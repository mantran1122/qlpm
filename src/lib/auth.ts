import { SignJWT, jwtVerify } from 'jose'
import { COOKIE_NAME } from '@/lib/edge/jwt'

export type { UserRole } from '@/lib/edge/jwt'
export { COOKIE_NAME }

export const MAX_LOGIN_ATTEMPTS = 5
export const LOCKOUT_MINUTES = 30

const getSecret = () => new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET ?? process.env.JWT_SECRET!
)

export interface JwtPayload {
  userId: number
  username: string
  email: string
  role: import('@/lib/edge/jwt').UserRole
  ver: number
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime('15m')
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as JwtPayload
  } catch {
    return null
  }
}
