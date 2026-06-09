import type { NextRequest } from 'next/server'
import { verifyJwtEdge, COOKIE_NAME } from '@/lib/edge/jwt'
import type { EdgeJwtPayload, UserRole } from '@/lib/edge/jwt'
import { prisma } from '@/lib/prisma'

export type AuthPayload = EdgeJwtPayload

// Layer 1 — chỉ verify JWT, KHÔNG query DB (dùng cho GET và mutation ít nhạy cảm)
export async function requireRole(
  req: NextRequest,
  ...roles: UserRole[]
): Promise<AuthPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = await verifyJwtEdge(token)
  if (!payload || !roles.includes(payload.role)) return null
  return payload
}

// Layer 2 — verify JWT + query DB (dùng cho mutation nhạy cảm: xóa, đổi role, reset pass)
export async function requireRoleStrict(
  req: NextRequest,
  ...roles: UserRole[]
): Promise<{ payload: AuthPayload; user: { id: number; isActive: boolean; lockedUntil: Date | null; tokenVersion: number } } | null> {
  const payload = await requireRole(req, ...roles)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, isActive: true, lockedUntil: true, tokenVersion: true },
  })
  if (
    !user ||
    !user.isActive ||
    (user.lockedUntil && user.lockedUntil > new Date()) ||
    user.tokenVersion !== payload.ver
  ) {
    return null
  }
  return { payload, user }
}

// Double-submit cookie CSRF check
export function requireCsrf(req: NextRequest): boolean {
  const cookieCsrf = req.cookies.get('csrf')?.value
  const headerCsrf = req.headers.get('x-csrf')
  return !!cookieCsrf && !!headerCsrf && cookieCsrf === headerCsrf
}
