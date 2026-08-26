/**
 * Sprint 0 email invariants.
 *
 * These are the properties the OTP login flow depends on, and every one of them
 * fails SILENTLY if broken — a suppressed email looks identical to a delivered
 * one from the caller's side, and an OTP leaked into a log looks like nothing at
 * all. That is why they are pinned here rather than left to review.
 *
 *   1. sendOtpEmail throws, with the right reason. A signup that reports success
 *      while no code was sent is the failure this exists to prevent (§2.6).
 *   2. The five pre-Sprint-0 senders keep their exact failure semantics — three
 *      swallow, two propagate. orders.ts calls them fire-and-forget.
 *   3. TRANSACTIONAL_EMAIL_ENABLED suppresses exactly four senders. Not three,
 *      not six: password reset and OTP must survive it.
 *   4. The quota counter fails closed, and releases a failed send's reservation.
 *   5. The OTP code never reaches a log line, a console path, or the send-log row.
 *
 * Run: npm test --workspace=api
 */
import { test, describe, beforeEach, afterEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── Isolation ────────────────────────────────────────────────────────────────
// api/.env points at the PRODUCTION database and there is no dev database, so a
// stray connection here writes to live data. Two independent guards: a dead
// DATABASE_URL, and a Prisma stub swapped into the module cache before anything
// under test can import the real one.
process.env.DATABASE_URL = 'postgresql://tests:tests@127.0.0.1:1/nonexistent';

interface SendLogRow {
  toEmailHash: string;
  template: string;
  status: string;
  providerMessageId?: string | null;
  error?: string | null;
}

const sendLog: SendLogRow[] = [];

const prismaPath = require.resolve('../src/lib/prisma');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      emailSend: {
        create: async ({ data }: { data: SendLogRow }) => { sendLog.push(data); return data; },
      },
    },
  },
} as NodeModule;

/* eslint-disable @typescript-eslint/no-var-requires */
const transportMod = require('../src/services/email/transport');
const email = require('../src/services/email');
/* eslint-enable @typescript-eslint/no-var-requires */

const { EmailUnavailableError, __setTransportForTest, deliver, getQuotaUsage } = transportMod;

// ── Test doubles ─────────────────────────────────────────────────────────────

interface FakeTransport {
  name: string;
  isConfigured(): boolean;
  send(msg: { to: string; subject: string; html: string }): Promise<{ messageId: string }>;
  sent: Array<{ to: string; subject: string; html: string }>;
}

function fakeTransport(opts: {
  configured?: boolean;
  fail?: string | null;
  messageId?: string;
} = {}): FakeTransport {
  const { configured = true, fail = null, messageId = 'msg-1' } = opts;
  const sent: FakeTransport['sent'] = [];
  return {
    name: 'fake',
    sent,
    isConfigured: () => configured,
    async send(msg) {
      sent.push(msg);
      if (fail) throw new Error(fail);
      return { messageId };
    },
  };
}

/** Captures everything written to console for the duration of `fn`. */
async function captureConsole(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const realLog = console.log;
  const realError = console.error;
  const sink = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  console.log = sink;
  console.error = sink;
  try {
    await fn();
  } finally {
    console.log = realLog;
    console.error = realError;
  }
  return lines;
}

const ORDER = {
  orderNumber: 'BZ-1001',
  customerName: 'Rina',
  customerPhone: '01700000000',
  customerEmail: 'customer@example.com',
  total: 1500,
  paymentMethod: 'cod',
  items: [{ productName: 'Kurti', quantity: 1, subtotal: 1500 }],
  shippingAddress: { line1: '12 Road 3', city: 'Dhaka', district: 'Dhaka' },
};
const SHOP = { name: 'Rina Boutique', subdomain: 'rina' };

const ENV_KEYS = [
  'TRANSACTIONAL_EMAIL_ENABLED', 'EMAIL_DAILY_QUOTA',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
  'UPSTASH_REDIS_URL', 'UPSTASH_REDIS_TOKEN',
];

beforeEach(() => {
  sendLog.length = 0;
  ENV_KEYS.forEach(k => delete process.env[k]);
});

afterEach(() => {
  __setTransportForTest(null);
});

// ─────────────────────────────────────────────────────────────────────────────

