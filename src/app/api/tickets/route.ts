import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import { recordAudit } from '@/lib/node/audit'
import { sendNotification } from '@/lib/node/notification'
import { getSetting } from '@/lib/node/settings'
import type { NextRequest } from 'next/server'
import type { TicketSeverity, TicketStatus } from '@prisma/client'

const TICKET_INCLUDE = {
  room:       { select: { roomCode: true } },
  createdBy:  { select: { id: true, username: true, profile: { select: { displayName: true } } } },
  assignedTo: { select: { id: true, name: true } },
  replies:    { orderBy: { createdAt: 'desc' as const }, take: 1, select: { id: true, createdAt: true } },
} as const

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status   = searchParams.get('status') as TicketStatus | null
  const severity = searchParams.get('severity') as TicketSeverity | null
  const roomId   = searchParams.get('roomId')
  const isUrgent = searchParams.get('isUrgent')
  const from     = searchParams.get('from')
  const to       = searchParams.get('to')
  const page     = Math.max(1, Number(searchParams.get('page')  || 1))
  const limit    = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {}

  // GUEST chỉ thấy ticket của mình
  // TECHNICIAN chỉ thấy ticket được gán cho họ hoặc do họ tạo
  if (auth.role === 'GUEST') {
    where.createdById = auth.userId
  } else if (auth.role === 'TECHNICIAN') {
    const tech = await prisma.technician.findUnique({ where: { userId: auth.userId }, select: { id: true } })
    where.OR = [
      { createdById: auth.userId },
      ...(tech ? [{ assignedToId: tech.id }] : []),
    ]
  }

  if (status)   where.status   = status
  if (severity) where.severity = severity
  if (roomId)   where.roomId   = Number(roomId)
  if (isUrgent === 'true')  where.isUrgent = true
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    }
  }

  const [total, records] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      include:  TICKET_INCLUDE,
      orderBy:  [{ isUrgent: 'desc' }, { createdAt: 'desc' }],
      skip:     (page - 1) * limit,
      take:     limit,
    }),
  ])

  // Tính hasUnreadReply cho GUEST
  const data = records.map(t => {
    const lastReply = t.replies[0] ?? null
    const hasUnreadReply = auth.role === 'GUEST'
      ? !!(lastReply && (!t.guestReadAt || lastReply.createdAt > t.guestReadAt))
      : undefined
    return { ...t, hasUnreadReply }
  })

  return Response.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const rl = rateLimit(`ticket-create:${auth.userId}`, 20, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const { title, description, roomId, machineNo, severity, isUrgent, urgentReason, imageUrls } = body

  if (!title || !description) {
    return Response.json({ error: 'Thiếu trường bắt buộc: title, description' }, { status: 400 })
  }
  if (String(title).length > 200) {
    return Response.json({ error: 'Tiêu đề tối đa 200 ký tự' }, { status: 400 })
  }

  const validSeverities: TicketSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  const severityVal: TicketSeverity = validSeverities.includes(severity as TicketSeverity)
    ? (severity as TicketSeverity)
    : 'MEDIUM'

  // Validate roomId nếu có
  if (roomId) {
    const room = await prisma.room.findUnique({ where: { id: Number(roomId) }, select: { id: true } })
    if (!room) return Response.json({ error: 'Không tìm thấy phòng' }, { status: 404 })
  }

  // Validate imageUrls
  let imageUrlsStr: string | null = null
  if (imageUrls) {
    try {
      const arr = typeof imageUrls === 'string' ? JSON.parse(imageUrls) : imageUrls
      if (!Array.isArray(arr)) throw new Error()
      if (arr.length > 5) return Response.json({ error: 'Tối đa 5 ảnh mỗi ticket' }, { status: 400 })
      imageUrlsStr = JSON.stringify(arr)
    } catch {
      return Response.json({ error: 'imageUrls phải là mảng JSON' }, { status: 400 })
    }
  }

  const urgent = Boolean(isUrgent)

  const ticket = await prisma.ticket.create({
    data: {
      title:        String(title),
      description:  String(description),
      roomId:       roomId ? Number(roomId) : null,
      machineNo:    machineNo ? Number(machineNo) : null,
      severity:     severityVal,
      isUrgent:     urgent,
      urgentReason: urgent && urgentReason ? String(urgentReason) : null,
      imageUrls:    imageUrlsStr,
      createdById:  auth.userId,
    },
    include: {
      room:       { select: { roomCode: true } },
      createdBy:  { select: { id: true, username: true, profile: { select: { displayName: true } } } },
      assignedTo: { select: { id: true, name: true } },
    },
  })

  await recordAudit({
    userId: auth.userId,
    action: 'ticket.created',
    target: `ticket:${ticket.id}`,
    detail: { title: ticket.title, severity: severityVal, isUrgent: urgent },
  })

  // Gửi notification cho ADMIN + MANAGER
  const notifType = urgent ? 'ERROR' : 'INFO'
  const notifTitle = urgent
    ? `[KHẨN] Ticket mới: ${ticket.title}`
    : `Ticket mới: ${ticket.title}`
  await sendNotification({
    roles:   ['ADMIN', 'MANAGER'],
    title:   notifTitle,
    message: `Từ: ${ticket.createdBy.profile?.displayName ?? ticket.createdBy.username}. ${ticket.description.slice(0, 100)}`,
    type:    notifType,
    link:    `/tickets/admin?id=${ticket.id}`,
  })

  // Gửi email nếu urgent và SMTP đã cấu hình
  if (urgent) {
    try {
      const host = await getSetting('smtp_host')
      const port = await getSetting('smtp_port')
      const user = await getSetting('smtp_user')
      const pass = await getSetting('smtp_pass')
      const from = await getSetting('smtp_from')
      if (host && port && user && pass && from) {
        const admins = await prisma.user.findMany({
          where: { role: { in: ['ADMIN', 'MANAGER'] }, isActive: true, email: { not: '' } },
          select: { email: true },
        })
        const toList = admins.map(u => u.email).join(', ')
        if (toList) {
          const nodemailer = (await import('nodemailer')).default
          const transporter = nodemailer.createTransport({
            host, port: parseInt(port, 10), secure: port === '465', auth: { user, pass },
          })
          await transporter.sendMail({
            from,
            to: toList,
            subject: `[KHẨN] Ticket: ${ticket.title}`,
            html: `<h3>Ticket Khẩn Cấp</h3><p><b>Tiêu đề:</b> ${ticket.title}</p><p><b>Mô tả:</b> ${ticket.description}</p>${urgentReason ? `<p><b>Lý do khẩn:</b> ${urgentReason}</p>` : ''}<p>Xem tại hệ thống quản lý phòng máy.</p>`,
          })
        }
      }
    } catch { /* ignore email failure */ }
  }

  return Response.json(ticket, { status: 201 })
}
