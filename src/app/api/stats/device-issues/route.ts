import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

const COMPUTER_FIELDS = ['caseError', 'cpuError', 'ramError', 'diskError', 'powerError'] as const

type ComputerField = (typeof COMPUTER_FIELDS)[number]

function hasVal(v: string | null | undefined): boolean {
  return v != null && v.trim() !== ''
}

function roomStatus(total: number): 'normal' | 'warning' | 'serious' {
  if (total === 0) return 'normal'
  if (total <= 3) return 'warning'
  return 'serious'
}

const ZERO_SUMMARY = {
  totalRoomsWithIssues: 0,
  totalIssues: 0,
  monitorIssues: 0,
  hdmiIssues: 0,
  mouseIssues: 0,
  keyboardIssues: 0,
  computerIssues: 0,
  networkIssues: 0,
  otherIssues: 0,
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER', 'TECHNICIAN')
  if (!auth) return Response.json({ error: 'Không có quyền xem thống kê' }, { status: 403 })

  const rooms = await prisma.room.findMany({
    include: {
      floor: true,
      machines: {
        select: {
          id: true,
          machineNo: true,
          isTeacher: true,
          monitorError: true,
          monitorCableError: true,
          mouseError: true,
          keyboardError: true,
          caseError: true,
          cpuError: true,
          ramError: true,
          diskError: true,
          powerError: true,
          networkError: true,
          powerCableError: true,
          extraNotes: true,
          updatedAt: true,
        },
      },
    },
    orderBy: [{ floor: { name: 'asc' } }, { roomCode: 'asc' }],
  })

  const roomStats = rooms.map(room => {
    let monitorIssues = 0, hdmiIssues = 0, mouseIssues = 0, keyboardIssues = 0
    let computerIssues = 0, networkIssues = 0, otherIssues = 0

    const faultyMachines: {
      machineId: number
      machineNo: number
      isTeacher: boolean
      monitorError: string | null
      hdmiError: string | null
      mouseError: string | null
      keyboardError: string | null
      computerError: string | null
      networkError: string | null
      otherError: string | null
      extraNotes: string | null
      updatedAt: Date
    }[] = []

    for (const m of room.machines) {
      const mon  = hasVal(m.monitorError)
      const hdmi = hasVal(m.monitorCableError)
      const mouse = hasVal(m.mouseError)
      const kbd  = hasVal(m.keyboardError)
      const comp = COMPUTER_FIELDS.some((f: ComputerField) => hasVal(m[f]))
      const net  = hasVal(m.networkError)
      const other = hasVal(m.powerCableError)

      if (mon)   monitorIssues++
      if (hdmi)  hdmiIssues++
      if (mouse) mouseIssues++
      if (kbd)   keyboardIssues++
      if (comp)  computerIssues++
      if (net)   networkIssues++
      if (other) otherIssues++

      if (mon || hdmi || mouse || kbd || comp || net || other) {
        const compParts = [m.caseError, m.cpuError, m.ramError, m.diskError, m.powerError].filter(Boolean)
        faultyMachines.push({
          machineId: m.id,
          machineNo: m.machineNo,
          isTeacher: m.isTeacher,
          monitorError: m.monitorError,
          hdmiError: m.monitorCableError,
          mouseError: m.mouseError,
          keyboardError: m.keyboardError,
          computerError: compParts.length > 0 ? compParts.join('; ') : null,
          networkError: m.networkError,
          otherError: m.powerCableError,
          extraNotes: m.extraNotes,
          updatedAt: m.updatedAt,
        })
      }
    }

    const totalIssues = monitorIssues + hdmiIssues + mouseIssues + keyboardIssues
      + computerIssues + networkIssues + otherIssues

    return {
      roomId: room.id,
      roomName: `Phòng ${room.roomCode}`,
      roomCode: room.roomCode,
      floorName: room.floor.name,
      totalMachines: room.machines.length,
      totalIssues,
      monitorIssues,
      hdmiIssues,
      mouseIssues,
      keyboardIssues,
      computerIssues,
      networkIssues,
      otherIssues,
      status: roomStatus(totalIssues),
      machines: faultyMachines,
    }
  })

  const summary = roomStats.reduce(
    (acc, r) => ({
      totalRoomsWithIssues: acc.totalRoomsWithIssues + (r.totalIssues > 0 ? 1 : 0),
      totalIssues:    acc.totalIssues    + r.totalIssues,
      monitorIssues:  acc.monitorIssues  + r.monitorIssues,
      hdmiIssues:     acc.hdmiIssues     + r.hdmiIssues,
      mouseIssues:    acc.mouseIssues    + r.mouseIssues,
      keyboardIssues: acc.keyboardIssues + r.keyboardIssues,
      computerIssues: acc.computerIssues + r.computerIssues,
      networkIssues:  acc.networkIssues  + r.networkIssues,
      otherIssues:    acc.otherIssues    + r.otherIssues,
    }),
    { ...ZERO_SUMMARY }
  )

  return Response.json({ summary, rooms: roomStats })
}
