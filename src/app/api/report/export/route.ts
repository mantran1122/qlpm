import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/node/auth'
import { SUPPLY_LABELS, ERROR_LABELS } from '@/lib/machine-utils'
import type { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'

const SUPPLY_FIELDS = [
  'caseQty', 'cpuQty', 'ramQty', 'diskQty', 'powerQty',
  'monitorQty', 'monitorCableQty', 'powerCableQty',
  'mouseQty', 'networkQty', 'keyboardQty',
] as const

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

type ParseResult = { from: Date; to: Date } | { error: string }

function parseDateRange(params: URLSearchParams): ParseResult {
  const period = params.get('period') ?? 'month'
  const now    = new Date()
  let from: Date, to: Date

  if (period === 'custom') {
    const fromStr = params.get('from'); const toStr = params.get('to')
    if (!fromStr || !toStr) return { error: 'Cần cung cấp from và to khi period=custom' }
    from = new Date(fromStr); to = new Date(toStr)
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return { error: 'from/to không hợp lệ' }
    const diff = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)
    if (diff > 365) return { error: 'Khoảng thời gian tối đa 365 ngày' }
  } else {
    to = new Date(now)
    switch (period) {
      case 'day':     from = new Date(now); from.setHours(0, 0, 0, 0); break
      case 'week':    from = new Date(now); from.setDate(now.getDate() - 6); from.setHours(0, 0, 0, 0); break
      case 'quarter': from = new Date(now); from.setMonth(now.getMonth() - 3); from.setHours(0, 0, 0, 0); break
      case 'year':    from = new Date(now); from.setFullYear(now.getFullYear() - 1); from.setHours(0, 0, 0, 0); break
      default:        from = new Date(now.getFullYear(), now.getMonth(), 1)
    }
  }
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

function fmtDate(d: Date | string) {
  const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
  const [y, m, day] = s.split('-')
  return `${day}/${m}/${y}`
}

function styleHeader(row: ExcelJS.Row, fillColor = '1E40AF') {
  row.eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fillColor } }
    cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  row.height = 30
}

function styleSubHeader(row: ExcelJS.Row) {
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
    cell.font = { bold: true, size: 10, color: { argb: 'FF1E40AF' } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } }
    cell.alignment = { vertical: 'middle' }
  })
  row.height = 24
}

function addTitle(ws: ExcelJS.Worksheet, text: string, cols: number) {
  const row = ws.addRow([text])
  ws.mergeCells(row.number, 1, row.number, cols)
  row.getCell(1).font      = { bold: true, size: 14, color: { argb: 'FF1E40AF' } }
  row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
  row.height = 36
  ws.addRow([])
}

