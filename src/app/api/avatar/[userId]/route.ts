import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { NextRequest } from 'next/server'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads', 'avatars')

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  // Phải đăng nhập mới xem được avatar
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return new Response('Unauthorized', { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return new Response('Unauthorized', { status: 401 })

  const { userId } = await params
  // Lấy filename từ URL search params hoặc path segment cuối
  const url = new URL(req.url)
  const segments = url.pathname.split('/')
  const filename = segments[segments.length - 1]

  // Sanitize: ngăn path traversal
  const safe = path.basename(filename)
  if (!safe.endsWith('.webp') || !safe.match(/^\d+_[0-9a-f]{16}\.webp$/)) {
    return new Response('Not found', { status: 404 })
  }

  // userId trong filename phải match userId trong path
  const fileUserId = safe.split('_')[0]
  if (fileUserId !== userId) return new Response('Forbidden', { status: 403 })

  const filePath = path.join(UPLOAD_DIR, safe)
  try {
    const data = await fs.readFile(filePath)
    return new Response(data, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
