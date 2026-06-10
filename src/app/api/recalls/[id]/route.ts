import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { recordAudit } from '@/lib/node/audit'
import type { NextRequest } from 'next/server'

const RECALL_DETAIL_INCLUDE = {
  machine:               { select: { machineNo: true, isTeacher: true, isFaulty: true } },
  room:                  { select: { roomCode: true, floor: { select: { name: true } } } },
  recalledBy:            { select: { id: true, username: true, profile: { select: { displayName: true } } } },
  recalledByTechnician:  { select: { id: true, name: true, phone: true } },
  repairedBy:            { select: { id: true, username: true, profile: { select: { displayName: true } } } },
  repairedByTechnician:  { select: { id: true, name: true, phone: true } },
  preRepairStatus:       { select: { id: true, description: true, reportedAt: true, imageUrls: true, reportedBy: true } },
  alerts:                { orderBy: { sentAt: 'desc' as const }, select: { id: true, daysOverdue: true, sentAt: true, dismissedAt: true, dismissedById: true } },
  maintenanceLogs:       { select: { id: true, maintenanceDate: true, actionType: true, notes: true, technicianName: true, createdAt: true }, orderBy: { createdAt: 'desc' as const }, take: 10 },
} as const

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id } = await params
  const record = await prisma.recallRecord.findUnique({
    where:   { id: Number(id) },
    include: RECALL_DETAIL_INCLUDE,
  })
  if (!record) return Response.json({ error: 'Không tìm thấy bản ghi' }, { status: 404 })

  return Response.json(record)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.recallRecord.findUnique({ where: { id: Number(id) } })
  if (!existing) return Response.json({ error: 'Không tìm thấy bản ghi' }, { status: 404 })

  // TECHNICIAN chỉ được cập nhật bản ghi liên quan đến họ
  if (auth.role === 'TECHNICIAN') {
    const myTech = await prisma.technician.findUnique({ where: { userId: auth.userId }, select: { id: true } })
    const myTechId = myTech?.id ?? null
    const isRecaller = existing.recalledById === auth.userId || (myTechId && existing.recalledByTechnicianId === myTechId)
    const isRepairer = existing.repairedById === auth.userId || (myTechId && existing.repairedByTechnicianId === myTechId)
    if (!isRecaller && !isRepairer) {
      return Response.json({ error: 'Không có quyền cập nhật bản ghi này' }, { status: 403 })
    }
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const { repairStartedAt, repairFinishedAt, repairedByTechnicianId, notes, complexity } = body

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {}

  // Nhận sửa
  if (repairStartedAt !== undefined) {
    if (existing.repairStartedAt) return Response.json({ error: 'Đã nhận sửa trước đó' }, { status: 400 })
    updateData.repairStartedAt  = new Date(String(repairStartedAt))
    updateData.repairedById     = auth.userId

    let techId: number | null = null
    if (repairedByTechnicianId) {
      const tech = await prisma.technician.findUnique({ where: { id: Number(repairedByTechnicianId) }, select: { id: true } })
      if (!tech) return Response.json({ error: 'Không tìm thấy kỹ thuật viên' }, { status: 404 })
      techId = tech.id
    } else if (auth.role === 'TECHNICIAN') {
      const tech = await prisma.technician.findUnique({ where: { userId: auth.userId }, select: { id: true } })
      if (tech) techId = tech.id
    }
    updateData.repairedByTechnicianId = techId
  }

  // Đánh dấu hoàn thành
  if (repairFinishedAt !== undefined) {
    if (!existing.repairStartedAt) return Response.json({ error: 'Chưa bắt đầu sửa — cần nhận sửa trước' }, { status: 400 })
    if (existing.repairFinishedAt) return Response.json({ error: 'Đã đánh dấu hoàn thành trước đó' }, { status: 400 })
    updateData.repairFinishedAt = new Date(String(repairFinishedAt))
  }

  if (notes !== undefined)      updateData.notes      = notes ? String(notes) : null
  if (complexity !== undefined) {
    const valid = ['LOW', 'MEDIUM', 'HIGH']
    if (!valid.includes(String(complexity))) return Response.json({ error: 'complexity không hợp lệ' }, { status: 400 })
    updateData.complexity = complexity
  }

  if (Object.keys(updateData).length === 0) {
    return Response.json({ error: 'Không có trường nào để cập nhật' }, { status: 400 })
  }

  const updated = await prisma.recallRecord.update({
    where:   { id: Number(id) },
    data:    updateData,
    include: RECALL_DETAIL_INCLUDE,
  })

  await recordAudit({
    userId: auth.userId,
    action: 'recall.updated',
    target: `recall:${id}`,
    detail: { fields: Object.keys(updateData) },
  })

  return Response.json(updated)
}
