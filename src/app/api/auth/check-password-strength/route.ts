import { checkPassword } from '@/lib/node/password'
import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  let body: { password?: string }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }
  const { password } = body
  if (typeof password !== 'string') {
    return Response.json({ score: 0, ok: false, errors: ['Thiếu password'] }, { status: 400 })
  }
  const result = checkPassword(password)
  return Response.json(result)
}
