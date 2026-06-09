'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'

interface AuditEntry {
  id: number
  userId: number | null
  userEmail: string | null
  userDisplayName: string | null
  action: string
  target: string | null
  detail: Record<string, unknown> | null
  ip: string | null
  ua: string | null
  createdAt: string
}

const ACTION_LABELS: Record<string, string> = {
  'user.created': 'Tạo tài khoản',
  'user.role_changed': 'Đổi vai trò',
  'user.locked': 'Khóa tài khoản',
  'user.unlocked': 'Mở khóa tài khoản',
  'user.deactivated': 'Vô hiệu hóa',
  'user.activated': 'Kích hoạt',
  'user.password_changed': 'Đổi mật khẩu',
  'settings.updated': 'Cập nhật cấu hình',
  'settings.smtp_updated': 'Cấu hình email',
  'notification.sent': 'Gửi thông báo',
  'notification.created': 'Tạo thông báo',
  'maintenance.created': 'Tạo bảo trì',
  'maintenance.updated': 'Sửa bảo trì',
}

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

function exportCSV(items: AuditEntry[]) {
  const header = 'ID,Thời gian,Người dùng,Thao tác,Đối tượng,IP\n'
  const rows = items.map(l => {
    const user = l.userDisplayName ?? l.userEmail ?? 'Hệ thống'
    const action = getActionLabel(l.action)
    return `${l.id},"${l.createdAt}","${user}","${action}","${l.target ?? ''}","${l.ip ?? ''}"`
  }).join('\n')
  const bom = '\uFEFF'
  const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `nhat-ky-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function DetailModal({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 14, padding: 24, maxWidth: 500, width: '90%', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Chi tiết nhật ký</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)' }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.8 }}>
          <div><strong>ID:</strong> {entry.id}</div>
          <div><strong>Thời gian:</strong> {new Date(entry.createdAt).toLocaleString('vi-VN')}</div>
          <div><strong>Người dùng:</strong> {entry.userDisplayName ?? entry.userEmail ?? 'Hệ thống'}</div>
          <div><strong>Thao tác:</strong> {getActionLabel(entry.action)} ({entry.action})</div>
          <div><strong>Đối tượng:</strong> {entry.target ?? '—'}</div>
          <div><strong>IP:</strong> {entry.ip ?? '—'}</div>
          <div><strong>User Agent:</strong> {entry.ua ?? '—'}</div>
          {entry.detail && (
            <div style={{ marginTop: 8 }}>
              <strong>Chi tiết:</strong>
              <pre style={{ margin: '4px 0 0', padding: 10, borderRadius: 8, background: 'var(--hover)', fontSize: 11.5, overflow: 'auto', maxHeight: 200 }}>
                {JSON.stringify(entry.detail, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null)
  const loadRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async (cursor?: number, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '30' })
      if (cursor) params.set('cursor', String(cursor))
      const res = await fetch(`/api/audit-logs?${params}`)
      if (res.ok) {
        const data = await res.json()
        if (append) setEntries(prev => [...prev, ...(data.data ?? [])])
        else setEntries(data.data ?? [])
        setNextCursor(data.nextCursor)
        setHasMore(data.hasMore)
      }
    } catch { /* ignore */ }
    finally { setLoading(false); setLoadingMore(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!loadRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !loadingMore) fetchData(nextCursor!, true) },
      { threshold: 0.1 }
    )
    observer.observe(loadRef.current)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, nextCursor, fetchData])

  const timeAgo = (dateStr: string) => {
    try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: vi }) } catch { return dateStr }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>Đang tải...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => exportCSV(entries)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 9,
          border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)',
          background: 'var(--hover)', color: 'var(--text-faint)',
        }}>
          <Icon name="download" size={14} /> Xuất CSV
        </button>
      </div>

      <Card pad={0}>
        {entries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>Chưa có nhật ký nào</div>
        ) : (
          entries.map(e => (
            <div
              key={e.id}
              onClick={() => setSelectedEntry(e)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px',
                borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12.5,
                transition: 'background .1s',
              }}
              onMouseEnter={ev => { (ev.currentTarget as HTMLDivElement).style.background = 'var(--hover)' }}
              onMouseLeave={ev => { (ev.currentTarget as HTMLDivElement).style.background = '' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{getActionLabel(e.action)}</div>
                <div style={{ color: 'var(--text-faint)', marginTop: 2 }}>
                  {e.userDisplayName ?? e.userEmail ?? 'Hệ thống'}
                  {e.target ? ` · ${e.target}` : ''}
                  {e.ip ? ` · ${e.ip}` : ''}
                </div>
              </div>
              <span style={{ color: 'var(--text-faint)', fontSize: 11.5, flexShrink: 0 }}>{timeAgo(e.createdAt)}</span>
            </div>
          ))
        )}
        <div ref={loadRef} style={{ padding: 20, textAlign: 'center' }}>
          {loadingMore && <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>Đang tải thêm...</span>}
        </div>
      </Card>

      {selectedEntry && <DetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />}
    </div>
  )
}
