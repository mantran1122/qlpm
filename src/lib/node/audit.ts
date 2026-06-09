import { prisma } from '@/lib/prisma'

export async function recordAudit(opts: {
  userId?: number | null
  action: string        // e.g. "user.role_changed", "settings.smtp_updated"
  target?: string       // e.g. "user:42", "room:7"
  detail?: object
  ip?: string
  ua?: string
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: opts.userId ?? null,
        action: opts.action,
        target: opts.target ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        detail: opts.detail !== undefined ? (opts.detail as any) : undefined,
        ip: opts.ip ?? null,
        ua: opts.ua ?? null,
      },
    })
  } catch {
    // Audit failure không được làm crash request
  }
}
