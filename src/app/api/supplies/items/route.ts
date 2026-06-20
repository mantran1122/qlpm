import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const items = await prisma.supplyItem.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
  return Response.json(items)
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER')
  if (!auth) return Response.json({ error: 'Không có quyền' }, { status: 403 })
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF invalid' }, { status: 403 })

  const body = await req.json()
  const label = (body.label ?? '').trim()
  const icon = (body.icon ?? '').trim() || 'box'

  if (!label) return Response.json({ error: 'Tên vật tư không được để trống' }, { status: 400 })

  // Generate unique code from label (slug)
  const base = label
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').toLowerCase()
    .slice(0, 20)
  const suffix = Date.now().toString(36)
  const code = `custom_${base}_${suffix}`

  // sortOrder = max+1
  const maxItem = await prisma.supplyItem.findFirst({ orderBy: { sortOrder: 'desc' } })
  const sortOrder = (maxItem?.sortOrder ?? 0) + 1

  const item = await prisma.supplyItem.create({
    data: { code, label, icon, isBuiltin: false, isActive: true, sortOrder },
  })
  return Response.json(item, { status: 201 })
}