describe('sendOtpEmail — inverted semantics (§2.6)', () => {
  test('throws EmailUnavailableError(unconfigured) when the transport has no credentials', async () => {
    __setTransportForTest(fakeTransport({ configured: false }));
    await assert.rejects(
      () => email.sendOtpEmail('user@example.com', '123456'),
      (err: Error & { reason?: string }) => {
        assert.ok(err instanceof EmailUnavailableError);
        assert.equal(err.reason, 'unconfigured');
        return true;
      },
    );
  });

  test('throws EmailUnavailableError(send_failed) when the send fails', async () => {
    __setTransportForTest(fakeTransport({ fail: 'Brevo HTTP 401 (unauthorized)' }));
    await assert.rejects(
      () => email.sendOtpEmail('user@example.com', '123456'),
      (err: Error & { reason?: string }) => {
        assert.equal(err.reason, 'send_failed');
        assert.match(err.message, /401/);
        return true;
      },
    );
  });

  test('throws rather than returning an empty messageId', async () => {
    // deliver() returns null only on a tolerated failure and neither is tolerated
    // here; a blank id would otherwise be recorded as a successful send.
    __setTransportForTest(fakeTransport({ messageId: '' }));
    await assert.rejects(
      () => email.sendOtpEmail('user@example.com', '123456'),
      (err: Error & { reason?: string }) => err.reason === 'send_failed',
    );
  });

  test('returns the provider messageId on success', async () => {
    __setTransportForTest(fakeTransport({ messageId: '<abc@smtp-relay.mailin.fr>' }));
    const id = await email.sendOtpEmail('user@example.com', '123456');
    assert.equal(id, '<abc@smtp-relay.mailin.fr>');
  });

  test('is NOT suppressed by TRANSACTIONAL_EMAIL_ENABLED=false', async () => {
    process.env.TRANSACTIONAL_EMAIL_ENABLED = 'false';
    const t = fakeTransport();
    __setTransportForTest(t);
    await email.sendOtpEmail('user@example.com', '123456');
    assert.equal(t.sent.length, 1, 'the gate must never reach the OTP path');
  });
});

describe('the OTP code never escapes the message body', () => {
  const CODE = '482913';

  test('absent from every console line, on all four outcomes', async () => {
    const lines = await captureConsole(async () => {
      __setTransportForTest(fakeTransport());
      await email.sendOtpEmail('user@example.com', CODE);

      __setTransportForTest(fakeTransport({ configured: false }));
      await email.sendOtpEmail('user@example.com', CODE).catch(() => {});

      __setTransportForTest(fakeTransport({ fail: 'connection reset' }));
      await email.sendOtpEmail('user@example.com', CODE).catch(() => {});

      // quota exhausted
      process.env.EMAIL_DAILY_QUOTA = '1';
      await withFakeRedis(async () => {
        __setTransportForTest(fakeTransport());
        await email.sendOtpEmail('user@example.com', CODE).catch(() => {});
        await email.sendOtpEmail('user@example.com', CODE).catch(() => {});
      });
    });

    const leaked = lines.filter(l => l.includes(CODE));
    assert.deepEqual(leaked, [], `OTP code leaked into ${leaked.length} log line(s)`);
  });

  test('absent from the email_sends row, which stores a hash and a template name', async () => {
    __setTransportForTest(fakeTransport());
    await email.sendOtpEmail('user@example.com', CODE);

    assert.equal(sendLog.length, 1);
    const row = sendLog[0];
    assert.equal(row.template, 'otp');
    assert.equal(row.status, 'sent');
    assert.ok(!JSON.stringify(row).includes(CODE), 'OTP code reached the send log');
    // The recipient is hashed, never stored in the clear (§7.6).
    assert.ok(!JSON.stringify(row).includes('user@example.com'));
    assert.match(row.toEmailHash, /^[0-9a-f]{64}$/);
  });

  test('a failed send records the error but still no code', async () => {
    __setTransportForTest(fakeTransport({ fail: 'smtp said no' }));
    await email.sendOtpEmail('user@example.com', CODE).catch(() => {});

    assert.equal(sendLog.length, 1);
    assert.equal(sendLog[0].status, 'failed');
    assert.ok(!JSON.stringify(sendLog[0]).includes(CODE));
  });
});

