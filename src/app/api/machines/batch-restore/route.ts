import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import { sendNotification } from '@/lib/node/notification'
import type { NextRequest } from 'next/server'

const ERROR_FIELDS = [
  'softwareError', 'caseError', 'cpuError', 'ramError', 'diskError',
  'powerError', 'monitorError', 'monitorCableError', 'powerCableError',
  'mouseError', 'networkError', 'keyboardError',
] as const

async function getActorName(userId: number): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      email: true,
      profile: { select: { displayName: true, employeeCode: true } },
    },
  })
  if (!u) return `User #${userId}`
  return u.profile?.displayName || u.username || u.email || u.profile?.employeeCode || `User #${userId}`
}

export async function POST(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const rl = rateLimit(`mutation:${auth.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  let body: { ids?: number[]; notes?: string }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  if (!body.ids || body.ids.length === 0) {
    return Response.json({ error: 'ids là bắt buộc' }, { status: 400 })
  }

  const notes = body.notes?.trim() || 'Máy đã được sửa chữa và đưa vào hoạt động'
  const now = new Date()
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

  // Chỉ xử lý máy đang thực sự lỗi
  const faultyMachines = await prisma.machine.findMany({
    where: { id: { in: body.ids }, isFaulty: true },
    select: { id: true, machineNo: true, isTeacher: true, roomId: true },
  })

  if (faultyMachines.length === 0) {
    return Response.json({ error: 'Không có máy lỗi nào trong danh sách' }, { status: 400 })
  }

  const faultyIds = faultyMachines.map(m => m.id)

  // Xóa tất cả lỗi + isFaulty = false
  const clearData: Record<string, null | boolean> = { isFaulty: false }
  for (const f of ERROR_FIELDS) clearData[f] = null

  await prisma.machine.updateMany({
    where: { id: { in: faultyIds } },
    data: clearData,
  })

  // Với mỗi máy: đóng DISABLE log + tạo RESTORE log
  for (const m of faultyMachines) {
    const openDisable = await prisma.maintenanceLog.findFirst({
      where: { machineId: m.id, actionType: 'DISABLE_FAULTY_MACHINE', completedAt: null },
      orderBy: { maintenanceDate: 'desc' },
    })
    if (openDisable) {
      await prisma.maintenanceLog.update({
        where: { id: openDisable.id },
        data: { completedAt: now },
      })
    }
    await prisma.maintenanceLog.create({
      data: {
        roomId: m.roomId,
        machineId: m.id,
        machineNo: m.machineNo,
        actionType: 'RESTORE_MACHINE',
        createdById: auth.userId,
        isSupplyIntake: false,
        maintenanceDate: today,
        notes,
        completedAt: now,
      },
    })
  }

  // Thông báo admin
  const firstMachine = await prisma.machine.findUnique({
    where: { id: faultyIds[0] },
    include: { room: true },
  })
  if (firstMachine?.room) {
    const actorName = await getActorName(auth.userId)
    const room = firstMachine.room
    sendNotification({
      roles: ['ADMIN', 'MANAGER'],
      title: `${actorName} đã sửa xong ${faultyMachines.length} máy tại ${room.roomCode}`,
      message: `${faultyMachines.length} máy đã được đưa về trạng thái tốt. Ghi chú: ${notes}`,
      type: 'SUCCESS',
      link: `/rooms/${room.roomCode}`,
    }).catch(() => {})
  }

  return Response.json({ restored: faultyMachines.length })
}
