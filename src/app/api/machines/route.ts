import { prisma } from '@/lib/prisma'
import { requireRole, requireRoleStrict, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const roomId = searchParams.get('roomId')

  const machines = await prisma.machine.findMany({
    where: roomId ? { roomId: Number(roomId) } : undefined,
    include: { room: { include: { floor: true } } },
    orderBy: [{ roomId: 'asc' }, { machineNo: 'asc' }],
  })

  return Response.json(machines)
}

export async function POST(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRoleStrict(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Không có quyền thêm máy' }, { status: 403 })

  const rl = rateLimit(`mutation:${auth.payload.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  let body: { roomId?: number; machineNo?: number; isTeacher?: boolean }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const { roomId, machineNo, isTeacher = false } = body
  if (!roomId || machineNo === undefined || machineNo === null) {
    return Response.json({ error: 'roomId và machineNo là bắt buộc' }, { status: 400 })
  }

  const existing = await prisma.machine.findUnique({ where: { roomId_machineNo_isTeacher: { roomId, machineNo, isTeacher } } })
  if (existing) {
    const loai = isTeacher ? 'giảng viên' : 'thường'
    return Response.json({ error: `Máy ${loai} số ${machineNo} đã tồn tại trong phòng này` }, { status: 409 })
  }

  const machine = await prisma.machine.create({ data: { roomId, machineNo, isTeacher } })
  return Response.json(machine, { status: 201 })
}
