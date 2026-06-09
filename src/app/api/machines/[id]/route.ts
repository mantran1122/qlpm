import { prisma } from '@/lib/prisma'
import { getMachineStatus } from '@/lib/machine-utils'
import { requireRole, requireRoleStrict, requireCsrf } from '@/lib/node/auth'
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

export async function GET(
  req: NextRequest,
  ctx: RouteContext<'/api/machines/[id]'>
) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id } = await ctx.params

  const machine = await prisma.machine.findUnique({
    where: { id: Number(id) },
    include: { room: { include: { floor: true } } },
  })

  if (!machine) {
    return Response.json({ error: 'Không tìm thấy máy' }, { status: 404 })
  }

  return Response.json({
    ...machine,
    status: getMachineStatus(machine as Record<string, unknown>),
  })
}

export async function PUT(
  req: NextRequest,
  ctx: RouteContext<'/api/machines/[id]'>
) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const rl = rateLimit(`mutation:${auth.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  const { id } = await ctx.params
  const machineId = Number(id)

  let body: Record<string, string | null | boolean>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const allowedFields = [
    'softwareError', 'caseError', 'cpuError', 'ramError', 'diskError',
    'powerError', 'monitorError', 'monitorCableError', 'powerCableError',
    'mouseError', 'networkError', 'keyboardError', 'extraNotes', 'lastMaintainedAt',
  ]

  const data: Record<string, string | null | Date | boolean> = {}
  for (const key of allowedFields) {
    if (key in body) {
      if (key === 'lastMaintainedAt') {
        data[key] = body[key] ? new Date(body[key] as string) : null
      } else {
        data[key] = (body[key] as string | null) ?? null
      }
    }
  }

  // Lấy trạng thái lỗi TRƯỚC khi update để phát hiện disable/restore
  const prevMachine = await prisma.machine.findUnique({
    where: { id: machineId },
    select: {
      isFaulty: true, machineNo: true, isTeacher: true, extraNotes: true,
      roomId: true, room: { select: { id: true, roomCode: true } },
    },
  })

  const errorFieldKeys = [
    'softwareError', 'caseError', 'cpuError', 'ramError', 'diskError',
    'powerError', 'monitorError', 'monitorCableError', 'powerCableError',
    'mouseError', 'networkError', 'keyboardError',
  ]

  // Tính hasError sau khi update
  const updatedErrors: Record<string, string | null> = {}
  for (const k of errorFieldKeys) {
    if (k in data) updatedErrors[k] = data[k] as string | null
  }

  // Nếu client gửi isFaulty thì dùng; nếu không thì suy ra từ error fields
  let newIsFaulty: boolean | null = null
  if ('isFaulty' in body) {
    newIsFaulty = Boolean(body.isFaulty)
    data.isFaulty = newIsFaulty
  } else {
    const hasNewErrors = errorFieldKeys.some(f => {
      if (f in updatedErrors) return updatedErrors[f] != null && updatedErrors[f] !== ''
      return false
    })
    const allCleared = errorFieldKeys.every(f => {
      if (f in data) return data[f] == null || data[f] === ''
      return true
    })
    if (Object.keys(updatedErrors).length > 0) {
      newIsFaulty = hasNewErrors ? true : (allCleared ? false : null)
      if (newIsFaulty !== null) data.isFaulty = newIsFaulty
    }
  }

  const machine = await prisma.machine.update({
    where: { id: machineId },
    data,
    include: { room: true },
  })

  const wasGood   = prevMachine && !prevMachine.isFaulty
  const nowFaulty = machine.isFaulty
  const wasFaulty = prevMachine?.isFaulty
  const nowGood   = !machine.isFaulty

  const reason = (body.extraNotes as string | null) ?? machine.extraNotes ?? ''
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // DISABLE: máy vừa chuyển sang trạng thái lỗi
  if (wasGood && nowFaulty && prevMachine?.room) {
    const room = machine.room
    const actorName = await getActorName(auth.userId)
    const machineLabel = `Máy PC-${machine.machineNo}${machine.isTeacher ? ' (GV)' : ''}`
    const timestamp = now.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

    // Ghi bản ghi lịch sử bảo trì DISABLE
    const disableLog = await prisma.maintenanceLog.create({
      data: {
        roomId: room.id,
        machineId: machine.id,
        machineNo: machine.machineNo,
        actionType: 'DISABLE_FAULTY_MACHINE',
        createdById: auth.userId,
        isSupplyIntake: false,
        maintenanceDate: today,
        notes: reason || 'Máy được báo lỗi',
        completedAt: null,
      },
    })

    // Gửi thông báo đầy đủ cho Admin (không debounce — mỗi lần tắt là một sự kiện riêng)
    sendNotification({
      roles: ['ADMIN', 'MANAGER'],
      title: `KTV ${actorName} đã tắt ${machineLabel} (${room.roomCode}) lúc ${timestamp}`,
      message: `Lý do: ${reason || 'Không ghi chú'}. Bản ghi #${disableLog.id} đã được tạo trong Lịch sử bảo trì.`,
      type: 'ERROR',
      link: `/rooms/${room.roomCode}`,
    }).catch(() => {})
  }

  // RESTORE: máy vừa được bật lại (clear hết lỗi)
  if (wasFaulty && nowGood) {
    // Đóng DISABLE log gần nhất chưa hoàn thành
    const openDisable = await prisma.maintenanceLog.findFirst({
      where: {
        machineId: machine.id,
        actionType: 'DISABLE_FAULTY_MACHINE',
        completedAt: null,
      },
      orderBy: { maintenanceDate: 'desc' },
    })
    if (openDisable) {
      await prisma.maintenanceLog.update({
        where: { id: openDisable.id },
        data: { completedAt: now },
      })
    }

    // Tạo RESTORE log
    await prisma.maintenanceLog.create({
      data: {
        roomId: machine.room.id,
        machineId: machine.id,
        machineNo: machine.machineNo,
        actionType: 'RESTORE_MACHINE',
        createdById: auth.userId,
        isSupplyIntake: false,
        maintenanceDate: today,
        notes: reason || 'Máy đã được sửa chữa và đưa vào hoạt động',
        completedAt: now,
      },
    })

    const actorName = await getActorName(auth.userId)
    sendNotification({
      roles: ['ADMIN', 'MANAGER'],
      title: `${actorName} đã sửa xong Máy PC-${machine.machineNo} (${machine.room.roomCode})`,
      message: `Máy đã được đưa vào hoạt động trở lại.`,
      type: 'SUCCESS',
      link: `/rooms/${machine.room.roomCode}`,
    }).catch(() => {})
  }

  // Thông báo lỗi thông thường (debounce theo phòng, giữ lại cho các trường hợp update lỗi không qua isFaulty)
  const hasAnyError = errorFieldKeys.some(f => machine[f as keyof typeof machine] != null && machine[f as keyof typeof machine] !== '')
  if (hasAnyError && !wasGood) {
    const room = machine.room
    const errorCount = errorFieldKeys.filter(f => machine[f as keyof typeof machine] != null && machine[f as keyof typeof machine] !== '').length
    sendNotification({
      roles: ['ADMIN', 'MANAGER'],
      title: `Máy gặp sự cố tại ${room.roomCode}`,
      message: `Máy #${machine.machineNo}${machine.isTeacher ? ' (Giảng viên)' : ''} tại phòng ${room.roomCode} được ghi nhận ${errorCount} lỗi.`,
      type: 'WARNING',
      link: `/rooms/${room.roomCode}`,
      triggerKey: `machine_error_room_${room.id}`,
      cooldownMinutes: 60,
    }).catch(() => {})
  }

  return Response.json({
    ...machine,
    status: getMachineStatus(machine as Record<string, unknown>),
  })
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<'/api/machines/[id]'>
) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRoleStrict(req, 'ADMIN', 'MANAGER')
  if (!auth) return Response.json({ error: 'Không có quyền xóa máy' }, { status: 403 })

  const { id } = await ctx.params
  await prisma.machine.delete({ where: { id: Number(id) } })
  return new Response(null, { status: 204 })
}
