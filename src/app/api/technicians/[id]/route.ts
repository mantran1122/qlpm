import { prisma } from '@/lib/prisma'
import { requireRole, requireRoleStrict, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id } = await ctx.params
  const techId = parseInt(id)
  if (isNaN(techId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

  const tech = await prisma.technician.findUnique({
    where: { id: techId },
    include: {
      maintenanceLogs: {
        include: { room: { select: { roomCode: true } } },
        orderBy: { maintenanceDate: 'desc' },
        take: 50,
      },
    },
  })

  if (!tech) return Response.json({ error: 'Not found' }, { status: 404 })

  const stats = await prisma.maintenanceLog.aggregate({
    where: { technicianId: techId },
    _sum: {
      caseQty: true, cpuQty: true, ramQty: true, diskQty: true,
      powerQty: true, monitorQty: true, monitorCableQty: true,
      powerCableQty: true, mouseQty: true, networkQty: true, keyboardQty: true,
    },
    _count: true,
  })

  return Response.json({
    id: tech.id,
    name: tech.name,
    phone: tech.phone,
    department: tech.department,
    notes: tech.notes,
    isActive: tech.isActive,
    totalMaintenances: stats._count,
    totalPartsReplaced: Object.values(stats._sum ?? {}).reduce((a, b) => (a ?? 0) + (b ?? 0), 0),
    logs: tech.maintenanceLogs.map(l => ({
      id: l.id,
      date: l.maintenanceDate,
      room: l.room?.roomCode ?? (l.isSupplyIntake ? 'QTTB' : '—'),
      isSupplyIntake: l.isSupplyIntake,
      swBefore: l.softwareErrorsBefore,
      hwBefore: l.hardwareErrorsBefore,
      swAfter: l.softwareErrorsAfter,
      hwAfter: l.hardwareErrorsAfter,
      notes: l.notes,
    })),
  })
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRoleStrict(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Chỉ admin mới có quyền chỉnh sửa' }, { status: 403 })

  const rl = rateLimit(`mutation:${auth.payload.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  const { id } = await ctx.params
  const techId = parseInt(id)
  if (isNaN(techId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

  let body: { name?: string; phone?: string; department?: string; notes?: string; isActive?: boolean }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name.trim()
  if (body.phone !== undefined) data.phone = body.phone?.trim() || null
  if (body.department !== undefined) data.department = body.department?.trim() || null
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null
  if (body.isActive !== undefined) data.isActive = body.isActive

  const tech = await prisma.technician.update({ where: { id: techId }, data })

  return Response.json(tech)
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRoleStrict(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Chỉ admin mới có quyền xóa' }, { status: 403 })

  const { id } = await ctx.params
  const techId = parseInt(id)
  if (isNaN(techId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

  // Soft delete: đặt isActive = false để giữ lịch sử bảo trì
  const tech = await prisma.technician.update({ where: { id: techId }, data: { isActive: false } })

  return Response.json(tech)
}
