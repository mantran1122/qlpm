import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })

  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) return Response.json({ error: 'ID không hợp lệ' }, { status: 400 })

  const notif = await prisma.notification.findUnique({ where: { id } })
  if (!notif) return Response.json({ error: 'Không tìm thấy thông báo' }, { status: 404 })
  if (notif.userId !== auth.userId) return Response.json({ error: 'Không có quyền' }, { status: 403 })

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: new Date() },
  })

  return Response.json({ id: updated.id, isRead: updated.isRead, readAt: updated.readAt })
}
