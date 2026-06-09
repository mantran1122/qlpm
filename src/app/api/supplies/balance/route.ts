import { prisma } from '@/lib/prisma'
import { SUPPLY_LABELS } from '@/lib/machine-utils'

const SUPPLY_FIELDS = [
  'caseQty', 'cpuQty', 'ramQty', 'diskQty', 'powerQty',
  'monitorQty', 'monitorCableQty', 'powerCableQty',
  'mouseQty', 'networkQty', 'keyboardQty',
] as const

export async function GET() {
  const [intakeLogs, usageLogs] = await Promise.all([
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
  ])

  const result = SUPPLY_FIELDS.map(field => {
    const intake = intakeLogs._sum[field] ?? 0
    const used = usageLogs._sum[field] ?? 0
    return {
      type: field,
      label: SUPPLY_LABELS[field] ?? field,
      intake,
      used,
      balance: intake - used,
    }
  })

  return Response.json(result)
}