// ── Sheet: Báo cáo máy lỗi ──────────────────────────────────────────────────
async function buildMachinesSheet(ws: ExcelJS.Worksheet, from: Date, to: Date, roomId?: number) {
  const [rooms, allMachines, logs] = await Promise.all([
    prisma.room.findMany({ include: { floor: true }, orderBy: [{ floorId: 'asc' }, { roomCode: 'asc' }] }),
    roomId ? prisma.machine.findMany({ where: { roomId } }) : prisma.machine.findMany(),
    prisma.maintenanceLog.findMany({
      where: { isSupplyIntake: false, maintenanceDate: { gte: from, lte: to }, ...(roomId ? { roomId } : {}) },
      include: { room: true },
      orderBy: { maintenanceDate: 'desc' },
    }),
  ])

  const filteredRooms = roomId ? rooms.filter(r => r.id === roomId) : rooms
  addTitle(ws, `Báo cáo máy lỗi — ${fmtDate(from)} đến ${fmtDate(to)}`, 8)

  // Summary
  const totalMachines = allMachines.length
  const totalErrors   = allMachines.filter(m => ERROR_FIELDS.some(f => m[f] != null && m[f] !== '')).length
  ws.addRow(['Tổng máy tính:', totalMachines, '', 'Máy lỗi:', totalErrors, '', 'Tỉ lệ lỗi (%):', totalMachines > 0 ? Math.round(totalErrors / totalMachines * 1000) / 10 : 0])
  ws.addRow(['Bảo trì trong kỳ:', logs.length])
  ws.addRow([])

  // Per-room
  const hdr = ws.addRow(['Phòng', 'Tầng', 'Tổng máy', 'Máy tốt', 'Lỗi PM', 'Lỗi PC', 'Cả hai', 'Tỉ lệ (%)'])
  styleHeader(hdr)
  ws.columns = [
    { key: 'a', width: 12 }, { key: 'b', width: 14 }, { key: 'c', width: 12 },
    { key: 'd', width: 12 }, { key: 'e', width: 10 }, { key: 'f', width: 10 },
    { key: 'g', width: 10 }, { key: 'h', width: 12 },
  ]

  for (const room of filteredRooms) {
    const machines   = allMachines.filter(m => m.roomId === room.id)
    const errorCount = machines.filter(m => ERROR_FIELDS.some(f => m[f] != null && m[f] !== '')).length
    const swCount    = machines.filter(m => m.softwareError != null && m.softwareError !== '').length
    const hwCount    = machines.filter(m => HW_FIELDS.some(f => m[f] != null && m[f] !== '')).length
    const bothCount  = machines.filter(m =>
      (m.softwareError != null && m.softwareError !== '') &&
      HW_FIELDS.some(f => m[f] != null && m[f] !== '')
    ).length
    const row = ws.addRow([room.roomCode, room.floor.name, machines.length, machines.length - errorCount, swCount, hwCount, bothCount, machines.length > 0 ? Math.round(errorCount / machines.length * 1000) / 10 : 0])
    if (errorCount > 0) row.getCell(8).font = { color: { argb: 'FFDC2626' } }
  }

  ws.addRow([])

  // Maintenance logs
  const hdr2 = ws.addRow(['Ngày', 'Phòng', 'Kỹ thuật viên', 'Lỗi PM trước', 'Lỗi PC trước', 'Lỗi PM sau', 'Lỗi PC sau', 'Ghi chú'])
  styleSubHeader(hdr2)
  for (const m of logs) {
    ws.addRow([
      fmtDate(m.maintenanceDate),
      m.room?.roomCode ?? '—',
      m.technicianName ?? '—',
      m.softwareErrorsBefore, m.hardwareErrorsBefore,
      m.softwareErrorsAfter, m.hardwareErrorsAfter,
      m.notes ?? '',
    ])
  }
}

// ── Sheet: Kho vật tư ────────────────────────────────────────────────────────
async function buildSupplySheet(ws: ExcelJS.Worksheet, from: Date, to: Date) {
  const [allIntake, allUsage, periodIntake, periodUsage] = await Promise.all([
    prisma.maintenanceLog.aggregate({ where: { isSupplyIntake: true }, _sum: { caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true, monitorQty: true, monitorCableQty: true, powerCableQty: true, mouseQty: true, networkQty: true, keyboardQty: true } }),
    prisma.maintenanceLog.aggregate({ where: { isSupplyIntake: false }, _sum: { caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true, monitorQty: true, monitorCableQty: true, powerCableQty: true, mouseQty: true, networkQty: true, keyboardQty: true } }),
    prisma.maintenanceLog.aggregate({ where: { isSupplyIntake: true, maintenanceDate: { gte: from, lte: to } }, _sum: { caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true, monitorQty: true, monitorCableQty: true, powerCableQty: true, mouseQty: true, networkQty: true, keyboardQty: true } }),
    prisma.maintenanceLog.aggregate({ where: { isSupplyIntake: false, maintenanceDate: { gte: from, lte: to } }, _sum: { caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true, monitorQty: true, monitorCableQty: true, powerCableQty: true, mouseQty: true, networkQty: true, keyboardQty: true } }),
  ])

  addTitle(ws, `Báo cáo kho vật tư — ${fmtDate(from)} đến ${fmtDate(to)}`, 7)
  ws.columns = [
    { key: 'a', width: 22 }, { key: 'b', width: 14 }, { key: 'c', width: 14 },
    { key: 'd', width: 14 }, { key: 'e', width: 16 }, { key: 'f', width: 16 }, { key: 'g', width: 16 },
  ]
  const hdr = ws.addRow(['Loại vật tư', 'Tổng nhập', 'Tổng xuất', 'Tồn kho', 'Nhập trong kỳ', 'Xuất trong kỳ', 'Chênh lệch kỳ'])
  styleHeader(hdr)

  for (const f of SUPPLY_FIELDS) {
    const totalIn   = (allIntake._sum  as Record<string, number | null>)[f] ?? 0
    const totalOut  = (allUsage._sum   as Record<string, number | null>)[f] ?? 0
    const periodIn  = (periodIntake._sum as Record<string, number | null>)[f] ?? 0
    const periodOut = (periodUsage._sum  as Record<string, number | null>)[f] ?? 0
    if (totalIn === 0 && periodIn === 0) continue
    const balance = totalIn - totalOut
    const row = ws.addRow([SUPPLY_LABELS[f] ?? f, totalIn, totalOut, balance, periodIn, periodOut, periodIn - periodOut])
    if (balance < 0) row.getCell(4).font = { color: { argb: 'FFDC2626' }, bold: true }
    else if (balance / Math.max(totalIn, 1) < 0.3) row.getCell(4).font = { color: { argb: 'FFD97706' } }
  }
}

