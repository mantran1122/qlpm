import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import { recordAudit } from '@/lib/node/audit'
import type { NextRequest } from 'next/server'
import type { RecallType, RecallComplexity } from '@prisma/client'

const RECALL_INCLUDE = {
  machine:               { select: { machineNo: true, isTeacher: true } },
  room:                  { select: { roomCode: true } },
  recalledBy:            { select: { id: true, username: true, profile: { select: { displayName: true } } } },
  recalledByTechnician:  { select: { id: true, name: true } },
  repairedBy:            { select: { id: true, username: true, profile: { select: { displayName: true } } } },
  repairedByTechnician:  { select: { id: true, name: true } },
  preRepairStatus:       { select: { id: true, description: true, reportedAt: true } },
  alerts:                { where: { dismissedAt: null }, select: { id: true, daysOverdue: true, sentAt: true } },
} as const

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const recallType  = searchParams.get('type') as RecallType | null
  const roomId      = searchParams.get('roomId')
  const from        = searchParams.get('from')
  const to          = searchParams.get('to')
  const overdue     = searchParams.get('overdue')
  const repairStatus = searchParams.get('repairStatus')
  const page        = Math.max(1, Number(searchParams.get('page')  || 1))
  const limit       = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {}
  if (recallType) where.recallType = recallType
  if (roomId)     where.roomId     = Number(roomId)
  if (from || to) {
    where.recalledAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    }
  }

  // Filter theo trạng thái sửa chữa
  if (repairStatus === 'pending_repair') {
    where.recallType     = 'RECALL_FOR_REPAIR'
    where.repairStartedAt = null
  } else if (repairStatus === 'in_repair') {
    where.repairStartedAt  = { not: null }
    where.repairFinishedAt = null
  } else if (repairStatus === 'completed') {
    where.repairFinishedAt = { not: null }
  }

  // Filter overdue: RECALL_FOR_REPAIR chưa xong sau threshold ngày
  if (overdue === 'true') {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'recall_overdue_days' } })
    const days = setting ? Number(setting.value) : 3
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    where.recallType      = 'RECALL_FOR_REPAIR'
    where.repairFinishedAt = null
    where.recalledAt      = { lte: threshold }
  }

  const [total, records] = await Promise.all([
    prisma.recallRecord.count({ where }),
    prisma.recallRecord.findMany({
      where,
      include:  RECALL_INCLUDE,
      orderBy:  { recalledAt: 'desc' },
      skip:     (page - 1) * limit,
      take:     limit,
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

  const { machineId, recallType, recalledAt, recalledByTechnicianId, preRepairStatusId, notes, complexity } = body

  if (!machineId || !recallType || !recalledAt) {
    return Response.json({ error: 'Thiếu trường bắt buộc: machineId, recallType, recalledAt' }, { status: 400 })
  }

  const validTypes: RecallType[] = ['RECALL_FOR_REPAIR', 'RECALL_STILL_USABLE', 'RETURN_AFTER_REPAIR']
  if (!validTypes.includes(recallType as RecallType)) {
    return Response.json({ error: 'recallType không hợp lệ' }, { status: 400 })
  }

  const machine = await prisma.machine.findUnique({
    where:  { id: Number(machineId) },
    select: { id: true, roomId: true, machineNo: true },
  })
  if (!machine) return Response.json({ error: 'Không tìm thấy máy' }, { status: 404 })

  // Resolve technicianId của user đang login (nếu là TECHNICIAN)
  let resolvedRecalledByTechId: number | null = null
  if (recalledByTechnicianId) {
    const tech = await prisma.technician.findUnique({ where: { id: Number(recalledByTechnicianId) }, select: { id: true } })
    if (!tech) return Response.json({ error: 'Không tìm thấy kỹ thuật viên' }, { status: 404 })
    resolvedRecalledByTechId = tech.id
  } else if (auth.role === 'TECHNICIAN') {
    const tech = await prisma.technician.findUnique({ where: { userId: auth.userId }, select: { id: true } })
    if (tech) resolvedRecalledByTechId = tech.id
  }

  const validComplexities: RecallComplexity[] = ['LOW', 'MEDIUM', 'HIGH']
  const complexityVal: RecallComplexity = validComplexities.includes(complexity as RecallComplexity)
    ? (complexity as RecallComplexity)
    : 'MEDIUM'

  const record = await prisma.recallRecord.create({
    data: {
      machineId:              machine.id,
      roomId:                 machine.roomId,
      machineNo:              machine.machineNo,
      recallType:             recallType as RecallType,
      complexity:             complexityVal,
      recalledById:           auth.userId,
      recalledByTechnicianId: resolvedRecalledByTechId,
      recalledAt:             new Date(String(recalledAt)),
      preRepairStatusId:      preRepairStatusId ? Number(preRepairStatusId) : null,
      notes:                  notes ? String(notes) : null,
    },
    include: RECALL_INCLUDE,
  })

  await recordAudit({
    userId: auth.userId,
    action: 'recall.created',
    target: `machine:${machine.id}`,
    detail: { recordId: record.id, recallType, machineNo: machine.machineNo },
  })

  return Response.json(record, { status: 201 })
}
