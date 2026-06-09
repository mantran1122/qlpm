import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return Response.json({ user: null })

  const payload = await verifyToken(token)
  if (!payload) return Response.json({ user: null })

  return Response.json({ user: payload })
}
