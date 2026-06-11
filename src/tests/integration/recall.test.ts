/**
 * Integration tests — Recalls API + Check-Overdue
 *
 * Kiểm tra POST/GET /api/recalls và POST /api/recalls/check-overdue
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// ─── Mocks ───────────────────────────────────────────────────────────────────

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

vi.mock('@/lib/node/notification', () => ({
  sendNotification: vi.fn().mockResolvedValue({ sent: 2, skipped: null }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recallRecord: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    recallAlert: {
      create: vi.fn(),
    },
    machine: {
      findUnique: vi.fn(),
    },
    technician: {
      findUnique: vi.fn(),
    },
    systemSetting: {
      findUnique: vi.fn(),
    },
    notificationDebounce: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    notification: {
      createMany: vi.fn(),
    },
  },
}))

import { GET, POST } from '@/app/api/recalls/route'
import { POST as checkOverdue } from '@/app/api/recalls/check-overdue/route'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { prisma } from '@/lib/prisma'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const AUTH_MANAGER = { userId: 2, username: 'manager', role: 'MANAGER' as const, email: 'mgr@test.com', ver: 0 }
const AUTH_TECH    = { userId: 5, username: 'ktv01',   role: 'TECHNICIAN' as const, email: 'ktv@test.com', ver: 0 }
const MOCK_MACHINE = { id: 42, roomId: 5, machineNo: 12 }

const SAMPLE_RECALL = {
  id: 1, machineId: 42, roomId: 5, machineNo: 12,
  recallType: 'RECALL_FOR_REPAIR', complexity: 'MEDIUM',
  recalledById: 2, recalledByTechnicianId: null,
  recalledAt: new Date('2026-06-10T09:00:00Z'),
  repairStartedAt: null, repairFinishedAt: null,
  preRepairStatusId: null, notes: null,
  createdAt: new Date(), updatedAt: new Date(),
  machine: { machineNo: 12, isTeacher: false },
  room: { roomCode: 'B202' },
  recalledBy: { id: 2, username: 'manager', profile: { displayName: 'Manager' } },
  recalledByTechnician: null, repairedBy: null, repairedByTechnician: null,
  preRepairStatus: null, alerts: [],
}

function makePostReq(body: object): NextRequest {
  return {
    nextUrl: new URL('http://localhost/api/recalls'),
    json: () => Promise.resolve(body),
  } as unknown as NextRequest
}

function makeGetReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/recalls')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return { nextUrl: url } as unknown as NextRequest
}

function makeCronReq(key: string | null): NextRequest {
  return {
    headers: { get: (h: string) => h === 'x-internal-key' ? key : null },
  } as unknown as NextRequest
}

// ─── GET /api/recalls ─────────────────────────────────────────────────────────

describe('GET /api/recalls', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trả về 401 khi chưa đăng nhập', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(null)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(401)
  })

  it('trả về danh sách phân trang', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_MANAGER as never)
    vi.mocked(prisma.recallRecord.count as ReturnType<typeof vi.fn>).mockResolvedValue(1)
    vi.mocked(prisma.recallRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([SAMPLE_RECALL])

    const res = await GET(makeGetReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.total).toBe(1)
    expect(body.data).toHaveLength(1)
  })

  it('filter theo recallType', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_MANAGER as never)
    vi.mocked(prisma.recallRecord.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    vi.mocked(prisma.recallRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await GET(makeGetReq({ type: 'RECALL_FOR_REPAIR' }))

    expect(prisma.recallRecord.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ recallType: 'RECALL_FOR_REPAIR' }) }),
    )
  })

  it('filter overdue=true: query records quá hạn', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_MANAGER as never)
    vi.mocked(prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ value: '3' })
    vi.mocked(prisma.recallRecord.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    vi.mocked(prisma.recallRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await GET(makeGetReq({ overdue: 'true' }))

    expect(prisma.recallRecord.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recallType:       'RECALL_FOR_REPAIR',
          repairFinishedAt: null,
        }),
      }),
    )
  })
})

// ─── POST /api/recalls ────────────────────────────────────────────────────────

describe('POST /api/recalls', () => {
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

  it('trả về 400 khi thiếu machineId', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_MANAGER as never)
    const res = await POST(makePostReq({ recallType: 'RECALL_FOR_REPAIR', recalledAt: '2026-06-10T09:00:00Z' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/machineId/)
  })

  it('trả về 400 khi recallType không hợp lệ', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_MANAGER as never)
    const res = await POST(makePostReq({
      machineId: 42, recallType: 'INVALID_TYPE', recalledAt: '2026-06-10T09:00:00Z',
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/recallType/)
  })

  it('trả về 404 khi machine không tồn tại', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_MANAGER as never)
    vi.mocked(prisma.machine.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const res = await POST(makePostReq({
      machineId: 999, recallType: 'RECALL_FOR_REPAIR', recalledAt: '2026-06-10T09:00:00Z',
    }))

    expect(res.status).toBe(404)
  })

  it('trả về 404 khi recalledByTechnicianId không tồn tại', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_MANAGER as never)
    vi.mocked(prisma.machine.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MACHINE)
    vi.mocked(prisma.technician.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const res = await POST(makePostReq({
      machineId: 42, recallType: 'RECALL_FOR_REPAIR',
      recalledAt: '2026-06-10T09:00:00Z', recalledByTechnicianId: 999,
    }))

    expect(res.status).toBe(404)
  })

  it('tạo recall thành công với status 201', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_MANAGER as never)
    vi.mocked(prisma.machine.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MACHINE)
    vi.mocked(prisma.recallRecord.create as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_RECALL)

    const res = await POST(makePostReq({
      machineId: 42, recallType: 'RECALL_FOR_REPAIR',
      recalledAt: '2026-06-10T09:00:00Z', notes: 'CPU bị cháy',
    }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe(1)
  })

  it('TECHNICIAN: auto-resolve technicianId từ userId', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_TECH as never)
    vi.mocked(prisma.machine.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MACHINE)
    // Không truyền recalledByTechnicianId → server tự resolve từ userId=5
    vi.mocked(prisma.technician.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 7 })
    vi.mocked(prisma.recallRecord.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...SAMPLE_RECALL, recalledById: 5, recalledByTechnicianId: 7,
    })

    const res = await POST(makePostReq({
      machineId: 42, recallType: 'RECALL_FOR_REPAIR', recalledAt: '2026-06-10T09:00:00Z',
    }))

    expect(res.status).toBe(201)
    // Khi TECHNICIAN không cung cấp recalledByTechnicianId,
    // server tự lookup technician.userId = auth.userId
    expect(prisma.technician.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 5 } }),
    )
    expect(prisma.recallRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recalledByTechnicianId: 7 }),
      }),
    )
  })

  it('complexity mặc định là MEDIUM khi không truyền', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_MANAGER as never)
    vi.mocked(prisma.machine.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MACHINE)
    vi.mocked(prisma.recallRecord.create as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_RECALL)

    await POST(makePostReq({
      machineId: 42, recallType: 'RECALL_FOR_REPAIR', recalledAt: '2026-06-10T09:00:00Z',
    }))

    expect(prisma.recallRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ complexity: 'MEDIUM' }),
      }),
    )
  })

  it('complexity HIGH được giữ nguyên khi truyền vào', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_MANAGER as never)
    vi.mocked(prisma.machine.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MACHINE)
    vi.mocked(prisma.recallRecord.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...SAMPLE_RECALL, complexity: 'HIGH',
    })

    await POST(makePostReq({
      machineId: 42, recallType: 'RECALL_FOR_REPAIR',
      recalledAt: '2026-06-10T09:00:00Z', complexity: 'HIGH',
    }))

    expect(prisma.recallRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ complexity: 'HIGH' }),
      }),
    )
  })
})

// ─── POST /api/recalls/check-overdue ─────────────────────────────────────────

describe('POST /api/recalls/check-overdue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INTERNAL_CRON_KEY = 'test-secret-key'
  })

  it('trả về 401 khi không có X-Internal-Key header', async () => {
    const res = await checkOverdue(makeCronReq(null))
    expect(res.status).toBe(401)
  })

  it('trả về 401 khi key sai', async () => {
    const res = await checkOverdue(makeCronReq('wrong-key'))
    expect(res.status).toBe(401)
  })

  it('trả về kết quả khi không có record quá hạn', async () => {
    vi.mocked(prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    vi.mocked(prisma.recallRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const res = await checkOverdue(makeCronReq('test-secret-key'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.checked).toBe(0)
    expect(body.alertsCreated).toBe(0)
    expect(body.thresholdDays).toBe(3) // default
  })

  it('dùng recall_overdue_days từ SystemSetting nếu có', async () => {
    vi.mocked(prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ value: '5' })
    vi.mocked(prisma.recallRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const res = await checkOverdue(makeCronReq('test-secret-key'))
    const body = await res.json()

    expect(body.thresholdDays).toBe(5)
  })

  it('tạo RecallAlert và gửi notification cho record quá hạn', async () => {
    const { sendNotification } = await import('@/lib/node/notification')
    vi.mocked(prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    vi.mocked(prisma.recallRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 10, machineNo: 5,
        recalledAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 ngày trước
        room: { roomCode: 'C101' },
      },
    ])
    vi.mocked(prisma.notificationDebounce.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    vi.mocked(prisma.recallAlert.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    vi.mocked(prisma.notification.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 })
    vi.mocked(prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }, { id: 2 }])

    const res = await checkOverdue(makeCronReq('test-secret-key'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.checked).toBe(1)
    expect(body.alertsCreated).toBe(1)
    expect(prisma.recallAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recallRecordId: 10 }) }),
    )
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ['ADMIN', 'MANAGER'], type: 'WARNING' }),
    )
  })

  it('bỏ qua record đã được alert hôm nay (debounce)', async () => {
    vi.mocked(prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    vi.mocked(prisma.recallRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 11, machineNo: 6,
        recalledAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        room: { roomCode: 'D201' },
      },
    ])
    // Debounce đã tồn tại → bỏ qua
    vi.mocked(prisma.notificationDebounce.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      triggerKey: 'recall_alert_11_2026-06-10',
      lastSentAt: new Date(),
      expiresAt:  new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    const res = await checkOverdue(makeCronReq('test-secret-key'))
    const body = await res.json()

    expect(body.checked).toBe(1)
    expect(body.alertsCreated).toBe(0)
    expect(prisma.recallAlert.create).not.toHaveBeenCalled()
  })
})
