/**
 * Integration tests — Tickets API
 *
 * Kiểm tra GET/POST /api/tickets, bao gồm:
 * - Validation body (title, imageUrls, roomId)
 * - Phân quyền theo role: GUEST chỉ thấy ticket của mình, TECHNICIAN thấy ticket được gán
 * - Ticket khẩn cấp gửi notification loại ERROR
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/node/auth', () => ({
  requireRole: vi.fn(),
  requireCsrf: vi.fn(() => true),
}))

vi.mock('@/lib/node/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ ok: true, remaining: 19, retryAfterSeconds: 0 })),
}))

vi.mock('@/lib/node/audit', () => ({
  recordAudit: vi.fn(),
}))

vi.mock('@/lib/node/notification', () => ({
  sendNotification: vi.fn().mockResolvedValue({ sent: 2, skipped: null }),
}))

vi.mock('@/lib/node/settings', () => ({
  getSetting: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    ticket: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    room: {
      findUnique: vi.fn(),
    },
    technician: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    notification: {
      createMany: vi.fn(),
    },
    notificationDebounce: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}))

import { GET, POST } from '@/app/api/tickets/route'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { sendNotification } from '@/lib/node/notification'
import { prisma } from '@/lib/prisma'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const AUTH_ADMIN   = { userId: 1, username: 'admin',   role: 'ADMIN' as const,      email: 'admin@test.com',   ver: 0 }
const AUTH_MANAGER = { userId: 2, username: 'manager', role: 'MANAGER' as const,    email: 'mgr@test.com',     ver: 0 }
const AUTH_TECH    = { userId: 5, username: 'ktv01',   role: 'TECHNICIAN' as const, email: 'ktv@test.com',     ver: 0 }
const AUTH_GUEST   = { userId: 9, username: 'guest01', role: 'GUEST' as const,      email: 'guest@test.com',   ver: 0 }

const MOCK_ROOM = { id: 3, roomCode: 'B202' }

const SAMPLE_TICKET = {
  id: 1, roomId: 3, machineNo: 12,
  title: 'Máy 12 không lên màn hình',
  description: 'Bật máy lên nhưng màn hình tối hoàn toàn',
  severity: 'HIGH', status: 'PENDING',
  isUrgent: false, urgentReason: null,
  imageUrls: null, createdById: 9, assignedToId: null,
  guestReadAt: null,
  createdAt: new Date(), updatedAt: new Date(),
  room: { roomCode: 'B202' },
  createdBy: { id: 9, username: 'guest01', profile: { displayName: 'Nguyễn Văn A' } },
  assignedTo: null,
  replies: [],
}

function makePostReq(body: object): NextRequest {
  return {
    nextUrl: new URL('http://localhost/api/tickets'),
    json: () => Promise.resolve(body),
  } as unknown as NextRequest
}

function makeGetReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/tickets')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return { nextUrl: url } as unknown as NextRequest
}

// ─── GET /api/tickets ─────────────────────────────────────────────────────────

describe('GET /api/tickets', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trả về 401 khi chưa đăng nhập', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(null)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(401)
  })

  it('ADMIN thấy toàn bộ ticket — không có filter createdById', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    vi.mocked(prisma.ticket.count as ReturnType<typeof vi.fn>).mockResolvedValue(5)
    vi.mocked(prisma.ticket.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await GET(makeGetReq())

    expect(prisma.ticket.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ createdById: expect.anything() }) }),
    )
  })

  it('GUEST chỉ thấy ticket của mình (createdById = userId)', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_GUEST as never)
    vi.mocked(prisma.ticket.count as ReturnType<typeof vi.fn>).mockResolvedValue(2)
    vi.mocked(prisma.ticket.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...SAMPLE_TICKET, id: 1 },
      { ...SAMPLE_TICKET, id: 2 },
    ])

    const res = await GET(makeGetReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(prisma.ticket.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ createdById: 9 }) }),
    )
  })

  it('GUEST: hasUnreadReply = true khi có reply mới hơn guestReadAt', async () => {
    const lastReplyAt = new Date(Date.now() - 1000)
    const guestReadAt = new Date(Date.now() - 60000) // đọc trước đó 1 phút

    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_GUEST as never)
    vi.mocked(prisma.ticket.count as ReturnType<typeof vi.fn>).mockResolvedValue(1)
    vi.mocked(prisma.ticket.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...SAMPLE_TICKET, guestReadAt, replies: [{ id: 10, createdAt: lastReplyAt }] },
    ])

    const res = await GET(makeGetReq())
    const body = await res.json()

    expect(body.data[0].hasUnreadReply).toBe(true)
  })

  it('GUEST: hasUnreadReply = false khi guestReadAt mới hơn reply', async () => {
    const lastReplyAt = new Date(Date.now() - 60000)
    const guestReadAt = new Date(Date.now() - 1000) // đọc sau reply

    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_GUEST as never)
    vi.mocked(prisma.ticket.count as ReturnType<typeof vi.fn>).mockResolvedValue(1)
    vi.mocked(prisma.ticket.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...SAMPLE_TICKET, guestReadAt, replies: [{ id: 10, createdAt: lastReplyAt }] },
    ])

    const res = await GET(makeGetReq())
    const body = await res.json()

    expect(body.data[0].hasUnreadReply).toBe(false)
  })

  it('TECHNICIAN thấy ticket của mình và ticket được gán (OR condition)', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_TECH as never)
    vi.mocked(prisma.technician.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 7 })
    vi.mocked(prisma.ticket.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    vi.mocked(prisma.ticket.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await GET(makeGetReq())

    expect(prisma.ticket.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ createdById: 5 }),
            expect.objectContaining({ assignedToId: 7 }),
          ]),
        }),
      }),
    )
  })

  it('MANAGER: filter theo status', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_MANAGER as never)
    vi.mocked(prisma.ticket.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    vi.mocked(prisma.ticket.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await GET(makeGetReq({ status: 'PENDING' }))

    expect(prisma.ticket.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) }),
    )
  })
})

// ─── POST /api/tickets ────────────────────────────────────────────────────────

describe('POST /api/tickets', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trả về 403 khi CSRF không hợp lệ', async () => {
    vi.mocked(requireCsrf).mockReturnValueOnce(false)
    const res = await POST(makePostReq({}))
    expect(res.status).toBe(403)
  })

  it('trả về 401 khi chưa đăng nhập', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(null)
    const res = await POST(makePostReq({}))
    expect(res.status).toBe(401)
  })

  it('trả về 400 khi thiếu title', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_GUEST as never)
    const res = await POST(makePostReq({ description: 'Máy bị lỗi' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/title/)
  })

  it('trả về 400 khi thiếu description', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_GUEST as never)
    const res = await POST(makePostReq({ title: 'Máy lỗi' }))
    expect(res.status).toBe(400)
  })

  it('trả về 400 khi title vượt quá 200 ký tự', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_GUEST as never)
    const res = await POST(makePostReq({
      title: 'A'.repeat(201),
      description: 'Mô tả chi tiết',
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/200/)
  })

  it('trả về 404 khi roomId không tồn tại', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_GUEST as never)
    vi.mocked(prisma.room.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const res = await POST(makePostReq({
      title: 'Máy lỗi', description: 'Chi tiết', roomId: 999,
    }))

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/phòng/)
  })

  it('trả về 400 khi imageUrls vượt quá 5 ảnh', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_GUEST as never)

    const res = await POST(makePostReq({
      title: 'Máy lỗi', description: 'Chi tiết',
      imageUrls: ['/1.jpg', '/2.jpg', '/3.jpg', '/4.jpg', '/5.jpg', '/6.jpg'],
    }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/5/)
  })

  it('tạo ticket thường thành công và trả về 201', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_GUEST as never)
    vi.mocked(prisma.room.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_ROOM)
    vi.mocked(prisma.ticket.create as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_TICKET)
    vi.mocked(prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }, { id: 2 }])
    vi.mocked(prisma.notification.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 })
    vi.mocked(prisma.notificationDebounce.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const res = await POST(makePostReq({
      title: 'Máy 12 không lên màn hình',
      description: 'Bật máy lên nhưng màn hình tối',
      roomId: 3, machineNo: 12, severity: 'HIGH',
    }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe(1)
  })

  it('ticket khẩn cấp: gửi sendNotification với type ERROR', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_GUEST as never)
    vi.mocked(prisma.room.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_ROOM)
    vi.mocked(prisma.ticket.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...SAMPLE_TICKET, isUrgent: true,
      title: '[KHẨN] Máy lỗi',
    })
    vi.mocked(prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    vi.mocked(prisma.notification.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })
    vi.mocked(prisma.notificationDebounce.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    await POST(makePostReq({
      title: 'Máy lỗi khẩn cấp',
      description: 'Sắp có thi',
      isUrgent: true,
      urgentReason: '60 sinh viên thi buổi chiều',
    }))

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: ['ADMIN', 'MANAGER'],
        type:  'ERROR',
      }),
    )
  })

  it('ticket thường: gửi sendNotification với type INFO', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_GUEST as never)
    vi.mocked(prisma.ticket.create as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_TICKET)
    vi.mocked(prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    vi.mocked(prisma.notification.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })
    vi.mocked(prisma.notificationDebounce.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    await POST(makePostReq({
      title: 'Máy chậm',
      description: 'Máy khởi động chậm',
      isUrgent: false,
    }))

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: ['ADMIN', 'MANAGER'],
        type:  'INFO',
      }),
    )
  })

  it('severity mặc định là MEDIUM khi không truyền hoặc truyền sai', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_GUEST as never)
    vi.mocked(prisma.ticket.create as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_TICKET)
    vi.mocked(prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    vi.mocked(prisma.notification.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })
    vi.mocked(prisma.notificationDebounce.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    await POST(makePostReq({
      title: 'Máy lỗi',
      description: 'Chi tiết',
      severity: 'INVALID_VALUE',
    }))

    expect(prisma.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ severity: 'MEDIUM' }),
      }),
    )
  })
})
