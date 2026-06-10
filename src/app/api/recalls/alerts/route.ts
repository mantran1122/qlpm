import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER')
  if (!auth) return Response.json({ error: 'Không có quyền' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const page  = Math.max(1, Number(searchParams.get('page')  || 1))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))

  const where = { dismissedAt: null }

  const [total, alerts] = await Promise.all([
    prisma.recallAlert.count({ where }),
    prisma.recallAlert.findMany({
      where,
      include: {
        recallRecord: {
          select: {
            id: true,
            machineNo: true,
            recallType: true,
            recalledAt: true,
            room:       { select: { roomCode: true } },
            recalledByTechnician: { select: { name: true } },
          },
        },
      },
      orderBy: { sentAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
  ])

  return Response.json({ data: alerts, total, page, limit, totalPages: Math.ceil(total / limit) })
}
