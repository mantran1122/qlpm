# Vận hành Hệ thống — QL Phòng Máy

> Phiên bản 1.0 · Last updated: 08/06/2026

---

## Mục Lục

1. [Cron Jobs](#1-cron-jobs)
2. [Backup & Restore Database](#2-backup--restore-database)
3. [Rotate Encryption Key](#3-rotate-encryption-key)
4. [Monitoring & Logging](#4-monitoring--logging)
5. [Deployment](#5-deployment)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Cron Jobs

### 1.1 Dọn dẹp NotificationDebounce

**Script:** `scripts/clean-debounce.ts`
**Tần suất:** mỗi ngày 1 lần (3:00 AM)
**Lệnh:**
```bash
npx ts-node --project tsconfig.seed.json scripts/clean-debounce.ts
```

### 1.2 Dọn dẹp Audit Log

**Script:** `scripts/clean-audit-logs.ts`
**Tần suất:** mỗi ngày (3:30 AM)
**Lệnh:**
```bash
npx ts-node --project tsconfig.seed.json scripts/clean-audit-logs.ts
```
**Hành vi:** Export CSV vào `backups/audit/` → xóa bản ghi > `audit_retention_days` ngày (mặc định 90).

### 1.3 Backup Database

**Script:** `scripts/backup-db.sh`
**Tần suất:** mỗi ngày (2:00 AM)
**Lệnh:**
```bash
bash scripts/backup-db.sh
```
**Hành vi:** `mysqldump` + gzip → `backups/db/YYYYMMDD_HHMMSS.sql.gz`. Giữ 30 bản gần nhất.

### Cấu hình Cron

#### Linux/macOS (crontab)
```cron
0 2 * * * cd /path/to/phong-may-manager && bash scripts/backup-db.sh
0 3 * * * cd /path/to/phong-may-manager && npx ts-node --project tsconfig.seed.json scripts/clean-debounce.ts
30 3 * * * cd /path/to/phong-may-manager && npx ts-node --project tsconfig.seed.json scripts/clean-audit-logs.ts
```

#### Windows (Task Scheduler)
Tạo 3 task chạy `powershell -Command "cd E:\phantichphongmay\phong-may-manager; npx ts-node --project tsconfig.seed.json scripts/clean-debounce.ts"`

---

## 2. Backup & Restore Database

### 2.1 Backup thủ công
```bash
cd /path/to/phong-may-manager
bash scripts/backup-db.sh
```

### 2.2 Restore
```bash
gunzip < backups/db/YYYYMMDD_HHMMSS.sql.gz | mysql -u root -p phong_may_db
```

### 2.3 Restore drill (kiểm tra định kỳ)
```bash
# 1. Tạo DB staging
mysql -u root -p -e "CREATE DATABASE phong_may_db_restore_test"

# 2. Restore vào staging
gunzip < backups/db/LATEST.sql.gz | mysql -u root -p phong_may_db_restore_test

# 3. Chạy migration để đảm bảo schema khớp
DATABASE_URL="mysql://root:pass@localhost:3306/phong_may_db_restore_test" npx prisma migrate deploy

# 4. Test query
echo "SELECT COUNT(*) FROM users" | mysql -u root -p phong_may_db_restore_test

# 5. Dọn dẹp
mysql -u root -p -e "DROP DATABASE phong_may_db_restore_test"
```

---

## 3. Rotate Encryption Key

Khi cần đổi `ENCRYPTION_KEY` (ví dụ: nghi ngờ lộ key):

### Bước 1: Tạo key mới
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Bước 2: Re-encrypt tất cả secret trong DB
Script `scripts/rotate-encryption-key.ts`:
```ts
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { encrypt, decrypt } from '../src/lib/node/crypto'

const prisma = new PrismaClient()

// Đặt ENCRYPTION_KEY cũ và mới
// Chạy: OLD_KEY=... NEW_KEY=... npx ts-node --project tsconfig.seed.json scripts/rotate-encryption-key.ts

async function main() {
  const settings = await prisma.systemSetting.findMany({ where: { isSecret: true } })
  for (const s of settings) {
    const plaintext = decrypt(s.value) // dùng key cũ
    const newCiphertext = encrypt(plaintext) // dùng key mới
    await prisma.systemSetting.update({
      where: { key: s.key },
      data: { value: newCiphertext },
    })
  }
  console.log(`Đã re-encrypt ${settings.length} secret settings`)
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1) })
```

### Bước 3: Cập nhật `.env`
```
ENCRYPTION_KEY=<key mới>
```

### Bước 4: Restart server
```bash
npm run build && npm run start
```

---

## 4. Monitoring & Logging

### 4.1 Health Check
```bash
curl http://localhost:3000/api/health
# Response: { "ok": true, "db": "ok", "uptime": 12345 }
```

### 4.2 Logs
Dùng Pino logger (`src/lib/node/logger.ts`). Log ghi ra stdout/stderr dạng JSON.
Để xem log đọc được: `npm run dev 2>&1 | npx pino-pretty`

### 4.3 Sentry
- Thêm `SENTRY_DSN` vào `.env`
- Cài `@sentry/nextjs` nếu muốn full error tracking

---

## 5. Deployment

### 5.1 Build
```bash
npm run build   # Next.js production build
```

### 5.2 Start
```bash
npm run start   # Chạy trên port 3000 (mặc định)
```

### 5.3 CI/CD checklist
- [ ] `npm run lint` — ESLint pass
- [ ] `npx tsc --noEmit` — TypeScript typecheck
- [ ] `npm run test` — Vitest 43/43 pass
- [ ] `npm run build` — Next.js build thành công
- [ ] Migration: `npx prisma migrate deploy`
- [ ] Health check: `GET /api/health` → 200

### 5.4 Environment Variables
Xem `.env.example` hoặc checklist đầy đủ ở mục 9 của `KEHOACH_v3.md`.

---

## 6. Troubleshooting

| Vấn đề | Giải pháp |
|---|---|
| Prisma client không có model mới | `npx prisma generate` (tắt dev server trước) |
| Migration fail | Check `prisma/migrations/` đã có migration mới chưa → `npx prisma migrate deploy` |
| Cannot connect to DB | Check `DATABASE_URL` trong `.env`, MySQL service đang chạy |
| JWT liên tục hết hạn | `JWT_TTL_MIN=15` — kiểm tra `X-Token-Refresh-Needed` header |
| CSRF error | Client phải gọi `csrfFetch()` thay vì `fetch()` thường cho mutation |
| Locked account | Admin vào `/settings` → "Tài khoản & Vai trò" → unlock |
| Email không gửi được | Vào `/settings` → "Cấu hình Email" → test lại. Với Gmail cần App Password |