describe('TRANSACTIONAL_EMAIL_ENABLED gates exactly four senders', () => {
  async function callAll(t: FakeTransport) {
    __setTransportForTest(t);
    await captureConsole(async () => {
      await email.sendVerificationEmail('m@example.com', 'Rina', 'tok');
      await email.sendOrderConfirmation(ORDER, SHOP);
      await email.sendMerchantNewOrder(ORDER, 'merchant@example.com', SHOP);
      await email.sendOrderStatusUpdate({ ...ORDER, status: 'shipped' }, SHOP);
      await email.sendPasswordResetEmail('m@example.com', 'Rina', 'tok');
      await email.sendOtpEmail('m@example.com', '111111');
      await email.sendTestEmail('admin@example.com');
    });
  }

  test('OFF (the default) suppresses the four, and only the four', async () => {
    const t = fakeTransport();
    await callAll(t);
    const subjects = t.sent.map(m => m.subject);
    assert.equal(t.sent.length, 3, `expected 3 sends, got ${subjects.length}: ${subjects.join(' | ')}`);
    assert.ok(subjects.some(s => /Reset your BazarHQ password/.test(s)), 'password reset must survive the gate');
    assert.ok(subjects.some(s => /verification code/.test(s)), 'OTP must survive the gate');
    assert.ok(subjects.some(s => /transport test/i.test(s)), 'admin test-send must ignore the gate');
  });

  test('the default is OFF when the variable is unset', async () => {
    delete process.env.TRANSACTIONAL_EMAIL_ENABLED;
    const t = fakeTransport();
    await callAll(t);
    assert.equal(t.sent.length, 3);
  });

  test('ON lets all seven through', async () => {
    process.env.TRANSACTIONAL_EMAIL_ENABLED = 'true';
    const t = fakeTransport();
    await callAll(t);
    assert.equal(t.sent.length, 7);
  });

  test('only the exact string "true" enables it', async () => {
    for (const val of ['TRUE', ' true ', '1', 'yes', 'false', '']) {
      process.env.TRANSACTIONAL_EMAIL_ENABLED = val;
      const t = fakeTransport();
      await callAll(t);
      const expected = ['TRUE', ' true '].includes(val) ? 7 : 3;
      assert.equal(t.sent.length, expected, `TRANSACTIONAL_EMAIL_ENABLED=${JSON.stringify(val)}`);
    }
  });
});

describe('the five pre-Sprint-0 senders keep their exact failure semantics', () => {
  test('unconfigured — all five return quietly, none throw', async () => {
    __setTransportForTest(fakeTransport({ configured: false }));
    await captureConsole(async () => {
      await email.sendVerificationEmail('m@example.com', 'Rina', 'tok');
      await email.sendPasswordResetEmail('m@example.com', 'Rina', 'tok');
      await email.sendOrderConfirmation(ORDER, SHOP);
      await email.sendMerchantNewOrder(ORDER, 'merchant@example.com', SHOP);
      await email.sendOrderStatusUpdate({ ...ORDER, status: 'shipped' }, SHOP);
    });
  });

  test('send fails — verification and password reset PROPAGATE', async () => {
    process.env.TRANSACTIONAL_EMAIL_ENABLED = 'true';
    __setTransportForTest(fakeTransport({ fail: 'transport down' }));
    await assert.rejects(() => email.sendVerificationEmail('m@example.com', 'Rina', 'tok'));
    await assert.rejects(() => email.sendPasswordResetEmail('m@example.com', 'Rina', 'tok'));
  });

  test('send fails — the three order senders SWALLOW (orders.ts is fire-and-forget)', async () => {
    process.env.TRANSACTIONAL_EMAIL_ENABLED = 'true';
    __setTransportForTest(fakeTransport({ fail: 'transport down' }));
    await captureConsole(async () => {
      await email.sendOrderConfirmation(ORDER, SHOP);
      await email.sendMerchantNewOrder(ORDER, 'merchant@example.com', SHOP);
      await email.sendOrderStatusUpdate({ ...ORDER, status: 'shipped' }, SHOP);
    });
    assert.equal(sendLog.filter(r => r.status === 'failed').length, 3);
  });

  test('an order with no customer email is skipped without touching the transport', async () => {
    process.env.TRANSACTIONAL_EMAIL_ENABLED = 'true';
    const t = fakeTransport();
    __setTransportForTest(t);
    await email.sendOrderConfirmation({ ...ORDER, customerEmail: null }, SHOP);
    await email.sendOrderStatusUpdate({ ...ORDER, customerEmail: null, status: 'shipped' }, SHOP);
    assert.equal(t.sent.length, 0);
  });
});

// ─── Quota ───────────────────────────────────────────────────────────────────
// Backed by a loopback server speaking Upstash's REST protocol rather than a
// stubbed client: @upstash/redis defines its commands as own instance
// properties and auto-pipelines them, so a monkeypatched method is simply
// bypassed and the test passes while exercising nothing.

const store = new Map<string, string>();
let redisServer: http.Server;
let redisUrl = '';