// ── Sheet: Linh kiện sử dụng ─────────────────────────────────────────────────
async function buildPartsSheet(ws: ExcelJS.Worksheet, from: Date, to: Date, roomId?: number) {
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

  addTitle(ws, `Báo cáo linh kiện sử dụng — ${fmtDate(from)} đến ${fmtDate(to)}`, 4 + SUPPLY_FIELDS.length)

  const totals: Record<string, number> = {}
  for (const f of SUPPLY_FIELDS) totals[f] = 0
  for (const m of logs) for (const f of SUPPLY_FIELDS) totals[f] += (m as Record<string, unknown>)[f] as number ?? 0

  // Summary row
  ws.addRow(['Tổng cộng:', '', '', '', ...SUPPLY_FIELDS.map(f => totals[f])])

  const widths: number[] = [12, 14, 20, 30, ...SUPPLY_FIELDS.map(() => 12)]
  ws.columns = widths.map(w => ({ width: w }))

  const hdr = ws.addRow(['Ngày', 'Phòng', 'Kỹ thuật viên', 'Ghi chú', ...SUPPLY_FIELDS.map(f => SUPPLY_LABELS[f] ?? f)])
  styleHeader(hdr)

  for (const m of logs) {
    const parts = SUPPLY_FIELDS.map(f => (m as Record<string, unknown>)[f] as number ?? 0)
    ws.addRow([fmtDate(m.maintenanceDate), m.room?.roomCode ?? '—', m.technicianName ?? '—', m.notes ?? '', ...parts])
  }
}

