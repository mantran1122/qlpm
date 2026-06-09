import { prisma } from '@/lib/prisma'
import type { UserRole } from '@/lib/edge/jwt'
import type { NotifType } from '@prisma/client'
import { recordAudit } from './audit'

export async function sendNotification(opts: {
  userId?: number
  roles?: UserRole[]
  title: string
  message: string
  type?: NotifType
  link?: string
  triggerKey?: string
  cooldownMinutes?: number
}): Promise<{ sent: number; skipped: 'debounced' | null; broadcastId?: number }> {
  try {
    if (opts.triggerKey) {
      const cooldownMs = (opts.cooldownMinutes ?? 360) * 60 * 1000
      const existing = await prisma.notificationDebounce.findUnique({
        where: { triggerKey: opts.triggerKey },
      })
      if (existing && existing.lastSentAt.getTime() + cooldownMs > Date.now()) {
        return { sent: 0, skipped: 'debounced' }
      }
    }

    let userIds: number[] = []

    if (opts.userId !== undefined) {
      userIds = [opts.userId]
    } else if (opts.roles && opts.roles.length > 0) {
      const users = await prisma.user.findMany({
        where: { role: { in: opts.roles }, isActive: true },
        select: { id: true },
      })
      userIds = users.map(u => u.id)
    } else {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
      })
      userIds = users.map(u => u.id)
    }

    if (userIds.length === 0) {
      return { sent: 0, skipped: null }
    }

    const broadcastId = Math.floor(Date.now() / 1000) + userIds[0]
    const type = opts.type ?? 'INFO'

    await prisma.notification.createMany({
      data: userIds.map(uid => ({
        userId: uid,
        title: opts.title,
        message: opts.message,
        type,
        link: opts.link ?? null,
        broadcastId: userIds.length > 1 ? broadcastId : null,
      })),
    })

    if (opts.triggerKey) {
      const cooldownMs = (opts.cooldownMinutes ?? 360) * 60 * 1000
      const expiresAt = new Date(Date.now() + cooldownMs * 2)
      await prisma.notificationDebounce.upsert({
        where: { triggerKey: opts.triggerKey },
        update: { lastSentAt: new Date(), expiresAt },
        create: {
          triggerKey: opts.triggerKey,
          lastSentAt: new Date(),
          expiresAt,
        },
      })
    }

    try {
      await recordAudit({
        userId: null,
        action: 'notification.sent',
        target: userIds.length > 1 ? `broadcast:${broadcastId}` : `user:${userIds[0]}`,
        detail: { title: opts.title, recipientCount: userIds.length, type },
      })
    } catch { /* ignore audit failure */ }

    return { sent: userIds.length, skipped: null, broadcastId: userIds.length > 1 ? broadcastId : undefined }
  } catch {
    return { sent: 0, skipped: null }
  }
}

export async function clearDebounce(triggerKey: string): Promise<void> {
  try {
    await prisma.notificationDebounce.deleteMany({ where: { triggerKey } })
  } catch { /* ignore */ }
}
