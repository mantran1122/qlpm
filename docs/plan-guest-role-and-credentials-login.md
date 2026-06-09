# Kế hoạch: Thêm Vai Trò Khách + Đăng nhập Tên đăng nhập / Mật khẩu

## Tổng quan

Hai tính năng độc lập, thực hiện theo 2 PR riêng:

- **PR 1 — GUEST role:** ADMIN tạo tài khoản khách thủ công với email + mật khẩu tạm
- **PR 2 — Username login:** form đăng nhập tài khoản trên trang login

**Hướng thiết kế đã chốt:**
- GUEST **không** tự đăng ký được — Google OAuth giữ nguyên chỉ cho `@nctu.edu.vn`
- ADMIN tạo tài khoản GUEST thủ công trong Settings → Users; giao credentials qua email/Zalo/giấy
- GUEST đăng nhập bằng form username + password (PR 2)
- Không thể đổi role từ/sang GUEST — tránh trạng thái không hợp lệ

**Scope cho PR sau (không làm lúc này):**
- `mustChangePassword` flag — ép GUEST đổi pass lần đầu đăng nhập

---

## PR 1 — Vai Trò GUEST ✅ HOÀN THÀNH

### 1.1 — Prisma: thêm enum value

**File:** `prisma/schema.prisma`

```diff
enum UserRole {
  ADMIN
  MANAGER
  TECHNICIAN
+ GUEST
}
```

- **Máy dev:** `npx prisma migrate dev --name add-guest-role`
- **Máy chủ production:** `npx prisma migrate deploy` — KHÔNG dùng `migrate dev` trên prod
- Sau migration: `npx prisma generate`

> Không cần backfill — `passwordHash: ''` của OAuth user cũ không ảnh hưởng gì. GUEST sẽ có bcrypt hash thật.

---

### 1.2 — Kiểu TypeScript

**File:** `src/lib/edge/jwt.ts` — dòng 3

```diff
- export type UserRole = 'ADMIN' | 'MANAGER' | 'TECHNICIAN'
+ export type UserRole = 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'GUEST'
```

---

### 1.3 — API tạo user: nới validation cho GUEST

**File:** `src/app/api/users/route.ts`

**Thay đổi body type:**
```ts
let body: { email?: string; role?: string; displayName?: string; password?: string }
```

**Thêm GUEST vào danh sách role hợp lệ:**
```diff
- if (!['ADMIN', 'MANAGER', 'TECHNICIAN'].includes(role)) {
+ if (!['ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST'].includes(role)) {
```

**Nới validation domain — chỉ check với non-GUEST:**
```ts
if (role !== 'GUEST') {
  const domain = normalizedEmail.split('@')[1]
  if (domain !== ALLOWED_DOMAIN) {
    return Response.json({ error: `Chỉ chấp nhận email @${ALLOWED_DOMAIN}` }, { status: 422 })
  }
}
```

**Hash password cho GUEST (bắt buộc, tối thiểu 10 ký tự):**
```ts
import bcrypt from 'bcryptjs'

let passwordHash = ''
if (role === 'GUEST') {
  if (!body.password?.trim()) {
    return Response.json({ error: 'Mật khẩu là bắt buộc cho tài khoản khách' }, { status: 400 })
  }
  if (body.password.length < 10) {
    return Response.json({ error: 'Mật khẩu tối thiểu 10 ký tự' }, { status: 400 })
  }
  passwordHash = await bcrypt.hash(body.password, 12)
}
```

> Tối thiểu 10 ký tự (không phải 8) vì ADMIN tạo password cho khách — password mạnh ngay từ đầu giảm rủi ro nếu khách không đổi.

**Username cho GUEST = full email** (tránh collision với `john@nctu.edu.vn`):
```ts
const username = role === 'GUEST'
  ? normalizedEmail              // full email: john@gmail.com
  : normalizedEmail.split('@')[0]
```

---

### 1.4 — API cập nhật user: block đổi role từ/sang GUEST

**File:** `src/app/api/users/[id]/route.ts`

Thêm hai thay đổi:

**1 — Thêm GUEST vào danh sách role hợp lệ:**
```diff
- if (!['ADMIN', 'MANAGER', 'TECHNICIAN'].includes(body.role)) {
+ if (!['ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST'].includes(body.role)) {
```

