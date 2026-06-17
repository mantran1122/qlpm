import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Đăng nhập — QL Phòng Máy',
  description: 'Đăng nhập hệ thống quản lý phòng máy tính Đại học Nam Cần Thơ',
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <main className="login-layout-frame">{children}</main>
}
