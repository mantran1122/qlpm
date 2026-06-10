import { prisma } from '@/lib/prisma'
import { sendNotification } from '@/lib/node/notification'
import type { NextRequest } from 'next/server'

// Endpoint nội bộ cho cron OS gọi hàng ngày.
// Không dùng JWT — xác thực bằng X-Internal-Key header.
export async function POST(req: NextRequest) {
  const key = req.headers.get('x-internal-key')
  if (!key || key !== process.env.INTERNAL_CRON_KEY) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const setting = await prisma.systemSetting.findUnique({ where: { key: 'recall_overdue_days' } })
  const thresholdDays = setting ? Math.max(1, Number(setting.value)) : 3
  const thresholdMs   = thresholdDays * 24 * 60 * 60 * 1000
  const now           = new Date()
  const cutoff        = new Date(now.getTime() - thresholdMs)
  const todayKey      = now.toISOString().slice(0, 10) // YYYY-MM-DD

  // Lấy tất cả RECALL_FOR_REPAIR chưa xong và đã quá hạn
  const overdueRecords = await prisma.recallRecord.findMany({
    where: {
      recallType:      'RECALL_FOR_REPAIR',
      repairFinishedAt: null,
      recalledAt:      { lte: cutoff },
    },
    select: {
      id:        true,
      machineNo: true,
      recalledAt: true,
      room:      { select: { roomCode: true } },
    },
  })

  let alertsCreated = 0

  for (const record of overdueRecords) {
    const debounceKey = `recall_alert_${record.id}_${todayKey}`

    // Kiểm tra đã gửi hôm nay chưa (dùng NotificationDebounce)
    const existing = await prisma.notificationDebounce.findUnique({ where: { triggerKey: debounceKey } })
    if (existing) continue

    const daysOverdue = Math.floor((now.getTime() - record.recalledAt.getTime()) / (24 * 60 * 60 * 1000))

    await prisma.recallAlert.create({
      data: { recallRecordId: record.id, daysOverdue },
    })

    await sendNotification({
      roles:          ['ADMIN', 'MANAGER'],
      title:          `Máy thu hồi quá hạn — ${record.room.roomCode} Máy ${record.machineNo}`,
      message:        `Bản ghi thu hồi #${record.id} đã quá ${daysOverdue} ngày chưa được sửa chữa.`,
      type:           'WARNING',
      link:           `/recall/${record.id}`,
      triggerKey:     debounceKey,
      cooldownMinutes: 23 * 60, // ~23h để alert lại mỗi ngày
    })

    alertsCreated++
  }

  return Response.json({
    checked:      overdueRecords.length,
    alertsCreated,
    thresholdDays,
    runAt:        now.toISOString(),
  })
}
