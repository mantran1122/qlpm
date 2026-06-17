/**
 * Unit tests — parseDateRange timezone (GMT+7)
 *
 * Server chạy UTC, user ở Asia/Ho_Chi_Minh (+07:00).
 * "Hôm nay" phải tính từ 00:00 VN time, không phải 00:00 UTC.
 *
 * Cách test: mock Date.now() / new Date() để cố định thời gian server,
 * rồi kiểm tra from/to được tính đúng GMT+7.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/node/auth', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    room:            { findMany: vi.fn().mockResolvedValue([]) },
    machine:         { findMany: vi.fn().mockResolvedValue([]) },
    maintenanceLog:  { findMany: vi.fn().mockResolvedValue([]), aggregate: vi.fn().mockResolvedValue({ _sum: {} }), count: vi.fn().mockResolvedValue(0) },
    recallRecord:    { groupBy: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    technician:      { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

import { GET } from '@/app/api/report/route'
import { requireRole } from '@/lib/node/auth'
import { prisma } from '@/lib/prisma'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AUTH_ADMIN = { userId: 1, username: 'admin', role: 'ADMIN' as const, email: 'admin@test.com', ver: 0 }

function makeGetReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/report')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return { nextUrl: url } as unknown as NextRequest
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000  // +07:00

// ─── Timezone tests ───────────────────────────────────────────────────────────

describe('parseDateRange — timezone GMT+7', () => {
  beforeEach(() => vi.clearAllMocks())

  it('period=day: from phải là midnight VN (00:00 +07:00) không phải midnight UTC', async () => {
    // Giả sử server UTC là 22:00 ngày 15/06/2026 → VN time là 05:00 ngày 16/06/2026
    const serverUTC = new Date('2026-06-15T22:00:00Z')
    vi.setSystemTime(serverUTC)

    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    vi.mocked(prisma.maintenanceLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const res = await GET(makeGetReq({ type: 'supply', period: 'day' }))
    expect(res.status).toBe(200)

    const body = await res.json()
    const from = new Date(body.period.from)

    // Midnight VN ngày 16/06 = 2026-06-15T17:00:00Z (UTC)
    expect(from.toISOString()).toBe('2026-06-15T17:00:00.000Z')

    vi.useRealTimers()
  })

  it('period=day: from không phải midnight UTC khi server = 22:00 UTC', async () => {
    const serverUTC = new Date('2026-06-15T22:00:00Z')
    vi.setSystemTime(serverUTC)

    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)

    const res = await GET(makeGetReq({ type: 'supply', period: 'day' }))
    const body = await res.json()
    const from = new Date(body.period.from)

    // Midnight UTC ngày 15/06 sẽ là '2026-06-15T00:00:00.000Z' — SAI
    expect(from.toISOString()).not.toBe('2026-06-15T00:00:00.000Z')

    vi.useRealTimers()
  })

  it('period=month: from phải là đầu tháng theo VN time', async () => {
    // Server UTC là 30/11/2026 18:00 UTC → VN là 01/12/2026 01:00 → tháng VN là tháng 12
    const serverUTC = new Date('2026-11-30T18:00:00Z')
    vi.setSystemTime(serverUTC)

    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)

    const res = await GET(makeGetReq({ type: 'supply', period: 'month' }))
    const body = await res.json()
    const from = new Date(body.period.from)

    // Đầu tháng 12 theo VN = 2026-11-30T17:00:00Z (UTC)
    expect(from.toISOString()).toBe('2026-11-30T17:00:00.000Z')

    vi.useRealTimers()
  })

  it('period=week: from phải là midnight VN của 6 ngày trước', async () => {
    // Server UTC: 2026-06-16T10:00:00Z → VN: 2026-06-16T17:00:00+07:00
    const serverUTC = new Date('2026-06-16T10:00:00Z')
    vi.setSystemTime(serverUTC)

    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)

    const res = await GET(makeGetReq({ type: 'supply', period: 'week' }))
    const body = await res.json()
    const from = new Date(body.period.from)

    // 6 ngày trước VN ngày 16/06 = ngày 10/06 → midnight VN = 2026-06-09T17:00:00Z
    expect(from.toISOString()).toBe('2026-06-09T17:00:00.000Z')

    vi.useRealTimers()
  })

  it('period=custom: to phải là end-of-day VN của ngày to', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)

    const res = await GET(makeGetReq({ type: 'supply', period: 'custom', from: '2026-06-01', to: '2026-06-15' }))
    const body = await res.json()
    const to = new Date(body.period.to)

    // End-of-day ngày 15/06 theo VN = 2026-06-15T16:59:59.999Z (23:59:59 VN = 16:59:59 UTC)
    expect(to.getUTCHours()).toBe(16)
    expect(to.getUTCMinutes()).toBe(59)
  })

  afterEach(() => {
    vi.useRealTimers()
  })
})

// ─── Type=daily hoạt động với period=day ─────────────────────────────────────

describe('GET /api/report — type=daily', () => {
  beforeEach(() => vi.clearAllMocks())

  it('type=daily với period=day trả về 200', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq({ type: 'daily', period: 'day' }))
    expect(res.status).toBe(200)
  })

  it('type=daily trả về đúng cấu trúc DailyReport', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq({ type: 'daily', period: 'day' }))
    const body = await res.json()
    expect(body.type).toBe('daily')
    expect(body).toHaveProperty('summary')
    expect(body.summary).toHaveProperty('totalMachines')
    expect(body.summary).toHaveProperty('goodMachines')
    expect(body.summary).toHaveProperty('errorMachines')
    expect(body.summary).toHaveProperty('maintenanceToday')
    expect(body).toHaveProperty('errorMachinesList')
    expect(body).toHaveProperty('maintenanceLogs')
    expect(body).toHaveProperty('floorStats')
    expect(body).toHaveProperty('byRoom')
    expect(Array.isArray(body.errorMachinesList)).toBe(true)
    expect(Array.isArray(body.floorStats)).toBe(true)
  })

  it('type=daily: errorMachines + goodMachines = totalMachines (với dữ liệu rỗng)', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq({ type: 'daily', period: 'day' }))
    const body = await res.json()
    expect(body.summary.goodMachines + body.summary.errorMachines).toBe(body.summary.totalMachines)
  })
})
