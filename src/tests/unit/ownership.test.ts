import { describe, it, expect } from 'vitest'
import { assertOwnership } from '@/lib/node/ownership'

describe('assertOwnership', () => {
  it('ADMIN luôn được phép', () => {
    const result = assertOwnership({ role: 'ADMIN', userId: 1, resourceOwnerId: 99 })
    expect(result.ok).toBe(true)
  })

  it('owner được phép', () => {
    const result = assertOwnership({ role: 'MANAGER', userId: 5, resourceOwnerId: 5 })
    expect(result.ok).toBe(true)
  })

  it('non-owner bị từ chối với 403', () => {
    const result = assertOwnership({ role: 'TECHNICIAN', userId: 3, resourceOwnerId: 7 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
    }
  })

  it('MANAGER không phải owner bị từ chối', () => {
    const result = assertOwnership({ role: 'MANAGER', userId: 2, resourceOwnerId: 8 })
    expect(result.ok).toBe(false)
  })
})
