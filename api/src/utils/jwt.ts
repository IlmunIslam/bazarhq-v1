import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

type Role = 'merchant' | 'customer' | 'admin';

interface JwtPayload {
  sub: string;   // userId or adminId
  role: Role;
  jti: string;   // tracked in sessions table for revocation
  shopId?: string;
}

const EXPIRY: Record<Role, string> = {
  merchant: '7d',
  customer: '30d',
  admin: '8h',
};

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export function signToken(payload: Omit<JwtPayload, 'jti'>): { token: string; jti: string } {
  const jti = randomUUID();
  const token = jwt.sign({ ...payload, jti }, getSecret(), { expiresIn: EXPIRY[payload.role] });
  return { token, jti };
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as JwtPayload;
}
