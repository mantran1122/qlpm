import { prisma } from '@/lib/prisma'

export async function GET() {
  let db: 'ok' | 'error' = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    db = 'error'
  }

  const uptime = Math.floor(process.uptime())
  const ok = db === 'ok'

  return Response.json(
    { ok, db, uptime },
    { status: ok ? 200 : 503 }
  )
}
