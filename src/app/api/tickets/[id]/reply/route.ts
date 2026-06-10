import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import { recordAudit } from '@/lib/node/audit'
import { sendNotification } from '@/lib/node/notification'
import type { NextRequest } from 'next/server'
import type { TicketStatus } from '@prisma/client'

// Ma trận chuyển đổi trạng thái hợp lệ:
// TECHNICIAN: chỉ IN_PROGRESS, RESOLVED
// ADMIN/MANAGER: bất kỳ
const TECH_ALLOWED_STATUS: TicketStatus[] = ['IN_PROGRESS', 'RESOLVED']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập hoặc không đủ quyền (GUEST không được reply)' }, { status: 403 })

  const rl = rateLimit(`ticket-reply:${auth.userId}`, 30, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  const { id } = await params
  const ticket = await prisma.ticket.findUnique({
    where:   { id: Number(id) },
    include: { createdBy: { select: { id: true, role: true } }, assignedTo: { select: { id: true, userId: true } } },
  })
  if (!ticket) return Response.json({ error: 'Không tìm thấy ticket' }, { status: 404 })

  // TECHNICIAN chỉ reply ticket được gán cho họ
  if (auth.role === 'TECHNICIAN') {
    const tech = await prisma.technician.findUnique({ where: { userId: auth.userId }, select: { id: true } })
    const isAssigned = tech && ticket.assignedToId === tech.id
    const isOwner    = ticket.createdById === auth.userId
    if (!isAssigned && !isOwner) {
      return Response.json({ error: 'Bạn không được phân công ticket này' }, { status: 403 })
    }
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const { content, statusChange, assignToTechnicianId } = body

  if (!content || !String(content).trim()) {
    return Response.json({ error: 'Thiếu nội dung reply' }, { status: 400 })
  }

  // Validate statusChange
  let newStatus: TicketStatus | null = null
  if (statusChange) {
    const validStatuses: TicketStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'RESOLVED']
    if (!validStatuses.includes(statusChange as TicketStatus)) {
      return Response.json({ error: 'statusChange không hợp lệ' }, { status: 400 })
    }
    if (auth.role === 'TECHNICIAN' && !TECH_ALLOWED_STATUS.includes(statusChange as TicketStatus)) {
      return Response.json({ error: 'KTV chỉ được đặt trạng thái IN_PROGRESS hoặc RESOLVED' }, { status: 403 })
    }
    newStatus = statusChange as TicketStatus
  }

  // Gán KTV khi duyệt (ADMIN/MANAGER only)
  let assignedToId: number | null | undefined = undefined
  let assignedTechUserId: number | null = null
  if (assignToTechnicianId !== undefined && (auth.role === 'ADMIN' || auth.role === 'MANAGER')) {
    if (assignToTechnicianId === null) {
      assignedToId = null
    } else {
      const tech = await prisma.technician.findUnique({
        where:  { id: Number(assignToTechnicianId) },
        select: { id: true, userId: true },
      })
      if (!tech) return Response.json({ error: 'Không tìm thấy kỹ thuật viên' }, { status: 404 })
      assignedToId     = tech.id
      assignedTechUserId = tech.userId
    }
  }

  // Tạo reply và cập nhật ticket trong transaction
  const [reply] = await prisma.$transaction(async (tx) => {
    const r = await tx.ticketReply.create({
      data: {
        ticketId:     ticket.id,
        content:      String(content).trim(),
        statusChange: newStatus,
        createdById:  auth.userId,
      },
      include: { createdBy: { select: { id: true, username: true, role: true, profile: { select: { displayName: true } } } } },
    })

    // Cập nhật ticket nếu cần
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ticketUpdate: Record<string, any> = {}
    if (newStatus)               ticketUpdate.status = newStatus
    if (assignedToId !== undefined) ticketUpdate.assignedToId = assignedToId

    if (Object.keys(ticketUpdate).length > 0) {
      await tx.ticket.update({ where: { id: ticket.id }, data: ticketUpdate })
    }

    return [r]
  })

  await recordAudit({
    userId: auth.userId,
    action: 'ticket.replied',
    target: `ticket:${id}`,
    detail: { replyId: reply.id, statusChange: newStatus },
  })

  // Notifications
  const replyerName = reply.createdBy.profile?.displayName ?? reply.createdBy.username

  // Notify người tạo ticket (trừ khi chính họ reply)
  if (ticket.createdBy.id !== auth.userId) {
    await sendNotification({
      userId:  ticket.createdBy.id,
      title:   `Phản hồi ticket: ${ticket.title}`,
      message: `${replyerName}: ${String(content).slice(0, 80)}`,
      type:    'INFO',
      link:    `/tickets/${ticket.id}`,
    })
  }

  // Notify KTV nếu được gán lúc này
  if (assignedTechUserId && assignedTechUserId !== auth.userId) {
    await sendNotification({
      userId:  assignedTechUserId,
      title:   `Được gán ticket: ${ticket.title}`,
      message: `Bạn được phân công xử lý ticket #${ticket.id}.`,
      type:    'INFO',
      link:    `/tickets/${ticket.id}`,
    })
  }

  return Response.json(reply, { status: 201 })
}
