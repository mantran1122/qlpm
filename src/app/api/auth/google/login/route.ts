import { getGoogleOAuthURL, validateConfig } from '@/lib/google-auth'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET() {
  try {
    validateConfig()
  } catch {
    return Response.json({ error: 'Cấu hình Google OAuth chưa đầy đủ' }, { status: 500 })
  }

  const state = crypto.randomBytes(32).toString('hex')

  const res = NextResponse.redirect(getGoogleOAuthURL(state))
  res.cookies.set({
    name: 'oauth_state',
    value: state,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 600,
    secure: process.env.NODE_ENV === 'production',
  })

  return res
}
