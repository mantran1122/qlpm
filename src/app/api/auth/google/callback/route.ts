import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { exchangeCode, getUserInfo, isAllowedEmail, validateConfig } from '@/lib/google-auth'
import { signToken, COOKIE_NAME } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    validateConfig()
  } catch {
    return Response.json({ error: 'Cấu hình Google OAuth chưa đầy đủ' }, { status: 500 })
  }

  const error = req.nextUrl.searchParams.get('error')
  if (error) {
    return NextResponse.redirect(new URL('/login?error=access_denied', req.url))
  }

  // Kiểm tra state chống CSRF
  const storedState = req.cookies.get('oauth_state')?.value
  const returnedState = req.nextUrl.searchParams.get('state')
  if (!storedState || !returnedState || storedState !== returnedState) {
    return NextResponse.redirect(new URL('/login?error=invalid_state', req.url))
  }

  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', req.url))
  }

  let userInfo: { email: string; name: string; picture?: string }
  try {
    const tokens = await exchangeCode(code)
    userInfo = await getUserInfo(tokens.access_token)
  } catch {
    return NextResponse.redirect(new URL('/login?error=google_failed', req.url))
  }

  // Kiểm tra email domain
  if (!isAllowedEmail(userInfo.email)) {
    return NextResponse.redirect(
      new URL(`/login?error=invalid_domain&email=${encodeURIComponent(userInfo.email)}`, req.url)
    )
  }

  // Tìm hoặc tạo user
  let user = await prisma.user.findUnique({
    where: { email: userInfo.email.toLowerCase() },
  })

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: userInfo.email.toLowerCase(),
        username: userInfo.email.split('@')[0],
        passwordHash: '',
        role: 'TECHNICIAN',
        isActive: true,
        profile: {
          create: {
            displayName: userInfo.name || userInfo.email.split('@')[0],
          },
        },
      },
    })
  }

  if (!user.isActive) {
    return NextResponse.redirect(new URL('/login?error=disabled', req.url))
  }

  // Cập nhật thời gian đăng nhập
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), loginAttempts: 0, lockedUntil: null },
  })

  const token = await signToken({
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    ver: user.tokenVersion,
  })

  const res = NextResponse.redirect(new URL('/?login=success', req.url))
  res.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 8 * 3600,
    secure: process.env.NODE_ENV === 'production',
  })
  // Xóa state cookie
  res.cookies.set({ name: 'oauth_state', value: '', maxAge: 0, path: '/' })

  return res
}
