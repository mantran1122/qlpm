import { prisma } from '@/lib/prisma'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import type { NextRequest } from 'next/server'

export async function POST(
  req: NextRequest,
  ctx: RouteContext<'/api/rooms/[roomCode]/generate-machines'>
) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload || payload.role !== 'ADMIN')
    return Response.json({ error: 'Chỉ admin mới có quyền' }, { status: 403 })

  const { roomCode } = await ctx.params
  const room = await prisma.room.findUnique({
    where: { roomCode: decodeURIComponent(roomCode) },
    include: { _count: { select: { machines: true } } },
  })

  if (!room) return Response.json({ error: 'Không tìm thấy phòng' }, { status: 404 })
  if (room._count.machines > 0)
    return Response.json({ error: 'Phòng đã có máy, không thể tạo tự động' }, { status: 409 })
  if (room.totalMachines <= 0)
    return Response.json({ error: 'totalMachines phải lớn hơn 0' }, { status: 400 })

  await prisma.machine.createMany({
    data: Array.from({ length: room.totalMachines }, (_, i) => ({
      roomId: room.id,
      machineNo: i + 1,
      isTeacher: false,
    })),
  })

  return Response.json({ created: room.totalMachines })
}
