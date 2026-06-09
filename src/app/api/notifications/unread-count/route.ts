import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })

  const count = await prisma.notification.count({
    where: { userId: auth.userId, isRead: false },
  })

  return Response.json({ count })
}
