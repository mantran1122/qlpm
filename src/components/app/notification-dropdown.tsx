'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { IconBtn } from './primitives'
import { Icon } from './icons'
import { csrfFetch } from '@/lib/csrf'

interface NotifItem {
  id: number
  title: string
  message: string
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS'
  link: string | null
  isRead: boolean
  createdAt: string
}

const TYPE_ICON: Record<string, string> = {
  INFO: 'info',
  WARNING: 'alertTriangle',
  ERROR: 'alertCircle',
  SUCCESS: 'checkCircle',
}

const TYPE_COLOR: Record<string, string> = {
  INFO: 'var(--primary)',
  WARNING: '#f59e0b',
  ERROR: '#ef4444',
  SUCCESS: '#22c55e',
}

export function NotificationDropdown() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifs, setNotifs] = useState<NotifItem[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count')
      if (res.ok) {
        const data = await res.json()
        setUnreadCount(data.count ?? 0)
      }
    } catch { /* ignore */ }
  }, [])

  const fetchNotifs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=5')
      if (res.ok) {
        const data = await res.json()
        setNotifs(data.data ?? [])
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  const handleToggle = () => {
    if (!open) {
      fetchNotifs()
      setOpen(true)
    } else {
      setOpen(false)
    }
  }

  const handleMarkRead = async (notif: NotifItem) => {
    if (!notif.isRead) {
      setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
      csrfFetch(`/api/notifications/${notif.id}/read`, { method: 'PATCH' }).catch(() => {
        setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: false } : n))
        setUnreadCount(prev => prev + 1)
      })
    }
    if (notif.link) {
      router.push(notif.link)
    }
    setOpen(false)
  }

  const handleMarkAllRead = async () => {
    setNotifs(prev => prev.map(n => ({ ...n, isRead: true })))
    setUnreadCount(0)
    try {
      await csrfFetch('/api/notifications/read-all', { method: 'PATCH' })
    } catch {
      fetchNotifs()
      fetchUnreadCount()
    }
  }

  const timeAgo = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: vi })
    } catch {
      return ''
    }
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <IconBtn
        name="bell"
        badge={unreadCount || undefined}
        title="Thông báo"
        onClick={handleToggle}
      />
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: -10, width: 380,
          background: 'var(--surface)', borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,.18)', border: '1px solid var(--border)',
          zIndex: 100, overflow: 'hidden', animation: 'popIn .15s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Thông báo</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>Đang tải...</span>
              </div>
            ) : notifs.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <Icon name="bell" size={32} style={{ color: 'var(--text-faint)', marginBottom: 10 }} />
                <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>Không có thông báo nào</div>
              </div>
            ) : (
              notifs.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleMarkRead(n)}
                  style={{
                    display: 'flex', gap: 12, padding: '12px 18px', width: '100%', border: 'none',
                    background: n.isRead ? 'transparent' : 'color-mix(in srgb, var(--primary) 5%, transparent)',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)',
                    borderBottom: '1px solid var(--border)', transition: 'background .12s ease',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)' }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = n.isRead ? 'transparent' : 'color-mix(in srgb, var(--primary) 5%, transparent)'
                  }}
                >
                  <span style={{ color: TYPE_COLOR[n.type] ?? 'var(--text-faint)', flexShrink: 0, marginTop: 1 }}>
                    <Icon name={TYPE_ICON[n.type] ?? 'info'} size={18} stroke={2} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.message}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{timeAgo(n.createdAt)}</div>
                  </div>
                  {!n.isRead && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: 4 }} />
                  )}
                </button>
              ))
            )}
          </div>
          {notifs.length > 0 && (
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
              <button
                onClick={() => { router.push('/notifications'); setOpen(false) }}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                Xem tất cả thông báo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
