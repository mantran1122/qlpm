import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import type { NextRequest } from 'next/server'

const SW_FIELD = 'softwareError' as const
const HW_FIELDS = [
  'caseError', 'cpuError', 'ramError', 'diskError',
  'powerError', 'monitorError', 'monitorCableError', 'powerCableError',
  'mouseError', 'networkError', 'keyboardError',
] as const

export async function POST(
  req: NextRequest,
  ctx: RouteContext<'/api/rooms/[roomCode]/snapshot'>
) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const rl = rateLimit(`snapshot:${auth.userId}`, 10, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  const { roomCode } = await ctx.params
  let body: { notes?: string } = {}
  try { body = await req.json() } catch { /* empty body OK */ }

  const room = await prisma.room.findUnique({
    where: { roomCode: decodeURIComponent(roomCode) },
    include: {
      machines: {
        select: {
          isTeacher: true,
          softwareError: true,
          caseError: true, cpuError: true, ramError: true, diskError: true,
          powerError: true, monitorError: true, monitorCableError: true,
          powerCableError: true, mouseError: true, networkError: true, keyboardError: true,
        },
      },
    },
  })

  if (!room) return Response.json({ error: 'Không tìm thấy phòng' }, { status: 404 })

  const regular = room.machines.filter(m => !m.isTeacher)
  let swCount = 0, hwCount = 0
  for (const m of regular) {
    const hasSw = m[SW_FIELD] != null && m[SW_FIELD] !== ''
    const hasHw = HW_FIELDS.some(f => m[f] != null && m[f] !== '')
    if (hasSw) swCount++
    if (hasHw) hwCount++
  }
  const errCount = regular.filter(m => {
    const hasSw = m[SW_FIELD] != null && m[SW_FIELD] !== ''
    const hasHw = HW_FIELDS.some(f => m[f] != null && m[f] !== '')
    return hasSw || hasHw
  }).length
  const goodCount = regular.length - errCount

  const now = new Date()
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const autoNotes = `Tình trạng phòng: ${goodCount} máy tốt, ${swCount} lỗi PM, ${hwCount} lỗi PC`
  const notes = body.notes?.trim() ? `${body.notes.trim()} — ${autoNotes}` : autoNotes

  const log = await prisma.maintenanceLog.create({
    data: {
      roomId: room.id,
      actionType: 'ROOM_STATUS_SNAPSHOT',
      maintenanceDate: today,
      softwareErrorsBefore: swCount,
      hardwareErrorsBefore: hwCount,
      softwareErrorsAfter: 0,
      hardwareErrorsAfter: 0,
      notes,
      createdById: auth.userId,
      isSupplyIntake: false,
    },
  })

  return Response.json({ success: true, logId: log.id })
}
