'use client'
import { useRouter } from 'next/navigation'

export function useNav() {
  const router = useRouter()
  return (page: string, param?: string | null) => {
    if (page === 'room-detail' && param) { router.push(`/rooms/${encodeURIComponent(param)}`); return }
    const map: Record<string, string> = {
      dashboard: '/', rooms: '/rooms', maintenance: '/maintenance',
      software: '/software', supplies: '/supplies', stats: '/stats',
    }
    router.push(map[page] ?? '/')
  }
}
