import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const username = process.argv[2] || 'admin'
  const email = process.argv[3] || 'admin@phongmay.local'
  const password = process.argv[4] || 'Admin@123456'

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  })

  if (existing) {
    console.log(`⚠️  Tài khoản đã tồn tại: ${existing.email}`)
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: { username, email, passwordHash, role: 'ADMIN' },
  })

  console.log(`✅ Tạo admin thành công:`)
  console.log(`   Username : ${user.username}`)
  console.log(`   Email    : ${user.email}`)
  console.log(`   Password : ${password}`)
  console.log(`   Role     : ${user.role}`)
  console.log(`\n⚠️  Hãy đổi mật khẩu sau khi đăng nhập lần đầu!`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
