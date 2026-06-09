import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    include: { profile: true },
  })

  if (!user) return Response.json({ error: 'User not found' }, { status: 404 })

  return Response.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    profile: user.profile
      ? {
          displayName: user.profile.displayName,
          employeeCode: user.profile.employeeCode,
          department: user.profile.department,
          phone: user.profile.phone,
          avatar: user.profile.avatar,
        }
      : null,
  })
}

export async function PUT(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { displayName?: string; employeeCode?: string; department?: string; phone?: string }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const data: Record<string, string> = {}
  if (body.displayName !== undefined) data.displayName = body.displayName.trim()
  if (body.employeeCode !== undefined) data.employeeCode = body.employeeCode.trim() || ''
  if (body.department !== undefined) data.department = body.department.trim() || ''
  if (body.phone !== undefined) data.phone = body.phone.trim() || ''

  if (data.displayName === '') {
    return Response.json({ error: 'Tên hiển thị không được để trống' }, { status: 400 })
  }

  const profile = await prisma.userProfile.upsert({
    where: { userId: auth.userId },
    create: {
      userId: auth.userId,
      displayName: data.displayName,
      employeeCode: data.employeeCode ?? null,
      department: data.department ?? null,
      phone: data.phone ?? null,
    },
    update: data,
  })

  return Response.json({
    displayName: profile.displayName,
    employeeCode: profile.employeeCode,
    department: profile.department,
    phone: profile.phone,
  })
}
