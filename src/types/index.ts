export type MachineStatus = 'Tốt' | 'Lỗi'

export interface MachineWithStatus {
  id: number
  roomId: number
  machineNo: number
  isTeacher: boolean
  status: MachineStatus
  softwareError?: string | null
  caseError?: string | null
  cpuError?: string | null
  ramError?: string | null
  diskError?: string | null
  powerError?: string | null
  monitorError?: string | null
  monitorCableError?: string | null
  powerCableError?: string | null
  mouseError?: string | null
  networkError?: string | null
  keyboardError?: string | null
  extraNotes?: string | null
  lastMaintainedAt?: Date | null
  updatedAt?: Date
}

export interface RoomWithStats {
  id: number
  roomCode: string
  floor: { name: string }
  totalMachines: number
  cpuSpec?: string | null
  ramSpec?: string | null
  diskSpec?: string | null
  monitorSpec?: string | null
  notes?: string | null
  errorCount: number
  goodCount: number
}

export interface SupplyBalance {
  type: string
  label: string
  intake: number
  used: number
  balance: number
}
