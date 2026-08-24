import { prisma } from '@/lib/prisma'
import { requireRoleStrict, requireCsrf } from '@/lib/node/auth'
import { recordAudit } from '@/lib/node/audit'
import type { NextRequest } from 'next/server'

const BUILTIN_SUM = {
  caseQty: true, cpuQty: true, ramQty: true, diskQty: true, powerQty: true,
  monitorQty: true, monitorCableQty: true, powerCableQty: true,
  mouseQty: true, networkQty: true, keyboardQty: true,
} as const

async function availableBalance(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], item: { id: number; code: string; isBuiltin: boolean }) {
  const adjustment = await tx.supplyAdjustment.aggregate({ where: { supplyItemId: item.id }, _sum: { delta: true } })
  const balance = adjustment._sum.delta ?? 0
  if (!item.isBuiltin) return balance
  if (!(item.code in BUILTIN_SUM)) throw new Error('INVALID_BUILTIN_SUPPLY')
  const field = item.code as keyof typeof BUILTIN_SUM
  const [intake, used] = await Promise.all([
    tx.maintenanceLog.aggregate({ where: { isSupplyIntake: true }, _sum: BUILTIN_SUM }),
    tx.maintenanceLog.aggregate({ where: { isSupplyIntake: false }, _sum: BUILTIN_SUM }),
  ])
  return balance + (intake._sum[field] ?? 0) - (used._sum[field] ?? 0)
}

export async function POST(req: NextRequest) {
  const auth = await requireRoleStrict(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Chi ADMIN duoc dieu chinh ton kho' }, { status: 403 })
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF invalid' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return Response.json({ error: 'Du lieu khong hop le' }, { status: 400 }) }
  const supplyItemId = Number(body.supplyItemId)
  const delta = Number(body.delta)
  const reason = String(body.reason ?? '').trim()
  const coordinatorName = String(body.coordinatorName ?? '').trim()
  const note = String(body.note ?? '').trim() || null

  if (!Number.isInteger(supplyItemId) || !Number.isInteger(delta) || delta === 0) return Response.json({ error: 'Vat tu va so luong nguyen khac 0 la bat buoc' }, { status: 400 })
  if (!reason || !coordinatorName) return Response.json({ error: 'Phai nhap ly do va nguoi doi chieu' }, { status: 400 })

  try {
    const adjustment = await prisma.$transaction(async tx => {
      const item = await tx.supplyItem.findUnique({ where: { id: supplyItemId } })
      if (!item || !item.isActive) throw new Error('SUPPLY_NOT_FOUND')
      const balance = await availableBalance(tx, item)
      if (delta < 0 && Math.abs(delta) > balance) throw new Error(`INSUFFICIENT_STOCK:${balance}`)
      return tx.supplyAdjustment.create({
        data: { supplyItemId, delta, movementType: 'ADJUSTMENT', reason, coordinatorName, note, createdById: auth.payload.userId },
        include: { supplyItem: { select: { label: true, code: true } }, createdBy: { select: { username: true, profile: { select: { displayName: true } } } } },
      })
    })
    recordAudit({ userId: auth.payload.userId, action: 'supply.adjusted', target: `supply:${supplyItemId}`, detail: { delta, reason, coordinatorName } }).catch(() => {})
    return Response.json(adjustment, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'SUPPLY_NOT_FOUND') return Response.json({ error: 'Vat tu khong ton tai hoac da ngung dung' }, { status: 404 })
    if (message.startsWith('INSUFFICIENT_STOCK:')) return Response.json({ error: `Khong du ton kho. Ton kha dung: ${message.split(':')[1]}` }, { status: 409 })
    throw error
  }
}
