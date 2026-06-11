'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFetch } from '@/lib/use-fetch'
import { fmtDate } from '@/lib/app-data'
import { Card, Badge, Select } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'

interface ApiRoom { id: number; roomCode: string }
interface ApiLog {
  id: number
  maintenanceDate: string
  isSupplyIntake: boolean
  actionType: string | null
  machineNo: number | null
  technicianName: string | null
  technicianId: number | null
  notes: string | null
  room: { roomCode: string } | null
  softwareErrorsBefore: number; hardwareErrorsBefore: number
  softwareErrorsAfter: number; hardwareErrorsAfter: number
  completedAt: string | null
}
interface PaginatedLogs { data: ApiLog[]; total: number; page: number; totalPages: number }

function logId(log: ApiLog) {
  if (log.actionType === 'DISABLE_FAULTY_MACHINE') return 'SC-' + String(log.id).padStart(4, '0')
  return 'BT-' + String(log.id).padStart(4, '0')
}

export default function MaintenanceHistoryPage() {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [roomFilter, setRoomFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const perPage = 10

  const { data: me } = useFetch<{ user: { role: string } | null }>('/api/auth/me')

  // Trang này chỉ dành cho TECHNICIAN
  useEffect(() => {
    if (me?.user && me.user.role !== 'TECHNICIAN') {
      router.replace('/maintenance')
    }
  }, [me, router])

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams({ page: '1', limit: '200' })
    if (roomFilter !== 'all') p.set('roomCode', roomFilter)
    return `/api/maintenance?${p}`
  }, [roomFilter])

  const { data: resp, loading, error } = useFetch<PaginatedLogs>(apiUrl)
  const { data: rooms } = useFetch<ApiRoom[]>('/api/rooms')

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Đang tải dữ liệu...</div>
  if (error)   return <div style={{ padding: 60, textAlign: 'center', color: 'var(--err-tx)' }}>Lỗi tải dữ liệu: {error}</div>
  if (!resp)   return null

  const allLogs = resp.data
  const filtered = allLogs.filter(m =>
    typeFilter === 'all'
    || (typeFilter === 'bt' && !m.actionType)
    || (typeFilter === 'sc' && m.actionType === 'DISABLE_FAULTY_MACHINE')
  )

  const pages = Math.max(1, Math.ceil(filtered.length / perPage))
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage)

  const roomOpts = [{ value: 'all', label: 'Tất cả phòng' }, ...(rooms ?? []).map(r => ({ value: r.roomCode, label: r.roomCode }))]

  return (
    <div className="stack">
      {/* Filters */}
      <Card pad={16} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 600 }}>
          <Icon name="filter" size={16} />Lọc
        </div>
        <Select value={roomFilter} onChange={v => { setRoomFilter(v); setPage(1) }} options={roomOpts} />
        <Select
          value={typeFilter}
          onChange={v => { setTypeFilter(v); setPage(1) }}
          options={[
            { value: 'all', label: 'Tất cả loại' },
            { value: 'bt',  label: 'Bảo trì phòng' },
            { value: 'sc',  label: 'Tắt máy sự cố' },
          ]}
        />
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--text-faint)' }}>
          {filtered.length} bản ghi
        </span>
      </Card>

      <Card pad={0}>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Mã / Ngày</th>
                <th>Phòng / Máy</th>
                <th>Loại</th>
                <th>Ghi chú</th>
                <th style={{ textAlign: 'center' }}>Lỗi trước → sau</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(m => {
                const before = m.softwareErrorsBefore + m.hardwareErrorsBefore
                const after  = m.softwareErrorsAfter  + m.hardwareErrorsAfter
                const isDisable = m.actionType === 'DISABLE_FAULTY_MACHINE'
                return (
                  <tr key={m.id} className="trow">
                    <td style={{ paddingLeft: 22, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600, color: isDisable ? 'var(--err-tx)' : 'var(--text)' }}>{logId(m)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{fmtDate(m.maintenanceDate)}</div>
                    </td>
                    <td>
                      {m.room?.roomCode
                        ? <Badge tone="info">{m.room.roomCode}{m.machineNo ? ` · Máy ${m.machineNo}` : ''}</Badge>
                        : <span style={{ color: 'var(--text-faint)' }}>—</span>
                      }
                    </td>
                    <td>
                      {isDisable
                        ? <Badge tone="err" icon="alert">Tắt máy sự cố</Badge>
                        : <Badge tone="soft" icon="wrench">Bảo trì phòng</Badge>
                      }
                    </td>
                    <td style={{ color: 'var(--text-muted)', maxWidth: 240, fontSize: 13 }}>{m.notes ?? '—'}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {!isDisable
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                            <span style={{ color: 'var(--err-tx)' }}>{before}</span>
                            <Icon name="arrowR" size={13} style={{ color: 'var(--good)' }} />
                            <span style={{ color: 'var(--good-tx)' }}>{after}</span>
                          </span>
                        : <span style={{ color: 'var(--text-faint)' }}>—</span>
                      }
                    </td>
                    <td>
                      {isDisable
                        ? m.completedAt
                          ? <Badge tone="good">Đã sửa xong</Badge>
                          : <Badge tone="err">Đang xử lý</Badge>
                        : <Badge tone="muted">Hoàn thành</Badge>
                      }
                    </td>
                  </tr>
                )
              })}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint)', fontSize: 13 }}>
                    Không có bản ghi nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
            {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} / {filtered.length}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="icon-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ opacity: page === 1 ? .4 : 1 }}>
              <Icon name="chevronL" size={16} />
            </button>
            {Array.from({ length: pages }).map((_, i) => (
              <button key={i} onClick={() => setPage(i + 1)} className="icon-btn" style={{ width: 36, fontWeight: 600, fontSize: 13, ...(page === i + 1 ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : {}) }}>
                {i + 1}
              </button>
            ))}
            <button className="icon-btn" disabled={page === pages} onClick={() => setPage(p => Math.min(pages, p + 1))} style={{ opacity: page === pages ? .4 : 1 }}>
              <Icon name="chevronR" size={16} />
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
