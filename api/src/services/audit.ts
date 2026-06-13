import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export async function writeAuditLog(params: {
  actorId: string;
  actorEmail: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({ data: params });
  } catch {
    // Audit log failure should never crash the request
  }
}
