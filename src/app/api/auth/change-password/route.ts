import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { checkPassword } from '@/lib/node/password'
import { recordAudit } from '@/lib/node/audit'
import { rateLimit } from '@/lib/node/rate-limit'
import bcrypt from 'bcryptjs'
import type { NextRequest } from 'next/server'

export async function PUT(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  // Rate limit: 10 lần/giờ/user
  const rl = rateLimit(`change-pw:${auth.userId}`, 10, 3600)
  if (!rl.ok) {
    return Response.json({ error: 'Quá nhiều yêu cầu. Thử lại sau.' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSeconds) },
    })
  }

  let body: { oldPassword?: string; newPassword?: string }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const { oldPassword, newPassword } = body
  if (!oldPassword || !newPassword) {
    return Response.json({ error: 'Thiếu trường bắt buộc' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, passwordHash: true, email: true, username: true },
  })
  if (!user) return Response.json({ error: 'Người dùng không tồn tại' }, { status: 404 })

  const oldOk = await bcrypt.compare(oldPassword, user.passwordHash)
  if (!oldOk) {
    return Response.json({ error: 'Mật khẩu hiện tại không đúng' }, { status: 400 })
  }

  const { ok, errors } = checkPassword(newPassword, [user.email, user.username])
  if (!ok) {
    return Response.json({ error: errors[0], errors }, { status: 422 })
  }

  const newHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      tokenVersion: { increment: 1 },
    },
  })

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined
  await recordAudit({
    userId: user.id,
    action: 'user.password_changed',
    target: `user:${user.id}`,
    ip: ip ?? undefined,
  })

  return Response.json({ ok: true })
}
