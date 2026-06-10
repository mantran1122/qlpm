import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id } = await params
  const record = await prisma.devicePreRepairStatus.findUnique({
    where: { id: Number(id) },
    include: {
      machine:    { select: { machineNo: true, isTeacher: true, isFaulty: true } },
      room:       { select: { roomCode: true, floor: { select: { name: true } } } },
      technician: { select: { id: true, name: true, phone: true } },
      createdBy:  { select: { id: true, username: true, profile: { select: { displayName: true } } } },
    },
  })

  if (!record) return Response.json({ error: 'Không tìm thấy bản ghi' }, { status: 404 })

  return Response.json(record)
}
