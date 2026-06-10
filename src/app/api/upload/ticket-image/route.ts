import { rateLimit } from '@/lib/node/rate-limit'
import { requireRole } from '@/lib/node/auth'
import sharp from 'sharp'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { NextRequest } from 'next/server'

const TICKET_DIR = path.join(process.cwd(), 'uploads', 'ticket-images')
const MAX_BYTES  = (Number(process.env.MAX_UPLOAD_MB) || 5) * 1024 * 1024
const MAX_FILES  = 5

const MAGIC: Record<string, number[][]> = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png':  [[0x89, 0x50, 0x4E, 0x47]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
}

function detectMime(buf: Buffer): string | null {
  for (const [mime, sigs] of Object.entries(MAGIC)) {
    for (const sig of sigs) {
      if (sig.every((b, i) => buf[i] === b)) return mime
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const rl = rateLimit(`ticket-upload:${auth.userId}`, 20, 3600)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu upload' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return Response.json({ error: 'Form data không hợp lệ' }, { status: 400 })
  }

  const files = formData.getAll('files')
  if (!files.length) return Response.json({ error: 'Thiếu file' }, { status: 400 })
  if (files.length > MAX_FILES) return Response.json({ error: `Tối đa ${MAX_FILES} ảnh mỗi lần upload` }, { status: 400 })

  await fs.mkdir(TICKET_DIR, { recursive: true })

  const urls: string[] = []
  for (const file of files) {
    if (!(file instanceof Blob)) continue
    if (file.size > MAX_BYTES) {
      return Response.json({ error: `File quá lớn. Tối đa ${process.env.MAX_UPLOAD_MB ?? 5} MB` }, { status: 413 })
    }

    const buf  = Buffer.from(await file.arrayBuffer())
    const mime = detectMime(buf)
    if (!mime) return Response.json({ error: 'Định dạng không hỗ trợ (JPG, PNG, WebP)' }, { status: 415 })

    let outBuf: Buffer
    try {
      outBuf = await sharp(buf)
        .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer()
    } catch {
      return Response.json({ error: 'File ảnh không hợp lệ' }, { status: 422 })
    }

    const filename = `${auth.userId}_${crypto.randomBytes(10).toString('hex')}.jpg`
    await fs.writeFile(path.join(TICKET_DIR, filename), outBuf)
    urls.push(`/api/ticket-image/${filename}`)
  }

  return Response.json({ ok: true, urls })
}
