import { prisma } from '@/lib/prisma'
import { requireRole, requireRoleStrict, requireCsrf } from '@/lib/node/auth'
import { assertOwnership } from '@/lib/node/ownership'
import { rateLimit } from '@/lib/node/rate-limit'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id } = await ctx.params
  const logId = parseInt(id)
  if (isNaN(logId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

  const log = await prisma.maintenanceLog.findUnique({
    where: { id: logId },
    include: { room: { include: { floor: true } }, technician: true },
  })
  if (!log) return Response.json({ error: 'Không tìm thấy bản ghi' }, { status: 404 })

  // TECHNICIAN chỉ được xem bản ghi do chính họ tạo
  if (auth.role === 'TECHNICIAN' && log.createdById !== auth.userId) {
    return Response.json({ error: 'Bạn không có quyền xem bản ghi này' }, { status: 403 })
  }

  return Response.json(log)
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const rl = rateLimit(`mutation:${auth.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  const { id } = await ctx.params
  const logId = parseInt(id)
  if (isNaN(logId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

  // Ownership check: chỉ owner hoặc ADMIN mới được sửa
  const existing = await prisma.maintenanceLog.findUnique({
    where: { id: logId },
    select: { createdById: true },
  })
  if (!existing) return Response.json({ error: 'Không tìm thấy bản ghi' }, { status: 404 })

  if (existing.createdById !== null) {
    const ownerCheck = assertOwnership({
      role: auth.role,
      userId: auth.userId,
      resourceOwnerId: existing.createdById,
    })
    if (!ownerCheck.ok) return Response.json({ error: ownerCheck.error }, { status: ownerCheck.status })
  } else if (auth.role !== 'ADMIN') {
    // Bản ghi cũ không có createdById → chỉ ADMIN được sửa
    return Response.json({ error: 'Chỉ admin mới có quyền chỉnh sửa bản ghi cũ' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (body.maintenanceDate) data.maintenanceDate = new Date(String(body.maintenanceDate))
  if ('technicianName' in body) data.technicianName = body.technicianName ? String(body.technicianName).trim() : null
  if ('technicianId' in body) data.technicianId = body.technicianId ? Number(body.technicianId) : null
  if ('notes' in body) data.notes = body.notes ? String(body.notes).trim() : null
  if ('softwareErrorsBefore' in body) data.softwareErrorsBefore = Number(body.softwareErrorsBefore ?? 0)
  if ('hardwareErrorsBefore' in body) data.hardwareErrorsBefore = Number(body.hardwareErrorsBefore ?? 0)
  if ('softwareErrorsAfter' in body) data.softwareErrorsAfter = Number(body.softwareErrorsAfter ?? 0)
  if ('hardwareErrorsAfter' in body) data.hardwareErrorsAfter = Number(body.hardwareErrorsAfter ?? 0)

  const qtyFields = [
    'caseQty', 'cpuQty', 'ramQty', 'diskQty', 'powerQty',
    'monitorQty', 'monitorCableQty', 'powerCableQty',
    'mouseQty', 'networkQty', 'keyboardQty',
    'recCaseQty', 'recCpuQty', 'recRamQty', 'recDiskQty', 'recPowerQty',
    'recMonitorQty', 'recMonitorCableQty', 'recPowerCableQty',
    'recMouseQty', 'recNetworkQty', 'recKeyboardQty',
  ]
  for (const f of qtyFields) {
    if (f in body) data[f] = Number(body[f] ?? 0)
  }

  if ('roomCode' in body && body.roomCode) {
    const room = await prisma.room.findUnique({ where: { roomCode: String(body.roomCode) } })
    if (!room) return Response.json({ error: `Không tìm thấy phòng: ${body.roomCode}` }, { status: 404 })
    data.roomId = room.id
  }

  const log = await prisma.maintenanceLog.update({ where: { id: logId }, data })
  return Response.json(log)
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRoleStrict(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Chỉ admin mới có quyền xóa' }, { status: 403 })

  const { id } = await ctx.params
  const logId = parseInt(id)
  if (isNaN(logId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

  await prisma.maintenanceLog.delete({ where: { id: logId } })
  return new Response(null, { status: 204 })
}
