import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Không có quyền' }, { status: 403 })
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF invalid' }, { status: 403 })

  const body = await req.json()
  const supplyItemId = Number(body.supplyItemId)
  const delta = Number(body.delta)
  const reason = (body.reason ?? '').trim()
  const coordinatorName = (body.coordinatorName ?? '').trim()
  const note = (body.note ?? '').trim() || undefined

  if (!supplyItemId || isNaN(delta) || delta === 0)
    return Response.json({ error: 'supplyItemId và delta (khác 0) là bắt buộc' }, { status: 400 })
  if (!reason) return Response.json({ error: 'Vui lòng nhập lý do điều chỉnh' }, { status: 400 })
  if (!coordinatorName) return Response.json({ error: 'Vui lòng nhập người điều phối' }, { status: 400 })

  const item = await prisma.supplyItem.findUnique({ where: { id: supplyItemId } })
  if (!item || !item.isActive) return Response.json({ error: 'Vật tư không tồn tại' }, { status: 404 })

  const adj = await prisma.supplyAdjustment.create({
    data: { supplyItemId, delta, reason, coordinatorName, note, createdById: auth.userId },
    include: {
      supplyItem: { select: { label: true, code: true } },
      createdBy: { select: { username: true, profile: { select: { displayName: true } } } },
    },
  })
  return Response.json(adj, { status: 201 })
}
