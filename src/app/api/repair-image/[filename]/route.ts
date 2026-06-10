import { requireRole } from '@/lib/node/auth'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { NextRequest } from 'next/server'

const REPAIR_DIR = path.join(process.cwd(), 'uploads', 'repair-images')

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return new Response('Unauthorized', { status: 401 })

  const { filename } = await params
  const safe = path.basename(filename)

  // Chỉ cho phép pattern: {userId}_{hex}.jpg
  if (!safe.match(/^\d+_[0-9a-f]{20}\.jpg$/)) {
    return new Response('Not found', { status: 404 })
  }

  const filePath = path.join(REPAIR_DIR, safe)
  try {
    const data = await fs.readFile(filePath)
    return new Response(data, {
      headers: {
        'Content-Type':  'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
