import { prisma } from '@/lib/prisma'
import { getMachineStatus } from '@/lib/machine-utils'
import { requireRole, requireRoleStrict, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import type { NextRequest } from 'next/server'

export async function GET(
  req: NextRequest,
  ctx: RouteContext<'/api/rooms/[roomCode]'>
) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const isKtv = auth.role === 'TECHNICIAN'

  const { roomCode } = await ctx.params

  const room = await prisma.room.findUnique({
    where: { roomCode: decodeURIComponent(roomCode) },
    include: {
      floor: true,
      machines: { orderBy: { machineNo: 'asc' } },
      maintenanceLogs: isKtv ? false : {
        orderBy: { maintenanceDate: 'desc' },
        take: 20,
      },
    },
  })

  if (!room) {
    return Response.json({ error: 'Không tìm thấy phòng' }, { status: 404 })
  }

  const machinesWithStatus = room.machines.map(m => ({
    ...m,
    status: getMachineStatus(m as Record<string, unknown>),
  }))

  return Response.json({
    ...room,
    machines: machinesWithStatus,
    maintenanceLogs: isKtv ? [] : room.maintenanceLogs,
  })
}

export async function PUT(
  req: NextRequest,
  ctx: RouteContext<'/api/rooms/[roomCode]'>
) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER')
  if (!auth) return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })

  const rl = rateLimit(`mutation:${auth.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  const { roomCode } = await ctx.params
  let body: { cpuSpec?: string; ramSpec?: string; diskSpec?: string; monitorSpec?: string }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const room = await prisma.room.update({
    where: { roomCode: decodeURIComponent(roomCode) },
    data: {
      cpuSpec:     body.cpuSpec?.trim()     || null,
      ramSpec:     body.ramSpec?.trim()     || null,
      diskSpec:    body.diskSpec?.trim()    || null,
      monitorSpec: body.monitorSpec?.trim() || null,
    },
  })

  return Response.json(room)
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<'/api/rooms/[roomCode]'>
) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRoleStrict(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })

  const rl = rateLimit(`mutation:${auth.payload.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  const { roomCode: idStr } = await ctx.params
  const roomId = parseInt(idStr, 10)
  if (isNaN(roomId)) return Response.json({ error: 'ID không hợp lệ' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const rawCode = typeof body.roomCode === 'string' ? body.roomCode : ''
  const newRoomCode = rawCode.trim().toUpperCase()

  if (!newRoomCode || !/^[A-Z0-9]+-[A-Z0-9]/.test(newRoomCode)) {
    return Response.json({ error: 'Mã phòng không hợp lệ (ví dụ: I2-01)' }, { status: 400 })
  }

  const currentRoom = await prisma.room.findUnique({ where: { id: roomId } })
  if (!currentRoom) return Response.json({ error: 'Không tìm thấy phòng' }, { status: 404 })

  const dup = await prisma.room.findFirst({ where: { roomCode: newRoomCode, id: { not: roomId } } })
  if (dup) return Response.json({ error: 'Mã phòng đã tồn tại ở phòng khác' }, { status: 409 })

  const newPrefixKey = newRoomCode.split('-')[0]
  const oldPrefixKey = currentRoom.roomCode.split('-')[0]
  const totalMachines = Number(body.totalMachines) || 0

  const updateData = {
    totalMachines,
    cpuSpec:     typeof body.cpuSpec     === 'string' ? body.cpuSpec.trim()     || null : null,
    ramSpec:     typeof body.ramSpec     === 'string' ? body.ramSpec.trim()     || null : null,
    diskSpec:    typeof body.diskSpec    === 'string' ? body.diskSpec.trim()    || null : null,
    monitorSpec: typeof body.monitorSpec === 'string' ? body.monitorSpec.trim() || null : null,
    notes:       typeof body.notes       === 'string' ? body.notes.trim()       || null : null,
  }

  let updatedRoom
  if (newPrefixKey !== oldPrefixKey) {
    await prisma.$transaction(async (tx) => {
      const newFloor = await tx.floor.upsert({
        where: { name: newPrefixKey },
        update: {},
        create: { name: newPrefixKey },
      })
      updatedRoom = await tx.room.update({
        where: { id: roomId },
        data: { roomCode: newRoomCode, floorId: newFloor.id, ...updateData },
        include: { floor: true },
      })
      await tx.$executeRaw`SELECT id FROM floors WHERE id = ${currentRoom.floorId} FOR UPDATE`
      const remaining = await tx.room.count({ where: { floorId: currentRoom.floorId } })
      if (remaining === 0) {
        await tx.floor.delete({ where: { id: currentRoom.floorId } })
      }
    }, { isolationLevel: 'Serializable' })
  } else {
    updatedRoom = await prisma.room.update({
      where: { id: roomId },
      data: { roomCode: newRoomCode, ...updateData },
      include: { floor: true },
    })
  }

  return Response.json(updatedRoom)
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<'/api/rooms/[roomCode]'>
) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRoleStrict(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })

  const { roomCode: idStr } = await ctx.params
  const roomId = parseInt(idStr, 10)
  if (isNaN(roomId)) return Response.json({ error: 'ID không hợp lệ' }, { status: 400 })

  const room = await prisma.room.findUnique({ where: { id: roomId } })
  if (!room) return Response.json({ error: 'Không tìm thấy phòng' }, { status: 404 })

  const floorId = room.floorId

  await prisma.$transaction(async (tx) => {
    await tx.machine.deleteMany({ where: { roomId } })
    await tx.maintenanceLog.updateMany({ where: { roomId }, data: { roomId: null } })
    await tx.room.delete({ where: { id: roomId } })
    await tx.$executeRaw`SELECT id FROM floors WHERE id = ${floorId} FOR UPDATE`
    const remaining = await tx.room.count({ where: { floorId } })
    if (remaining === 0) {
      await tx.floor.delete({ where: { id: floorId } })
    }
  }, { isolationLevel: 'Serializable' })

  return Response.json({ success: true })
}