// ── Sheet: KPI Thu hồi ───────────────────────────────────────────────────────
async function buildKpiSheet(ws: ExcelJS.Worksheet, from: Date, to: Date, techId?: number) {
  const technicians = await prisma.technician.findMany({
    where: techId ? { id: techId } : { isActive: true },
    select: { id: true, name: true },
  })
  const dateRange = { gte: from, lte: to }

  addTitle(ws, `KPI Thu hồi – Sửa chữa — ${fmtDate(from)} đến ${fmtDate(to)}`, 10)
  ws.columns = [
    { key: 'a', width: 22 }, { key: 'b', width: 14 }, { key: 'c', width: 14 }, { key: 'd', width: 14 },
    { key: 'e', width: 16 }, { key: 'f', width: 14 }, { key: 'g', width: 14 },
    { key: 'h', width: 16 }, { key: 'i', width: 16 }, { key: 'j', width: 20 },
  ]
  const hdr = ws.addRow(['Kỹ thuật viên', 'Tổng thu hồi', 'Cần sửa', 'Còn dùng', 'Trả máy', 'Đã sửa xong', 'Đang sửa', 'TB giờ sửa', 'TB phản hồi (phút)', 'Ghi chú'])
  styleHeader(hdr)

  for (const tech of technicians) {
    const [byType, done, inProg] = await Promise.all([
      prisma.recallRecord.groupBy({ by: ['recallType'], where: { recalledByTechnicianId: tech.id, recalledAt: dateRange }, _count: { id: true } }),
      prisma.recallRecord.count({ where: { repairedByTechnicianId: tech.id, repairFinishedAt: { not: null, gte: from, lte: to } } }),
      prisma.recallRecord.count({ where: { repairedByTechnicianId: tech.id, repairStartedAt: { not: null }, repairFinishedAt: null } }),
    ])

    const bt: Record<string, number> = { RECALL_FOR_REPAIR: 0, RECALL_STILL_USABLE: 0, RETURN_AFTER_REPAIR: 0 }
    let total = 0
    for (const r of byType) { bt[r.recallType] = r._count.id; total += r._count.id }
    if (total === 0 && done === 0 && inProg === 0) continue

    // Avg repair time
    const finished = await prisma.recallRecord.findMany({
      where: { repairedByTechnicianId: tech.id, recallType: 'RECALL_FOR_REPAIR', repairStartedAt: { not: null }, repairFinishedAt: { not: null, gte: from, lte: to } },
      select: { repairStartedAt: true, repairFinishedAt: true },
    })
    const responseTimes = await prisma.recallRecord.findMany({
      where: { repairedByTechnicianId: tech.id, recallType: 'RECALL_FOR_REPAIR', repairStartedAt: { not: null }, recalledAt: dateRange },
      select: { recalledAt: true, repairStartedAt: true },
    })

    const repairMins = finished.filter(r => r.repairStartedAt && r.repairFinishedAt)
      .map(r => Math.round((r.repairFinishedAt!.getTime() - r.repairStartedAt!.getTime()) / 60000))
    const respMins = responseTimes.filter(r => r.repairStartedAt)
      .map(r => Math.round((r.repairStartedAt!.getTime() - r.recalledAt.getTime()) / 60000))

    const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null
    const avgRepair = avg(repairMins)

    ws.addRow([
      tech.name, total, bt.RECALL_FOR_REPAIR, bt.RECALL_STILL_USABLE, bt.RETURN_AFTER_REPAIR,
      done, inProg,
      avgRepair != null ? `${Math.floor(avgRepair / 60)}h${avgRepair % 60}m` : '—',
      avg(respMins) ?? '—', '',
    ])
  }
}

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER')
  if (!auth) return Response.json({ error: 'Không có quyền' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const type      = searchParams.get('type') ?? 'machines'
  const roomIdStr = searchParams.get('roomId')
  const techIdStr = searchParams.get('technicianId')
  const roomId    = roomIdStr ? Number(roomIdStr) : undefined
  const techId    = techIdStr ? Number(techIdStr) : undefined

  const dr = parseDateRange(searchParams)
  if ('error' in dr) return Response.json({ error: dr.error }, { status: 400 })
  const { from, to } = dr

  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Phong May Manager'
  wb.created  = new Date()

  switch (type) {
    case 'machines': {
      const ws = wb.addWorksheet('Máy lỗi')
      await buildMachinesSheet(ws, from, to, roomId)
      break
    }
    case 'supply': {
      const ws = wb.addWorksheet('Kho vật tư')
      await buildSupplySheet(ws, from, to)
      break
    }
    case 'parts-usage': {
      const ws = wb.addWorksheet('Linh kiện')
      await buildPartsSheet(ws, from, to, roomId)
      break
    }
    case 'recall-kpi': {
      const ws = wb.addWorksheet('KPI Thu hồi')
      await buildKpiSheet(ws, from, to, techId)
      break
    }
    case 'all': {
      const [ws1, ws2, ws3, ws4] = [
        wb.addWorksheet('Máy lỗi'),
        wb.addWorksheet('Kho vật tư'),
        wb.addWorksheet('Linh kiện'),
        wb.addWorksheet('KPI Thu hồi'),
      ]
      await Promise.all([buildMachinesSheet(ws1, from, to), buildSupplySheet(ws2, from, to), buildPartsSheet(ws3, from, to), buildKpiSheet(ws4, from, to)])
      break
    }
    default:
      return Response.json({ error: 'type không hợp lệ' }, { status: 400 })
  }

  const typeLabel: Record<string, string> = { machines: 'may-loi', supply: 'kho', 'parts-usage': 'linh-kien', 'recall-kpi': 'kpi-thu-hoi', all: 'toan-bo' }
  const filename = `bao-cao-${typeLabel[type] ?? type}-${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.xlsx`

  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
