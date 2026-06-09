import crypto from 'node:crypto'

// KHÔNG dùng trong Edge runtime — chỉ trong API route / server action
const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY phải là 64 hex chars (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

// format: v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)  // GCM khuyến nghị 12 bytes
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export function decrypt(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Phiên bản mã hóa không hỗ trợ')
  }
  const [, ivHex, tagHex, dataHex] = parts
  const key = getKey()
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ])
  return dec.toString('utf8')
}
