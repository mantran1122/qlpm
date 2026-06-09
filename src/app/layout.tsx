import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'QL Phòng Máy — ĐH Nam Cần Thơ',
  description: 'Hệ thống quản lý phòng máy tính Đại học Nam Cần Thơ',
  icons: { icon: '/logo_don.png', apple: '/logo_don.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