**2 — Block đổi role qua lại giữa GUEST và non-GUEST:**
```ts
// Thêm ngay sau khi load `target`
if (body.role !== undefined) {
  const changingToGuest = body.role === 'GUEST'
  const currentlyGuest = target.role === 'GUEST'
  if (changingToGuest !== currentlyGuest) {
    return Response.json(
      { error: 'Không thể đổi role giữa Khách và các role khác. Hãy xóa tài khoản và tạo lại.' },
      { status: 422 }
    )
  }
}
```

**Tại sao cần block này:**
- `TECHNICIAN → GUEST`: user OAuth cũ có `passwordHash: ''` → không đăng nhập được bằng form (pass rỗng), cũng không dùng Google OAuth nữa → bị khóa khỏi hệ thống
- `GUEST → TECHNICIAN`: email ngoài `@nctu.edu.vn` trở thành TECHNICIAN → vi phạm chính sách domain

---

### 1.5 — API danh sách user: include GUEST

**File:** `src/app/api/users/route.ts` — dòng 17

```diff
- if (roleFilter && ['ADMIN', 'MANAGER', 'TECHNICIAN'].includes(roleFilter)) {
+ if (roleFilter && ['ADMIN', 'MANAGER', 'TECHNICIAN', 'GUEST'].includes(roleFilter)) {
```

Mặc định (không có filter) trả tất cả roles — GUEST xuất hiện trong danh sách khi ADMIN load trang Users.

---

### 1.6 — Shell: navigation và nhãn vai trò

**File:** `src/components/app/shell.tsx`

**NAV array** — thêm `'GUEST'` vào roles:

| Mục nav | Hiện tại | Sau khi sửa |
|---------|----------|-------------|
| `dashboard-ktv` | `['TECHNICIAN']` | `['TECHNICIAN', 'GUEST']` |
| `rooms` | `['ADMIN','MANAGER','TECHNICIAN']` | thêm `'GUEST'` |
| `maintenance-history` | `['TECHNICIAN']` | `['TECHNICIAN', 'GUEST']` |
| `software` | `['ADMIN','MANAGER','TECHNICIAN']` | thêm `'GUEST'` |

**ROLE_LABELS** — tách ra ngoài component, TypeScript báo lỗi nếu thêm role mới mà quên cập nhật:
```ts
const ROLE_LABELS: Record<import('@/lib/edge/jwt').UserRole, string> = {
  ADMIN: 'Quản trị viên',
  MANAGER: 'Quản lý',
  TECHNICIAN: 'Kỹ thuật viên',
  GUEST: 'Khách',
}
const roleLabel = user?.role ? ROLE_LABELS[user.role] : 'Khách'
```

---

### 1.7 — API GET routes: thêm GUEST

Chỉ thêm `'GUEST'` vào `requireRole` thuộc HTTP **GET**. Không động vào POST/PUT/DELETE.

| File | Dòng | Method | Thêm GUEST? | Lý do |
|------|------|--------|-------------|-------|
| `api/rooms/route.ts` | 7 | GET | ✅ | |
| `api/rooms/[roomCode]/route.ts` | 11 | GET | ✅ | |
| `api/machines/route.ts` | 7 | GET | ✅ | |
| `api/machines/[id]/route.ts` | 25 | GET | ✅ | |
| `api/maintenance/route.ts` | 8 | GET | ✅ | |
| `api/maintenance/[id]/route.ts` | 8 | GET | ✅ | |
| `api/dashboard/ktv/route.ts` | 6 | GET | ✅ | |
| `api/technicians/route.ts` | 7 | GET | ✅ | |
| `api/technicians/[id]/route.ts` | 7 | GET | ✅ | |
| `api/notifications/route.ts` | 9 | GET | ✅ | |
| `api/notifications/[id]/route.ts` | 11 | GET | ✅ | |
| `api/notifications/unread-count/route.ts` | 6 | GET | ✅ | |
| `api/notifications/read-all/route.ts` | 8 | POST | ✅ | GUEST cần mark-read notification của chính họ |
| `api/notifications/[id]/read/route.ts` | 11 | POST | ✅ | GUEST cần mark-read notification của chính họ |
| `api/auth/profile/route.ts` | 6 | GET | ✅ | |
| `api/auth/profile/route.ts` | 36 | PATCH | ✅ | GUEST cần cập nhật profile của mình |
| `api/auth/change-password/route.ts` | 12 | POST | ✅ | GUEST có bcrypt hash thật — được đổi |
| `api/settings/route.ts` | 8 | GET | ✅ | chỉ đọc |
| `api/statistics/summary/route.ts` | 18 | GET | ❌ | GUEST không thấy trang Stats |
| `api/users/route.ts` | 10 | GET | ❌ | admin/manager only |
| `api/audit-logs/route.ts` | 6 | GET | ❌ | admin only |
| `api/machines/batch/route.ts` | 29 | POST | ❌ | write |
| `api/machines/batch-restore/route.ts` | 29 | POST | ❌ | write |

