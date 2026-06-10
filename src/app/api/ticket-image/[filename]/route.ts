import { requireRole } from '@/lib/node/auth'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { NextRequest } from 'next/server'

const TICKET_DIR = path.join(process.cwd(), 'uploads', 'ticket-images')

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return new Response('Unauthorized', { status: 401 })

  const { filename } = await params
  const safe = path.basename(filename)

  if (!safe.match(/^\d+_[0-9a-f]{20}\.jpg$/)) {
    return new Response('Not found', { status: 404 })
  }

  const filePath = path.join(TICKET_DIR, safe)
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
