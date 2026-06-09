import { prisma } from '@/lib/prisma'
import { requireRole, requireRoleStrict, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const techs = await prisma.technician.findMany({
    where: { isActive: true },
    include: { _count: { select: { maintenanceLogs: true } } },
    orderBy: { name: 'asc' },
  })

  const result = await Promise.all(
    techs.map(async (t) => {
      const stats = await prisma.maintenanceLog.aggregate({
        where: { technicianId: t.id },
        _sum: {
          caseQty: true, cpuQty: true, ramQty: true, diskQty: true,
          powerQty: true, monitorQty: true, monitorCableQty: true,
          powerCableQty: true, mouseQty: true, networkQty: true, keyboardQty: true,
        },
      })
      return {
        id: t.id,
        name: t.name,
        phone: t.phone,
        department: t.department,
        notes: t.notes,
        totalMaintenances: t._count.maintenanceLogs,
        totalPartsReplaced: Object.values(stats._sum ?? {}).reduce((a, b) => (a ?? 0) + (b ?? 0), 0),
      }
    })
  )

  return Response.json(result)
}

export async function POST(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRoleStrict(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Chỉ admin mới có quyền tạo kỹ thuật viên' }, { status: 403 })

  const rl = rateLimit(`mutation:${auth.payload.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  let body: { name?: string; phone?: string; department?: string; notes?: string }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  if (!body.name?.trim()) {
    return Response.json({ error: 'Họ và tên là bắt buộc' }, { status: 400 })
  }

  const tech = await prisma.technician.create({
    data: {
      name: body.name.trim(),
      phone: body.phone?.trim() || null,
      department: body.department?.trim() || null,
      notes: body.notes?.trim() || null,
    },
  })

  return Response.json({ ...tech, totalMaintenances: 0, totalPartsReplaced: 0 }, { status: 201 })
}
