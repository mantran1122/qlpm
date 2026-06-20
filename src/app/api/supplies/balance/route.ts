import { prisma } from '@/lib/prisma'

const BUILTIN_FIELDS = [
  'caseQty', 'cpuQty', 'ramQty', 'diskQty', 'powerQty',
  'monitorQty', 'monitorCableQty', 'powerCableQty',
  'mouseQty', 'networkQty', 'keyboardQty',
] as const

export async function GET() {
  const [intakeLogs, usageLogs, items, adjustments] = await Promise.all([
    prisma.maintenanceLog.aggregate({
      where: { isSupplyIntake: true },
      _sum: {
        caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true,
        monitorQty: true, monitorCableQty: true, powerCableQty: true,
        mouseQty: true, networkQty: true, keyboardQty: true,
      },
    }),
    prisma.maintenanceLog.aggregate({
      where: { isSupplyIntake: false },
      _sum: {
        caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true,
        monitorQty: true, monitorCableQty: true, powerCableQty: true,
        mouseQty: true, networkQty: true, keyboardQty: true,
      },
    }),
    prisma.supplyItem.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    }),
    prisma.supplyAdjustment.groupBy({
      by: ['supplyItemId'],
      _sum: { delta: true },
    }),
  ])

  const adjMap = new Map(adjustments.map(a => [a.supplyItemId, a._sum.delta ?? 0]))

  const result = items.map(item => {
    const adj = adjMap.get(item.id) ?? 0
    if (item.isBuiltin) {
      const field = item.code as (typeof BUILTIN_FIELDS)[number]
      const logIntake = intakeLogs._sum[field] ?? 0
      const logUsed = usageLogs._sum[field] ?? 0
      // adj can be +/- from inline adjustments; treat as direct offset to balance
      return {
        id: item.id,
        type: item.code,
        label: item.label,
        icon: item.icon ?? 'box',
        isBuiltin: true,
        intake: logIntake,
        used: logUsed,
        adjustment: adj,
        balance: logIntake - logUsed + adj,
      }
    } else {
      // Custom items: balance is purely sum of adjustments
      const balance = adj
      return {
        id: item.id,
        type: item.code,
        label: item.label,
        icon: item.icon ?? 'box',
        isBuiltin: false,
        intake: Math.max(0, adj),
        used: Math.max(0, -adj),
        adjustment: adj,
        balance,
      }
    }
  })

  return Response.json(result)
}
