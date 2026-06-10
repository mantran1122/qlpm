import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { recordAudit } from '@/lib/node/audit'
import type { NextRequest } from 'next/server'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER')
  if (!auth) return Response.json({ error: 'Không có quyền' }, { status: 403 })

  const { id } = await params
  const alert = await prisma.recallAlert.findUnique({ where: { id: Number(id) } })
  if (!alert) return Response.json({ error: 'Không tìm thấy alert' }, { status: 404 })
  if (alert.dismissedAt) return Response.json({ error: 'Alert đã được dismiss trước đó' }, { status: 400 })

  const updated = await prisma.recallAlert.update({
    where: { id: Number(id) },
    data:  { dismissedAt: new Date(), dismissedById: auth.userId },
  })

  await recordAudit({
    userId: auth.userId,
    action: 'recall.alert_dismissed',
    target: `alert:${id}`,
    detail: { recallRecordId: alert.recallRecordId },
  })

  return Response.json(updated)
}
