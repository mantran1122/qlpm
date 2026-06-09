import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Chỉ admin mới có quyền' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor') ? parseInt(searchParams.get('cursor')!, 10) : undefined
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '30'), 100)
  const userId = searchParams.get('userId')
  const action = searchParams.get('action')

  const where: Record<string, unknown> = {}
  if (userId) where.userId = parseInt(userId, 10)
  if (action) where.action = action

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      user: { select: { email: true, profile: { select: { displayName: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  const hasMore = logs.length > limit
  if (hasMore) logs.pop()

  const nextCursor = hasMore ? logs[logs.length - 1]?.id : null

  return Response.json({
    data: logs.map(l => ({
      id: l.id,
      userId: l.userId,
      userEmail: l.user?.email ?? null,
      userDisplayName: l.user?.profile?.displayName ?? null,
      action: l.action,
      target: l.target,
      detail: l.detail,
      ip: l.ip,
      ua: l.ua,
      createdAt: l.createdAt,
    })),
    nextCursor,
    hasMore,
  })
}
