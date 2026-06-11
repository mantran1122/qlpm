'use client'
import { useState, useCallback, useEffect } from 'react'
import { useFetch } from '@/lib/use-fetch'
import { csrfFetch } from '@/lib/csrf'
import { fmtDate } from '@/lib/app-data'
import { Card, Button, Badge, Sheet, Field } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────
interface ApiRoom { id: number; roomCode: string }
interface ApiTech { id: number; name: string }
interface ApiMachine { id: number; machineNo: number; isTeacher: boolean; roomId: number }

interface ApiSnapshot {
  id: number
  maintenanceDate: string
  actionType: string | null
  notes: string | null
  room: { roomCode: string } | null
  technicianName: string | null
  createdBy: { username: string; profile: { displayName: string } | null } | null
}
interface PaginatedSnapshots { data: ApiSnapshot[]; total: number; page: number; totalPages: number }

interface PreRepairRecord {
  id: number
  machineId: number
  machineNo: number
  roomId: number
  description: string
  reportedBy: string | null
  reportedAt: string
  imageUrls: string | null
  technicianId: number | null
  createdAt: string
  machine: { machineNo: number; isTeacher: boolean } | null
  room: { roomCode: string } | null
  technician: { id: number; name: string } | null
  createdBy: { id: number; username: string; profile: { displayName: string } | null } | null
}

interface PaginatedRecords { data: PreRepairRecord[]; total: number; page: number; totalPages: number }

// ── Helpers ────────────────────────────────────────────────────────────────
function parseImageUrls(raw: string | null): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

function recordId(r: PreRepairRecord) {
  return 'PRS-' + String(r.id).padStart(4, '0')
}

// ── ImageUploader ──────────────────────────────────────────────────────────
function ImageUploader({ urls, onChange }: { urls: string[]; onChange: (urls: string[]) => void }) {
  const [uploading, setUploading] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (urls.length + files.length > 5) {
      toast.error('Tối đa 5 ảnh mỗi bản ghi')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      Array.from(files).forEach(f => fd.append('files', f))
      const res = await csrfFetch('/api/upload/repair-image', { method: 'POST', body: fd })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Upload thất bại'); return }
      const { urls: newUrls } = await res.json()
      onChange([...urls, ...newUrls])
    } finally { setUploading(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: urls.length ? 10 : 0 }}>
        {urls.map((url, i) => (
          <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Ảnh ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button
              type="button"
              onClick={() => onChange(urls.filter((_, j) => j !== i))}
              style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 99, background: 'rgba(0,0,0,.6)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#fff' }}>
              <Icon name="x" size={11} stroke={2.5} />
            </button>
          </div>
        ))}
        {urls.length < 5 && (
          <label style={{ width: 72, height: 72, borderRadius: 10, border: '2px dashed var(--border-strong)', display: 'grid', placeItems: 'center', cursor: uploading ? 'wait' : 'pointer', color: 'var(--text-faint)', flexShrink: 0 }}>
            {uploading ? <Icon name="refresh" size={20} style={{ animation: 'spin .7s linear infinite' }} /> : <Icon name="camera" size={20} />}
            <input type="file" accept="image/*" multiple hidden onChange={e => handleFiles(e.target.files)} disabled={uploading} />
          </label>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Tối đa 5 ảnh, 5MB/ảnh · JPG, PNG, WebP</div>
    </div>
  )
}

