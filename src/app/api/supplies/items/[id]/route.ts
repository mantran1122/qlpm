import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER')
  if (!auth) return Response.json({ error: 'Không có quyền' }, { status: 403 })
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF invalid' }, { status: 403 })

  const { id } = await params
  const itemId = Number(id)
  if (!itemId) return Response.json({ error: 'ID không hợp lệ' }, { status: 400 })

  const body = await req.json()
  const label = (body.label ?? '').trim()
  const icon = (body.icon ?? '').trim() || undefined

  if (!label) return Response.json({ error: 'Tên vật tư không được để trống' }, { status: 400 })

  const item = await prisma.supplyItem.findUnique({ where: { id: itemId } })
  if (!item || !item.isActive) return Response.json({ error: 'Không tìm thấy vật tư' }, { status: 404 })

  const updated = await prisma.supplyItem.update({
    where: { id: itemId },
    data: { label, ...(icon ? { icon } : {}) },
  })
  return Response.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER')
  if (!auth) return Response.json({ error: 'Không có quyền' }, { status: 403 })
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF invalid' }, { status: 403 })

  const { id } = await params
  const itemId = Number(id)
  if (!itemId) return Response.json({ error: 'ID không hợp lệ' }, { status: 400 })

  const item = await prisma.supplyItem.findUnique({ where: { id: itemId } })
  if (!item) return Response.json({ error: 'Không tìm thấy vật tư' }, { status: 404 })
  if (item.isBuiltin) return Response.json({ error: 'Không thể xóa vật tư hệ thống' }, { status: 400 })

  // Soft delete
  await prisma.supplyItem.update({ where: { id: itemId }, data: { isActive: false } })
  return Response.json({ ok: true })
}