---

### 1.8 — Settings > Users UI: hỗ trợ GUEST

**File:** `src/app/(main)/settings/tabs/users-tab.tsx`

**Thay đổi 1 — `ApiUser` interface:**
```diff
- role: 'ADMIN' | 'MANAGER' | 'TECHNICIAN'
+ role: 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'GUEST'
```

**Thay đổi 2 — `ROLE_LABEL` và `ROLE_COLOR`:**
```diff
+ GUEST: 'Khách',
// màu GUEST:
+ GUEST: '#8b5cf6',  // tím
```

**Thay đổi 3 — `AddUserDialog`:**

Initial state thêm `password` và reset về `''` khi đổi role:
```ts
const [form, setForm] = useState({ email: '', role: 'TECHNICIAN', displayName: '', password: '' })

// Khi đổi role, reset password để tránh gửi thừa
const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
  setForm(p => ({ ...p, role: e.target.value, password: '' }))
}
```

Thêm option và hiện password field khi chọn GUEST:
```tsx
<option value="GUEST">Khách</option>

{form.role === 'GUEST' && (
  <div>
    <label>Mật khẩu tạm *</label>
    <input type="password" value={form.password} onChange={set('password')}
      placeholder="Tối thiểu 10 ký tự" />
    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
      Giao mật khẩu này cho khách qua kênh bảo mật.
    </div>
  </div>
)}
```

**Thay đổi 4 — `EditUserDialog`:**

Không cho đổi role từ/sang GUEST — select role bị disable khi user là GUEST hoặc khi đang cố đổi sang GUEST:

```tsx
// Select role: disable nếu user hiện tại là GUEST
<select
  value={role}
  onChange={e => setRole(e.target.value)}
  disabled={user.role === 'GUEST'}
>
  <option value="TECHNICIAN">Kỹ thuật viên</option>
  <option value="MANAGER">Quản lý</option>
  <option value="ADMIN">Quản trị viên</option>
  {/* Không có option GUEST — ADMIN tạo mới thay vì đổi sang GUEST */}
</select>

{user.role === 'GUEST' && (
  <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
    Tài khoản Khách không thể đổi role. Xóa và tạo lại nếu cần.
  </div>
)}
```

> Backend cũng block (mục 1.4) — UI chỉ là UX convenience, không phải bảo mật duy nhất.

---

### Checklist kiểm tra thủ công PR 1

- [ ] `isActive` check trong login route: đã xác nhận tồn tại tại dòng 58 — disable user → login trả 403 ngay
- [ ] ADMIN tạo tài khoản GUEST với email ngoài `@nctu.edu.vn` → thành công
- [ ] Form hiện password field khi chọn role Khách; ẩn khi chọn role khác
- [ ] Password GUEST < 10 ký tự → báo lỗi
- [ ] GUEST xuất hiện trong danh sách Users với badge màu tím "Khách"
- [ ] EditUserDialog với GUEST: select role disabled, hiển thị thông báo
- [ ] Thử PATCH `/api/users/[guestId]` với `{ role: 'TECHNICIAN' }` → 422
- [ ] Thử PATCH `/api/users/[technicianId]` với `{ role: 'GUEST' }` → 422
- [ ] Google OAuth với email ngoài domain vẫn bị từ chối (hành vi cũ giữ nguyên)
- [ ] GUEST đăng nhập bằng form (PR 2) → thấy menu: Phòng Máy, Lịch Sử Bảo Trì, Phần Mềm
- [ ] GUEST gọi POST /api/machines → 403
- [ ] GUEST gọi PUT /api/rooms/[code] → 403
- [ ] GUEST gọi DELETE bất kỳ → 403
- [ ] GUEST truy cập `/stats` → 403 từ API
- [ ] GUEST đổi mật khẩu của mình → thành công
- [ ] ADMIN vô hiệu hóa GUEST → login tiếp theo trả 403 ngay (isActive check); session cũ còn đến hết JWT TTL 15 phút — chấp nhận được

