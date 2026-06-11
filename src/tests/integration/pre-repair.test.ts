/**
 * Integration tests — Pre-Repair Status API
 *
 * Kiểm tra GET /api/pre-repair-status và POST /api/pre-repair-status
 * thông qua gọi trực tiếp route handler với Prisma và auth được mock.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// ─── Mocks (phải khai báo trước import) ─────────────────────────────────────

vi.mock('@/lib/node/auth', () => ({
  requireRole: vi.fn(),
  requireCsrf: vi.fn(() => true),
}))

vi.mock('@/lib/node/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ ok: true, remaining: 59, retryAfterSeconds: 0 })),
}))

vi.mock('@/lib/node/audit', () => ({
  recordAudit: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    devicePreRepairStatus: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    machine: {
      findUnique: vi.fn(),
    },
    technician: {
      findUnique: vi.fn(),
    },
  },
}))

import { GET, POST } from '@/app/api/pre-repair-status/route'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { prisma } from '@/lib/prisma'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const AUTH_ADMIN = { userId: 1, username: 'admin', role: 'ADMIN' as const, email: 'admin@test.com', ver: 0 }
const MOCK_MACHINE = { id: 42, roomId: 5, machineNo: 12 }

const SAMPLE_RECORD = {
  id: 1, machineId: 42, roomId: 5, machineNo: 12,
  description: 'Màn hình không lên',
  reportedBy: 'Thầy A',
  reportedAt: new Date('2026-06-10T08:00:00Z'),
  imageUrls: null, technicianId: null, createdById: 1,
  createdAt: new Date(),
  machine: { machineNo: 12, isTeacher: false },
  room: { roomCode: 'B202' },
  technician: null,
  createdBy: { id: 1, username: 'admin', profile: { displayName: 'Admin' } },
}

function makePostReq(body: object): NextRequest {
  return {
    nextUrl: new URL('http://localhost/api/pre-repair-status'),
    json: () => Promise.resolve(body),
  } as unknown as NextRequest
}

function makeGetReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/pre-repair-status')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return { nextUrl: url } as unknown as NextRequest
}

// ─── GET tests ───────────────────────────────────────────────────────────────

describe('GET /api/pre-repair-status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trả về 401 khi chưa đăng nhập', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(null)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/đăng nhập/)
  })

  it('trả về danh sách phân trang', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    vi.mocked(prisma.devicePreRepairStatus.count as ReturnType<typeof vi.fn>).mockResolvedValue(2)
    vi.mocked(prisma.devicePreRepairStatus.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...SAMPLE_RECORD, id: 1 },
      { ...SAMPLE_RECORD, id: 2 },
    ])

    const res = await GET(makeGetReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.total).toBe(2)
    expect(body.data).toHaveLength(2)
    expect(body.page).toBe(1)
    expect(body.totalPages).toBe(1)
  })

  it('filter theo machineId truyền đúng vào prisma', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    vi.mocked(prisma.devicePreRepairStatus.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    vi.mocked(prisma.devicePreRepairStatus.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await GET(makeGetReq({ machineId: '42' }))

    expect(prisma.devicePreRepairStatus.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ machineId: 42 }) }),
    )
  })

  it('filter theo roomId và khoảng ngày', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    vi.mocked(prisma.devicePreRepairStatus.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    vi.mocked(prisma.devicePreRepairStatus.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await GET(makeGetReq({ roomId: '5', from: '2026-01-01', to: '2026-06-30' }))

    expect(prisma.devicePreRepairStatus.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roomId:    5,
          createdAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
        }),
      }),
    )
  })

  it('giới hạn limit tối đa 50', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    vi.mocked(prisma.devicePreRepairStatus.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    vi.mocked(prisma.devicePreRepairStatus.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await GET(makeGetReq({ limit: '999' }))

    expect(prisma.devicePreRepairStatus.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    )
  })
})

// ─── POST tests ──────────────────────────────────────────────────────────────

describe('POST /api/pre-repair-status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trả về 403 khi CSRF token không hợp lệ', async () => {
    vi.mocked(requireCsrf).mockReturnValueOnce(false)
    const res = await POST(makePostReq({}))
    expect(res.status).toBe(403)
  })

  it('trả về 401 khi chưa đăng nhập', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(null)
    const res = await POST(makePostReq({}))
    expect(res.status).toBe(401)
  })

  it('trả về 400 khi thiếu machineId', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await POST(makePostReq({ description: 'Lỗi', reportedAt: '2026-06-10T08:00:00Z' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/machineId/)
  })

  it('trả về 400 khi thiếu description', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await POST(makePostReq({ machineId: 42, reportedAt: '2026-06-10T08:00:00Z' }))
    expect(res.status).toBe(400)
  })

  it('trả về 400 khi thiếu reportedAt', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await POST(makePostReq({ machineId: 42, description: 'Lỗi màn hình' }))
    expect(res.status).toBe(400)
  })

  it('trả về 404 khi machine không tồn tại', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    vi.mocked(prisma.machine.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const res = await POST(makePostReq({
      machineId: 999,
      description: 'Lỗi màn hình',
      reportedAt: '2026-06-10T08:00:00Z',
    }))

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/máy/)
  })

  it('trả về 404 khi technicianId không tồn tại', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    vi.mocked(prisma.machine.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MACHINE)
    vi.mocked(prisma.technician.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const res = await POST(makePostReq({
      machineId: 42, description: 'Lỗi màn hình',
      reportedAt: '2026-06-10T08:00:00Z', technicianId: 999,
    }))

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/kỹ thuật viên/)
  })

  it('trả về 400 khi imageUrls vượt quá 5 ảnh', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    vi.mocked(prisma.machine.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MACHINE)

    const res = await POST(makePostReq({
      machineId: 42, description: 'Lỗi', reportedAt: '2026-06-10T08:00:00Z',
      imageUrls: ['/1.jpg', '/2.jpg', '/3.jpg', '/4.jpg', '/5.jpg', '/6.jpg'],
    }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/5/)
  })

  it('trả về 400 khi imageUrls không phải mảng JSON', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    vi.mocked(prisma.machine.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MACHINE)

    const res = await POST(makePostReq({
      machineId: 42, description: 'Lỗi', reportedAt: '2026-06-10T08:00:00Z',
      imageUrls: 'not-an-array',
    }))

    expect(res.status).toBe(400)
  })

  it('tạo bản ghi thành công và trả về 201', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    vi.mocked(prisma.machine.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MACHINE)
    vi.mocked(prisma.devicePreRepairStatus.create as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_RECORD)

    const res = await POST(makePostReq({
      machineId: 42,
      description: 'Màn hình không lên',
      reportedAt: '2026-06-10T08:00:00Z',
      reportedBy: 'Thầy A',
    }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe(1)
  })

  it('tạo bản ghi với imageUrls hợp lệ — lưu dưới dạng JSON string', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    vi.mocked(prisma.machine.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MACHINE)
    vi.mocked(prisma.devicePreRepairStatus.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...SAMPLE_RECORD,
      imageUrls: '["/img/a.jpg","/img/b.jpg"]',
    })

    const res = await POST(makePostReq({
      machineId: 42, description: 'Lỗi', reportedAt: '2026-06-10T08:00:00Z',
      imageUrls: ['/img/a.jpg', '/img/b.jpg'],
    }))

    expect(res.status).toBe(201)
    expect(prisma.devicePreRepairStatus.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imageUrls: '["/img/a.jpg","/img/b.jpg"]',
        }),
      }),
    )
  })

  it('ghi audit log sau khi tạo thành công', async () => {
    const { recordAudit } = await import('@/lib/node/audit')
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    vi.mocked(prisma.machine.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MACHINE)
    vi.mocked(prisma.devicePreRepairStatus.create as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_RECORD)

    await POST(makePostReq({
      machineId: 42, description: 'Lỗi', reportedAt: '2026-06-10T08:00:00Z',
    }))

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pre_repair.created' }),
    )
  })
})
