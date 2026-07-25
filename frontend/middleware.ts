import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MAIN_DOMAIN = process.env.NEXT_PUBLIC_DOMAIN ?? 'bazarhq.com';

// First-party app routes that must NEVER be rewritten to a storefront, even when
// a ?_shop= param or _dev_shop cookie is present. Storefront selection applies
// only to the public shopping surface — not to the marketplace, the merchant
// dashboard, auth, or superadmin. The (auth) route group has no URL prefix, so
// its pages appear here by their real paths (/login, /register, …).
const FIRST_PARTY_PREFIXES = [
  '/marketplace',       // cross-shop marketplace section (M2+)
  '/dashboard',
  '/login',
  '/register',
  '/forgot-password',
  '/verify-email',
  '/reset-password',
  '/superadmin',
];

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  // First-party app routes are never rewritten to a storefront — and crucially
  // the _shop param / _dev_shop cookie logic below is never even consulted for
  // them, so a sticky cookie can't hijack /marketplace, the dashboard, auth, or
  // superadmin. Storefront selection resumes for every other path.
  if (FIRST_PARTY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // The ?_shop= param selects a storefront without a per-shop subdomain. This is
  // required in production on Vercel (single domain, no *.bazarhq.com subdomains)
  // and is also how local dev targets a shop — so it must run in every env, not
  // just development.
  const queryShop = request.nextUrl.searchParams.get('_shop');
  let subdomain: string | null = null;

  if (queryShop) {
    // Persist in cookie so subsequent navigation keeps the shop context
    subdomain = queryShop;
    const url = request.nextUrl.clone();
    url.pathname = `/sites/${subdomain}${pathname}`;
    const response = NextResponse.rewrite(url);
    response.cookies.set('_dev_shop', subdomain, { path: '/', sameSite: 'lax' });
    return response;
  }
  // Use cookie set by a previous ?_shop= visit
  const cookieShop = request.cookies.get('_dev_shop')?.value;
  if (cookieShop) subdomain = cookieShop;

  if (!subdomain) {
    const hostname = host.split(':')[0]; // strip port
    if (hostname !== MAIN_DOMAIN && hostname.endsWith(`.${MAIN_DOMAIN}`)) {
      subdomain = hostname.slice(0, -(`.${MAIN_DOMAIN}`.length));
    }
  }

  if (subdomain) {
    const url = request.nextUrl.clone();
    url.pathname = `/sites/${subdomain}${pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sites).*)', ],
};