---

## PR 2 — Form Đăng Nhập Tên Đăng Nhập / Mật Khẩu ✅ HOÀN THÀNH

### 2.1 — API Login: hỗ trợ username + backward compat

**File:** `src/app/api/auth/login/route.ts`

Chấp nhận cả `identifier` lẫn `email` trong body:

```ts
let body: { identifier?: string; email?: string; password?: string }
const { identifier, email, password } = body
const input = (identifier ?? email ?? '').trim().toLowerCase()

if (!input || !password) {
  return Response.json({ error: 'Tên đăng nhập và mật khẩu là bắt buộc' }, { status: 400 })
}

const user = await prisma.user.findFirst({
  where: input.includes('@') ? { email: input } : { username: input },
  select: { ... },
})
```

**Message thống nhất — không leak thông tin tài khoản:**
- Sai password thông thường → `"Email hoặc mật khẩu không đúng"`
- OAuth user thử login (`passwordHash: ''`) → `bcrypt.compare(pass, '')` = `false` → cùng message

> Rate limit: đã có 5/phút/IP và 20/giờ/IP tại dòng 15–26.

---

### 2.2 — Trang Login: tab form + DISABLE flag

**File:** `src/app/login/page.tsx`

**Tab switcher:**
- Tab **"Google"** — nút Google hiện tại
- Tab **"Tài khoản"** — form username + password

**Flag ẩn tab Google cho intranet:**
```ts
const disableGoogle = process.env.NEXT_PUBLIC_DISABLE_GOOGLE_OAUTH === 'true'
// Ẩn tab Google khi flag bật
```

**Xử lý lỗi:**

| Status | Hiển thị |
|--------|----------|
| 401 | message từ server (còn N lần / sai pass) |
| 429 | message từ server (khóa / rate limit) |
| 403 | "Tài khoản đã bị vô hiệu hóa" |
| Network | "Không thể kết nối. Vui lòng thử lại." |

---

### Checklist kiểm tra thủ công PR 2

- [ ] Đăng nhập đúng username + password → vào được
- [ ] Đăng nhập đúng email + password → vào được
- [ ] Client cũ gửi `{ email, password }` → vẫn hoạt động (backward compat)
- [ ] GUEST tạo từ PR 1 đăng nhập bằng tab "Tài khoản" → vào được
- [ ] Sai password → đếm ngược còn N lần hiển thị đúng
- [ ] Sai 5 lần → khóa, message rõ ràng
- [ ] OAuth user thử login form → "Email hoặc mật khẩu không đúng"
- [ ] Tab Google vẫn hoạt động sau khi thêm tab form
- [ ] Rate limit → 429 hiển thị đúng

---

## Phần 3 — Host Nội Bộ (Local Network)

### Rõ ràng về ai dùng được gì trên intranet

| Đối tượng | Ngoài mạng (internet) | Trong mạng nội bộ |
|-----------|----------------------|-------------------|
| Staff `@nctu.edu.vn` | Google OAuth ✅ | ❌ Google không chạy được qua HTTP/IP — chỉ dùng được nếu đã có password form |
| GUEST | Form login ✅ | Form login ✅ |

**Kết luận thực tế:** Intranet phù hợp nhất cho GUEST xem demo. Staff `@nctu.edu.vn` không có password form nên không dùng được intranet — họ dùng Google OAuth từ bên ngoài. Nếu cần staff dùng intranet, phải thêm tính năng "Đặt mật khẩu" cho OAuth user — để PR sau.

---

### 3.1 — Yêu cầu máy chủ

- Node.js ≥ 18
- Kết nối internet (TiDB Cloud database là remote)
- IP tĩnh trong mạng nội bộ

---

### 3.2 — Cấu hình `.env` cho intranet

```env
NODE_ENV=production
NEXT_PUBLIC_DISABLE_GOOGLE_OAUTH=true
# DATABASE_URL, NEXTAUTH_SECRET, ENCRYPTION_KEY, SMTP — giữ nguyên
```

