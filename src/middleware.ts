import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyJwtEdge, COOKIE_NAME } from '@/lib/edge/jwt'
import type { UserRole } from '@/lib/edge/jwt'

const PUBLIC_PATHS = ['/login', '/api/auth']

// Route nhạy cảm — Layer 1 chặn nhanh tại middleware (không query DB)
const PROTECTED: Array<{ pattern: RegExp; methods: string[]; roles: UserRole[] }> = [
  { pattern: /^\/api\/rooms/,       methods: ['POST', 'PUT', 'PATCH', 'DELETE'], roles: ['ADMIN'] },
  { pattern: /^\/api\/machines(?!\/batch)/, methods: ['POST', 'DELETE'],          roles: ['ADMIN', 'MANAGER'] },
  { pattern: /^\/api\/technicians/, methods: ['POST', 'PUT', 'DELETE'],          roles: ['ADMIN'] },
  { pattern: /^\/api\/users/,       methods: ['*'],                              roles: ['ADMIN'] },
  { pattern: /^\/api\/settings/,    methods: ['POST', 'PUT', 'PATCH', 'DELETE'], roles: ['ADMIN'] },
  { pattern: /^\/api\/audit-logs/,  methods: ['*'],                              roles: ['ADMIN'] },
  { pattern: /^\/api\/statistics/,  methods: ['*'],                              roles: ['ADMIN', 'MANAGER', 'TECHNICIAN'] },
  { pattern: /^\/stats/,            methods: ['*'],                              roles: ['ADMIN', 'MANAGER'] },
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const payload = await verifyJwtEdge(token)
  if (!payload) {
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'Phiên đăng nhập không hợp lệ' }, { status: 401 })
    }
    const res = NextResponse.redirect(new URL('/login', req.url))
    res.cookies.set({ name: COOKIE_NAME, value: '', maxAge: 0, path: '/' })
    return res
  }

  // Layer 1: role gating theo pattern
  const method = req.method.toUpperCase()
  for (const rule of PROTECTED) {
    if (!rule.pattern.test(pathname)) continue
    if (rule.methods[0] !== '*' && !rule.methods.includes(method)) continue
    if (!rule.roles.includes(payload.role)) {
      return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }
  }

  // Truyền userId và role xuống route handler qua header
  const res = NextResponse.next()
  res.headers.set('x-user-id', String(payload.userId))
  res.headers.set('x-user-role', payload.role)

  // Thông báo client refresh khi token còn < 5 phút (exp là giây)
  const exp = (payload as unknown as { exp?: number }).exp
  if (exp) {
    const remainingSec = exp - Math.floor(Date.now() / 1000)
    if (remainingSec < 300) {
      res.headers.set('X-Token-Refresh-Needed', '1')
    }
  }

  // Đảm bảo CSRF cookie tồn tại — user đăng nhập trước Phase 2 chưa có cookie này
  if (!req.cookies.get('csrf')) {
    res.cookies.set({
      name: 'csrf',
      value: crypto.randomUUID(),
      httpOnly: false,  // JS phải đọc được để gắn vào X-CSRF header
      path: '/',
      sameSite: 'lax',
      maxAge: 30 * 60,
      secure: process.env.NODE_ENV === 'production',
    })
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$).*)'],
}
