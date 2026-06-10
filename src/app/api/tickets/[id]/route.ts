import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { recordAudit } from '@/lib/node/audit'
import type { NextRequest } from 'next/server'
import type { TicketStatus } from '@prisma/client'

const TICKET_DETAIL_INCLUDE = {
  room:       { select: { roomCode: true, floor: { select: { name: true } } } },
  createdBy:  { select: { id: true, username: true, profile: { select: { displayName: true, phone: true } } } },
  assignedTo: { select: { id: true, name: true, phone: true } },
  replies: {
    orderBy:  { createdAt: 'asc' as const },
    include:  { createdBy: { select: { id: true, username: true, role: true, profile: { select: { displayName: true } } } } },
  },
} as const

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id } = await params
  const ticket = await prisma.ticket.findUnique({
    where:   { id: Number(id) },
    include: TICKET_DETAIL_INCLUDE,
  })
  if (!ticket) return Response.json({ error: 'Không tìm thấy ticket' }, { status: 404 })

  // GUEST chỉ xem ticket của mình
  if (auth.role === 'GUEST' && ticket.createdById !== auth.userId) {
    return Response.json({ error: 'Không có quyền xem ticket này' }, { status: 403 })
  }
  // TECHNICIAN chỉ xem ticket của mình hoặc được gán
  if (auth.role === 'TECHNICIAN') {
    const tech = await prisma.technician.findUnique({ where: { userId: auth.userId }, select: { id: true } })
    const isOwner   = ticket.createdById === auth.userId
    const isAssigned = tech && ticket.assignedToId === tech.id
    if (!isOwner && !isAssigned) {
      return Response.json({ error: 'Không có quyền xem ticket này' }, { status: 403 })
    }
  }

  // Cập nhật guestReadAt khi chủ ticket (GUEST) xem chi tiết
  if (auth.role === 'GUEST' && ticket.createdById === auth.userId) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data:  { guestReadAt: new Date() },
    }).catch(() => { /* ignore */ })
  }

  return Response.json(ticket)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER')
  if (!auth) return Response.json({ error: 'Chỉ ADMIN/MANAGER được cập nhật ticket' }, { status: 403 })

  const { id } = await params
  const ticket = await prisma.ticket.findUnique({ where: { id: Number(id) } })
  if (!ticket) return Response.json({ error: 'Không tìm thấy ticket' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const { assignedToId, status } = body

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {}

  if (assignedToId !== undefined) {
    if (assignedToId === null) {
      updateData.assignedToId = null
    } else {
      const tech = await prisma.technician.findUnique({ where: { id: Number(assignedToId) }, select: { id: true, userId: true } })
      if (!tech) return Response.json({ error: 'Không tìm thấy kỹ thuật viên' }, { status: 404 })
      updateData.assignedToId = tech.id

      // Notify KTV nếu có user account
      if (tech.userId) {
        const { sendNotification } = await import('@/lib/node/notification')
        await sendNotification({
          userId:  tech.userId,
          title:   `Được gán ticket: ${ticket.title}`,
          message: `Bạn được phân công xử lý ticket #${ticket.id}.`,
          type:    'INFO',
          link:    `/tickets/${ticket.id}`,
        })
      }
    }
  }

  if (status !== undefined) {
    const validStatuses: TicketStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'RESOLVED']
    if (!validStatuses.includes(status as TicketStatus)) {
      return Response.json({ error: 'status không hợp lệ' }, { status: 400 })
    }
    updateData.status = status
  }

  if (Object.keys(updateData).length === 0) {
    return Response.json({ error: 'Không có trường nào để cập nhật' }, { status: 400 })
  }

  const updated = await prisma.ticket.update({
    where:   { id: Number(id) },
    data:    updateData,
    include: TICKET_DETAIL_INCLUDE,
  })

  await recordAudit({
    userId: auth.userId,
    action: 'ticket.updated',
    target: `ticket:${id}`,
    detail: { fields: Object.keys(updateData) },
  })

  return Response.json(updated)
}
