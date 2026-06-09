import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function main() {
  // Lấy retention days từ system_settings (mặc định 90)
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'audit_retention_days' } })
  const retentionDays = setting?.value ? parseInt(setting.value, 10) : 90

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

  // Export logs cũ ra CSV trước khi xóa
  const oldLogs = await prisma.auditLog.findMany({
    where: { createdAt: { lt: cutoff } },
    orderBy: { createdAt: 'asc' },
  })

  if (oldLogs.length > 0) {
    const backupDir = path.join(process.cwd(), 'backups', 'audit')
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

    const dateStr = cutoff.toISOString().slice(0, 10)
    const csvPath = path.join(backupDir, `${dateStr}.csv`)

    const header = 'ID,UserId,Action,Target,Detail,IP,UserAgent,CreatedAt\n'
    const rows = oldLogs.map(l => {
      const detail = l.detail ? JSON.stringify(l.detail).replace(/"/g, '""') : ''
      return `${l.id},${l.userId ?? ''},"${l.action}","${l.target ?? ''}","${detail}","${l.ip ?? ''}","${l.ua ?? ''}","${l.createdAt.toISOString()}"`
    }).join('\n')
    fs.writeFileSync(csvPath, '\uFEFF' + header + rows, 'utf8')

    console.log(`Đã export ${oldLogs.length} bản ghi vào ${csvPath}`)

    const result = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    console.log(`Đã xóa ${result.count} bản ghi cũ hơn ${retentionDays} ngày`)
  } else {
    console.log('Không có bản ghi nào cần xóa')
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1) })
