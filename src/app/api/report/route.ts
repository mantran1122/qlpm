import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/node/auth'
import { ERROR_LABELS, SUPPLY_LABELS } from '@/lib/machine-utils'
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

const SUPPLY_FIELDS = [
  'caseQty', 'cpuQty', 'ramQty', 'diskQty', 'powerQty',
  'monitorQty', 'monitorCableQty', 'powerCableQty',
  'mouseQty', 'networkQty', 'keyboardQty',
] as const

type ParseResult = { from: Date; to: Date } | { error: string }

function parseDateRange(params: URLSearchParams): ParseResult {
  const period = params.get('period') ?? 'month'
  const now    = new Date()
  let from: Date, to: Date

  if (period === 'custom') {
    const fromStr = params.get('from')
    const toStr   = params.get('to')
    if (!fromStr || !toStr) return { error: 'Cần cung cấp from và to khi period=custom' }
    from = new Date(fromStr)
    to   = new Date(toStr)
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return { error: 'from/to không hợp lệ' }
    const diff = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)
    if (diff > 365) return { error: 'Khoảng thời gian tối đa 365 ngày' }
  } else {
    to = new Date(now)
    switch (period) {
      case 'day':
        from = new Date(now); from.setHours(0, 0, 0, 0); break
      case 'week':
        from = new Date(now); from.setDate(now.getDate() - 6); from.setHours(0, 0, 0, 0); break
      case 'quarter':
        from = new Date(now); from.setMonth(now.getMonth() - 3); from.setHours(0, 0, 0, 0); break
      case 'year':
        from = new Date(now); from.setFullYear(now.getFullYear() - 1); from.setHours(0, 0, 0, 0); break
      default: // month
        from = new Date(now.getFullYear(), now.getMonth(), 1)
    }
  }

  to.setHours(23, 59, 59, 999)
  return { from, to }
}

