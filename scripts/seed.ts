import * as path from 'path'
import * as dotenv from 'dotenv'
import * as XLSX from 'xlsx'

dotenv.config({ path: path.join(__dirname, '../.env') })

import { PrismaClient, SoftwareCategory } from '@prisma/client'

const prisma = new PrismaClient()
const EXCEL_PATH = path.join(__dirname, '../../Thống kê phòng máy.xlsx')

function excelDateToJS(serial: number): Date {
  return new Date((serial - 25569) * 86400 * 1000)
}

function normalizeRoomCode(code: string): string {
  // I301 → I3-01, T301 → T3-01
  return String(code).replace(/^([A-Z]+\d)(\d{2})$/, '$1-$2')
}

function mapSoftwareCategory(cat: string | null): SoftwareCategory {
  if (!cat) return SoftwareCategory.VAN_PHONG
  if (cat.includes('Đồ hoạ')) return SoftwareCategory.DO_HOA
  if (cat.includes('Lập trình')) return SoftwareCategory.LAP_TRINH_CNTT
  if (cat.includes('Mạng')) return SoftwareCategory.MANG
  if (cat.includes('Kế toán') || cat.includes('thống kê')) return SoftwareCategory.KE_TOAN_THONG_KE
  return SoftwareCategory.VAN_PHONG
}

