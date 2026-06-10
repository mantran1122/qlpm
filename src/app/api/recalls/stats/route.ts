import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/node/auth'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'ADMIN', 'MANAGER')
  if (!auth) return Response.json({ error: 'Không có quyền' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const from         = searchParams.get('from')
  const to           = searchParams.get('to')
  const technicianId = searchParams.get('technicianId')

  if (!from || !to) {
    return Response.json({ error: 'Cần cung cấp from và to' }, { status: 400 })
  }

  const fromDate = new Date(from)
  const toDate   = new Date(to)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return Response.json({ error: 'from/to không hợp lệ' }, { status: 400 })
  }
  const diffDays = (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)
  if (diffDays > 365) {
    return Response.json({ error: 'Khoảng thời gian tối đa 365 ngày' }, { status: 400 })
  }

  // Lấy danh sách KTV cần thống kê
  const techWhere = technicianId
    ? { id: Number(technicianId) }
    : { isActive: true }

  const technicians = await prisma.technician.findMany({
    where:  techWhere,
    select: { id: true, name: true },
  })

  const dateRange = { gte: fromDate, lte: toDate }

  const stats = await Promise.all(
    technicians.map(async tech => {
      const [
        recallsByType,
        repairsCompleted,
        repairsInProgress,
        repairsNotStarted,
        finishedRepairs,
        responseTimes,
      ] = await Promise.all([
        // Số lần thu hồi phân theo loại
        prisma.recallRecord.groupBy({
          by: ['recallType'],
          where: { recalledByTechnicianId: tech.id, recalledAt: dateRange },
          _count: { id: true },
        }),
        // Số lần sửa hoàn thành
        prisma.recallRecord.count({
          where: { repairedByTechnicianId: tech.id, repairFinishedAt: { not: null, ...{ gte: fromDate, lte: toDate } } },
        }),
        // Đang sửa (started nhưng chưa xong)
        prisma.recallRecord.count({
          where: { repairedByTechnicianId: tech.id, repairStartedAt: { not: null }, repairFinishedAt: null },
        }),
        // Được gán chưa bắt đầu
        prisma.recallRecord.count({
          where: { repairedByTechnicianId: tech.id, repairStartedAt: null, recalledAt: dateRange },
        }),
        // Bản ghi đã xong để tính thời gian trung bình
        prisma.recallRecord.findMany({
          where: {
            repairedByTechnicianId: tech.id,
            recallType:             'RECALL_FOR_REPAIR',
            repairStartedAt:        { not: null },
            repairFinishedAt:       { not: null, gte: fromDate, lte: toDate },
          },
          select: { repairStartedAt: true, repairFinishedAt: true },
        }),
        // Bản ghi để tính thời gian phản hồi (recalledAt → repairStartedAt)
        prisma.recallRecord.findMany({
          where: {
            repairedByTechnicianId: tech.id,
            recallType:             'RECALL_FOR_REPAIR',
            repairStartedAt:        { not: null },
            recalledAt:             dateRange,
          },
          select: { recalledAt: true, repairStartedAt: true },
        }),
      ])

      const byType: Record<string, number> = {
        RECALL_FOR_REPAIR: 0,
        RECALL_STILL_USABLE: 0,
        RETURN_AFTER_REPAIR: 0,
      }
      let totalRecalls = 0
      for (const r of recallsByType) {
        byType[r.recallType] = r._count.id
        totalRecalls += r._count.id
      }

      const repairMinutes = finishedRepairs
        .filter(r => r.repairStartedAt && r.repairFinishedAt)
        .map(r => Math.round((r.repairFinishedAt!.getTime() - r.repairStartedAt!.getTime()) / 60000))

      const responseMinutes = responseTimes
        .filter(r => r.repairStartedAt)
        .map(r => Math.round((r.repairStartedAt!.getTime() - r.recalledAt.getTime()) / 60000))

      const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null
      const min = (arr: number[]) => arr.length ? Math.min(...arr) : null
      const max = (arr: number[]) => arr.length ? Math.max(...arr) : null

      return {
        technicianId:      tech.id,
        technicianName:    tech.name,
        period:            { from, to },
        totalRecalls,
        recallsByType:     byType,
        totalRepairsCompleted: repairsCompleted,
        repairsInProgress,
        repairsNotStarted,
        avgRepairMinutes:    avg(repairMinutes),
        minRepairMinutes:    min(repairMinutes),
        maxRepairMinutes:    max(repairMinutes),
        avgResponseMinutes:  avg(responseMinutes),
      }
    })
  )

  return Response.json({ data: stats, period: { from, to } })
}
