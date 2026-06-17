'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useFetch } from '@/lib/use-fetch'
import { csrfFetch } from '@/lib/csrf'
import { Card, Button, Badge, Sheet, Field } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'
import { toast } from 'sonner'

type TicketStatus   = 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'RESOLVED'
type TicketSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

interface Ticket {
  id: number
  title: string
  description: string
  roomId: number | null
  machineNo: number | null
  severity: TicketSeverity
  status: TicketStatus
  isUrgent: boolean
  createdAt: string
  updatedAt: string
  hasUnreadReply?: boolean
  room: { roomCode: string } | null
  createdBy: { id: number; username: string; profile: { displayName: string } | null } | null
  assignedTo: { id: number; name: string } | null
  replies: { id: number; createdAt: string }[]
}

interface PageData { data: Ticket[]; total: number; page: number; totalPages: number }
interface UserProfile { id: number; role: string; profile: { displayName: string } | null }
interface ApiRoom { id: number; roomCode: string }

const STATUS_LABELS: Record<TicketStatus, string> = {
  PENDING:     'Chờ duyệt',
  APPROVED:    'Đã duyệt',
  REJECTED:    'Từ chối',
  IN_PROGRESS: 'Đang xử lý',
  RESOLVED:    'Đã xử lý',
}
const STATUS_TONES: Record<TicketStatus, string> = {
  PENDING:     'both',
  APPROVED:    'info',
  REJECTED:    'err',
  IN_PROGRESS: 'teacher',
  RESOLVED:    'good',
}
const SEVERITY_LABELS: Record<TicketSeverity, string> = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', CRITICAL: 'Khẩn cấp' }
const SEVERITY_TONES:  Record<TicketSeverity, string> = { LOW: 'good', MEDIUM: 'soft', HIGH: 'both', CRITICAL: 'err' }

