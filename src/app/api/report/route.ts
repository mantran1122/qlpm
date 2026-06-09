import { prisma } from '@/lib/prisma'
import { ERROR_LABELS, SUPPLY_LABELS } from '@/lib/machine-utils'

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

const SUPPLY_FIELDS = [
  'caseQty', 'cpuQty', 'ramQty', 'diskQty', 'powerQty',
  'monitorQty', 'monitorCableQty', 'powerCableQty',
  'mouseQty', 'networkQty', 'keyboardQty',
] as const

export async function GET() {
  const [rooms, allMachines, maintenanceLogs, supplyIntake, supplyUsage] = await Promise.all([
    prisma.room.findMany({ include: { floor: true }, orderBy: [{ floorId: 'asc' }, { roomCode: 'asc' }] }),
    prisma.machine.findMany(),
    prisma.maintenanceLog.findMany({
      where: { isSupplyIntake: false },
      include: { room: true },
      orderBy: { maintenanceDate: 'desc' },
      take: 20,
    }),
    prisma.maintenanceLog.aggregate({
      where: { isSupplyIntake: true },
      _sum: { caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true, monitorQty: true, monitorCableQty: true, powerCableQty: true, mouseQty: true, networkQty: true, keyboardQty: true },
    }),
    prisma.maintenanceLog.aggregate({
      where: { isSupplyIntake: false },
      _sum: { caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true, monitorQty: true, monitorCableQty: true, powerCableQty: true, mouseQty: true, networkQty: true, keyboardQty: true },
    }),
  ])

  // Per-room stats
  const roomRows = rooms.map(room => {
    const machines = allMachines.filter(m => m.roomId === room.id)
    const errorCount   = machines.filter(m => ERROR_FIELDS.some(f => m[f] != null && m[f] !== '')).length
    const swCount      = machines.filter(m => m.softwareError != null && m.softwareError !== '').length
    const hwCount      = machines.filter(m => HW_FIELDS.some(f => m[f] != null && m[f] !== '')).length
    const bothCount    = machines.filter(m =>
      (m.softwareError != null && m.softwareError !== '') &&
      HW_FIELDS.some(f => m[f] != null && m[f] !== '')
    ).length
    const goodCount    = machines.length - errorCount
    return {
      roomCode:     room.roomCode,
      floor:        room.floor.name,
      totalMachines: machines.length,
      goodCount,
      swCount,
      hwCount,
      bothCount,
      errorCount,
      errorRate:    machines.length > 0 ? Math.round((errorCount / machines.length) * 1000) / 10 : 0,
      cpuSpec:      room.cpuSpec,
      ramSpec:      room.ramSpec,
      diskSpec:     room.diskSpec,
      monitorSpec:  room.monitorSpec,
    }
  })

  // Per-floor stats
  const floorMap = new Map<string, { total: number; errors: number; sw: number; hw: number }>()
  for (const row of roomRows) {
    if (!floorMap.has(row.floor)) floorMap.set(row.floor, { total: 0, errors: 0, sw: 0, hw: 0 })
    const f = floorMap.get(row.floor)!
    f.total  += row.totalMachines
    f.errors += row.errorCount
    f.sw     += row.swCount
    f.hw     += row.hwCount
  }
  const floorStats = Array.from(floorMap.entries())
    .map(([floor, s]) => ({ floor, ...s, rate: s.total > 0 ? Math.round(s.errors / s.total * 1000) / 10 : 0 }))
    .sort((a, b) => b.errors - a.errors)

  // Error by type
  const errorByType = ERROR_FIELDS
    .map(f => ({ field: f, label: ERROR_LABELS[f] ?? f, count: allMachines.filter(m => m[f] != null && m[f] !== '').length }))
    .filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count)

  // Summary
  const totalMachines = allMachines.length
  const totalErrors   = allMachines.filter(m => ERROR_FIELDS.some(f => m[f] != null && m[f] !== '')).length
  const swMachines    = allMachines.filter(m => m.softwareError != null && m.softwareError !== '').length
  const hwMachines    = allMachines.filter(m => HW_FIELDS.some(f => m[f] != null && m[f] !== '')).length
  const goodRate      = totalMachines > 0 ? Math.round((1 - totalErrors / totalMachines) * 1000) / 10 : 100

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const maintenanceThisMonth = await prisma.maintenanceLog.count({ where: { isSupplyIntake: false, maintenanceDate: { gte: monthStart } } })

  // Supplies
  const supplies = SUPPLY_FIELDS.map(field => {
    const intake  = (supplyIntake._sum as Record<string, number | null>)[field]  ?? 0
    const used    = (supplyUsage._sum  as Record<string, number | null>)[field]  ?? 0
    const balance = intake - used
    return { type: field, label: SUPPLY_LABELS[field] ?? field, intake, used, balance, pct: intake > 0 ? Math.round(balance / intake * 100) : 0 }
  }).filter(s => s.intake > 0)

  return Response.json({
    generatedAt: now.toISOString(),
    summary: { totalMachines, totalErrors, swMachines, hwMachines, goodRate, errorRate: totalMachines > 0 ? Math.round(totalErrors / totalMachines * 1000) / 10 : 0, maintenanceThisMonth, totalRooms: rooms.length },
    rooms: roomRows,
    floorStats,
    errorByType,
    maintenanceLogs: maintenanceLogs.map(m => ({
      id: m.id,
      date: m.maintenanceDate instanceof Date ? m.maintenanceDate.toISOString().slice(0, 10) : String(m.maintenanceDate).slice(0, 10),
      room: m.room?.roomCode ?? '—',
      technicianName: m.technicianName ?? '—',
      softwareErrorsBefore: m.softwareErrorsBefore,
      hardwareErrorsBefore: m.hardwareErrorsBefore,
      softwareErrorsAfter:  m.softwareErrorsAfter,
      hardwareErrorsAfter:  m.hardwareErrorsAfter,
      notes: m.notes ?? '—',
    })),
    supplies,
  })
}
