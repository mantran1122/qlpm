import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import { recordAudit } from '@/lib/node/audit'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const machineId = searchParams.get('machineId')
  const roomId    = searchParams.get('roomId')
  const from      = searchParams.get('from')
  const to        = searchParams.get('to')
  const page      = Math.max(1, Number(searchParams.get('page')  || 1))
  const limit     = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))

  const where: Record<string, unknown> = {}
  if (machineId) where.machineId = Number(machineId)
  if (roomId)    where.roomId    = Number(roomId)
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    }
  }

  const [total, records] = await Promise.all([
    prisma.devicePreRepairStatus.count({ where }),
    prisma.devicePreRepairStatus.findMany({
      where,
      include: {
        machine:    { select: { machineNo: true, isTeacher: true } },
        room:       { select: { roomCode: true } },
        technician: { select: { id: true, name: true } },
        createdBy:  { select: { id: true, username: true, profile: { select: { displayName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
  ])

  return Response.json({
    data:       records,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}

export async function POST(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const rl = rateLimit(`mutation:${auth.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const { machineId, description, reportedBy, reportedAt, imageUrls, technicianId } = body

  if (!machineId || !description || !reportedAt) {
    return Response.json({ error: 'Thiếu trường bắt buộc: machineId, description, reportedAt' }, { status: 400 })
  }

  const machine = await prisma.machine.findUnique({
    where:  { id: Number(machineId) },
    select: { id: true, roomId: true, machineNo: true },
  })
  if (!machine) return Response.json({ error: 'Không tìm thấy máy' }, { status: 404 })

  // Validate technicianId nếu có
  if (technicianId) {
    const tech = await prisma.technician.findUnique({ where: { id: Number(technicianId) }, select: { id: true } })
    if (!tech) return Response.json({ error: 'Không tìm thấy kỹ thuật viên' }, { status: 404 })
  }

  // Validate imageUrls là JSON array string
  let imageUrlsStr: string | null = null
  if (imageUrls) {
    try {
      const arr = typeof imageUrls === 'string' ? JSON.parse(imageUrls) : imageUrls
      if (!Array.isArray(arr)) throw new Error()
      if (arr.length > 5) return Response.json({ error: 'Tối đa 5 ảnh mỗi bản ghi' }, { status: 400 })
      imageUrlsStr = JSON.stringify(arr)
    } catch {
      return Response.json({ error: 'imageUrls phải là mảng JSON' }, { status: 400 })
    }
  }

  const record = await prisma.devicePreRepairStatus.create({
    data: {
      machineId:    machine.id,
      roomId:       machine.roomId,
      machineNo:    machine.machineNo,
      description:  String(description),
      reportedBy:   reportedBy ? String(reportedBy) : null,
      reportedAt:   new Date(String(reportedAt)),
      imageUrls:    imageUrlsStr,
      technicianId: technicianId ? Number(technicianId) : null,
      createdById:  auth.userId,
    },
    include: {
      machine:    { select: { machineNo: true, isTeacher: true } },
      room:       { select: { roomCode: true } },
      technician: { select: { id: true, name: true } },
      createdBy:  { select: { id: true, username: true, profile: { select: { displayName: true } } } },
    },
  })

  await recordAudit({
    userId: auth.userId,
    action: 'pre_repair.created',
    target: `machine:${machine.id}`,
    detail: { recordId: record.id, machineNo: machine.machineNo },
  })

  return Response.json(record, { status: 201 })
}
