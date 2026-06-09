import { Shell } from '@/components/app/shell'
import { Toaster } from 'sonner'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Shell>{children}</Shell>
      <Toaster position="top-right" richColors />
    </>
  )
}
