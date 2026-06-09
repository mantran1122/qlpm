import { describe, it, expect } from 'vitest'
import { checkPassword } from '@/lib/node/password'

describe('checkPassword', () => {
  it('từ chối mật khẩu dưới 8 ký tự', () => {
    const { ok, errors } = checkPassword('Ab1!')
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('8 ký tự'))).toBe(true)
  })

  it('từ chối mật khẩu quá yếu (score < 2)', () => {
    const { ok } = checkPassword('aaaaaaaa')
    expect(ok).toBe(false)
  })

  it('chấp nhận mật khẩu đủ mạnh', () => {
    const { ok } = checkPassword('MyPass@2024')
    expect(ok).toBe(true)
  })

  it('trả về score từ 0-4', () => {
    const { score: weak } = checkPassword('abc123')
    const { score: strong } = checkPassword('correct-horse-battery-staple-2024!')
    expect(weak).toBeGreaterThanOrEqual(0)
    expect(strong).toBeLessThanOrEqual(4)
  })
})
