/**
 * Integration tests — Report API
 *
 * Kiểm tra GET /api/report:
 * - Phân quyền: chỉ ADMIN/MANAGER được truy cập
 * - Date range validation: custom period không có from/to, khoảng > 365 ngày
 * - Type routing: invalid type → 400, valid types → 200
 * - Legacy mode (không có type param) vẫn hoạt động
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/node/auth', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    room: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    machine: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    maintenanceLog: {
      findMany:   vi.fn().mockResolvedValue([]),
      aggregate:  vi.fn().mockResolvedValue({ _sum: {} }),
      count:      vi.fn().mockResolvedValue(0),
    },
    recallRecord: {
      groupBy:  vi.fn().mockResolvedValue([]),
      count:    vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    technician: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}))

import { GET } from '@/app/api/report/route'
import { requireRole } from '@/lib/node/auth'
import { prisma } from '@/lib/prisma'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const AUTH_ADMIN   = { userId: 1, username: 'admin',   role: 'ADMIN' as const,   email: 'admin@test.com',   ver: 0 }
const AUTH_MANAGER = { userId: 2, username: 'manager', role: 'MANAGER' as const, email: 'mgr@test.com',     ver: 0 }

function makeGetReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/report')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return { nextUrl: url } as unknown as NextRequest
}

// ─── Phân quyền ──────────────────────────────────────────────────────────────

describe('GET /api/report — phân quyền', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trả về 403 khi chưa đăng nhập', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(null)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(403)
  })

  it('ADMIN được truy cập', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq({ type: 'supply' }))
    expect(res.status).toBe(200)
  })

  it('MANAGER được truy cập', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_MANAGER as never)
    const res = await GET(makeGetReq({ type: 'supply' }))
    expect(res.status).toBe(200)
  })
})

// ─── Date range validation ────────────────────────────────────────────────────

describe('GET /api/report — date range validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trả về 400 khi period=custom nhưng thiếu from', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq({ type: 'supply', period: 'custom', to: '2026-06-30' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/from/)
  })

  it('trả về 400 khi period=custom nhưng thiếu to', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq({ type: 'supply', period: 'custom', from: '2026-01-01' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/to/)
  })

  it('trả về 400 khi khoảng thời gian custom > 365 ngày', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq({
      type: 'supply', period: 'custom',
      from: '2025-01-01', to: '2026-06-30', // ~545 ngày
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/365/)
  })

  it('trả về 200 khi khoảng thời gian custom ≤ 365 ngày', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq({
      type: 'supply', period: 'custom',
      from: '2026-01-01', to: '2026-06-30', // ~180 ngày
    }))
    expect(res.status).toBe(200)
  })

  it('trả về 400 khi from/to không phải ngày hợp lệ', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq({
      type: 'supply', period: 'custom',
      from: 'not-a-date', to: '2026-06-30',
    }))
    expect(res.status).toBe(400)
  })
})

// ─── Type routing ─────────────────────────────────────────────────────────────

describe('GET /api/report — type routing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trả về 400 khi type không hợp lệ', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq({ type: 'invalid-type' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/type/)
  })

  it('type=machines: trả về 200 với cấu trúc đúng', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq({ type: 'machines', period: 'month' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.type).toBe('machines')
    expect(body).toHaveProperty('summary')
    expect(body).toHaveProperty('rooms')
    expect(body).toHaveProperty('period')
    expect(body).toHaveProperty('generatedAt')
  })

  it('type=supply: trả về 200 với cấu trúc đúng', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq({ type: 'supply', period: 'month' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.type).toBe('supply')
    expect(body).toHaveProperty('summary')
    expect(body).toHaveProperty('supplies')
  })

  it('type=parts-usage: trả về 200 với cấu trúc đúng', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq({ type: 'parts-usage', period: 'month' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.type).toBe('parts-usage')
    expect(body).toHaveProperty('summary')
    expect(body).toHaveProperty('rows')
  })

  it('type=recall-kpi: trả về 200 với cấu trúc đúng', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq({ type: 'recall-kpi', period: 'month' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.type).toBe('recall-kpi')
    expect(body).toHaveProperty('data')
  })
})

// ─── Legacy mode ──────────────────────────────────────────────────────────────

describe('GET /api/report — legacy mode (không có type param)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset các mock về default resolve values
    vi.mocked(prisma.room.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    vi.mocked(prisma.machine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    vi.mocked(prisma.maintenanceLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    vi.mocked(prisma.maintenanceLog.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: {} })
    vi.mocked(prisma.maintenanceLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
  })

  it('trả về 200 với cấu trúc legacy', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    const res = await GET(makeGetReq()) // không có type
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('summary')
    expect(body).toHaveProperty('rooms')
    expect(body).toHaveProperty('floorStats')
    expect(body).toHaveProperty('errorByType')
    expect(body).toHaveProperty('generatedAt')
  })

  it('không có type param → không gọi recallRecord (không phá vỡ báo cáo cũ)', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
    await GET(makeGetReq())
    expect(prisma.recallRecord.findMany).not.toHaveBeenCalled()
    expect(prisma.recallRecord.groupBy).not.toHaveBeenCalled()
  })
})

// ─── Period presets ───────────────────────────────────────────────────────────

describe('GET /api/report — period presets', () => {
  beforeEach(() => vi.clearAllMocks())

  for (const period of ['day', 'week', 'month', 'quarter', 'year'] as const) {
    it(`period=${period}: trả về 200`, async () => {
      vi.mocked(requireRole).mockResolvedValueOnce(AUTH_ADMIN as never)
      const res = await GET(makeGetReq({ type: 'supply', period }))
      expect(res.status).toBe(200)
    })
  }
})
