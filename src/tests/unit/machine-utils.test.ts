/**
 * Unit tests — machine-utils
 *
 * Kiểm tra logic xác định trạng thái máy và màu hiển thị.
 * Toàn bộ pure function — không cần mock.
 */

import { describe, it, expect } from 'vitest'
import { getMachineStatus, getMachineColor } from '@/lib/machine-utils'
import type { MachineWithStatus } from '@/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMachine(overrides: Record<string, unknown> = {}): MachineWithStatus {
  return {
    id: 1, machineNo: 1, roomId: 1, isTeacher: false,
    softwareError: null, caseError: null, cpuError: null,
    ramError: null, diskError: null, powerError: null,
    monitorError: null, monitorCableError: null, powerCableError: null,
    mouseError: null, networkError: null, keyboardError: null,
    status: 'Tốt',
    ...overrides,
  } as unknown as MachineWithStatus
}

// ─── getMachineStatus ────────────────────────────────────────────────────────

describe('getMachineStatus', () => {
  it('"Tốt" khi không có lỗi nào', () => {
    expect(getMachineStatus(makeMachine())).toBe('Tốt')
  })

  it('"Tốt" khi tất cả error field là empty string', () => {
    expect(getMachineStatus(makeMachine({
      softwareError: '', cpuError: '', ramError: '',
    }))).toBe('Tốt')
  })

  it('"Tốt" khi tất cả error field là null', () => {
    expect(getMachineStatus(makeMachine({
      softwareError: null, caseError: null, cpuError: null,
    }))).toBe('Tốt')
  })

  it('"Lỗi" khi có softwareError', () => {
    expect(getMachineStatus(makeMachine({ softwareError: 'Lỗi Office' }))).toBe('Lỗi')
  })

  it('"Lỗi" khi có cpuError', () => {
    expect(getMachineStatus(makeMachine({ cpuError: 'CPU cháy' }))).toBe('Lỗi')
  })

  it('"Lỗi" khi có ramError', () => {
    expect(getMachineStatus(makeMachine({ ramError: 'Ram hỏng' }))).toBe('Lỗi')
  })

  it('"Lỗi" khi có diskError', () => {
    expect(getMachineStatus(makeMachine({ diskError: 'Ổ cứng bad sector' }))).toBe('Lỗi')
  })

  it('"Lỗi" khi có monitorError', () => {
    expect(getMachineStatus(makeMachine({ monitorError: 'Màn hình không lên' }))).toBe('Lỗi')
  })

  it('"Lỗi" khi có nhiều lỗi cùng lúc', () => {
    expect(getMachineStatus(makeMachine({
      softwareError: 'Office lỗi',
      cpuError: 'CPU cháy',
    }))).toBe('Lỗi')
  })
})

// ─── getMachineColor ─────────────────────────────────────────────────────────

describe('getMachineColor', () => {
  it('bg-purple-500 cho máy giáo viên dù không có lỗi', () => {
    const m = makeMachine({ isTeacher: true, status: 'Tốt' })
    expect(getMachineColor(m)).toBe('bg-purple-500')
  })

  it('bg-purple-500 cho máy giáo viên dù có lỗi', () => {
    const m = makeMachine({ isTeacher: true, status: 'Lỗi', softwareError: 'Lỗi Office' })
    expect(getMachineColor(m)).toBe('bg-purple-500')
  })

  it('bg-green-500 cho máy tốt không phải giáo viên', () => {
    const m = makeMachine({ isTeacher: false, status: 'Tốt' })
    expect(getMachineColor(m)).toBe('bg-green-500')
  })

  it('bg-orange-500 khi chỉ có phần mềm lỗi', () => {
    const m = makeMachine({ isTeacher: false, status: 'Lỗi', softwareError: 'Lỗi Office' })
    expect(getMachineColor(m)).toBe('bg-orange-500')
  })

  it('bg-red-500 khi chỉ có phần cứng lỗi (CPU)', () => {
    const m = makeMachine({ isTeacher: false, status: 'Lỗi', cpuError: 'CPU hỏng' })
    expect(getMachineColor(m)).toBe('bg-red-500')
  })

  it('bg-red-500 khi chỉ có phần cứng lỗi (Monitor)', () => {
    const m = makeMachine({ isTeacher: false, status: 'Lỗi', monitorError: 'Màn hình vỡ' })
    expect(getMachineColor(m)).toBe('bg-red-500')
  })

  it('bg-yellow-500 khi cả phần mềm lẫn phần cứng đều lỗi', () => {
    const m = makeMachine({
      isTeacher: false, status: 'Lỗi',
      softwareError: 'Lỗi Office',
      cpuError: 'CPU hỏng',
    })
    expect(getMachineColor(m)).toBe('bg-yellow-500')
  })

  it('bg-yellow-500 khi sw+hw lỗi với nhiều loại phần cứng', () => {
    const m = makeMachine({
      isTeacher: false, status: 'Lỗi',
      softwareError: 'Lỗi phần mềm',
      ramError: 'Ram hỏng',
      mouseError: 'Chuột không dùng được',
    })
    expect(getMachineColor(m)).toBe('bg-yellow-500')
  })
})
