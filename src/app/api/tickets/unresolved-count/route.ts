import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER')
  if (!auth) return Response.json({ error: 'Không đủ quyền' }, { status: 403 })

  const count = await prisma.ticket.count({
    where: { status: 'PENDING' },
  })

  return Response.json({ count })
}
