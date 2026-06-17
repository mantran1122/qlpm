import { signToken, COOKIE_NAME, getSessionMaxAgeSeconds } from '@/lib/auth'
import { verifyJwtEdge } from '@/lib/edge/jwt'
import { rateLimit } from '@/lib/node/rate-limit'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const payload = await verifyJwtEdge(token)
  if (!payload) {
    const res = Response.json({ error: 'Phiên đăng nhập không hợp lệ' }, { status: 401 })
    return res
  }

  // Rate limit: 30 lần/phút/user
  const rl = rateLimit(`refresh:${payload.userId}`, 30, 60)
  if (!rl.ok) {
    return Response.json({ error: 'Quá nhiều yêu cầu refresh' }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSeconds) },
    })
  }

  const newToken = await signToken({
    userId: payload.userId,
    username: payload.username,
    email: payload.email,
    role: payload.role,
    ver: payload.ver,
  })
  const sessionMaxAge = getSessionMaxAgeSeconds(payload.role)

  // Gia hạn CSRF token cùng lúc
  const csrfToken = req.cookies.get('csrf')?.value ?? crypto.randomUUID().replace(/-/g, '')

  const res = NextResponse.json({ ok: true })

  res.cookies.set({
    name: COOKIE_NAME,
    value: newToken,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: sessionMaxAge,
    secure: process.env.NODE_ENV === 'production',
  })

  res.cookies.set({
    name: 'csrf',
    value: csrfToken,
    httpOnly: false,
    path: '/',
    sameSite: 'lax',
    maxAge: sessionMaxAge,
    secure: process.env.NODE_ENV === 'production',
  })

  return res
}
