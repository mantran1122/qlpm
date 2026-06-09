'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Card } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'
import { csrfFetch } from '@/lib/csrf'

interface NotifItem {
  id: number
  title: string
  message: string
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS'
  link: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
  broadcastId: number | null
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

const TYPE_LABEL: Record<string, string> = {
  INFO: 'Thông tin',
  WARNING: 'Cảnh báo',
  ERROR: 'Lỗi',
  SUCCESS: 'Hoàn thành',
}

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'false', label: 'Chưa đọc' },
  { key: 'true', label: 'Đã đọc' },
]

const TYPE_FILTERS = [
  { key: '', label: 'Tất cả loại' },
  { key: 'INFO', label: 'Thông tin' },
  { key: 'WARNING', label: 'Cảnh báo' },
  { key: 'ERROR', label: 'Lỗi' },
  { key: 'SUCCESS', label: 'Hoàn thành' },
]

function exportCSV(items: NotifItem[]) {
  const header = 'ID,Tiêu đề,Nội dung,Loại,Trạng thái,Thời gian\n'
  const rows = items.map(n => {
    const msg = n.message.replace(/"/g, '""')
    const status = n.isRead ? 'Đã đọc' : 'Chưa đọc'
    return `${n.id},"${n.title}","${msg}","${TYPE_LABEL[n.type]}","${status}","${n.createdAt}"`
  }).join('\n')
  const bom = '\uFEFF'
  const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `thong-bao-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function NotificationsPage() {
  const router = useRouter()
  const [items, setItems] = useState<NotifItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [activeTab, setActiveTab] = useState('all')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const loadRef = useRef<HTMLDivElement>(null)
  const firstLoad = useRef(true)

  const fetchItems = useCallback(async (cursor?: number, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)

    try {
      const params = new URLSearchParams()
      params.set('limit', '20')
      if (cursor) params.set('cursor', String(cursor))
      if (activeTab !== 'all') params.set('isRead', activeTab)
      if (typeFilter) params.set('type', typeFilter)
      if (search.trim()) params.set('q', search.trim())

      const res = await fetch(`/api/notifications?${params}`)
      if (res.ok) {
        const data = await res.json()
        if (append) {
          setItems(prev => [...prev, ...(data.data ?? [])])
        } else {
          setItems(data.data ?? [])
        }
        setNextCursor(data.nextCursor)
        setHasMore(data.hasMore)
      }
    } catch { /* ignore */ }
    finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [activeTab, typeFilter, search])

  useEffect(() => {
    if (!firstLoad.current) {
      setItems([])
      setSelected(new Set())
      fetchItems()
    }
    firstLoad.current = false
  }, [activeTab, typeFilter, search, fetchItems])

  const handleToggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleToggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(items.map(n => n.id)))
    }
  }

  const handleMarkRead = async (ids: number[]) => {
    setItems(prev => prev.map(n => ids.includes(n.id) ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
    setSelected(new Set())
    try {
      await Promise.all(ids.map(id => csrfFetch(`/api/notifications/${id}/read`, { method: 'PATCH' })))
    } catch { fetchItems() }
  }

  const handleDelete = async (ids: number[]) => {
    setItems(prev => prev.filter(n => !ids.includes(n.id)))
    setSelected(new Set())
    try {
      await Promise.all(ids.map(id => csrfFetch(`/api/notifications/${id}`, { method: 'DELETE' })))
    } catch { fetchItems() }
  }

  const handleMarkAllRead = async () => {
    setItems(prev => prev.map(n => ({ ...n, isRead: true, readAt: new Date().toISOString() })))
    try { await csrfFetch('/api/notifications/read-all', { method: 'PATCH' }) } catch { fetchItems() }
  }

  const timeAgo = (dateStr: string) => {
    try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: vi }) } catch { return dateStr }
  }

  // Infinite scroll
  useEffect(() => {
    if (!loadRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !loadingMore) fetchItems(nextCursor!, true) },
      { threshold: 0.1 }
    )
    observer.observe(loadRef.current)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, nextCursor, fetchItems])

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', background: 'var(--hover)', borderRadius: 10, padding: 3, gap: 2 }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: activeTab === t.key ? 600 : 500,
                  background: activeTab === t.key ? 'var(--surface)' : 'transparent',
                  color: activeTab === t.key ? 'var(--text)' : 'var(--text-faint)',
                  fontFamily: 'var(--font)', boxShadow: activeTab === t.key ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                  transition: 'all .14s ease',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontFamily: 'var(--font)',
              cursor: 'pointer',
            }}
          >
            {TYPE_FILTERS.map(f => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm kiếm..."
            style={{
              padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontFamily: 'var(--font)',
              width: 200, outline: 'none',
            }}
          />
          {selected.size > 0 && (
            <>
              <button onClick={() => handleMarkRead([...selected])} style={actionBtnStyle('var(--primary)')}>
                <Icon name="check" size={14} /> Đánh dấu đã đọc
              </button>
              <button onClick={() => handleDelete([...selected])} style={actionBtnStyle('#ef4444')}>
                <Icon name="trash" size={14} /> Xóa
              </button>
            </>
          )}
          {items.length > 0 && (
            <button onClick={() => exportCSV(items)} style={actionBtnStyle('var(--text-faint)')}>
              <Icon name="download" size={14} /> Xuất CSV
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <Card pad={0}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
            Đang tải...
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Icon name="bell" size={40} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
            <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>Không có thông báo nào</div>
          </div>
        ) : (
          <>
            {items.length > 2 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
                <input
                  type="checkbox"
                  checked={selected.size === items.length}
                  onChange={handleToggleAll}
                  style={{ accentColor: 'var(--primary)' }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                  {selected.size > 0 ? `Đã chọn ${selected.size}` : 'Chọn tất cả'}
                </span>
                <div style={{ flex: 1 }} />
                {items.some(n => !n.isRead) && (
                  <button onClick={handleMarkAllRead} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    Đánh dấu tất cả đã đọc
                  </button>
                )}
              </div>
            )}
            {items.map(n => (
              <div
                key={n.id}
                style={{
                  display: 'flex', gap: 14, padding: '14px 18px', alignItems: 'flex-start',
                  borderBottom: '1px solid var(--border)',
                  background: n.isRead ? 'transparent' : 'color-mix(in srgb, var(--primary) 4%, transparent)',
                  cursor: 'pointer', transition: 'background .12s ease',
                }}
                onClick={() => {
                  if (n.link) router.push(n.link)
                  if (!n.isRead) handleMarkRead([n.id])
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={selected.has(n.id)}
                    onChange={e => { e.stopPropagation(); handleToggleSelect(n.id) }}
                    onClick={e => e.stopPropagation()}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  <span style={{ color: TYPE_COLOR[n.type] ?? 'var(--text-faint)', lineHeight: 1 }}>
                    <Icon name={TYPE_ICON[n.type] ?? 'info'} size={20} stroke={2} />
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{n.title}</span>
                    {!n.isRead && (
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 3, lineHeight: 1.5 }}>{n.message}</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11.5, color: 'var(--text-faint)' }}>
                    <span>{timeAgo(n.createdAt)}</span>
                    <span style={{ padding: '1px 8px', borderRadius: 99, background: 'var(--hover)', fontSize: 11 }}>
                      {TYPE_LABEL[n.type] ?? n.type}
                    </span>
                    {n.isRead && n.readAt && <span>Đã đọc · {timeAgo(n.readAt)}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {n.link && (
                    <button
                      onClick={e => { e.stopPropagation(); router.push(n.link!) }}
                      title="Mở liên kết"
                      style={{ ...iconStyle }}
                    >
                      <Icon name="externalLink" size={15} />
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete([n.id]) }}
                    title="Xóa"
                    style={{ ...iconStyle, color: '#ef4444' }}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            ))}
            {/* Infinite scroll trigger */}
            <div ref={loadRef} style={{ padding: 20, textAlign: 'center' }}>
              {loadingMore && (
                <span style={{ color: 'var(--text-faint)', fontSize: 12.5 }}>Đang tải thêm...</span>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '7px 13px', borderRadius: 9, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)',
    background: 'var(--hover)', color,
    transition: 'all .14s ease',
  }
}

const iconStyle: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'transparent', color: 'var(--text-faint)',
  display: 'grid', placeItems: 'center',
}
