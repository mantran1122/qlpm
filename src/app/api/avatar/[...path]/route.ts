import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { NextRequest } from 'next/server'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads', 'avatars')

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return new Response('Unauthorized', { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return new Response('Unauthorized', { status: 401 })

  const { path: segments } = await params
  // Expected: ['42', '42_abcdef1234567890.webp']
  if (segments.length !== 2) return new Response('Not found', { status: 404 })
  const [userId, rawFilename] = segments

  // Sanitize: ngăn path traversal
  const filename = path.basename(rawFilename)
  if (!filename.match(/^\d+_[0-9a-f]{16}\.webp$/)) {
    return new Response('Not found', { status: 404 })
  }
  if (!filename.startsWith(userId + '_')) {
    return new Response('Forbidden', { status: 403 })
  }

  const filePath = path.join(UPLOAD_DIR, filename)
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
