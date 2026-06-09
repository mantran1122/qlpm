import { prisma } from '@/lib/prisma'
import { requireRole, requireRoleStrict, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const rooms = await prisma.room.findMany({
    include: { floor: true, machines: true },
    orderBy: [{ floorId: 'asc' }, { roomCode: 'asc' }],
  })

  const result = rooms.map(room => {
    const errorCount = room.machines.filter(m =>
      m.softwareError || m.caseError || m.cpuError || m.ramError ||
      m.diskError || m.powerError || m.monitorError || m.monitorCableError ||
      m.powerCableError || m.mouseError || m.networkError || m.keyboardError
    ).length

    const softwareMachines = room.machines.filter(
      m => m.softwareError != null && m.softwareError !== ''
    )

    const hwFields = ['caseError','cpuError','ramError','diskError','powerError','monitorError','monitorCableError','powerCableError','mouseError','networkError','keyboardError'] as const
    const hardwareMachines = room.machines.filter(m =>
      hwFields.some(f => m[f] != null && m[f] !== '')
    )

    return {
      id: room.id,
      roomCode: room.roomCode,
      floor: { name: room.floor.name },
      totalMachines: room.totalMachines,
      cpuSpec: room.cpuSpec,
      ramSpec: room.ramSpec,
      diskSpec: room.diskSpec,
      monitorSpec: room.monitorSpec,
      notes: room.notes,
      errorCount,
      goodCount: room.totalMachines - errorCount,
      softwareCount: softwareMachines.length,
      softwareMachineNos: softwareMachines.map(m => m.machineNo),
      hardwareCount: hardwareMachines.length,
      hardwareMachineNos: hardwareMachines.map(m => m.machineNo),
    }
  })

  return Response.json(result)
}

export async function POST(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRoleStrict(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })

  const rl = rateLimit(`mutation:${auth.payload.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const rawCode = typeof body.roomCode === 'string' ? body.roomCode : ''
  const roomCode = rawCode.trim().toUpperCase()

  if (!roomCode || !/^[A-Z0-9]+-[A-Z0-9]/.test(roomCode)) {
    return Response.json({ error: 'Mã phòng không hợp lệ (ví dụ: I2-01)' }, { status: 400 })
  }

  const prefixKey = roomCode.split('-')[0]
  const totalMachines = Number(body.totalMachines) || 0

  const existing = await prisma.room.findUnique({ where: { roomCode } })
  if (existing) return Response.json({ error: 'Mã phòng đã tồn tại' }, { status: 409 })

  const floor = await prisma.floor.upsert({
    where: { name: prefixKey },
    update: {},
    create: { name: prefixKey },
  })

  const room = await prisma.$transaction(async (tx) => {
    const created = await tx.room.create({
      data: {
        roomCode,
        floorId: floor.id,
        totalMachines,
        cpuSpec:     typeof body.cpuSpec     === 'string' ? body.cpuSpec.trim()     || null : null,
        ramSpec:     typeof body.ramSpec     === 'string' ? body.ramSpec.trim()     || null : null,
        diskSpec:    typeof body.diskSpec    === 'string' ? body.diskSpec.trim()    || null : null,
        monitorSpec: typeof body.monitorSpec === 'string' ? body.monitorSpec.trim() || null : null,
        notes:       typeof body.notes       === 'string' ? body.notes.trim()       || null : null,
      },
      include: { floor: true },
    })

    if (totalMachines > 0) {
      await tx.machine.createMany({
        data: Array.from({ length: totalMachines }, (_, i) => ({
          roomId: created.id,
          machineNo: i + 1,
          isTeacher: false,
        })),
      })
    }

    return created
  })

  return Response.json(room, { status: 201 })
}
