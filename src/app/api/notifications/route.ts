import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import { recordAudit } from '@/lib/node/audit'
import { sendNotification } from '@/lib/node/notification'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor') ? parseInt(searchParams.get('cursor')!, 10) : undefined
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)
  const isRead = searchParams.get('isRead')
  const type = searchParams.get('type')
  const q = searchParams.get('q')

  const where: Record<string, unknown> = { userId: auth.userId }
  if (isRead === 'true') where.isRead = true
  else if (isRead === 'false') where.isRead = false
  if (type) where.type = type
  if (q) where.title = { contains: q }

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  const hasMore = notifications.length > limit
  if (hasMore) notifications.pop()

  const nextCursor = hasMore ? notifications[notifications.length - 1]?.id : null

  return Response.json({
    data: notifications,
    nextCursor,
    hasMore,
  })
}

export async function POST(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER')
  if (!auth) return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })

  const rl = rateLimit(`notification:send:${auth.userId}`, 30, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  let body: {
    userId?: number
    roles?: string[]
    title?: string
    message?: string
    type?: string
    link?: string
  }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  if (!body.title?.trim() || !body.message?.trim()) {
    return Response.json({ error: 'title và message là bắt buộc' }, { status: 400 })
  }

  const validTypes = ['INFO', 'WARNING', 'ERROR', 'SUCCESS']
  const notifType = body.type && validTypes.includes(body.type) ? body.type as 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' : 'INFO'

  const validRoles = ['ADMIN', 'MANAGER', 'TECHNICIAN']
  const roles = body.roles?.filter(r => validRoles.includes(r)) as ('ADMIN' | 'MANAGER' | 'TECHNICIAN')[] | undefined

  const result = await sendNotification({
    userId: body.userId,
    roles: roles && roles.length ? roles : undefined,
    title: body.title.trim(),
    message: body.message.trim(),
    type: notifType,
    link: body.link?.trim() || undefined,
  })

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined
  await recordAudit({
    userId: auth.userId,
    action: 'notification.created',
    target: body.userId ? `user:${body.userId}` : 'broadcast',
    detail: { title: body.title, recipientCount: result.sent },
    ip: ip ?? undefined,
  })

  return Response.json({ sent: result.sent }, { status: 201 })
}
