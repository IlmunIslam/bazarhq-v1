import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@bazarhq.com';
  const password = process.env.ADMIN_PASSWORD ?? 'Admin@12345';
  const fullName = 'BazarHQ Admin';

  const existing = await prisma.adminAccount.findUnique({ where: { email } });
  if (existing) {
    console.log('Admin account already exists:', email);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.adminAccount.create({
    data: { email, passwordHash, fullName, role: 'superadmin' },
  });

  console.log(`Admin account created: ${email} (password: ${password})`);
  console.log('Change the password immediately after first login!');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
