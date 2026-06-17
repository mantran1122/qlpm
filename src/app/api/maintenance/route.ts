import { prisma } from '@/lib/prisma'
import { requireRole, requireCsrf } from '@/lib/node/auth'
import { rateLimit } from '@/lib/node/rate-limit'
import { sendNotification } from '@/lib/node/notification'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const roomCode = searchParams.get('roomCode')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 20)))

  const actionType = searchParams.get('actionType')
  const where: Record<string, unknown> = {}

  // TECHNICIAN chỉ thấy bản ghi do chính họ tạo, bất kể client gửi param gì
  if (auth.role === 'TECHNICIAN') {
    where.createdById = auth.userId
  }

  if (actionType) {
    where.actionType = actionType
  }

  if (roomCode) {
    const room = await prisma.room.findUnique({ where: { roomCode } })
    if (room) where.roomId = room.id
  }

  if (startDate || endDate) {
    where.maintenanceDate = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    }
  }

  const [total, logs] = await Promise.all([
    prisma.maintenanceLog.count({ where }),
    prisma.maintenanceLog.findMany({
      where,
      include: {
        room: { include: { floor: true } },
        technician: true,
        createdBy: { select: { username: true, email: true, profile: { select: { displayName: true } } } },
      },
      orderBy: [
        { maintenanceDate: 'desc' },
        { createdAt: 'desc' },
      ],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return Response.json({
    data: logs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}

export async function POST(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const rl = rateLimit(`mutation:${auth.userId}`, 60, 60)
  if (!rl.ok) return Response.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const { roomCode, isSupplyIntake, maintenanceDate, technicianName, technicianId, notes, machineId, machineNo, ...quantities } = body

  if (!maintenanceDate) {
    return Response.json({ error: 'maintenanceDate là bắt buộc' }, { status: 400 })
  }

  if (!isSupplyIntake && !roomCode) {
    return Response.json({ error: 'Cần roomCode hoặc isSupplyIntake=true' }, { status: 400 })
  }

  let roomId: number | null = null
  if (!isSupplyIntake && roomCode) {
    const room = await prisma.room.findUnique({ where: { roomCode: String(roomCode) } })
    if (!room) {
      return Response.json({ error: `Không tìm thấy phòng: ${roomCode}` }, { status: 404 })
    }
    roomId = room.id
  }

  const qtyFields = [
    'caseQty', 'cpuQty', 'ramQty', 'diskQty', 'powerQty',
    'monitorQty', 'monitorCableQty', 'powerCableQty',
    'mouseQty', 'networkQty', 'keyboardQty',
    'recCaseQty', 'recCpuQty', 'recRamQty', 'recDiskQty', 'recPowerQty',
    'recMonitorQty', 'recMonitorCableQty', 'recPowerCableQty',
    'recMouseQty', 'recNetworkQty', 'recKeyboardQty',
    'softwareErrorsBefore', 'hardwareErrorsBefore',
    'softwareErrorsAfter', 'hardwareErrorsAfter',
  ]

  const qtyData: Record<string, number> = {}
  for (const f of qtyFields) {
    qtyData[f] = Number(quantities[f] ?? 0)
  }

  const log = await prisma.maintenanceLog.create({
    data: {
      roomId,
      createdById: auth.userId,
      isSupplyIntake: Boolean(isSupplyIntake),
      maintenanceDate: new Date(String(maintenanceDate)),
      technicianName: technicianName ? String(technicianName) : null,
      technicianId: technicianId ? Number(technicianId) : null,
      notes: notes ? String(notes) : null,
      machineId: machineId ? Number(machineId) : null,
      machineNo: machineNo ? Number(machineNo) : null,
      ...qtyData,
    },
    include: { room: { include: { floor: true } }, technician: true },
  })

  // Gửi thông báo: bảo trì phòng máy
  if (!isSupplyIntake && roomId && log.room) {
    const techName = log.technicianName ?? log.technician?.name ?? 'Kỹ thuật viên'
    sendNotification({
      roles: ['ADMIN', 'MANAGER'],
      title: 'Bảo trì hoàn thành',
      message: `Phòng ${log.room.roomCode} đã được bảo trì bởi ${techName} vào ngày ${new Date(log.maintenanceDate).toLocaleDateString('vi-VN')}.`,
      type: 'SUCCESS',
      link: `/rooms/${log.room.roomCode}`,
    }).catch(() => {})
  }

  // Kiểm tra tồn kho thấp sau khi tạo log
  checkLowStockAndNotify().catch(() => {})

  return Response.json(log, { status: 201 })
}

const SUPPLY_LABELS_MAP: Record<string, string> = {
  caseQty: 'Case', cpuQty: 'CPU', ramQty: 'RAM', diskQty: 'Ổ cứng',
  powerQty: 'Nguồn', monitorQty: 'Màn hình', monitorCableQty: 'Cáp màn hình',
  powerCableQty: 'Cáp nguồn', mouseQty: 'Chuột', networkQty: 'Card mạng',
  keyboardQty: 'Bàn phím',
}

async function checkLowStockAndNotify() {
  const [intake, used] = await Promise.all([
    prisma.maintenanceLog.aggregate({
      where: { isSupplyIntake: true },
      _sum: { caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true, monitorQty: true, monitorCableQty: true, powerCableQty: true, mouseQty: true, networkQty: true, keyboardQty: true },
    }),
    prisma.maintenanceLog.aggregate({
      where: { isSupplyIntake: false },
      _sum: { caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true, monitorQty: true, monitorCableQty: true, powerCableQty: true, mouseQty: true, networkQty: true, keyboardQty: true },
    }),
  ])

  const fields = Object.keys(SUPPLY_LABELS_MAP)
  const intakeSum = intake._sum as Record<string, number | null>
  const usedSum = used._sum as Record<string, number | null>
  for (const field of fields) {
    const i = intakeSum[field] ?? 0
    const u = usedSum[field] ?? 0
    const balance = i - u
    if (balance <= 2) {
      await sendNotification({
        roles: ['ADMIN', 'MANAGER'],
        title: 'Cảnh báo tồn kho thấp',
        message: `Vật tư "${SUPPLY_LABELS_MAP[field]}" chỉ còn ${balance} đơn vị. Cần nhập thêm.`,
        type: 'WARNING',
        link: '/supplies',
        triggerKey: `low_stock_${field}`,
        cooldownMinutes: 360,
      })
    } else {
      // Xóa debounce nếu tồn kho đã được bổ sung
      try { await prisma.notificationDebounce.deleteMany({ where: { triggerKey: `low_stock_${field}` } }) } catch { /* ignore */ }
    }
  }
}
