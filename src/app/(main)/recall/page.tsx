'use client'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFetch } from '@/lib/use-fetch'
import { csrfFetch } from '@/lib/csrf'
import { Card, Button, Badge, Sheet, Field } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────
type RecallType = 'RECALL_FOR_REPAIR' | 'RECALL_STILL_USABLE' | 'RETURN_AFTER_REPAIR'
type RecallComplexity = 'LOW' | 'MEDIUM' | 'HIGH'

interface ApiRoom     { id: number; roomCode: string }
interface ApiTech     { id: number; name: string }
interface ApiMachine  { id: number; machineNo: number; isTeacher: boolean; roomId: number }
interface ApiPreRepair { id: number; description: string; machineNo: number; room: { roomCode: string } | null }

interface RecallRecord {
  id: number
  machineId: number
  machineNo: number
  roomId: number
  recallType: RecallType
  complexity: RecallComplexity
  recalledAt: string
  repairStartedAt: string | null
  repairFinishedAt: string | null
  notes: string | null
  createdAt: string
  machine:              { machineNo: number; isTeacher: boolean } | null
  room:                 { roomCode: string } | null
  recalledBy:           { id: number; username: string; profile: { displayName: string } | null } | null
  recalledByTechnician: { id: number; name: string } | null
  repairedBy:           { id: number; username: string; profile: { displayName: string } | null } | null
  repairedByTechnician: { id: number; name: string } | null
  alerts:               { id: number; daysOverdue: number }[]
}

interface PaginatedRecalls { data: RecallRecord[]; total: number; page: number; totalPages: number }

// ── Helpers ────────────────────────────────────────────────────────────────
const RECALL_TYPE_LABELS: Record<RecallType, string> = {
  RECALL_FOR_REPAIR:   'Thu hồi để sửa',
  RECALL_STILL_USABLE: 'Thu hồi còn dùng được',
  RETURN_AFTER_REPAIR: 'Trả lại sau sửa',
}
const RECALL_TYPE_TONES: Record<RecallType, string> = {
  RECALL_FOR_REPAIR:   'err',
  RECALL_STILL_USABLE: 'both',
  RETURN_AFTER_REPAIR: 'good',
}
const COMPLEXITY_LABELS: Record<RecallComplexity, string> = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao' }
const COMPLEXITY_TONES:  Record<RecallComplexity, string> = { LOW: 'good', MEDIUM: 'both', HIGH: 'err' }

function recallId(r: RecallRecord) { return 'REC-' + String(r.id).padStart(4, '0') }

function repairStatusLabel(r: RecallRecord): { label: string; tone: string } {
  if (r.recallType !== 'RECALL_FOR_REPAIR') return { label: '—', tone: 'muted' }
  if (r.repairFinishedAt) return { label: 'Hoàn thành', tone: 'good' }
  if (r.repairStartedAt)  return { label: 'Đang sửa',   tone: 'info' }
  return { label: 'Chờ sửa', tone: 'err' }
}

