import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const rawId = searchParams.get('userId')

  // Xác định userId cần lấy stats
  let targetUserId: number
  if (rawId) {
    // TECHNICIAN chỉ được xem của chính mình
    if (auth.role === 'TECHNICIAN' && Number(rawId) !== auth.userId) {
      return Response.json({ error: 'Không có quyền xem dashboard của người khác' }, { status: 403 })
    }
    targetUserId = Number(rawId)
  } else {
    targetUserId = auth.userId
  }

  const { searchParams: sp } = req.nextUrl
  const rangeParam = sp.get('range') ?? 'month' // today | week | month | custom
  const startParam = sp.get('start')
  const endParam = sp.get('end')

  const now = new Date()
  let rangeStart: Date
  let rangeEnd: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  if (rangeParam === 'today') {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  } else if (rangeParam === 'week') {
    const day = now.getDay()
    const diff = day === 0 ? 6 : day - 1
    rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
  } else if (rangeParam === 'custom' && startParam && endParam) {
    rangeStart = new Date(startParam)
    rangeEnd   = new Date(endParam + 'T23:59:59')
  } else {
    // month (default)
    rangeStart = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  const baseWhere = { createdById: targetUserId, isSupplyIntake: false }

  // KPI trong khoảng thời gian
  const [kpiRestore, kpiIncident, allTime] = await Promise.all([
    prisma.maintenanceLog.count({
      where: {
        ...baseWhere,
        actionType: 'RESTORE_MACHINE',
        maintenanceDate: { gte: rangeStart, lte: rangeEnd },
      },
    }),
    prisma.maintenanceLog.count({
      where: {
        ...baseWhere,
        actionType: 'DISABLE_FAULTY_MACHINE',
        maintenanceDate: { gte: rangeStart, lte: rangeEnd },
      },
    }),
    prisma.maintenanceLog.count({ where: baseWhere }),
  ])

  // Phòng đã bảo trì trong kỳ (distinct roomId)
  const roomsInRange = await prisma.maintenanceLog.findMany({
    where: {
      ...baseWhere,
      actionType: null,
      maintenanceDate: { gte: rangeStart, lte: rangeEnd },
    },
    select: { roomId: true },
    distinct: ['roomId'],
  })
  const roomCount = roomsInRange.filter(r => r.roomId !== null).length

  // Biểu đồ cột: số lần bảo trì theo ngày (30 ngày gần nhất)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
  thirtyDaysAgo.setHours(0, 0, 0, 0)

  const dailyLogs = await prisma.maintenanceLog.findMany({
    where: {
      ...baseWhere,
      maintenanceDate: { gte: thirtyDaysAgo },
    },
    select: { maintenanceDate: true, actionType: true },
  })

  // Tạo map ngày → count
  const dailyMap: Record<string, { bt: number; disable: number; restore: number }> = {}
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    dailyMap[key] = { bt: 0, disable: 0, restore: 0 }
  }
  for (const log of dailyLogs) {
    const key = new Date(log.maintenanceDate).toISOString().slice(0, 10)
    if (dailyMap[key]) {
      if (log.actionType === 'DISABLE_FAULTY_MACHINE') dailyMap[key].disable++
      else if (log.actionType === 'RESTORE_MACHINE')   dailyMap[key].restore++
      else                                              dailyMap[key].bt++
    }
  }
  const dailyChart = Object.entries(dailyMap).map(([date, v]) => ({
    date,
    label: date.slice(5), // MM-DD
    bt: v.bt,
    disable: v.disable,
    restore: v.restore,
    total: v.bt + v.disable + v.restore,
  }))

  // Biểu đồ tròn: cơ cấu loại công việc (all time)
  const allLogs = await prisma.maintenanceLog.findMany({
    where: baseWhere,
    select: { actionType: true },
  })
  const typeCount = { 'Báo lỗi máy': 0, 'Sửa chữa máy': 0 }
  for (const l of allLogs) {
    if (l.actionType === 'DISABLE_FAULTY_MACHINE')  typeCount['Báo lỗi máy']++
    else if (l.actionType === 'RESTORE_MACHINE')     typeCount['Sửa chữa máy']++
  }
  const workTypeChart = Object.entries(typeCount).map(([label, value]) => ({ label, value }))

  // Danh sách phiếu gần nhất (10 bản ghi)
  const recentLogs = await prisma.maintenanceLog.findMany({
    where: baseWhere,
    include: { room: { select: { roomCode: true } } },
    orderBy: { maintenanceDate: 'desc' },
    take: 10,
  })

  // Thông tin user
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, profile: { select: { displayName: true, department: true, avatar: true } } },
  })

  return Response.json({
    userId: targetUserId,
    user: targetUser,
    range: { start: rangeStart, end: rangeEnd, type: rangeParam },
    kpi: {
      restoreCount: kpiRestore,
      incidentCount: kpiIncident,
      totalCount: kpiRestore + kpiIncident,
      roomCount,
      allTimeTotal: allTime,
    },
    dailyChart,
    workTypeChart,
    recentLogs: recentLogs.map(l => ({
      id: l.id,
      maintenanceDate: l.maintenanceDate,
      roomCode: l.room?.roomCode ?? null,
      machineNo: l.machineNo,
      actionType: l.actionType,
      notes: l.notes,
      softwareErrorsBefore: l.softwareErrorsBefore,
      hardwareErrorsBefore: l.hardwareErrorsBefore,
      softwareErrorsAfter: l.softwareErrorsAfter,
      hardwareErrorsAfter: l.hardwareErrorsAfter,
      completedAt: l.completedAt,
    })),
  })
}