before(async () => {
  redisServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const exec = (cmd: unknown[]): unknown => {
        const [op, key, val] = cmd.map(String);
        switch (op.toLowerCase()) {
          case 'set': store.set(key, val); return 'OK';
          case 'get': return store.has(key) ? store.get(key) : null;
          case 'del': return store.delete(key) ? 1 : 0;
          case 'incr': { const n = Number(store.get(key) ?? 0) + 1; store.set(key, String(n)); return n; }
          case 'decr': { const n = Number(store.get(key) ?? 0) - 1; store.set(key, String(n)); return n; }
          case 'expire': return 1;
          default: return null;
        }
      };
      const parsed = JSON.parse(raw || '[]');
      const body = req.url === '/pipeline'
        ? (parsed as unknown[][]).map(c => ({ result: exec(c) }))
        : { result: exec(parsed as unknown[]) };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
  });
  await new Promise<void>(r => redisServer.listen(0, '127.0.0.1', () => r()));
  redisUrl = `https://fake.upstash.io`;

  // The client requires an https:// URL; redirect only that host to the
  // loopback server so the genuine client and our real credential handling run.
  const realFetch = globalThis.fetch;
  const port = (redisServer.address() as AddressInfo).port;
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    realFetch(String(input).replace('https://fake.upstash.io', `http://127.0.0.1:${port}`), init)
  ) as typeof fetch;
});

after(() => { redisServer.close(); });

async function withFakeRedis(fn: () => Promise<void>): Promise<void> {
  process.env.UPSTASH_REDIS_REST_URL = redisUrl;
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  try {
    await fn();
  } finally {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
}

describe('daily quota', () => {
  beforeEach(() => { store.clear(); });

  test('counts each send', async () => {
    await withFakeRedis(async () => {
      __setTransportForTest(fakeTransport());
      await deliver('t', { to: 'a@b.c', subject: 's', html: 'h' });
      await deliver('t', { to: 'a@b.c', subject: 's', html: 'h' });
      const q = await getQuotaUsage();
      assert.equal(q.sent, 2);
      assert.equal(q.counter, 'redis');
    });
  });

  test('fails CLOSED at the limit — OTP throws quota_exhausted', async () => {
    process.env.EMAIL_DAILY_QUOTA = '2';
    await withFakeRedis(async () => {
      __setTransportForTest(fakeTransport());
      await email.sendOtpEmail('a@b.c', '111111');
      await email.sendOtpEmail('a@b.c', '222222');
      await assert.rejects(
        () => email.sendOtpEmail('a@b.c', '333333'),
        (err: Error & { reason?: string }) => err.reason === 'quota_exhausted',
      );
    });
  });

  test('a failed send releases its reservation', async () => {
    await withFakeRedis(async () => {
      __setTransportForTest(fakeTransport({ fail: 'nope' }));
      await captureConsole(() => deliver('t', { to: 'a@b.c', subject: 's', html: 'h' }));
      const q = await getQuotaUsage();
      assert.equal(q.sent, 0, 'a send that never left must not consume quota');
    });
  });

  test('EMAIL_DAILY_QUOTA overrides the default of 300', async () => {
    await withFakeRedis(async () => {
      assert.equal((await getQuotaUsage()).limit, 300);
      process.env.EMAIL_DAILY_QUOTA = '42';
      assert.equal((await getQuotaUsage()).limit, 42);
    });
  });

  test('without Redis the counter is disabled and sends proceed', async () => {
    // An unreachable counter is not evidence of an exhausted quota; failing
    // closed here would make the app undeliverable whenever Upstash blips.
    const t = fakeTransport();
    __setTransportForTest(t);
    await email.sendOtpEmail('a@b.c', '111111');
    assert.equal(t.sent.length, 1);
  });
});

describe('getQuotaUsage reports headroom, not Redis reachability', () => {
  beforeEach(() => { store.clear(); });

  test('unused quota is available', async () => {
    await withFakeRedis(async () => {
      const q = await getQuotaUsage();
      assert.equal(q.available, true, 'an untouched quota must not read as exhausted');
      assert.equal(q.sent, 0);
      assert.equal(q.remaining, 300);
    });
  });

  test('exhausted quota is unavailable', async () => {
    process.env.EMAIL_DAILY_QUOTA = '1';
    await withFakeRedis(async () => {
      __setTransportForTest(fakeTransport());
      await deliver('t', { to: 'a@b.c', subject: 's', html: 'h' });
      const q = await getQuotaUsage();
      assert.equal(q.available, false);
      assert.equal(q.remaining, 0);
    });
  });

  test('no counter → available, sent null, and counter says why', async () => {
    const q = await getQuotaUsage();
    assert.equal(q.counter, 'not-configured');
    assert.equal(q.sent, null, 'unknown is not zero');
    assert.equal(q.remaining, null);
    assert.equal(q.available, true, 'an unenforced quota lets every send through');
  });
});
