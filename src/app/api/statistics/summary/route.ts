import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

const ERROR_FIELDS = [
  'softwareError', 'caseError', 'cpuError', 'ramError', 'diskError',
  'powerError', 'monitorError', 'monitorCableError', 'powerCableError',
  'mouseError', 'networkError', 'keyboardError',
] as const

const HW_FIELDS = [
  'caseError', 'cpuError', 'ramError', 'diskError', 'powerError',
  'monitorError', 'monitorCableError', 'powerCableError',
  'mouseError', 'networkError', 'keyboardError',
] as const

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Không có quyền xem thống kê' }, { status: 403 })

  const [rooms, machines, recentMaintenance] = await Promise.all([
    prisma.room.findMany({ include: { floor: true } }),
    prisma.machine.findMany(),
    prisma.maintenanceLog.findMany({
      where: { isSupplyIntake: false },
      include: { room: { include: { floor: true } } },
      orderBy: { maintenanceDate: 'desc' },
      take: 5,
    }),
  ])

  const totalMachines = machines.length
  const errorMachines = machines.filter(m =>
    ERROR_FIELDS.some(f => m[f] != null && m[f] !== '')
  )
  const totalErrors = errorMachines.length
  const errorRate = totalMachines > 0 ? Math.round((totalErrors / totalMachines) * 1000) / 10 : 0
  const goodRate = Math.round((1 - totalErrors / totalMachines) * 1000) / 10

  const swMachines = machines.filter(m => m.softwareError != null && m.softwareError !== '').length
  const hwMachines = machines.filter(m =>
    HW_FIELDS.some(f => m[f] != null && m[f] !== '')
  ).length

  const errorsByType: Record<string, number> = {}
  for (const f of ERROR_FIELDS) {
    errorsByType[f] = machines.filter(m => m[f] != null && m[f] !== '').length
  }

  const floorMap = new Map<number, { floorName: string; roomIds: number[] }>()
  for (const room of rooms) {
    if (!floorMap.has(room.floorId)) {
      floorMap.set(room.floorId, { floorName: room.floor.name, roomIds: [] })
    }
    floorMap.get(room.floorId)!.roomIds.push(room.id)
  }

  const errorsByFloor = Array.from(floorMap.entries()).map(([, { floorName, roomIds }]) => {
    const floorMachines = machines.filter(m => roomIds.includes(m.roomId))
    const sw = floorMachines.filter(m => m.softwareError != null && m.softwareError !== '').length
    const hw = floorMachines.filter(m =>
      HW_FIELDS.some(f => m[f] != null && m[f] !== '')
    ).length
    const errorCount = floorMachines.filter(m =>
      ERROR_FIELDS.some(f => m[f] != null && m[f] !== '')
    ).length
    const totalCount = floorMachines.length
    return {
      floor: floorName,
      sw,
      hw,
      errorCount,
      totalCount,
      rate: totalCount > 0 ? Math.round((errorCount / totalCount) * 1000) / 10 : 0,
    }
  })

  const today = new Date()
  const weeklyErrors = await Promise.all(
    Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today)
      date.setDate(date.getDate() - (6 - i))
      const start = new Date(date.setHours(0, 0, 0, 0))
      const end = new Date(new Date(start).setHours(23, 59, 59, 999))
      return prisma.maintenanceLog.aggregate({
        where: {
          isSupplyIntake: false,
          maintenanceDate: { gte: start, lte: end },
        },
        _sum: {
          softwareErrorsBefore: true,
          hardwareErrorsBefore: true,
        },
      }).then(agg => ({
        date: start.toISOString().slice(0, 10),
        softwareErrors: agg._sum.softwareErrorsBefore ?? 0,
        hardwareErrors: agg._sum.hardwareErrorsBefore ?? 0,
      }))
    })
  )

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const maintenanceThisMonth = await prisma.maintenanceLog.count({
    where: {
      isSupplyIntake: false,
      maintenanceDate: { gte: monthStart },
    },
  })

  return Response.json({
    totalMachines,
    totalErrors,
    errorRate,
    goodRate,
    swMachines,
    hwMachines,
    maintenanceThisMonth,
    errorsByFloor,
    errorsByType,
    recentMaintenance,
    weeklyErrors,
  })
}