// ── CreateSheet ────────────────────────────────────────────────────────────
function CreateSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [roomId,       setRoomId]       = useState('')
  const [machineId,    setMachineId]    = useState('')
  const [techId,       setTechId]       = useState('')
  const [description,  setDescription]  = useState('')
  const [reportedBy,   setReportedBy]   = useState('')
  const [reportedAt,   setReportedAt]   = useState(new Date().toISOString().slice(0, 16))
  const [imageUrls,    setImageUrls]    = useState<string[]>([])
  const [saving,       setSaving]       = useState(false)
  const [errMsg,       setErrMsg]       = useState('')

  const { data: rooms } = useFetch<ApiRoom[]>('/api/rooms')
  const { data: techs } = useFetch<ApiTech[]>('/api/technicians')
  const { data: machines } = useFetch<ApiMachine[]>(
    roomId ? `/api/machines?roomId=${roomId}` : ''
  )

  useEffect(() => {
    if (!open) {
      setRoomId(''); setMachineId(''); setTechId(''); setDescription('')
      setReportedBy(''); setReportedAt(new Date().toISOString().slice(0, 16))
      setImageUrls([]); setErrMsg('')
    }
  }, [open])

  // Reset machineId khi đổi phòng
  useEffect(() => { setMachineId('') }, [roomId])

  const handleSave = async () => {
    if (!machineId) { setErrMsg('Vui lòng chọn máy'); return }
    if (!description.trim()) { setErrMsg('Vui lòng nhập mô tả tình trạng'); return }
    if (!reportedAt) { setErrMsg('Vui lòng nhập thời điểm phát hiện'); return }

    setSaving(true); setErrMsg('')
    try {
      const res = await csrfFetch('/api/pre-repair-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId:    Number(machineId),
          description:  description.trim(),
          reportedBy:   reportedBy.trim() || null,
          reportedAt:   new Date(reportedAt).toISOString(),
          imageUrls:    JSON.stringify(imageUrls),
          technicianId: techId ? Number(techId) : null,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErrMsg(d.error ?? 'Lỗi khi lưu'); return }
      toast.success('Đã lưu bản ghi tình trạng trước sửa')
      onSaved(); onClose()
    } finally { setSaving(false) }
  }

  const roomOpts    = (rooms ?? []).map(r => ({ value: String(r.id), label: r.roomCode }))
  const machineOpts = (machines ?? [])
    .filter(m => !m.isTeacher)
    .sort((a, b) => a.machineNo - b.machineNo)
    .map(m => ({ value: String(m.id), label: `Máy ${m.machineNo}` }))
  const techOpts = [{ value: '', label: '— KTV ghi nhận —' }, ...(techs ?? []).map(t => ({ value: String(t.id), label: t.name }))]

  return (
    <Sheet open={open} onClose={onClose} width={500}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Ghi nhận tình trạng trước sửa</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>Bản ghi này bất biến sau khi tạo</div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Chọn phòng + máy */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Phòng máy *">
            <select value={roomId} onChange={e => setRoomId(e.target.value)}
              style={{ width: '100%', height: 38, border: '1px solid var(--border-strong)', borderRadius: 10, padding: '0 12px', fontFamily: 'var(--font)', fontSize: 13.5, background: 'var(--surface)', color: 'var(--text)' }}>
              <option value="">— Chọn phòng —</option>
              {roomOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Máy số *">
            <select value={machineId} onChange={e => setMachineId(e.target.value)} disabled={!roomId}
              style={{ width: '100%', height: 38, border: '1px solid var(--border-strong)', borderRadius: 10, padding: '0 12px', fontFamily: 'var(--font)', fontSize: 13.5, background: 'var(--surface)', color: 'var(--text)', opacity: !roomId ? .5 : 1 }}>
              <option value="">— Chọn máy —</option>
              {machineOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>

        {/* Thời điểm + người báo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Thời điểm phát hiện *">
            <div className="field">
              <Icon name="calendar" size={16} style={{ color: 'var(--text-faint)' }} />
              <input type="datetime-local" value={reportedAt} onChange={e => setReportedAt(e.target.value)} />
            </div>
          </Field>
          <Field label="Người báo (GV/SV)">
            <div className="field">
              <Icon name="user" size={16} style={{ color: 'var(--text-faint)' }} />
              <input type="text" value={reportedBy} onChange={e => setReportedBy(e.target.value)} placeholder="Thầy/Cô Nguyễn Văn A…" />
            </div>
          </Field>
        </div>

        {/* KTV ghi nhận */}
        <Field label="KTV ghi nhận">
          <select value={techId} onChange={e => setTechId(e.target.value)}
            style={{ width: '100%', height: 38, border: '1px solid var(--border-strong)', borderRadius: 10, padding: '0 12px', fontFamily: 'var(--font)', fontSize: 13.5, background: 'var(--surface)', color: 'var(--text)' }}>
            {techOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        {/* Mô tả tình trạng */}
        <Field label="Mô tả tình trạng *">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Mô tả chi tiết: màn hình không lên, quạt kêu to, máy không POST…"
            rows={4}
            style={{ width: '100%', border: '1px solid var(--border-strong)', borderRadius: 11, padding: 12, fontFamily: 'var(--font)', fontSize: 13.5, resize: 'vertical', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
          />
        </Field>

        {/* Upload ảnh */}
        <Field label="Ảnh đính kèm">
          <ImageUploader urls={imageUrls} onChange={setImageUrls} />
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
          {saving ? 'Đang lưu…' : 'Lưu bản ghi'}
        </Button>
      </div>
    </Sheet>
  )
}

// ── DetailSheet ────────────────────────────────────────────────────────────
function DetailSheet({ record, onClose }: { record: PreRepairRecord | null; onClose: () => void }) {
  if (!record) return null
  const images = parseImageUrls(record.imageUrls)
  const creatorName = record.createdBy?.profile?.displayName ?? record.createdBy?.username ?? '—'

  return (
    <Sheet open={!!record} onClose={onClose} width={500}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{recordId(record)}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>
            {record.room?.roomCode} · Máy {record.machineNo}
          </div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Meta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <InfoRow icon="calendar" label="Phát hiện lúc" value={new Date(record.reportedAt).toLocaleString('vi-VN')} />
          <InfoRow icon="user"     label="Người báo"    value={record.reportedBy ?? '—'} />
          <InfoRow icon="users"    label="KTV ghi nhận" value={record.technician?.name ?? '—'} />
          <InfoRow icon="clock"    label="Tạo lúc"      value={new Date(record.createdAt).toLocaleString('vi-VN')} />
        </div>
        <InfoRow icon="user" label="Người tạo" value={creatorName} />

        {/* Mô tả */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Mô tả tình trạng</div>
          <div style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 10, fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {record.description}
          </div>
        </div>

        {/* Ảnh */}
        {images.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
              Ảnh đính kèm ({images.length})
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {images.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer"
                  style={{ width: 80, height: 80, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', display: 'block' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Ảnh ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </a>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: '10px 14px', background: 'var(--surface-3)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-faint)' }}>
          <Icon name="lock" size={14} />
          Bản ghi này bất biến — không thể chỉnh sửa hoặc xóa sau khi tạo.
        </div>
      </div>
    </Sheet>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        <Icon name={icon} size={12} />{label}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)', paddingLeft: 2 }}>{value}</div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function PreRepairPage() {
  const [page,        setPage]        = useState(1)
  const [createOpen,  setCreateOpen]  = useState(false)
  const [detail,      setDetail]      = useState<PreRepairRecord | null>(null)
  const [roomFilter,  setRoomFilter]  = useState('')
  const [activeTab,   setActiveTab]   = useState<'machines' | 'rooms'>('machines')
  const [snapPage,    setSnapPage]    = useState(1)
  const perPage = 10

  const { data: rooms } = useFetch<ApiRoom[]>('/api/rooms')

  const apiUrl = (() => {
    const p = new URLSearchParams({ page: String(page), limit: String(perPage) })
    if (roomFilter) {
      const room = (rooms ?? []).find(r => r.roomCode === roomFilter)
      if (room) p.set('roomId', String(room.id))
    }
    return `/api/pre-repair-status?${p}`
  })()

  const snapApiUrl = (() => {
    if (activeTab !== 'rooms') return ''
    const p = new URLSearchParams({ page: String(snapPage), limit: String(perPage), actionType: 'ROOM_STATUS_SNAPSHOT' })
    if (roomFilter) p.set('roomCode', roomFilter)
    return `/api/maintenance?${p}`
  })()

  const { data: resp, loading, error, refetch } = useFetch<PaginatedRecords>(apiUrl)
  const { data: snapResp, loading: snapLoading } = useFetch<PaginatedSnapshots>(snapApiUrl)

  const handleSaved = useCallback(() => { refetch(); setPage(1) }, [refetch])

  if (loading && activeTab === 'machines') return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>Đang tải dữ liệu…</div>
  if (error && activeTab === 'machines')   return <div style={{ padding: 60, textAlign: 'center', color: 'var(--err-tx)',    fontSize: 14 }}>Lỗi tải dữ liệu: {error}</div>

  const records    = resp?.data ?? []
  const total      = resp?.total ?? 0
  const totalPages = resp?.totalPages ?? 1
  const roomOpts   = [{ value: '', label: 'Tất cả phòng' }, ...(rooms ?? []).map(r => ({ value: r.roomCode, label: r.roomCode }))]

  const snaps      = snapResp?.data ?? []
  const snapTotal  = snapResp?.total ?? 0
  const snapTotalPages = snapResp?.totalPages ?? 1

  return (
    <div className="stack">
      {/* Toolbar */}
      <Card pad={16} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--surface-3)', borderRadius: 10 }}>
          {([['machines', 'Tình trạng máy'], ['rooms', 'Tình trạng phòng']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setActiveTab(k)} style={{
              padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 600,
              background: activeTab === k ? 'var(--surface)' : 'transparent',
              color: activeTab === k ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: activeTab === k ? 'var(--shadow-sm)' : 'none',
              transition: 'all .14s',
            }}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 600, marginLeft: 4 }}>
          <Icon name="filter" size={16} />Lọc
        </div>
        <select value={roomFilter} onChange={e => { setRoomFilter(e.target.value); setPage(1); setSnapPage(1) }}
          style={{ height: 36, border: '1px solid var(--border-strong)', borderRadius: 9, padding: '0 12px', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}>
          {roomOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {activeTab === 'machines' && (
          <Button variant="primary" icon="plus" style={{ marginLeft: 'auto' }} onClick={() => setCreateOpen(true)}>
            Ghi nhận mới
          </Button>
        )}
      </Card>

      {/* Bảng tình trạng máy */}
      {activeTab === 'machines' && (
      <Card pad={0}>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 22, whiteSpace: 'nowrap' }}>Mã / Ngày tạo</th>
                <th style={{ whiteSpace: 'nowrap' }}>Phòng · Máy</th>
                <th style={{ whiteSpace: 'nowrap' }}>Phát hiện lúc</th>
                <th style={{ whiteSpace: 'nowrap' }}>Người báo</th>
                <th style={{ whiteSpace: 'nowrap' }}>KTV ghi nhận</th>
                <th>Mô tả tình trạng</th>
                <th style={{ width: 70, textAlign: 'center', whiteSpace: 'nowrap' }}>Ảnh</th>
                <th style={{ width: 56 }}></th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-faint)', fontSize: 13.5 }}>
                    Chưa có bản ghi nào. Nhấn &quot;Ghi nhận mới&quot; để bắt đầu.
                  </td>
                </tr>
              )}
              {records.map(r => {
                const images = parseImageUrls(r.imageUrls)
                return (
                  <tr key={r.id} className="trow" style={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>
                    <td style={{ paddingLeft: 22, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600 }}>{recordId(r)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{fmtDate(r.createdAt)}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Badge tone="muted">{r.room?.roomCode ?? '—'}</Badge>
                      <span style={{ marginLeft: 6, fontSize: 13, color: 'var(--text-muted)' }}>Máy {r.machineNo}</span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                      {new Date(r.reportedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.reportedBy ?? '—'}</td>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{r.technician?.name ?? '—'}</td>
                    <td style={{ maxWidth: 260 }}>
                      <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                        {r.description}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {images.length > 0
                        ? <Badge tone="info" icon="camera">{images.length}</Badge>
                        : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="icon-btn" title="Xem chi tiết" onClick={() => setDetail(r)} style={{ color: 'var(--primary)' }}>
                        <Icon name="arrowR" size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
            {total === 0 ? '0 bản ghi' : `Hiển thị ${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} / ${total} bản ghi`}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="icon-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ opacity: page === 1 ? .4 : 1 }}>
              <Icon name="chevronL" size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => setPage(i + 1)} className="icon-btn"
                style={{ width: 36, fontWeight: 600, fontSize: 13, ...(page === i + 1 ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : {}) }}>
                {i + 1}
              </button>
            ))}
            <button className="icon-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} style={{ opacity: page === totalPages ? .4 : 1 }}>
              <Icon name="chevronR" size={16} />
            </button>
          </div>
        </div>
      </Card>
      )}

      {/* Bảng tình trạng phòng (snapshots) */}
      {activeTab === 'rooms' && (
      <Card pad={0}>
        {snapLoading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13.5 }}>Đang tải…</div>
        ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 22, whiteSpace: 'nowrap' }}>Mã / Ngày</th>
                <th style={{ whiteSpace: 'nowrap' }}>Phòng</th>
                <th>Tình trạng máy</th>
                <th style={{ whiteSpace: 'nowrap' }}>Người ghi nhận</th>
              </tr>
            </thead>
            <tbody>
              {snaps.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-faint)', fontSize: 13.5 }}>
                    Chưa có bản ghi tình trạng phòng nào.
                  </td>
                </tr>
              )}
              {snaps.map(s => {
                const creator = s.technicianName ?? s.createdBy?.profile?.displayName ?? s.createdBy?.username ?? '—'
                return (
                  <tr key={s.id} className="trow">
                    <td style={{ paddingLeft: 22, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600, color: 'var(--primary)' }}>GSN-{String(s.id).padStart(4, '0')}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{fmtDate(s.maintenanceDate)}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Badge tone="info">{s.room?.roomCode ?? '—'}</Badge>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 340 }}>
                      {s.notes ?? '—'}
                    </td>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{creator}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
            {snapTotal === 0 ? '0 bản ghi' : `Hiển thị ${(snapPage - 1) * perPage + 1}–${Math.min(snapPage * perPage, snapTotal)} / ${snapTotal} bản ghi`}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="icon-btn" disabled={snapPage === 1} onClick={() => setSnapPage(p => p - 1)} style={{ opacity: snapPage === 1 ? .4 : 1 }}>
              <Icon name="chevronL" size={16} />
            </button>
            {Array.from({ length: snapTotalPages }, (_, i) => (
              <button key={i} onClick={() => setSnapPage(i + 1)} className="icon-btn"
                style={{ width: 36, fontWeight: 600, fontSize: 13, ...(snapPage === i + 1 ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : {}) }}>
                {i + 1}
              </button>
            ))}
            <button className="icon-btn" disabled={snapPage === snapTotalPages} onClick={() => setSnapPage(p => p + 1)} style={{ opacity: snapPage === snapTotalPages ? .4 : 1 }}>
              <Icon name="chevronR" size={16} />
            </button>
          </div>
        </div>
      </Card>
      )}

      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} onSaved={handleSaved} />
      <DetailSheet record={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
