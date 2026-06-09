/**
 * Integration tests — Notification system
 *
 * Kiểm tra sendNotification helper: debounce, fan-out, broadcast
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mock Prisma ────────────────────────────────────────────────────────────
// Must be inline because vi.mock is hoisted above imports

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notification: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    notificationDebounce: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}))

import { sendNotification, clearDebounce } from '@/lib/node/notification'
import { prisma } from '@/lib/prisma'

const mockNotif = prisma.notification as unknown as {
  createMany: ReturnType<typeof vi.fn>
  findMany: ReturnType<typeof vi.fn>
}
const mockDebounce = prisma.notificationDebounce as unknown as {
  findUnique: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
  deleteMany: ReturnType<typeof vi.fn>
}
const mockUser = prisma.user as unknown as {
  findMany: ReturnType<typeof vi.fn>
}

describe('sendNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('gửi thông báo đến user cụ thể', async () => {
    mockNotif.createMany.mockResolvedValue({ count: 1 })

    const result = await sendNotification({
      userId: 1,
      title: 'Test',
      message: 'Test message',
    })

    expect(result.sent).toBe(1)
    expect(result.skipped).toBeNull()
    expect(mockNotif.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({
          userId: 1,
          title: 'Test',
          message: 'Test message',
          type: 'INFO',
        })],
      })
    )
  })

  it('bỏ qua khi trong thời gian debounce', async () => {
    mockDebounce.findUnique.mockResolvedValue({
      triggerKey: 'test_key',
      lastSentAt: new Date(Date.now() - 1 * 60 * 1000),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    const result = await sendNotification({
      userId: 1,
      title: 'Test',
      message: 'Should be debounced',
      triggerKey: 'test_key',
      cooldownMinutes: 360,
    })

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe('debounced')
    expect(mockNotif.createMany).not.toHaveBeenCalled()
  })

  it('gửi khi hết thời gian debounce', async () => {
    mockDebounce.findUnique.mockResolvedValue({
      triggerKey: 'test_key',
      lastSentAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    mockNotif.createMany.mockResolvedValue({ count: 1 })

    const result = await sendNotification({
      userId: 1,
      title: 'Test',
      message: 'After cooldown',
      triggerKey: 'test_key',
      cooldownMinutes: 360,
    })

    expect(result.sent).toBe(1)
    expect(result.skipped).toBeNull()
    expect(mockNotif.createMany).toHaveBeenCalled()
  })

  it('fan-out đến nhiều user theo role', async () => {
    mockUser.findMany.mockResolvedValue([
      { id: 1 }, { id: 2 }, { id: 3 },
    ])
    mockNotif.createMany.mockResolvedValue({ count: 3 })

    const result = await sendNotification({
      roles: ['ADMIN', 'MANAGER'],
      title: 'Broadcast',
      message: 'To admins and managers',
    })

    expect(result.sent).toBe(3)
    expect(mockUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: { in: ['ADMIN', 'MANAGER'] }, isActive: true },
      })
    )
    expect(mockNotif.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 1 }),
          expect.objectContaining({ userId: 2 }),
          expect.objectContaining({ userId: 3 }),
        ]),
      })
    )
  })

  it('không gửi nếu không có user nào khớp', async () => {
    mockUser.findMany.mockResolvedValue([])

    const result = await sendNotification({
      roles: ['ADMIN'],
      title: 'No recipients',
      message: 'Nobody',
    })

    expect(result.sent).toBe(0)
    expect(mockNotif.createMany).not.toHaveBeenCalled()
  })

  it('broadcastId được tạo cho fan-out nhiều user', async () => {
    mockUser.findMany.mockResolvedValue([
      { id: 10 }, { id: 20 },
    ])
    mockNotif.createMany.mockResolvedValue({ count: 2 })

    const result = await sendNotification({
      roles: ['ADMIN'],
      title: 'Fan-out',
      message: 'Multiple',
    })

    expect(result.broadcastId).toBeDefined()
    expect(result.sent).toBe(2)
  })

  it('upsert NotificationDebounce sau khi gửi', async () => {
    mockDebounce.findUnique.mockResolvedValue(null)
    mockNotif.createMany.mockResolvedValue({ count: 1 })

    await sendNotification({
      userId: 1,
      title: 'With debounce',
      message: 'Test',
      triggerKey: 'new_key',
      cooldownMinutes: 120,
    })

    expect(mockDebounce.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { triggerKey: 'new_key' },
        create: expect.objectContaining({
          triggerKey: 'new_key',
          expiresAt: expect.any(Date),
        }),
      })
    )
  })

  it('không crash khi DB lỗi', async () => {
    mockNotif.createMany.mockRejectedValue(new Error('DB down'))

    const result = await sendNotification({
      userId: 1,
      title: 'Fail safe',
      message: 'Test',
    })

    expect(result.sent).toBe(0)
    expect(result.skipped).toBeNull()
  })
})

describe('clearDebounce', () => {
  it('xóa debounce key', async () => {
    await clearDebounce('some_key')
    expect(mockDebounce.deleteMany).toHaveBeenCalledWith({
      where: { triggerKey: 'some_key' },
    })
  })
})