async function main() {
  const wb = XLSX.readFile(EXCEL_PATH)

  // ── 1. FLOORS & ROOMS ────────────────────────────────────────────────────
  console.log('Seeding floors and rooms...')
  const overviewSheet = wb.Sheets['Tổng quan']
  const overviewRows: any[][] = XLSX.utils.sheet_to_json(overviewSheet, { header: 1, defval: null })

  // rows from index 2 until room data ends (column A has STT number)
  let currentFloor: number | null = null
  const roomsData: { floor: string; roomCode: string; totalMachines: number; cpu: string | null; ram: string | null; disk: string | null; monitor: string | null; notes: string | null }[] = []

  for (let i = 2; i < overviewRows.length; i++) {
    const row = overviewRows[i]
    const roomCode = row[2]
    const totalMachines = row[3]

    if (!roomCode || typeof roomCode !== 'string' || !roomCode.match(/^[IT]/)) break

    if (row[1] !== null && row[1] !== undefined) {
      currentFloor = Number(row[1])
    }

    roomsData.push({
      floor: String(currentFloor),
      roomCode: String(roomCode).trim(),
      totalMachines: Number(totalMachines) || 0,
      cpu: row[4] ? String(row[4]).trim() : null,
      ram: row[5] ? String(row[5]).trim() : null,
      disk: row[6] ? String(row[6]).trim() : null,
      monitor: row[7] ? String(row[7]).trim() : null,
      notes: row[8] ? String(row[8]).trim() : null,
    })
  }

  // also add T3 floor
  const floorNames = [...new Set(roomsData.map(r => r.floor))]
  // T3 is a special floor - check rooms
  const floorMap = new Map<string, number>()
  for (const name of floorNames) {
    const floor = await prisma.floor.upsert({
      where: { name },
      update: {},
      create: { name },
    })
    floorMap.set(name, floor.id)
  }

  // Handle T3 floor if missing
  if (!floorMap.has('T3')) {
    // check if T3 rooms exist in any sheet
    const t3Sheet = wb.Sheets['T3']
    if (t3Sheet) {
      const t3Floor = await prisma.floor.upsert({
        where: { name: 'T3' },
        update: {},
        create: { name: 'T3' },
      })
      floorMap.set('T3', t3Floor.id)
    }
  }

  const roomMap = new Map<string, number>()
  for (const r of roomsData) {
    const floorId = floorMap.get(r.floor)!
    const room = await prisma.room.upsert({
      where: { roomCode: r.roomCode },
      update: {},
      create: {
        floorId,
        roomCode: r.roomCode,
        totalMachines: r.totalMachines,
        cpuSpec: r.cpu,
        ramSpec: r.ram,
        diskSpec: r.disk,
        monitorSpec: r.monitor,
        notes: r.notes,
      },
    })
    roomMap.set(r.roomCode, room.id)
  }

  // Seed T3-01 separately if not in Tổng quan
  if (!roomMap.has('T3-01')) {
    const t3Sheet = wb.Sheets['T3']
    if (t3Sheet) {
      const floorId = floorMap.get('T3')!
      const room = await prisma.room.upsert({
        where: { roomCode: 'T3-01' },
        update: {},
        create: {
          floorId,
          roomCode: 'T3-01',
          totalMachines: 61,
          cpuSpec: null,
          ramSpec: null,
          diskSpec: null,
          monitorSpec: null,
          notes: null,
        },
      })
      roomMap.set('T3-01', room.id)
    }
  }

  console.log(`  → ${floorMap.size} floors, ${roomMap.size} rooms`)

  // ── 2. SOFTWARE ──────────────────────────────────────────────────────────
  console.log('Seeding software...')
  const softwareSet = new Set<string>()
  let swCount = 0

  for (let i = 2; i < overviewRows.length; i++) {
    const row = overviewRows[i]
    const name = row[11]
    if (!name || typeof name !== 'string' || !name.trim()) continue
    if (softwareSet.has(name.trim())) continue
    softwareSet.add(name.trim())

    const category = mapSoftwareCategory(row[13] ? String(row[13]) : null)
    const notes = row[12] ? String(row[12]).trim() : null

    await prisma.software.create({
      data: { name: name.trim(), category, notes },
    })
    swCount++
  }
  console.log(`  → ${swCount} software entries`)

  // ── 3. MACHINES ──────────────────────────────────────────────────────────
  console.log('Seeding machines...')
  const machineSheets = ['I2', 'I3', 'I4', 'I5', 'I6', 'T3']
  let machineCount = 0

  for (const sheetName of machineSheets) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const roomCodeRaw = row[0]
      const machineNo = row[1]

      if (!roomCodeRaw || !machineNo || typeof machineNo !== 'number') continue
      // skip summary rows like "Tổng"
      if (String(roomCodeRaw).toLowerCase().includes('tổng')) continue

      const roomCode = normalizeRoomCode(String(roomCodeRaw).trim())
      const roomId = roomMap.get(roomCode)
      if (!roomId) {
        console.warn(`  ! Room not found: ${roomCode}`)
        continue
      }

      // col P (index 15) = Ghi chú
      const ghiChu = row[15]
      const isTeacher = ghiChu && String(ghiChu).includes('GV')

      // lastMaintainedAt: nếu ghi chú là số (Excel serial date)
      let lastMaintainedAt: Date | null = null
      if (typeof ghiChu === 'number') {
        lastMaintainedAt = excelDateToJS(ghiChu)
      }

      const extraNotes = (ghiChu && typeof ghiChu === 'string' && !ghiChu.includes('GV'))
        ? ghiChu.trim()
        : null

      await prisma.machine.upsert({
        where: { roomId_machineNo_isTeacher: { roomId, machineNo: Number(machineNo), isTeacher: !!isTeacher } },
        update: {},
        create: {
          roomId,
          machineNo: Number(machineNo),
          isTeacher: !!isTeacher,
          softwareError: row[3] ? String(row[3]).trim() : null,
          caseError:     row[4] ? String(row[4]).trim() : null,
          cpuError:      row[5] ? String(row[5]).trim() : null,
          ramError:      row[6] ? String(row[6]).trim() : null,
          diskError:     row[7] ? String(row[7]).trim() : null,
          powerError:    row[8] ? String(row[8]).trim() : null,
          monitorError:  row[9] ? String(row[9]).trim() : null,
          monitorCableError: row[10] ? String(row[10]).trim() : null,
          powerCableError:   row[11] ? String(row[11]).trim() : null,
          mouseError:    row[12] ? String(row[12]).trim() : null,
          networkError:  row[13] ? String(row[13]).trim() : null,
          keyboardError: row[14] ? String(row[14]).trim() : null,
          extraNotes,
          lastMaintainedAt,
        },
      })
      machineCount++
    }
  }
  console.log(`  → ${machineCount} machines`)

  // ── 4. MAINTENANCE LOGS ──────────────────────────────────────────────────
  console.log('Seeding maintenance logs...')
  const btSheet = wb.Sheets['Bảng theo dõi']
  const btRows: any[][] = XLSX.utils.sheet_to_json(btSheet, { header: 1, defval: null })

  // header is row index 5, data from row index 6
  let logCount = 0
  for (let i = 6; i < btRows.length; i++) {
    const row = btRows[i]
    const phong = row[1]
    const ngay = row[2]

    if (!phong && !ngay) continue
    if (!ngay) continue

    const isSupplyIntake = phong === 'QTTB'
    let roomId: number | null = null

    if (!isSupplyIntake && phong) {
      const roomCode = normalizeRoomCode(String(phong).trim())
      roomId = roomMap.get(roomCode) ?? null
      if (!roomId) {
        console.warn(`  ! Maintenance: room not found: ${phong}`)
        continue
      }
    }

    const maintenanceDate = typeof ngay === 'number'
      ? excelDateToJS(ngay)
      : new Date(ngay)

    await prisma.maintenanceLog.create({
      data: {
        roomId,
        isSupplyIntake,
        maintenanceDate,
        caseQty:         Number(row[3])  || 0,
        cpuQty:          Number(row[4])  || 0,
        ramQty:          Number(row[5])  || 0,
        diskQty:         Number(row[6])  || 0,
        powerQty:        Number(row[7])  || 0,
        monitorQty:      Number(row[8])  || 0,
        monitorCableQty: Number(row[9])  || 0,
        powerCableQty:   Number(row[10]) || 0,
        mouseQty:        Number(row[11]) || 0,
        networkQty:      Number(row[12]) || 0,
        keyboardQty:     Number(row[13]) || 0,
        notes:           row[14] ? String(row[14]).trim() : null,
        softwareErrorsBefore: Number(row[15]) || 0,
        hardwareErrorsBefore: Number(row[16]) || 0,
        softwareErrorsAfter:  Number(row[17]) || 0,
        hardwareErrorsAfter:  Number(row[18]) || 0,
        technicianName:  row[19] ? String(row[19]).trim() : null,
      },
    })
    logCount++
  }
  console.log(`  → ${logCount} maintenance logs`)

  console.log('\n✓ Seed completed!')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
