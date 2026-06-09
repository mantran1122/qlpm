import { requireRoleStrict, requireCsrf } from '@/lib/node/auth'
import { getSetting } from '@/lib/node/settings'
import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  if (!requireCsrf(req)) return Response.json({ error: 'CSRF token không hợp lệ' }, { status: 403 })

  const auth = await requireRoleStrict(req, 'ADMIN')
  if (!auth) return Response.json({ error: 'Chỉ admin mới có quyền' }, { status: 403 })

  const host = await getSetting('smtp_host')
  const port = await getSetting('smtp_port')
  const user = await getSetting('smtp_user')
  const pass = await getSetting('smtp_pass')
  const from = await getSetting('smtp_from')

  if (!host || !port || !user || !pass || !from) {
    return Response.json({ error: 'Cấu hình SMTP chưa đầy đủ' }, { status: 400 })
  }

  let body: { to?: string }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body không hợp lệ' }, { status: 400 })
  }

  const to = body.to || user

  // Gửi email test dùng SMTP thủ công (không cần nodemailer lib)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = (await import('nodemailer')).default
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: port === '465',
      auth: { user, pass },
    })

    await transporter.sendMail({
      from,
      to,
      subject: 'Test email — QL Phòng Máy',
      text: 'Email test từ Hệ thống Quản lý Phòng Máy. Cấu hình SMTP hoạt động bình thường.',
      html: '<h3>Email test thành công</h3><p>Hệ thống Quản lý Phòng Máy đã gửi email test. Cấu hình SMTP hoạt động bình thường.</p>',
    })

    return Response.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return Response.json({ error: `Không thể gửi email: ${message}` }, { status: 500 })
  }
}