// ── Báo cáo máy lỗi ──────────────────────────────────────────────────────────
async function reportMachines(from: Date, to: Date, roomId?: number) {
  const [rooms, allMachines, maintenanceLogs, supplyIntake, supplyUsage] = await Promise.all([
    prisma.room.findMany({ include: { floor: true }, orderBy: [{ floorId: 'asc' }, { roomCode: 'asc' }] }),
    roomId ? prisma.machine.findMany({ where: { roomId } }) : prisma.machine.findMany(),
    prisma.maintenanceLog.findMany({
      where: { isSupplyIntake: false, maintenanceDate: { gte: from, lte: to }, ...(roomId ? { roomId } : {}) },
      include: { room: true },
      orderBy: { maintenanceDate: 'desc' },
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

  const filteredRooms = roomId ? rooms.filter(r => r.id === roomId) : rooms
  const roomRows = filteredRooms.map(room => {
    const machines  = allMachines.filter(m => m.roomId === room.id)
    const errorCount = machines.filter(m => ERROR_FIELDS.some(f => m[f] != null && m[f] !== '')).length
    const swCount    = machines.filter(m => m.softwareError != null && m.softwareError !== '').length
    const hwCount    = machines.filter(m => HW_FIELDS.some(f => m[f] != null && m[f] !== '')).length
    const bothCount  = machines.filter(m =>
      (m.softwareError != null && m.softwareError !== '') &&
      HW_FIELDS.some(f => m[f] != null && m[f] !== '')
    ).length
    return {
      roomCode:      room.roomCode,
      floor:         room.floor.name,
      totalMachines: machines.length,
      goodCount:     machines.length - errorCount,
      swCount, hwCount, bothCount, errorCount,
      errorRate:     machines.length > 0 ? Math.round((errorCount / machines.length) * 1000) / 10 : 0,
      cpuSpec:       room.cpuSpec,
      ramSpec:       room.ramSpec,
      diskSpec:      room.diskSpec,
      monitorSpec:   room.monitorSpec,
    }
  })

  const floorMap = new Map<string, { total: number; errors: number; sw: number; hw: number }>()
  for (const row of roomRows) {
    if (!floorMap.has(row.floor)) floorMap.set(row.floor, { total: 0, errors: 0, sw: 0, hw: 0 })
    const f = floorMap.get(row.floor)!
    f.total += row.totalMachines; f.errors += row.errorCount; f.sw += row.swCount; f.hw += row.hwCount
  }
  const floorStats = Array.from(floorMap.entries())
    .map(([floor, s]) => ({ floor, ...s, rate: s.total > 0 ? Math.round(s.errors / s.total * 1000) / 10 : 0 }))
    .sort((a, b) => b.errors - a.errors)

  const errorByType = ERROR_FIELDS
    .map(f => ({ field: f, label: ERROR_LABELS[f] ?? f, count: allMachines.filter(m => m[f] != null && m[f] !== '').length }))
    .filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count)

  const totalMachines = allMachines.length
  const totalErrors   = allMachines.filter(m => ERROR_FIELDS.some(f => m[f] != null && m[f] !== '')).length
  const swMachines    = allMachines.filter(m => m.softwareError != null && m.softwareError !== '').length
  const hwMachines    = allMachines.filter(m => HW_FIELDS.some(f => m[f] != null && m[f] !== '')).length

  const supplies = SUPPLY_FIELDS.map(field => {
    const intake  = (supplyIntake._sum as Record<string, number | null>)[field]  ?? 0
    const used    = (supplyUsage._sum  as Record<string, number | null>)[field]  ?? 0
    return { type: field, label: SUPPLY_LABELS[field] ?? field, intake, used, balance: intake - used, pct: intake > 0 ? Math.round((intake - used) / intake * 100) : 0 }
  }).filter(s => s.intake > 0)

  return {
    summary: { totalMachines, totalErrors, swMachines, hwMachines, goodRate: totalMachines > 0 ? Math.round((1 - totalErrors / totalMachines) * 1000) / 10 : 100, errorRate: totalMachines > 0 ? Math.round(totalErrors / totalMachines * 1000) / 10 : 0, totalRooms: filteredRooms.length, maintenanceInPeriod: maintenanceLogs.length },
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
  }
}

// ── Báo cáo kho vật tư ───────────────────────────────────────────────────────
async function reportSupply(from: Date, to: Date) {
  const [allIntake, allUsage, intakeInPeriod, usageInPeriod] = await Promise.all([
    prisma.maintenanceLog.aggregate({
      where: { isSupplyIntake: true },
      _sum: { caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true, monitorQty: true, monitorCableQty: true, powerCableQty: true, mouseQty: true, networkQty: true, keyboardQty: true },
    }),
    prisma.maintenanceLog.aggregate({
      where: { isSupplyIntake: false },
      _sum: { caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true, monitorQty: true, monitorCableQty: true, powerCableQty: true, mouseQty: true, networkQty: true, keyboardQty: true },
    }),
    prisma.maintenanceLog.aggregate({
      where: { isSupplyIntake: true, maintenanceDate: { gte: from, lte: to } },
      _sum: { caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true, monitorQty: true, monitorCableQty: true, powerCableQty: true, mouseQty: true, networkQty: true, keyboardQty: true },
    }),
    prisma.maintenanceLog.aggregate({
      where: { isSupplyIntake: false, maintenanceDate: { gte: from, lte: to } },
      _sum: { caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true, monitorQty: true, monitorCableQty: true, powerCableQty: true, mouseQty: true, networkQty: true, keyboardQty: true },
    }),
  ])

  const supplies = SUPPLY_FIELDS.map(field => {
    const totalIn  = (allIntake._sum  as Record<string, number | null>)[field] ?? 0
    const totalOut = (allUsage._sum   as Record<string, number | null>)[field] ?? 0
    const periodIn = (intakeInPeriod._sum as Record<string, number | null>)[field] ?? 0
    const periodOut= (usageInPeriod._sum  as Record<string, number | null>)[field] ?? 0
    return {
      type: field, label: SUPPLY_LABELS[field] ?? field,
      totalIntake: totalIn, totalUsed: totalOut, balance: totalIn - totalOut,
      pct: totalIn > 0 ? Math.round((totalIn - totalOut) / totalIn * 100) : 0,
      periodIntake: periodIn, periodUsed: periodOut, periodNet: periodIn - periodOut,
    }
  }).filter(s => s.totalIntake > 0 || s.periodIntake > 0)

  const totalBalance   = supplies.reduce((s, x) => s + x.balance, 0)
  const periodNetTotal = supplies.reduce((s, x) => s + x.periodNet, 0)
  const lowCount       = supplies.filter(s => s.pct < 30).length

  return { summary: { totalTypes: supplies.length, totalBalance, periodNetTotal, lowCount }, supplies }
}

// ── Báo cáo linh kiện sử dụng ────────────────────────────────────────────────
async function reportPartsUsage(from: Date, to: Date, roomId?: number) {
  const logs = await prisma.maintenanceLog.findMany({
    where: {
      isSupplyIntake: false,
      maintenanceDate: { gte: from, lte: to },
      ...(roomId ? { roomId } : {}),
      OR: SUPPLY_FIELDS.map(f => ({ [f]: { gt: 0 } })),
    },
    include: { room: true },
    orderBy: { maintenanceDate: 'desc' },
  })

  const totals: Record<string, number> = {}
  for (const f of SUPPLY_FIELDS) totals[f] = 0

  const rows = logs.map(m => {
    const parts: Record<string, number> = {}
    for (const f of SUPPLY_FIELDS) {
      const v = (m as Record<string, unknown>)[f] as number ?? 0
      parts[f] = v
      totals[f] += v
    }
    return {
      id: m.id,
      date: m.maintenanceDate instanceof Date ? m.maintenanceDate.toISOString().slice(0, 10) : String(m.maintenanceDate).slice(0, 10),
      room: m.room?.roomCode ?? '—',
      technicianName: m.technicianName ?? '—',
      notes: m.notes ?? '',
      ...parts,
    }
  })

  const summary = SUPPLY_FIELDS.map(f => ({ type: f, label: SUPPLY_LABELS[f] ?? f, total: totals[f] })).filter(s => s.total > 0)
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0)

  return { summary: { grandTotal, byType: summary, totalLogs: rows.length }, rows }
}

// ── Báo cáo KPI thu hồi ──────────────────────────────────────────────────────
async function reportRecallKpi(from: Date, to: Date, technicianId?: number) {
  const technicians = await prisma.technician.findMany({
    where: technicianId ? { id: technicianId } : { isActive: true },
    select: { id: true, name: true },
  })

  const dateRange = { gte: from, lte: to }

  const stats = await Promise.all(
    technicians.map(async tech => {
      const [recallsByType, repairsCompleted, repairsInProgress, repairsNotStarted, finishedRepairs, responseTimes] = await Promise.all([
        prisma.recallRecord.groupBy({
          by: ['recallType'],
          where: { recalledByTechnicianId: tech.id, recalledAt: dateRange },
          _count: { id: true },
        }),
        prisma.recallRecord.count({
          where: { repairedByTechnicianId: tech.id, repairFinishedAt: { not: null, gte: from, lte: to } },
        }),
        prisma.recallRecord.count({
          where: { repairedByTechnicianId: tech.id, repairStartedAt: { not: null }, repairFinishedAt: null },
        }),
        prisma.recallRecord.count({
          where: { repairedByTechnicianId: tech.id, repairStartedAt: null, recalledAt: dateRange },
        }),
        prisma.recallRecord.findMany({
          where: { repairedByTechnicianId: tech.id, recallType: 'RECALL_FOR_REPAIR', repairStartedAt: { not: null }, repairFinishedAt: { not: null, gte: from, lte: to } },
          select: { repairStartedAt: true, repairFinishedAt: true },
        }),
        prisma.recallRecord.findMany({
          where: { repairedByTechnicianId: tech.id, recallType: 'RECALL_FOR_REPAIR', repairStartedAt: { not: null }, recalledAt: dateRange },
          select: { recalledAt: true, repairStartedAt: true },
        }),
      ])

      const byType: Record<string, number> = { RECALL_FOR_REPAIR: 0, RECALL_STILL_USABLE: 0, RETURN_AFTER_REPAIR: 0 }
      let totalRecalls = 0
      for (const r of recallsByType) { byType[r.recallType] = r._count.id; totalRecalls += r._count.id }

      const repairMins = finishedRepairs.filter(r => r.repairStartedAt && r.repairFinishedAt)
        .map(r => Math.round((r.repairFinishedAt!.getTime() - r.repairStartedAt!.getTime()) / 60000))
      const responseMins = responseTimes.filter(r => r.repairStartedAt)
        .map(r => Math.round((r.repairStartedAt!.getTime() - r.recalledAt.getTime()) / 60000))

      const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null
      const min = (a: number[]) => a.length ? Math.min(...a) : null
      const max = (a: number[]) => a.length ? Math.max(...a) : null

      return {
        technicianId: tech.id, technicianName: tech.name,
        totalRecalls, recallsByType: byType,
        totalRepairsCompleted: repairsCompleted, repairsInProgress, repairsNotStarted,
        avgRepairMinutes: avg(repairMins), minRepairMinutes: min(repairMins), maxRepairMinutes: max(repairMins),
        avgResponseMinutes: avg(responseMins),
      }
    })
  )

  return { data: stats.filter(s => s.totalRecalls > 0 || s.totalRepairsCompleted > 0 || s.repairsInProgress > 0) }
}

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER')
  if (!auth) return Response.json({ error: 'Không có quyền' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const type       = searchParams.get('type')
  const roomIdStr  = searchParams.get('roomId')
  const techIdStr  = searchParams.get('technicianId')
  const roomId     = roomIdStr ? Number(roomIdStr) : undefined
  const techId     = techIdStr ? Number(techIdStr) : undefined

  // Legacy mode: no type param → original behavior (backward compat với trang in báo cáo cũ)
  if (!type) {
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

    const roomRows = rooms.map(room => {
      const machines  = allMachines.filter(m => m.roomId === room.id)
      const errorCount = machines.filter(m => ERROR_FIELDS.some(f => m[f] != null && m[f] !== '')).length
      const swCount    = machines.filter(m => m.softwareError != null && m.softwareError !== '').length
      const hwCount    = machines.filter(m => HW_FIELDS.some(f => m[f] != null && m[f] !== '')).length
      const bothCount  = machines.filter(m =>
        (m.softwareError != null && m.softwareError !== '') &&
        HW_FIELDS.some(f => m[f] != null && m[f] !== '')
      ).length
      return { roomCode: room.roomCode, floor: room.floor.name, totalMachines: machines.length, goodCount: machines.length - errorCount, swCount, hwCount, bothCount, errorCount, errorRate: machines.length > 0 ? Math.round((errorCount / machines.length) * 1000) / 10 : 0, cpuSpec: room.cpuSpec, ramSpec: room.ramSpec, diskSpec: room.diskSpec, monitorSpec: room.monitorSpec }
    })

    const floorMap = new Map<string, { total: number; errors: number; sw: number; hw: number }>()
    for (const row of roomRows) {
      if (!floorMap.has(row.floor)) floorMap.set(row.floor, { total: 0, errors: 0, sw: 0, hw: 0 })
      const f = floorMap.get(row.floor)!
      f.total += row.totalMachines; f.errors += row.errorCount; f.sw += row.swCount; f.hw += row.hwCount
    }
    const floorStats = Array.from(floorMap.entries())
      .map(([floor, s]) => ({ floor, ...s, rate: s.total > 0 ? Math.round(s.errors / s.total * 1000) / 10 : 0 }))
      .sort((a, b) => b.errors - a.errors)

    const errorByType = ERROR_FIELDS
      .map(f => ({ field: f, label: ERROR_LABELS[f] ?? f, count: allMachines.filter(m => m[f] != null && m[f] !== '').length }))
      .filter(e => e.count > 0).sort((a, b) => b.count - a.count)

    const totalMachines = allMachines.length
    const totalErrors   = allMachines.filter(m => ERROR_FIELDS.some(f => m[f] != null && m[f] !== '')).length
    const swMachines    = allMachines.filter(m => m.softwareError != null && m.softwareError !== '').length
    const hwMachines    = allMachines.filter(m => HW_FIELDS.some(f => m[f] != null && m[f] !== '')).length
    const now           = new Date()
    const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1)
    const maintenanceThisMonth = await prisma.maintenanceLog.count({ where: { isSupplyIntake: false, maintenanceDate: { gte: monthStart } } })

    const supplies = SUPPLY_FIELDS.map(field => {
      const intake = (supplyIntake._sum as Record<string, number | null>)[field]  ?? 0
      const used   = (supplyUsage._sum  as Record<string, number | null>)[field]  ?? 0
      return { type: field, label: SUPPLY_LABELS[field] ?? field, intake, used, balance: intake - used, pct: intake > 0 ? Math.round((intake - used) / intake * 100) : 0 }
    }).filter(s => s.intake > 0)

    return Response.json({
      generatedAt: now.toISOString(),
      summary: { totalMachines, totalErrors, swMachines, hwMachines, goodRate: totalMachines > 0 ? Math.round((1 - totalErrors / totalMachines) * 1000) / 10 : 100, errorRate: totalMachines > 0 ? Math.round(totalErrors / totalMachines * 1000) / 10 : 0, maintenanceThisMonth, totalRooms: rooms.length },
      rooms: roomRows, floorStats, errorByType,
      maintenanceLogs: maintenanceLogs.map(m => ({
        id: m.id,
        date: m.maintenanceDate instanceof Date ? m.maintenanceDate.toISOString().slice(0, 10) : String(m.maintenanceDate).slice(0, 10),
        room: m.room?.roomCode ?? '—',
        technicianName: m.technicianName ?? '—',
        softwareErrorsBefore: m.softwareErrorsBefore, hardwareErrorsBefore: m.hardwareErrorsBefore,
        softwareErrorsAfter:  m.softwareErrorsAfter,  hardwareErrorsAfter:  m.hardwareErrorsAfter,
        notes: m.notes ?? '—',
      })),
      supplies,
    })
  }

  // Typed report mode
  const dr = parseDateRange(searchParams)
  if ('error' in dr) return Response.json({ error: dr.error }, { status: 400 })
  const { from, to } = dr
  const period = { from: from.toISOString(), to: to.toISOString() }

  switch (type) {
    case 'machines': {
      const data = await reportMachines(from, to, roomId)
      return Response.json({ type: 'machines', period, generatedAt: new Date().toISOString(), ...data })
    }
    case 'supply': {
      const data = await reportSupply(from, to)
      return Response.json({ type: 'supply', period, generatedAt: new Date().toISOString(), ...data })
    }
    case 'parts-usage': {
      const data = await reportPartsUsage(from, to, roomId)
      return Response.json({ type: 'parts-usage', period, generatedAt: new Date().toISOString(), ...data })
    }
    case 'recall-kpi': {
      const data = await reportRecallKpi(from, to, techId)
      return Response.json({ type: 'recall-kpi', period, generatedAt: new Date().toISOString(), ...data })
    }
    default:
      return Response.json({ error: 'type không hợp lệ. Dùng: machines | supply | parts-usage | recall-kpi' }, { status: 400 })
  }
}
