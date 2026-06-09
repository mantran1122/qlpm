import { unstable_cache, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'

export const getCachedSettings = unstable_cache(
  async () => {
    const rows = await prisma.systemSetting.findMany({ where: { isSecret: false } })
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value
    return map
  },
  ['system-settings'],
  { tags: ['settings'], revalidate: 300 }
)

export function invalidateSettingsCache() {
  revalidateTag('settings', 'max')
}
