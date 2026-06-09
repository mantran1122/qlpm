import { describe, it, expect, beforeEach } from 'vitest'
import { encrypt, decrypt } from '@/lib/node/crypto'

beforeEach(() => {
  // Key hợp lệ: 64 hex chars = 32 bytes
  process.env.ENCRYPTION_KEY = 'a'.repeat(64)
})

describe('encrypt / decrypt', () => {
  it('round-trip giữ nguyên plaintext', () => {
    const plain = 'smtp_password_123!'
    const cipher = encrypt(plain)
    expect(decrypt(cipher)).toBe(plain)
  })

  it('ciphertext khác plaintext', () => {
    const plain = 'secret'
    expect(encrypt(plain)).not.toBe(plain)
  })

  it('mỗi lần encrypt ra ciphertext khác nhau (IV random)', () => {
    const plain = 'same input'
    expect(encrypt(plain)).not.toBe(encrypt(plain))
  })

  it('throw khi ciphertext bị tamper', () => {
    const cipher = encrypt('value')
    const tampered = cipher.slice(0, -4) + 'ffff'
    expect(() => decrypt(tampered)).toThrow()
  })

  it('throw khi phiên bản không phải v1', () => {
    expect(() => decrypt('v2:aabb:ccdd:eeff')).toThrow('Phiên bản mã hóa không hỗ trợ')
  })

  it('throw khi ENCRYPTION_KEY không đủ dài', () => {
    process.env.ENCRYPTION_KEY = 'tooshort'
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY phải là 64 hex chars')
  })
})