function fmtDt(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

// ── CreateSheet ────────────────────────────────────────────────────────────
function CreateSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [roomId,       setRoomId]       = useState('')
  const [machineId,    setMachineId]    = useState('')
  const [recallType,   setRecallType]   = useState<RecallType>('RECALL_FOR_REPAIR')
  const [complexity,   setComplexity]   = useState<RecallComplexity>('MEDIUM')
  const [techId,       setTechId]       = useState('')
  const [preRepairId,  setPreRepairId]  = useState('')
  const [recalledAt,   setRecalledAt]   = useState(new Date().toISOString().slice(0, 16))
  const [notes,        setNotes]        = useState('')
  const [saving,       setSaving]       = useState(false)
  const [errMsg,       setErrMsg]       = useState('')

  const { data: rooms }   = useFetch<ApiRoom[]>('/api/rooms')
  const { data: techs }   = useFetch<ApiTech[]>('/api/technicians')
  const { data: machines } = useFetch<ApiMachine[]>(roomId ? `/api/machines?roomId=${roomId}` : '')
  const { data: preRepairs } = useFetch<{ data: ApiPreRepair[] }>(
    machineId ? `/api/pre-repair-status?machineId=${machineId}&limit=10` : ''
  )

  useEffect(() => {
    if (!open) {
      setRoomId(''); setMachineId(''); setRecallType('RECALL_FOR_REPAIR'); setComplexity('MEDIUM')
      setTechId(''); setPreRepairId(''); setRecalledAt(new Date().toISOString().slice(0, 16))
      setNotes(''); setErrMsg('')
    }
  }, [open])

  useEffect(() => { setMachineId(''); setPreRepairId('') }, [roomId])
  useEffect(() => { setPreRepairId('') }, [machineId])

  const handleSave = async () => {
    if (!machineId)   { setErrMsg('Vui lòng chọn máy'); return }
    if (!recalledAt)  { setErrMsg('Vui lòng nhập thời điểm thu hồi'); return }
    setSaving(true); setErrMsg('')
    try {
      const res = await csrfFetch('/api/recalls', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          machineId:              Number(machineId),
          recallType,
          complexity,
          recalledByTechnicianId: techId ? Number(techId) : null,
          recalledAt:             new Date(recalledAt).toISOString(),
          preRepairStatusId:      preRepairId ? Number(preRepairId) : null,
          notes:                  notes.trim() || null,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErrMsg(d.error ?? 'Lỗi khi lưu'); return }
      toast.success('Đã tạo bản ghi thu hồi')
      onSaved(); onClose()
    } finally { setSaving(false) }
  }

  const roomOpts    = (rooms ?? []).map(r => ({ value: String(r.id), label: r.roomCode }))
  const machineOpts = (machines ?? []).filter(m => !m.isTeacher).sort((a, b) => a.machineNo - b.machineNo)
    .map(m => ({ value: String(m.id), label: `Máy ${m.machineNo}` }))
  const techOpts    = [{ value: '', label: '— Chọn KTV —' }, ...(techs ?? []).map(t => ({ value: String(t.id), label: t.name }))]
  const preOpts     = [{ value: '', label: '— Không liên kết —' }, ...((preRepairs?.data ?? []).map(p => ({ value: String(p.id), label: `PRS-${String(p.id).padStart(4,'0')} · ${p.description.slice(0, 50)}` })))]

  const selectStyle = { width: '100%', height: 38, border: '1px solid var(--border-strong)', borderRadius: 10, padding: '0 12px', fontFamily: 'var(--font)', fontSize: 13.5, background: 'var(--surface)', color: 'var(--text)' }

  return (
    <Sheet open={open} onClose={onClose} width={520}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Tạo bản ghi thu hồi</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>Ghi nhận máy được thu hồi để sửa chữa hoặc kiểm tra</div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Phòng + Máy */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Phòng máy *">
            <select value={roomId} onChange={e => setRoomId(e.target.value)} style={selectStyle}>
              <option value="">— Chọn phòng —</option>
              {roomOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Máy số *">
            <select value={machineId} onChange={e => setMachineId(e.target.value)} disabled={!roomId}
              style={{ ...selectStyle, opacity: !roomId ? .5 : 1 }}>
              <option value="">— Chọn máy —</option>
              {machineOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>

        {/* Loại thu hồi + Độ phức tạp */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Loại thu hồi *">
            <select value={recallType} onChange={e => setRecallType(e.target.value as RecallType)} style={selectStyle}>
              <option value="RECALL_FOR_REPAIR">Thu hồi để sửa</option>
              <option value="RECALL_STILL_USABLE">Thu hồi còn dùng được</option>
              <option value="RETURN_AFTER_REPAIR">Trả lại sau sửa</option>
            </select>
          </Field>
          <Field label="Độ phức tạp">
            <select value={complexity} onChange={e => setComplexity(e.target.value as RecallComplexity)} style={selectStyle}>
              <option value="LOW">Thấp</option>
              <option value="MEDIUM">Trung bình</option>
              <option value="HIGH">Cao</option>
            </select>
          </Field>
        </div>

        {/* KTV + Thời điểm */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="KTV thu hồi">
            <select value={techId} onChange={e => setTechId(e.target.value)} style={selectStyle}>
              {techOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Thời điểm thu hồi *">
            <div className="field">
              <Icon name="calendar" size={16} style={{ color: 'var(--text-faint)' }} />
              <input type="datetime-local" value={recalledAt} onChange={e => setRecalledAt(e.target.value)} />
            </div>
          </Field>
        </div>

        {/* Link Pre-repair status */}
        <Field label="Tình trạng trước sửa (tùy chọn)">
          <select value={preRepairId} onChange={e => setPreRepairId(e.target.value)} disabled={!machineId}
            style={{ ...selectStyle, opacity: !machineId ? .5 : 1 }}>
            {preOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        {/* Ghi chú */}
        <Field label="Ghi chú">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="CPU bị cháy, màn hình không lên…"
            rows={3}
            style={{ width: '100%', border: '1px solid var(--border-strong)', borderRadius: 11, padding: 12, fontFamily: 'var(--font)', fontSize: 13.5, resize: 'vertical', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
          />
        </Field>

        {errMsg && (
          <div style={{ color: 'var(--err-tx)', fontSize: 13, padding: '8px 12px', background: 'var(--err-bg)', borderRadius: 8 }}>
            {errMsg}
          </div>
        )}
      </div>

      <div style={{ padding: 20, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="outline" onClick={onClose}>Hủy</Button>
        <Button variant="primary" icon="save" onClick={handleSave} disabled={saving}>
          {saving ? 'Đang lưu…' : 'Tạo bản ghi'}
        </Button>
      </div>
    </Sheet>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function RecallPage() {
  const router      = useRouter()
  const [page,         setPage]         = useState(1)
  const [createOpen,   setCreateOpen]   = useState(false)
  const [typeFilter,   setTypeFilter]   = useState('')
  const [roomFilter,   setRoomFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const perPage = 15

  const { data: rooms } = useFetch<ApiRoom[]>('/api/rooms')

  const apiUrl = (() => {
    const p = new URLSearchParams({ page: String(page), limit: String(perPage) })
    if (typeFilter) {
      if (typeFilter === 'overdue') { p.set('overdue', 'true') }
      else p.set('type', typeFilter)
    }
    if (statusFilter && typeFilter !== 'overdue') p.set('repairStatus', statusFilter)
    if (roomFilter) {
      const room = (rooms ?? []).find(r => r.roomCode === roomFilter)
      if (room) p.set('roomId', String(room.id))
    }
    return `/api/recalls?${p}`
  })()

  const { data: resp, loading, error, refetch } = useFetch<PaginatedRecalls>(apiUrl)
  const handleSaved = useCallback(() => { refetch(); setPage(1) }, [refetch])

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
      <Icon name="refresh" size={28} style={{ marginBottom: 12, opacity: 0.4, animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 12px' }} />
      <div>Đang tải dữ liệu...</div>
    </div>
  )
  if (error) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <Icon name="alert" size={28} style={{ color: 'var(--err)', display: 'block', margin: '0 auto 12px' }} />
      <div style={{ color: 'var(--err-tx)', fontSize: 14, marginBottom: 16 }}>Không tải được dữ liệu. Vui lòng thử lại.</div>
      <Button variant="outline" size="sm" onClick={() => refetch()} icon="refresh">Thử lại</Button>
    </div>
  )

  const records    = resp?.data ?? []
  const total      = resp?.total ?? 0
  const totalPages = resp?.totalPages ?? 1

  const roomOpts = [
    { value: '', label: 'Tất cả phòng' },
    ...(rooms ?? []).map(r => ({ value: r.roomCode, label: r.roomCode })),
  ]

  return (
    <div className="stack">
      {/* Toolbar */}
      <Card pad={16} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 600 }}>
          <Icon name="filter" size={16} />Lọc
        </div>

        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
          style={{ height: 36, border: '1px solid var(--border-strong)', borderRadius: 9, padding: '0 12px', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}>
          <option value="">Tất cả loại</option>
          <option value="RECALL_FOR_REPAIR">Thu hồi để sửa</option>
          <option value="RECALL_STILL_USABLE">Thu hồi còn dùng</option>
          <option value="RETURN_AFTER_REPAIR">Trả lại sau sửa</option>
          <option value="overdue">⚠ Quá hạn</option>
        </select>

        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          style={{ height: 36, border: '1px solid var(--border-strong)', borderRadius: 9, padding: '0 12px', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}>
          <option value="">Tất cả trạng thái</option>
          <option value="pending_repair">Chờ sửa</option>
          <option value="in_repair">Đang sửa</option>
          <option value="completed">Hoàn thành</option>
        </select>

        <select value={roomFilter} onChange={e => { setRoomFilter(e.target.value); setPage(1) }}
          style={{ height: 36, border: '1px solid var(--border-strong)', borderRadius: 9, padding: '0 12px', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}>
          {roomOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <Button variant="primary" icon="plus" style={{ marginLeft: 'auto' }} onClick={() => setCreateOpen(true)}>
          Tạo bản ghi
        </Button>
      </Card>

      {/* Bảng */}
      <Card pad={0}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>Đang tải…</div>
        ) : error ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--err-tx)', fontSize: 14 }}>Lỗi: {error}</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 22, whiteSpace: 'nowrap' }}>Mã / Ngày</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Phòng · Máy</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Loại thu hồi</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Độ P.T</th>
                    <th style={{ whiteSpace: 'nowrap' }}>KTV thu hồi</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Trạng thái sửa</th>
                    <th style={{ whiteSpace: 'nowrap' }}>KTV sửa</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Ghi chú</th>
                    <th style={{ width: 48 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-faint)', fontSize: 13.5 }}>
                        Chưa có bản ghi nào. Nhấn &quot;Tạo bản ghi&quot; để bắt đầu.
                      </td>
                    </tr>
                  )}
                  {records.map(r => {
                    const repairStatus = repairStatusLabel(r)
                    const isOverdue    = r.alerts.length > 0
                    return (
                      <tr key={r.id} className="trow" style={{ cursor: 'pointer' }}
                        onClick={() => router.push(`/recall/${r.id}`)}>
                        <td style={{ paddingLeft: 22, whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {recallId(r)}
                            {isOverdue && <Icon name="warning" size={14} style={{ color: 'var(--err)' }} />}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{fmtDt(r.recalledAt)}</div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <Badge tone="muted">{r.room?.roomCode ?? '—'}</Badge>
                          <span style={{ marginLeft: 6, fontSize: 13, color: 'var(--text-muted)' }}>Máy {r.machineNo}</span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <Badge tone={RECALL_TYPE_TONES[r.recallType] as 'err' | 'good' | 'both' | 'muted' | 'info'}>
                            {RECALL_TYPE_LABELS[r.recallType]}
                          </Badge>
                        </td>
                        <td>
                          <Badge tone={COMPLEXITY_TONES[r.complexity] as 'err' | 'good' | 'both' | 'muted' | 'info'}>
                            {COMPLEXITY_LABELS[r.complexity]}
                          </Badge>
                        </td>
                        <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                          {r.recalledByTechnician?.name ?? r.recalledBy?.profile?.displayName ?? r.recalledBy?.username ?? '—'}
                        </td>
                        <td>
                          <Badge tone={repairStatus.tone as 'err' | 'good' | 'both' | 'muted' | 'info'}>
                            {repairStatus.label}
                          </Badge>
                        </td>
                        <td style={{ fontSize: 13, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                          {r.repairedByTechnician?.name ?? r.repairedBy?.profile?.displayName ?? '—'}
                        </td>
                        <td style={{ maxWidth: 200 }}>
                          <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-faint)' }}>
                            {r.notes ?? '—'}
                          </div>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <button className="icon-btn" title="Xem chi tiết"
                            onClick={() => router.push(`/recall/${r.id}`)}
                            style={{ color: 'var(--primary)' }}>
                            <Icon name="arrowR" size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
                {total === 0 ? '0 bản ghi' : `Hiển thị ${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} / ${total} bản ghi`}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="icon-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ opacity: page === 1 ? .4 : 1 }}>
                  <Icon name="chevronL" size={16} />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(i => (
                  <button key={i} onClick={() => setPage(i)} className="icon-btn"
                    style={{ width: 36, fontWeight: 600, fontSize: 13, ...(page === i ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : {}) }}>
                    {i}
                  </button>
                ))}
                <button className="icon-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} style={{ opacity: page === totalPages ? .4 : 1 }}>
                  <Icon name="chevronR" size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} onSaved={handleSaved} />
    </div>
  )
}
