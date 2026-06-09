import { prisma } from '@/lib/prisma'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import { recordAudit } from '@/lib/node/audit'
import sharp from 'sharp'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { NextRequest } from 'next/server'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads', 'avatars')
const MAX_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 5) * 1024 * 1024

// Magic bytes để xác định loại file thực sự
const MAGIC: Record<string, number[][]> = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png':  [[0x89, 0x50, 0x4E, 0x47]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],  // "RIFF"
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
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return Response.json({ error: 'Phiên không hợp lệ' }, { status: 401 })

  // Rate limit: 10 lần/giờ/user
  const rl = rateLimit(`avatar:${payload.userId}`, 10, 3600)
  if (!rl.ok) {
    return Response.json({ error: 'Quá nhiều yêu cầu upload. Thử lại sau.' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSeconds) },
    })
  }

  let formData: FormData
  try { formData = await req.formData() } catch {
    return Response.json({ error: 'Form data không hợp lệ' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: 'Thiếu file' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return Response.json({ error: `File quá lớn. Tối đa ${process.env.MAX_UPLOAD_MB ?? 5} MB` }, { status: 413 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buf = Buffer.from(arrayBuffer)

  // Kiểm tra magic bytes
  const realMime = detectMime(buf)
  if (!realMime) {
    return Response.json({ error: 'Định dạng file không được hỗ trợ (chỉ JPG, PNG, WebP)' }, { status: 415 })
  }

  // Re-encode bằng sharp → WebP 256×256, xóa EXIF/metadata
  let webpBuf: Buffer
  try {
    webpBuf = await sharp(buf)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer()
  } catch {
    return Response.json({ error: 'File ảnh không hợp lệ' }, { status: 422 })
  }

  // Tạo thư mục nếu chưa có
  await fs.mkdir(UPLOAD_DIR, { recursive: true })

  // Xóa avatar cũ nếu có
  const profile = await prisma.userProfile.findUnique({
    where: { userId: payload.userId },
    select: { avatar: true },
  })
  if (profile?.avatar) {
    const oldPath = path.join(UPLOAD_DIR, path.basename(profile.avatar))
    await fs.unlink(oldPath).catch(() => {})
  }

  // Lưu file mới
  const filename = `${payload.userId}_${crypto.randomBytes(8).toString('hex')}.webp`
  const filePath = path.join(UPLOAD_DIR, filename)
  await fs.writeFile(filePath, webpBuf)

  // Lưu path vào DB
  const avatarPath = `/api/avatar/${payload.userId}/${filename}`
  await prisma.userProfile.upsert({
    where: { userId: payload.userId },
    update: { avatar: avatarPath },
    create: {
      userId: payload.userId,
      displayName: payload.username,
      avatar: avatarPath,
    },
  })

  await recordAudit({ userId: payload.userId, action: 'user.avatar_uploaded', target: `user:${payload.userId}` })

  return Response.json({ ok: true, avatar: avatarPath })
}
