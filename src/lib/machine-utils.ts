import type { MachineStatus, MachineWithStatus } from '@/types'

const ERROR_FIELDS = [
  'softwareError', 'caseError', 'cpuError', 'ramError', 'diskError',
  'powerError', 'monitorError', 'monitorCableError', 'powerCableError',
  'mouseError', 'networkError', 'keyboardError',
] as const

export function getMachineStatus(machine: Record<string, unknown>): MachineStatus {
  return ERROR_FIELDS.some(f => machine[f] != null && machine[f] !== '') ? 'Lỗi' : 'Tốt'
}

export function getMachineColor(machine: MachineWithStatus): string {
  if (machine.isTeacher) return 'bg-purple-500'
  if (machine.status === 'Tốt') return 'bg-green-500'
  const hasSoftware = !!machine.softwareError
  const hasHardware = [
    machine.caseError, machine.cpuError, machine.ramError, machine.diskError,
    machine.powerError, machine.monitorError, machine.monitorCableError,
    machine.powerCableError, machine.mouseError, machine.networkError, machine.keyboardError,
  ].some(Boolean)
  if (hasSoftware && hasHardware) return 'bg-yellow-500'
  if (hasSoftware) return 'bg-orange-500'
  return 'bg-red-500'
}

export const ERROR_LABELS: Record<string, string> = {
  softwareError: 'Phần mềm',
  caseError: 'Vỏ máy (Case)',
  cpuError: 'CPU',
  ramError: 'RAM',
  diskError: 'Ổ cứng',
  powerError: 'Nguồn điện',
  monitorError: 'Màn hình',
  monitorCableError: 'Dây màn hình',
  powerCableError: 'Dây nguồn',
  mouseError: 'Chuột',
  networkError: 'Mạng',
  keyboardError: 'Bàn phím',
}

export const SUPPLY_LABELS: Record<string, string> = {
  caseQty: 'Vỏ máy (Case)',
  cpuQty: 'CPU',
  ramQty: 'RAM',
  diskQty: 'Ổ cứng',
  powerQty: 'Nguồn điện',
  monitorQty: 'Màn hình',
  monitorCableQty: 'Dây màn hình',
  powerCableQty: 'Dây nguồn',
  mouseQty: 'Chuột',
  networkQty: 'Mạng',
  keyboardQty: 'Bàn phím',
}
