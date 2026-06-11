import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import { sendNotification } from '@/lib/node/notification'
import type { NextRequest } from 'next/server'

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

const ERROR_FIELDS = [
  'softwareError', 'caseError', 'cpuError', 'ramError', 'diskError',
  'powerError', 'monitorError', 'monitorCableError', 'powerCableError',
  'mouseError', 'networkError', 'keyboardError',
]

export async function POST(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const rl = rateLimit(`mutation:${auth.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  let body: { ids?: number[]; fields?: Record<string, string | null> }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  if (!body.ids || body.ids.length === 0) {
    return Response.json({ error: 'ids là bắt buộc' }, { status: 400 })
  }

  if (!body.fields || Object.keys(body.fields).length === 0) {
    return Response.json({ error: 'fields là bắt buộc' }, { status: 400 })
  }

  // Chỉ cho phép các trường lỗi, không ghi null để tránh xóa lỗi cũ
  const data: Record<string, string | boolean> = {}
  for (const [key, val] of Object.entries(body.fields)) {
    if (ERROR_FIELDS.includes(key) && val != null) {
      data[key] = val
    }
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'Không có trường lỗi hợp lệ' }, { status: 400 })
  }

  // Vì chỉ thêm lỗi (không xóa), isFaulty chắc chắn = true sau khi batch
  data.isFaulty = true

  // Lấy trạng thái trước khi update để phát hiện máy nào chuyển good → faulty
  const prevMachines = await prisma.machine.findMany({
    where: { id: { in: body.ids } },
    select: { id: true, isFaulty: true, machineNo: true, isTeacher: true, roomId: true },
  })
  const machinesGoingFaulty = prevMachines.filter(m => !m.isFaulty)

  // Cập nhật hàng loạt
  const updatedCount = await prisma.machine.updateMany({
    where: { id: { in: body.ids } },
    data,
  })

  const now = new Date()
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const errorLabels = Object.keys(data)
    .filter(k => k !== 'isFaulty')
    .map(k => k.replace('Error', ''))
    .join(', ')

  // Tạo DISABLE log cho mỗi máy vừa chuyển từ tốt → lỗi
  if (machinesGoingFaulty.length > 0) {
    await prisma.maintenanceLog.createMany({
      data: machinesGoingFaulty.map(m => ({
        roomId: m.roomId,
        machineId: m.id,
        machineNo: m.machineNo,
        actionType: 'DISABLE_FAULTY_MACHINE',
        createdById: auth.userId,
        isSupplyIntake: false,
        maintenanceDate: today,
        notes: `Ghi nhận lỗi hàng loạt: ${errorLabels}`,
        completedAt: null,
      })),
    })
  }

  // Lấy thông tin phòng + user để gửi thông báo
  const firstMachine = await prisma.machine.findUnique({
    where: { id: body.ids[0] },
    include: { room: true },
  })

  if (firstMachine?.room && machinesGoingFaulty.length > 0) {
    const room = firstMachine.room
    const actorName = await getActorName(auth.userId)
    const timestamp = now.toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    sendNotification({
      roles: ['ADMIN', 'MANAGER'],
      title: `KTV ${actorName} ghi nhận ${machinesGoingFaulty.length} máy lỗi tại ${room.roomCode} lúc ${timestamp}`,
      message: `Lỗi: ${errorLabels}. Tổng ${body.ids.length} máy được cập nhật (${machinesGoingFaulty.length} máy chuyển sang trạng thái lỗi).`,
      type: 'ERROR',
      link: `/rooms/${room.roomCode}`,
    }).catch(() => {})
  } else if (firstMachine?.room) {
    // Các máy đã lỗi sẵn, chỉ cập nhật thêm loại lỗi — gửi WARNING debounce
    const room = firstMachine.room
    sendNotification({
      roles: ['ADMIN', 'MANAGER'],
      title: `Máy gặp sự cố tại ${room.roomCode}`,
      message: `${body.ids.length} máy tại phòng ${room.roomCode} được cập nhật lỗi: ${errorLabels}.`,
      type: 'WARNING',
      link: `/rooms/${room.roomCode}`,
      triggerKey: `machine_error_room_${room.id}`,
      cooldownMinutes: 60,
    }).catch(() => {})
  }

  // Trả về danh sách máy đã cập nhật
  const machines = await prisma.machine.findMany({
    where: { id: { in: body.ids } },
    include: { room: true },
  })

  return Response.json({
    updated: updatedCount.count,
    machines,
  })
}
