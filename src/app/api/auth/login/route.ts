import { prisma } from '@/lib/prisma'
import { signToken, COOKIE_NAME, MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES } from '@/lib/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import { sendNotification } from '@/lib/node/notification'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'

  // Rate limit: 5 lần/phút/IP
  const rl1 = rateLimit(`login:min:${ip}`, 5, 60)
  if (!rl1.ok) {
    return Response.json({ error: 'Quá nhiều yêu cầu đăng nhập. Thử lại sau 1 phút.' }, {
      status: 429,
      headers: { 'Retry-After': String(rl1.retryAfterSeconds) },
    })
  }

  // Rate limit: 20 lần/giờ/IP
  const rl2 = rateLimit(`login:hr:${ip}`, 20, 3600)
  if (!rl2.ok) {
    return Response.json({ error: 'Quá nhiều yêu cầu đăng nhập. Thử lại sau ít phút.' }, {
      status: 429,
      headers: { 'Retry-After': String(rl2.retryAfterSeconds) },
    })
  }

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const { email, password } = body
  if (!email || !password) {
    return Response.json({ error: 'Email và mật khẩu là bắt buộc' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      id: true, username: true, email: true, passwordHash: true,
      role: true, isActive: true, lockedUntil: true, loginAttempts: true, tokenVersion: true,
      lastLoginIp: true, lastLoginUa: true,
    },
  })

  // Trả lỗi chung — không để lộ email có tồn tại hay không
  if (!user) {
    return Response.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 })
  }

  if (!user.isActive) {
    return Response.json({ error: 'Tài khoản đã bị vô hiệu hóa' }, { status: 403 })
  }

  // Kiểm tra tài khoản đang bị khóa
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
    return Response.json(
      { error: `Tài khoản tạm khóa. Thử lại sau ${remaining} phút` },
      { status: 429 }
    )
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash)

  if (!passwordOk) {
    const newAttempts = user.loginAttempts + 1
    const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS

    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: newAttempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
          : undefined,
      },
    })

    if (shouldLock) {
      // Gửi thông báo: tài khoản bị khóa
      sendNotification({
        roles: ['ADMIN'],
        title: 'Tài khoản bị khóa',
        message: `Tài khoản ${user.email} đã bị khóa ${LOCKOUT_MINUTES} phút sau ${MAX_LOGIN_ATTEMPTS} lần đăng nhập sai. IP: ${ip}`,
        type: 'WARNING',
        link: '/settings',
        triggerKey: `lockout_${user.id}`,
        cooldownMinutes: 60,
      }).catch(() => {})
      return Response.json(
        { error: `Sai mật khẩu ${MAX_LOGIN_ATTEMPTS} lần liên tiếp. Tài khoản bị khóa ${LOCKOUT_MINUTES} phút` },
        { status: 429 }
      )
    }

    const left = MAX_LOGIN_ATTEMPTS - newAttempts
    return Response.json(
      { error: `Email hoặc mật khẩu không đúng. Còn ${left} lần thử` },
      { status: 401 }
    )
  }

  // Đăng nhập thành công — reset counter, ghi thời điểm đăng nhập và thiết bị
  const ua = req.headers.get('user-agent') ?? null

  // Phát hiện thiết bị lạ (IP hoặc UA khác lần trước)
  const isNewDevice = user.lastLoginIp && user.lastLoginUa
    && (user.lastLoginIp !== ip || user.lastLoginUa !== ua)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      loginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      lastLoginUa: ua,
    },
  })

  const token = await signToken({
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    ver: user.tokenVersion,
  })

  // Gửi thông báo thiết bị lạ
  if (isNewDevice) {
    sendNotification({
      userId: user.id,
      title: 'Đăng nhập từ thiết bị mới',
      message: `Tài khoản của bạn vừa đăng nhập từ thiết bị hoặc địa chỉ IP mới (${ip}). Nếu không phải là bạn, hãy liên hệ quản trị viên.`,
      type: 'WARNING',
      link: '/settings',
      triggerKey: `new_device_${user.id}`,
      cooldownMinutes: 1440,
    }).catch(() => {})
  }

  // Tạo CSRF token — random 32 bytes, non-HttpOnly để JS client có thể đọc
  const csrfToken = crypto.randomUUID().replace(/-/g, '')

  const res = NextResponse.json({
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
  })

  res.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 30 * 60,  // 30 phút (buffer cho sliding refresh)
    secure: process.env.NODE_ENV === 'production',
  })

  // CSRF cookie: non-HttpOnly để JS đọc được, same SameSite
  res.cookies.set({
    name: 'csrf',
    value: csrfToken,
    httpOnly: false,
    path: '/',
    sameSite: 'lax',
    maxAge: 30 * 60,
    secure: process.env.NODE_ENV === 'production',
  })

  return res
}
