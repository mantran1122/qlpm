import { prisma } from '@/lib/prisma'
import { requireRole, requireRoleStrict, requireCsrf } from '@/lib/node/auth'
import { recordAudit } from '@/lib/node/audit'
import { rateLimit } from '@/lib/node/rate-limit'
import bcrypt from 'bcryptjs'
import type { NextRequest } from 'next/server'

const ALLOWED_DOMAIN = 'nctu.edu.vn'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER')
  if (!auth) return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const roleFilter = searchParams.get('role')

  const where: Record<string, unknown> = {}
  if (roleFilter && ['ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST'].includes(roleFilter)) {
    where.role = roleFilter
  }

  const users = await prisma.user.findMany({
    where,
    include: { profile: { select: { displayName: true, department: true, avatar: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return Response.json(users.map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    lockedUntil: u.lockedUntil,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    displayName: u.profile?.displayName ?? null,
    department: u.profile?.department ?? null,
    avatar: u.profile?.avatar ?? null,
  })))
}

export async function POST(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRoleStrict(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })

  const rl = rateLimit(`mutation:${auth.payload.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  let body: { email?: string; role?: string; displayName?: string; password?: string }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const { email, role, displayName } = body

  if (!email?.trim() || !role) {
    return Response.json({ error: 'email và role là bắt buộc' }, { status: 400 })
  }

  if (!['ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST'].includes(role)) {
    return Response.json({ error: 'Role không hợp lệ' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase().trim()

  if (role !== 'GUEST') {
    const domain = normalizedEmail.split('@')[1]
    if (domain !== ALLOWED_DOMAIN) {
      return Response.json({ error: `Chỉ chấp nhận email @${ALLOWED_DOMAIN}` }, { status: 422 })
    }
  }

  let passwordHash = ''
  if (role === 'GUEST') {
    if (!body.password?.trim()) {
      return Response.json({ error: 'Mật khẩu là bắt buộc cho tài khoản khách' }, { status: 400 })
    }
    if (body.password.length < 10) {
      return Response.json({ error: 'Mật khẩu tối thiểu 10 ký tự' }, { status: 400 })
    }
    passwordHash = await bcrypt.hash(body.password, 12)
  }

  // GUEST username = full email (tránh collision với nctu.edu.vn accounts)
  const username = role === 'GUEST'
    ? normalizedEmail
    : normalizedEmail.split('@')[0]

  const dup = await prisma.user.findFirst({
    where: { OR: [{ email: normalizedEmail }, { username }] },
  })
  if (dup) return Response.json({ error: 'Email đã tồn tại trong hệ thống' }, { status: 409 })

  const user = await prisma.user.create({
    data: {
      username,
      email: normalizedEmail,
      passwordHash,
      role: role as 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'GUEST',
      profile: displayName?.trim() ? {
        create: { displayName: displayName.trim() },
      } : {
        create: { displayName: username },
      },
    },
    include: { profile: true },
  })

  if (role === 'TECHNICIAN') {
    await prisma.technician.create({
      data: { name: user.profile?.displayName || username, userId: user.id },
    })
  }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined
  await recordAudit({
    userId: auth.payload.userId,
    action: 'user.created',
    target: `user:${user.id}`,
    detail: { role, email: normalizedEmail },
    ip: ip ?? undefined,
  })

  return Response.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    displayName: user.profile?.displayName ?? null,
  }, { status: 201 })
}
