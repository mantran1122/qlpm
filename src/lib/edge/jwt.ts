import { jwtVerify } from 'jose'

export type UserRole = 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'GUEST'
export const GUEST_SESSION_MAX_AGE_SECONDS = 30 * 60
export const STAFF_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60

export interface EdgeJwtPayload {
  userId: number
  username: string
  email: string
  role: UserRole
  ver: number  // tokenVersion — tăng khi revoke
  jti?: string
}

// Edge-safe: chỉ dùng jose, KHÔNG import node:crypto hay Prisma
const getSecret = () => new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET ?? process.env.JWT_SECRET!
)

export const COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Host-token' : 'phong_may_session'

export function getSessionMaxAgeSeconds(role: UserRole): number {
  return role === 'GUEST'
    ? GUEST_SESSION_MAX_AGE_SECONDS
    : STAFF_SESSION_MAX_AGE_SECONDS
}

export async function verifyJwtEdge(token: string): Promise<EdgeJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    // Extract fields explicitly so old JWTs (pre-Phase-2, no `ver`) get a safe default
    const p = payload as Record<string, unknown>
    if (typeof p.userId !== 'number' || typeof p.role !== 'string') return null
    return {
      userId: p.userId,
      username: p.username as string,
      email: p.email as string,
      role: p.role as UserRole,
      ver: typeof p.ver === 'number' ? p.ver : 0,
      jti: p.jti as string | undefined,
    }
  } catch {
    return null
  }
}