> **Quan trọng:** `NEXT_PUBLIC_*` được bake vào bundle lúc `npm run build`. Đặt biến này **trước** khi build. Nếu đổi giá trị sau khi đã build, phải chạy lại `npm run build` mới có hiệu lực.

---

### 3.3 — Build và chạy

```bash
npm install
npx prisma migrate deploy
npm run build
npm run start -- -p 3000
```

---

### 3.4 — Mở firewall (Windows)

```powershell
New-NetFirewallRule -DisplayName "Next.js 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

---

### 3.5 — Windows Service với NSSM

NSSM không gọi được `npm.cmd`. Trỏ trực tiếp đến `node.exe`:

```powershell
where.exe node   # xác định đường dẫn, ví dụ: C:\Program Files\nodejs\node.exe

C:\tools\nssm\nssm.exe install PhongMay "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next start -p 3000"
C:\tools\nssm\nssm.exe set PhongMay AppDirectory "C:\path\to\phong-may-manager"
C:\tools\nssm\nssm.exe set PhongMay AppEnvironmentExtra "NODE_ENV=production"
C:\tools\nssm\nssm.exe start PhongMay
```

---

### 3.6 — Sơ đồ mạng

```
[Máy GUEST — trình duyệt]
         |
    LAN / Wi-Fi
         |
[Máy chủ nội bộ — IP tĩnh 192.168.x.x:3000]
    Next.js (NSSM service)
         |
    Internet
         |
[TiDB Cloud (MySQL-compatible)]
```

---

### 3.7 — Checklist triển khai

- [ ] Node.js ≥ 18 đã cài
- [ ] IP tĩnh đã đặt cho máy chủ
- [ ] `.env` đúng (`DATABASE_URL`, `JWT secret`, `SMTP`, `NEXT_PUBLIC_DISABLE_GOOGLE_OAUTH=true`)
- [ ] **`NEXT_PUBLIC_DISABLE_GOOGLE_OAUTH=true` đã đặt TRƯỚC khi build**
- [ ] `npx prisma migrate deploy` thành công
- [ ] `npm run build` không lỗi
- [ ] Firewall port 3000 đã mở (Private profile)
- [ ] NSSM service `status = RUNNING`
- [ ] Trang login chỉ hiện tab "Tài khoản" (không có tab Google)
- [ ] GUEST đăng nhập username + password thành công
- [ ] Restart máy chủ → service tự khởi động lại

---

## Tóm tắt thứ tự thực hiện

### PR 1 — GUEST role ✅
```
1.  prisma/schema.prisma                        — thêm GUEST enum ✅
2.  ALTER TABLE users MODIFY COLUMN role ...    — áp dụng trực tiếp lên DB local ✅
3.  npx prisma generate                         ✅
4.  src/lib/edge/jwt.ts                         — thêm 'GUEST' vào UserRole ✅
5.  src/app/api/users/route.ts                  — nới validation GUEST, hash password, username = full email ✅
6.  src/app/api/users/[id]/route.ts             — thêm GUEST vào role hợp lệ + block GUEST↔non-GUEST ✅
7.  src/app/api/**/route.ts                     — thêm GUEST vào GET (theo bảng 1.7) ✅
8.  src/components/app/shell.tsx                — nav + ROLE_LABELS ✅
9.  src/app/(main)/settings/tabs/users-tab.tsx  — GUEST option, password field, disabled role select ✅
```

### PR 2 — Username login ✅
```
10. src/app/api/auth/login/route.ts  — identifier field + username lookup ✅
11. src/app/login/page.tsx           — tab form + DISABLE_GOOGLE_OAUTH flag ✅
```

### Thêm sau khi hoàn thành (ngoài kế hoạch gốc) ✅
```
12. src/app/(main)/dashboard/ktv/page.tsx  — welcome card lấp lánh cho GUEST (thay vì 403) ✅
    + redirect GUEST sau credentials login → /dashboard/ktv thay vì /
```

### Triển khai intranet
```
13. Cài Node.js + NSSM trên máy chủ
14. Đặt NEXT_PUBLIC_DISABLE_GOOGLE_OAUTH=true trong .env
15. npm install && npx prisma migrate deploy && npm run build
16. Đăng ký NSSM service
17. Mở firewall port 3000
18. Test từ máy khác trong mạng
```
