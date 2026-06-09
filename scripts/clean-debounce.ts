import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const result = await prisma.notificationDebounce.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
  console.log(`Đã xóa ${result.count} bản ghi NotificationDebounce hết hạn`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1) })