function fmtDt(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

// ── CreateSheet ────────────────────────────────────────────────────────────
function CreateSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [roomId,      setRoomId]      = useState('')
  const [machineNo,   setMachineNo]   = useState('')
  const [severity,    setSeverity]    = useState<TicketSeverity>('MEDIUM')
  const [isUrgent,    setIsUrgent]    = useState(false)
  const [urgentReason, setUrgentReason] = useState('')
  const [imageUrls,   setImageUrls]   = useState<string[]>([])
  const [uploading,   setUploading]   = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [errMsg,      setErrMsg]      = useState('')

  const { data: rooms } = useFetch<ApiRoom[]>('/api/rooms')

  useEffect(() => {
    if (!open) {
      setTitle(''); setDescription(''); setRoomId(''); setMachineNo('')
      setSeverity('MEDIUM'); setIsUrgent(false); setUrgentReason(''); setImageUrls([]); setErrMsg('')
    }
  }, [open])

  const handleUpload = async (files: FileList) => {
    if (imageUrls.length + files.length > 5) { toast.error('Tối đa 5 ảnh'); return }
    setUploading(true)
    const fd = new FormData()
    Array.from(files).forEach(f => fd.append('files', f))
    try {
      const res = await csrfFetch('/api/upload/ticket-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Upload thất bại'); return }
      setImageUrls(prev => [...prev, ...data.urls])
    } finally { setUploading(false) }
  }

  const handleSave = async () => {
    if (!title.trim())       { setErrMsg('Vui lòng nhập tiêu đề'); return }
    if (!description.trim()) { setErrMsg('Vui lòng nhập mô tả'); return }
    if (isUrgent && !urgentReason.trim()) { setErrMsg('Vui lòng nhập lý do khẩn cấp'); return }
    setSaving(true); setErrMsg('')
    try {
      const res = await csrfFetch('/api/tickets', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:       title.trim(),
          description: description.trim(),
          roomId:      roomId  ? Number(roomId)  : null,
          machineNo:   machineNo ? Number(machineNo) : null,
          severity,
          isUrgent,
          urgentReason: isUrgent ? urgentReason.trim() : null,
          imageUrls,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErrMsg(d.error ?? 'Lỗi khi lưu'); return }
      toast.success('Đã gửi ticket — chờ ADMIN/Quản lý duyệt')
      onSaved(); onClose()
    } finally { setSaving(false) }
  }

  const roomOpts = (rooms ?? []).map(r => ({ value: String(r.id), label: r.roomCode }))
  const sel = { width: '100%', height: 38, border: '1px solid var(--border-strong)', borderRadius: 10, padding: '0 12px', fontFamily: 'var(--font)', fontSize: 13.5, background: 'var(--surface)', color: 'var(--text)' }

  return (
    <Sheet open={open} onClose={onClose} width={540}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Tạo ticket báo lỗi</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>Mô tả sự cố để được hỗ trợ kỹ thuật</div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Tiêu đề *">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="VD: Máy 12 P.B202 không lên màn hình"
            style={{ ...sel, padding: '0 12px' }} maxLength={200} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Phòng máy">
            <select value={roomId} onChange={e => setRoomId(e.target.value)} style={sel}>
              <option value="">— Chọn phòng —</option>
              {roomOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Số máy">
            <input value={machineNo} onChange={e => setMachineNo(e.target.value)} placeholder="VD: 12" type="number" min="1"
              style={{ ...sel, padding: '0 12px' }} />
          </Field>
        </div>

        <Field label="Mức độ nghiêm trọng">
          <select value={severity} onChange={e => setSeverity(e.target.value as TicketSeverity)} style={sel}>
            <option value="LOW">Thấp</option>
            <option value="MEDIUM">Trung bình</option>
            <option value="HIGH">Cao</option>
            <option value="CRITICAL">Khẩn cấp</option>
          </select>
        </Field>

        <Field label="Mô tả chi tiết *">
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Mô tả chi tiết sự cố: máy hư hỏng như thế nào, khi nào xảy ra..."
            rows={4} style={{ ...sel, height: 'auto', padding: '10px 12px', resize: 'vertical' }} />
        </Field>

        {/* Khẩn cấp */}
        <div style={{ background: 'var(--err-soft, rgba(239,68,68,.07))', border: '1px solid rgba(239,68,68,.2)', borderRadius: 12, padding: '14px 16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={isUrgent} onChange={e => setIsUrgent(e.target.checked)} style={{ width: 16, height: 16 }} />
            <span style={{ fontWeight: 600, color: 'var(--err)' }}>Đánh dấu khẩn cấp — gửi email thông báo ngay</span>
          </label>
          {isUrgent && (
            <textarea value={urgentReason} onChange={e => setUrgentReason(e.target.value)}
              placeholder="Lý do khẩn cấp: VD: Buổi chiều có 60 SV thi, không có máy dự phòng..."
              rows={2} style={{ ...sel, height: 'auto', padding: '8px 12px', marginTop: 10, resize: 'vertical', border: '1px solid var(--err)' }} />
          )}
        </div>

        {/* Upload ảnh */}
        <Field label={`Ảnh đính kèm (${imageUrls.length}/5)`}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {imageUrls.map((url, i) => (
              <div key={i} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                <button onClick={() => setImageUrls(prev => prev.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 99, background: 'var(--err)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, display: 'grid', placeItems: 'center' }}>×</button>
              </div>
            ))}
            {imageUrls.length < 5 && (
              <label style={{ width: 64, height: 64, border: '2px dashed var(--border)', borderRadius: 8, display: 'grid', placeItems: 'center', cursor: uploading ? 'wait' : 'pointer', color: 'var(--text-faint)' }}>
                {uploading ? <Icon name="refresh" size={20} /> : <Icon name="camera" size={20} />}
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => e.target.files && handleUpload(e.target.files)} />
              </label>
            )}
          </div>
        </Field>

        {errMsg && <div style={{ color: 'var(--err)', fontSize: 13, background: 'rgba(239,68,68,.07)', padding: '8px 12px', borderRadius: 8 }}>{errMsg}</div>}
      </div>

      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Hủy</Button>
        <Button onClick={handleSave} disabled={saving} icon={saving ? 'refresh' : 'plus'}>
          {saving ? 'Đang gửi...' : 'Gửi ticket'}
        </Button>
      </div>
    </Sheet>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function TicketsPage() {
  const router = useRouter()
  const [userInfo, setUserInfo] = useState<UserProfile | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    fetch('/api/auth/profile').then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setUserInfo(d)
        if (d.role === 'ADMIN' || d.role === 'MANAGER') {
          router.replace('/tickets/admin')
        }
      }
    })
  }, [router])

  const params = new URLSearchParams({ page: String(page), limit: '20' })
  if (statusFilter) params.set('status', statusFilter)

  const { data, loading, refetch } = useFetch<PageData>(
    `/api/tickets?${params.toString()}&_t=${tick}`
  )

  const reload = useCallback(() => { setTick(t => t + 1); refetch() }, [refetch])

  if (!userInfo) return null
  if (userInfo.role === 'ADMIN' || userInfo.role === 'MANAGER') return null

  const tickets = data?.data ?? []
  const totalPages = data?.totalPages ?? 1

  const hasUnread = tickets.some(t => t.hasUnreadReply)

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Ticket của tôi</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-faint)' }}>
            {userInfo.role === 'GUEST' ? 'Tạo và theo dõi yêu cầu hỗ trợ kỹ thuật' : 'Ticket được giao và tạo bởi bạn'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {hasUnread && (
            <Badge tone="err">Có phản hồi mới</Badge>
          )}
          <Button icon="plus" onClick={() => setCreateOpen(true)}>Tạo ticket mới</Button>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['', 'PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'RESOLVED'] as const).map(s => {
          const isActive = statusFilter === s
          const dotColor: Record<string, string> = {
            '': 'var(--primary)', PENDING: 'var(--both)', APPROVED: 'var(--primary)',
            REJECTED: 'var(--err)', IN_PROGRESS: 'var(--teacher)', RESOLVED: 'var(--good)',
          }
          const activeBg: Record<string, string> = {
            '': 'var(--primary)', PENDING: 'var(--both)', APPROVED: 'var(--primary)',
            REJECTED: 'var(--err)', IN_PROGRESS: 'var(--teacher)', RESOLVED: 'var(--good)',
          }
          return (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                fontFamily: 'var(--font)', fontSize: 15, fontWeight: isActive ? 600 : 500,
                padding: '7px 16px', borderRadius: 99,
                border: `1.5px solid ${isActive ? activeBg[s] : 'var(--border-strong)'}`,
                background: isActive ? activeBg[s] : 'var(--surface)',
                color: isActive ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer', whiteSpace: 'nowrap' as const, userSelect: 'none' as const,
                transition: 'all .18s ease', lineHeight: 1,
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                background: isActive ? 'rgba(255,255,255,.7)' : dotColor[s],
              }} />
              {s === '' ? 'Tất cả' : STATUS_LABELS[s as TicketStatus]}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
          <Icon name="refresh" size={28} style={{ marginBottom: 12, opacity: 0.4, animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 12px' }} />
          <div>Đang tải dữ liệu...</div>
        </div>
      ) : tickets.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <Icon name="ticket" size={40} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
          <div style={{ color: 'var(--text-faint)', fontSize: 14 }}>Chưa có ticket nào{statusFilter ? ' với trạng thái này' : ''}</div>
          <Button onClick={() => setCreateOpen(true)} style={{ marginTop: 16 }} icon="plus">Tạo ticket đầu tiên</Button>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tickets.map(t => (
            <Card key={t.id} style={{ cursor: 'pointer', transition: 'box-shadow .15s' }}>
              <div onClick={() => router.push(`/tickets/${t.id}`)} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{t.title}</span>
                    {t.isUrgent && <Badge tone="err">Khẩn</Badge>}
                    {t.hasUnreadReply && <Badge tone="err">Mới</Badge>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.description}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Badge tone={STATUS_TONES[t.status] as never}>{STATUS_LABELS[t.status]}</Badge>
                    <Badge tone={SEVERITY_TONES[t.severity] as never}>{SEVERITY_LABELS[t.severity]}</Badge>
                    {t.room && <Badge tone="soft">P.{t.room.roomCode}</Badge>}
                    {t.machineNo && <Badge tone="soft">Máy {t.machineNo}</Badge>}
                    {t.assignedTo && <Badge tone="muted">KTV: {t.assignedTo.name}</Badge>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>#{t.id}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>{fmtDt(t.createdAt)}</div>
                  {t.replies.length > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>
                      <Icon name="comment" size={11} /> {t.replies.length} phản hồi
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trước</Button>
          <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-faint)' }}>Trang {page}/{totalPages}</span>
          <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Sau →</Button>
        </div>
      )}

      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} onSaved={reload} />
    </div>
  )
}
