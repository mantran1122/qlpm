import { prisma } from '@/lib/prisma'
import { requireRoleStrict, requireCsrf } from '@/lib/node/auth'
import { recordAudit } from '@/lib/node/audit'
import { rateLimit } from '@/lib/node/rate-limit'
import type { NextRequest } from 'next/server'

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRoleStrict(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })

  const rl = rateLimit(`mutation:${auth.payload.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  const { id } = await ctx.params
  const targetId = parseInt(id)
  if (isNaN(targetId)) return Response.json({ error: 'ID không hợp lệ' }, { status: 400 })

  let body: {
    role?: string
    isActive?: boolean
    lockedUntil?: string | null
    displayName?: string
  }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } })
  if (!target) return Response.json({ error: 'Người dùng không tồn tại' }, { status: 404 })

  const userData: Record<string, unknown> = {}
  const auditDetails: Record<string, unknown> = {}
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined

  // Đổi role → bump tokenVersion để revoke JWT cũ
  if (body.role !== undefined) {
    if (!['ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST'].includes(body.role)) {
      return Response.json({ error: 'Role không hợp lệ' }, { status: 400 })
    }
    const changingToGuest = body.role === 'GUEST'
    const currentlyGuest = target.role === 'GUEST'
    if (changingToGuest !== currentlyGuest) {
      return Response.json(
        { error: 'Không thể đổi role giữa Khách và các role khác. Hãy xóa tài khoản và tạo lại.' },
        { status: 422 }
      )
    }
    userData.role = body.role
    userData.tokenVersion = { increment: 1 }
    auditDetails.oldRole = target.role
    auditDetails.newRole = body.role
  }

  // Khóa / mở tài khoản
  if (body.isActive !== undefined) {
    userData.isActive = body.isActive
    auditDetails.isActive = body.isActive
    if (body.isActive) {
      userData.lockedUntil = null
      userData.loginAttempts = 0
      userData.tokenVersion = { increment: 1 }
    }
  }

  // Đặt lại thời điểm lock thủ công
  if ('lockedUntil' in body) {
    userData.lockedUntil = body.lockedUntil ? new Date(body.lockedUntil) : null
    if (body.lockedUntil) userData.tokenVersion = { increment: 1 }
  }

  if (Object.keys(userData).length === 0 && !body.displayName) {
    return Response.json({ error: 'Không có thông tin để cập nhật' }, { status: 400 })
  }

  const updated = await prisma.user.update({ where: { id: targetId }, data: userData })

  if (body.displayName !== undefined) {
    await prisma.userProfile.upsert({
      where: { userId: targetId },
      create: { userId: targetId, displayName: body.displayName.trim() },
      update: { displayName: body.displayName.trim() },
    })
  }

  if (Object.keys(auditDetails).length > 0) {
    await recordAudit({
      userId: auth.payload.userId,
      action: 'user.updated',
      target: `user:${targetId}`,
      detail: auditDetails,
      ip: ip ?? undefined,
    })
  }

  return Response.json({
    id: updated.id,
    username: updated.username,
    email: updated.email,
    role: updated.role,
    isActive: updated.isActive,
    lockedUntil: updated.lockedUntil,
  })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRoleStrict(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })

  const { id } = await ctx.params
  const targetId = parseInt(id)
  if (isNaN(targetId)) return Response.json({ error: 'ID không hợp lệ' }, { status: 400 })

  if (targetId === auth.payload.userId) {
    return Response.json({ error: 'Không thể vô hiệu hóa chính mình' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined

  await prisma.user.update({
    where: { id: targetId },
    data: { isActive: false, tokenVersion: { increment: 1 } },
  })

  await recordAudit({
    userId: auth.payload.userId,
    action: 'user.deactivated',
    target: `user:${targetId}`,
    ip: ip ?? undefined,
  })

  return Response.json({ ok: true })
}
