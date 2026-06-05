import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const SECRET = process.env.JWT_SECRET!;

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

export function signToken(payload: Omit<JwtPayload, 'jti'>): { token: string; jti: string } {
  const jti = randomUUID();
  const token = jwt.sign({ ...payload, jti }, SECRET, { expiresIn: EXPIRY[payload.role] });
  return { token, jti };
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
