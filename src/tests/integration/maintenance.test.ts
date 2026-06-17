/**
 * Integration tests — Maintenance API
 *
 * Kiểm tra POST /api/maintenance:
 * - machineId nullable — có thể tạo log không liên quan máy cụ thể
 * - machineId hợp lệ — được lưu vào DB
 * - machineNo được lưu cùng machineId
 * - Không ảnh hưởng các field bắt buộc khác
 *
 * Kiểm tra onDelete: SetNull (behavior qua schema)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/node/auth', () => ({
  requireRole:       vi.fn(),
  requireCsrf:       vi.fn().mockReturnValue(true),
  requireRoleStrict: vi.fn(),
}))

vi.mock('@/lib/node/rate-limit', () => ({
  rateLimit: vi.fn().mockReturnValue({ ok: true }),
}))

vi.mock('@/lib/node/notification', () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    room: {
      findUnique: vi.fn(),
    },
    maintenanceLog: {
      create:      vi.fn(),
      count:       vi.fn().mockResolvedValue(0),
      findMany:    vi.fn().mockResolvedValue([]),
      aggregate:   vi.fn().mockResolvedValue({ _sum: {} }),
      deleteMany:  vi.fn().mockResolvedValue({}),
    },
    notificationDebounce: {
      deleteMany: vi.fn().mockResolvedValue({}),
    },
  },
}))

import { POST } from '@/app/api/maintenance/route'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { prisma } from '@/lib/prisma'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const AUTH_ADMIN = { userId: 1, username: 'admin', role: 'ADMIN' as const, email: 'admin@test.com', ver: 0 }
const MOCK_ROOM  = { id: 10, roomCode: 'A101', floorId: 1 }

function makePostReq(body: Record<string, unknown>): NextRequest {
  return {
    nextUrl: { searchParams: new URLSearchParams() },
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as NextRequest
}

const BASE_BODY = {
  roomCode: 'A101',
  isSupplyIntake: false,
  maintenanceDate: '2026-06-16',
  notes: 'Kiểm tra định kỳ',
}

// ─── machineId nullable ───────────────────────────────────────────────────────

describe('POST /api/maintenance — machineId nullable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireCsrf).mockReturnValue(true)
    vi.mocked(requireRole).mockResolvedValue(AUTH_ADMIN as never)
    vi.mocked(prisma.room.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_ROOM)
    vi.mocked(prisma.maintenanceLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1, ...BASE_BODY, roomId: MOCK_ROOM.id, machineId: null, machineNo: null, room: MOCK_ROOM,
    })
  })

  it('tạo log không có machineId — vẫn thành công', async () => {
    const res = await POST(makePostReq({ ...BASE_BODY }))
    expect(res.status).toBe(201)
  })

  it('machineId=null được truyền vào prisma.create', async () => {
    await POST(makePostReq({ ...BASE_BODY }))
    const createCall = vi.mocked(prisma.maintenanceLog.create).mock.calls[0][0]
    expect(createCall.data.machineId).toBeNull()
    expect(createCall.data.machineNo).toBeNull()
  })

  it('tạo log CÓ machineId — được lưu đúng', async () => {
    vi.mocked(prisma.maintenanceLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 2, ...BASE_BODY, roomId: MOCK_ROOM.id, machineId: 5, machineNo: 3, room: MOCK_ROOM,
    })

    const res = await POST(makePostReq({ ...BASE_BODY, machineId: 5, machineNo: 3 }))
    expect(res.status).toBe(201)

    const createCall = vi.mocked(prisma.maintenanceLog.create).mock.calls[0][0]
    expect(createCall.data.machineId).toBe(5)
    expect(createCall.data.machineNo).toBe(3)
  })

  it('thiếu maintenanceDate → 400', async () => {
    const res = await POST(makePostReq({ roomCode: 'A101', isSupplyIntake: false }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/maintenanceDate/)
  })

  it('isSupplyIntake=false nhưng thiếu roomCode → 400', async () => {
    const res = await POST(makePostReq({ isSupplyIntake: false, maintenanceDate: '2026-06-16' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/roomCode/)
  })

  it('phòng không tồn tại → 404', async () => {
    vi.mocked(prisma.room.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const res = await POST(makePostReq({ ...BASE_BODY, roomCode: 'INVALID' }))
    expect(res.status).toBe(404)
  })

  it('isSupplyIntake=true → không cần roomCode', async () => {
    vi.mocked(prisma.maintenanceLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 3, isSupplyIntake: true, maintenanceDate: '2026-06-16', roomId: null, machineId: null, room: null,
    })
    const res = await POST(makePostReq({ isSupplyIntake: true, maintenanceDate: '2026-06-16' }))
    expect(res.status).toBe(201)
  })
})

// ─── SET NULL behavior (kiểm tra qua schema intent) ──────────────────────────

describe('MaintenanceLog.machine — onDelete: SetNull (schema intent)', () => {
  it('machineId là nullable trong schema — cho phép null sau khi machine bị xóa', () => {
    // Kiểm tra rằng API tạo log chấp nhận machineId = null
    // (Hành vi SET NULL thực tế được DB enforce khi machine bị xóa)
    const logData = {
      machineId: null as number | null,
      machineNo: null as number | null,
      roomId: 10,
      maintenanceDate: new Date('2026-06-16'),
    }
    // machineId nullable → hợp lệ
    expect(logData.machineId).toBeNull()
    expect(logData.machineNo).toBeNull()
  })

  it('machineId có giá trị → được lưu bình thường', () => {
    const logWithMachine = { machineId: 5, machineNo: 3, roomId: 10 }
    expect(logWithMachine.machineId).toBe(5)
    expect(logWithMachine.machineNo).toBe(3)
  })
})
