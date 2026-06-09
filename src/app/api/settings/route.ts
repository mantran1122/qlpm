import { requireRole, requireRoleStrict, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import { getSetting, setSetting, getAllSettings } from '@/lib/node/settings'
import { invalidateSettingsCache } from '@/lib/node/settings-cache'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return Response.json({ error: 'Không có quyền truy cập' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')

  if (key) {
    const value = await getSetting(key)
    return Response.json({ key, value })
  }

  const settings = await getAllSettings()
  return Response.json(settings)
}

export async function PUT(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRoleStrict(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Chỉ admin mới có quyền' }, { status: 403 })

  const rl = rateLimit(`mutation:${auth.payload.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  let body: { key?: string; value?: string; isSecret?: boolean }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  if (!body.key?.trim()) {
    return Response.json({ error: 'key là bắt buộc' }, { status: 400 })
  }

  if (body.value === undefined || body.value === null) {
    return Response.json({ error: 'value là bắt buộc' }, { status: 400 })
  }

  await setSetting(body.key.trim(), String(body.value), body.isSecret === true, auth.payload.userId)
  invalidateSettingsCache()

  return Response.json({ ok: true, key: body.key.trim() })
}
