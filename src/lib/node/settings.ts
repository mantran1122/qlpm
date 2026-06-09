import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from './crypto'
import { recordAudit } from './audit'

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } })
  if (!row) return null
  return row.isSecret ? decrypt(row.value) : row.value
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.systemSetting.findMany()
  const map: Record<string, string> = {}
  for (const r of rows) {
    if (r.isSecret) continue
    map[r.key] = r.value
  }
  return map
}

export async function setSetting(key: string, value: string, isSecret: boolean, userId: number) {
  const stored = isSecret ? encrypt(value) : value
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: stored, isSecret, updatedBy: userId },
    create: { key, value: stored, isSecret, updatedBy: userId },
  })
}
