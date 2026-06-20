import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const itemId = Number(searchParams.get('itemId'))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 30)))
  const page = Math.max(1, Number(searchParams.get('page') || 1))

  const where = itemId ? { supplyItemId: itemId } : {}

  const [total, rows] = await Promise.all([
    prisma.supplyAdjustment.count({ where }),
    prisma.supplyAdjustment.findMany({
      where,
      include: {
        supplyItem: { select: { label: true, code: true, icon: true } },
        createdBy: { select: { username: true, profile: { select: { displayName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return Response.json({ data: rows, total, page, totalPages: Math.ceil(total / limit) })
}
