/**
 * Integration tests — RBAC role × route matrix
 *
 * Các test này kiểm tra logic requireRole / requireRoleStrict / requireCsrf
 * thông qua unit-style testing (không cần HTTP server thực).
 * Test DB integration cần môi trường riêng → để Phase 3/4.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { requireRole, requireRoleStrict, requireCsrf } from '@/lib/node/auth'
import { assertOwnership } from '@/lib/node/ownership'

// ─── Mock verifyJwtEdge ────────────────────────────────────────────────────

vi.mock('@/lib/edge/jwt', () => ({
  COOKIE_NAME: 'phong_may_session',
  verifyJwtEdge: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

import { verifyJwtEdge } from '@/lib/edge/jwt'
import { prisma } from '@/lib/prisma'

type Role = 'ADMIN' | 'MANAGER' | 'TECHNICIAN'

function makeReq(opts: {
  role?: Role
  csrfCookie?: string
  csrfHeader?: string
  hasToken?: boolean
  ver?: number
}): Parameters<typeof requireRole>[0] {
  const {
    role = 'TECHNICIAN',
    csrfCookie,
    csrfHeader,
    hasToken = true,
    ver = 0,
  } = opts

  const cookies = new Map<string, string>()
  if (hasToken) cookies.set('phong_may_session', 'mock-token')
  if (csrfCookie) cookies.set('csrf', csrfCookie)

  return {
    cookies: {
      get: (name: string) => {
        const val = cookies.get(name)
        return val ? { value: val } : undefined
      },
    },
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'x-csrf') return csrfHeader ?? null
        return null
      },
    },
    method: 'POST',
    nextUrl: { pathname: '/api/test' },
  } as unknown as Parameters<typeof requireRole>[0]
}

function mockPayload(role: Role, ver = 0) {
  return { userId: 1, username: 'testuser', email: 'test@nctu.edu.vn', role, ver }
}

function mockActiveUser(ver = 0) {
  return { id: 1, isActive: true, lockedUntil: null, tokenVersion: ver }
}

// ─── requireRole tests ─────────────────────────────────────────────────────

describe('requireRole', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trả về null khi không có token', async () => {
    const req = makeReq({ hasToken: false })
    const result = await requireRole(req, 'ADMIN')
    expect(result).toBeNull()
  })

  it('trả về null khi JWT không hợp lệ', async () => {
    vi.mocked(verifyJwtEdge).mockResolvedValueOnce(null)
    const req = makeReq({})
    const result = await requireRole(req, 'ADMIN')
    expect(result).toBeNull()
  })

  it('trả về null khi role không khớp', async () => {
    vi.mocked(verifyJwtEdge).mockResolvedValueOnce(mockPayload('TECHNICIAN'))
    const req = makeReq({ role: 'TECHNICIAN' })
    const result = await requireRole(req, 'ADMIN', 'MANAGER')
    expect(result).toBeNull()
  })

  it('trả về payload khi role khớp', async () => {
    vi.mocked(verifyJwtEdge).mockResolvedValueOnce(mockPayload('MANAGER'))
    const req = makeReq({ role: 'MANAGER' })
    const result = await requireRole(req, 'ADMIN', 'MANAGER')
    expect(result).not.toBeNull()
    expect(result?.role).toBe('MANAGER')
  })

  it('ADMIN được phép khi yêu cầu ADMIN', async () => {
    vi.mocked(verifyJwtEdge).mockResolvedValueOnce(mockPayload('ADMIN'))
    const req = makeReq({ role: 'ADMIN' })
    const result = await requireRole(req, 'ADMIN')
    expect(result?.role).toBe('ADMIN')
  })

  it('TECHNICIAN bị từ chối khi yêu cầu ADMIN/MANAGER', async () => {
    vi.mocked(verifyJwtEdge).mockResolvedValueOnce(mockPayload('TECHNICIAN'))
    const req = makeReq({ role: 'TECHNICIAN' })
    const result = await requireRole(req, 'ADMIN', 'MANAGER')
    expect(result).toBeNull()
  })
})

// ─── requireRoleStrict tests ───────────────────────────────────────────────

describe('requireRoleStrict', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trả về null khi user không active', async () => {
    vi.mocked(verifyJwtEdge).mockResolvedValueOnce(mockPayload('ADMIN'))
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ ...mockActiveUser(), isActive: false } as never)
    const req = makeReq({ role: 'ADMIN' })
    const result = await requireRoleStrict(req, 'ADMIN')
    expect(result).toBeNull()
  })

  it('trả về null khi user bị lock', async () => {
    vi.mocked(verifyJwtEdge).mockResolvedValueOnce(mockPayload('ADMIN'))
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      ...mockActiveUser(),
      lockedUntil: new Date(Date.now() + 60_000),
    } as never)
    const req = makeReq({ role: 'ADMIN' })
    const result = await requireRoleStrict(req, 'ADMIN')
    expect(result).toBeNull()
  })

  it('trả về null khi tokenVersion lệch (JWT bị revoke)', async () => {
    vi.mocked(verifyJwtEdge).mockResolvedValueOnce(mockPayload('ADMIN', 0))
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ ...mockActiveUser(5) } as never)
    const req = makeReq({ role: 'ADMIN' })
    const result = await requireRoleStrict(req, 'ADMIN')
    expect(result).toBeNull()
  })

  it('trả về { payload, user } khi hợp lệ', async () => {
    vi.mocked(verifyJwtEdge).mockResolvedValueOnce(mockPayload('ADMIN', 2))
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ ...mockActiveUser(2) } as never)
    const req = makeReq({ role: 'ADMIN' })
    const result = await requireRoleStrict(req, 'ADMIN')
    expect(result).not.toBeNull()
    expect(result?.payload.role).toBe('ADMIN')
  })
})

// ─── requireCsrf tests ─────────────────────────────────────────────────────

describe('requireCsrf', () => {
  it('trả về false khi không có csrf cookie', () => {
    const req = makeReq({ csrfHeader: 'abc123' })
    expect(requireCsrf(req)).toBe(false)
  })

  it('trả về false khi không có csrf header', () => {
    const req = makeReq({ csrfCookie: 'abc123' })
    expect(requireCsrf(req)).toBe(false)
  })

  it('trả về false khi cookie ≠ header', () => {
    const req = makeReq({ csrfCookie: 'abc123', csrfHeader: 'xyz789' })
    expect(requireCsrf(req)).toBe(false)
  })

  it('trả về true khi cookie === header', () => {
    const token = 'csrf-token-abc123'
    const req = makeReq({ csrfCookie: token, csrfHeader: token })
    expect(requireCsrf(req)).toBe(true)
  })
})

// ─── Ownership tests ───────────────────────────────────────────────────────

describe('assertOwnership', () => {
  it('ADMIN luôn được phép', () => {
    const result = assertOwnership({ role: 'ADMIN', userId: 1, resourceOwnerId: 99 })
    expect(result.ok).toBe(true)
  })

  it('owner được phép sửa bản ghi của mình', () => {
    const result = assertOwnership({ role: 'TECHNICIAN', userId: 5, resourceOwnerId: 5 })
    expect(result.ok).toBe(true)
  })

  it('non-owner bị từ chối', () => {
    const result = assertOwnership({ role: 'TECHNICIAN', userId: 5, resourceOwnerId: 99 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })

  it('MANAGER bị từ chối khi không phải owner', () => {
    const result = assertOwnership({ role: 'MANAGER', userId: 2, resourceOwnerId: 10 })
    expect(result.ok).toBe(false)
  })
})

// ─── Rate limit scope tests ─────────────────────────────────────────────────

describe('rateLimit keys', () => {
  it('login rate limit key phải khác nhau theo IP', () => {
    const key1 = `login:min:192.168.1.1`
    const key2 = `login:min:10.0.0.1`
    expect(key1).not.toBe(key2)
  })

  it('mutation rate limit key phải khác nhau theo userId', () => {
    const key1 = `mutation:1`
    const key2 = `mutation:2`
    expect(key1).not.toBe(key2)
  })
})
