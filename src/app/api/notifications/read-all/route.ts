import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

export async function PATCH(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })

  const result = await prisma.notification.updateMany({
    where: { userId: auth.userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })

  return Response.json({ count: result.count })
}
