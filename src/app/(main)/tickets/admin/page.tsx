'use client'
import { useState, useCallback } from 'react'
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
  urgentReason: string | null
  createdAt: string
  room: { roomCode: string } | null
  createdBy: { id: number; username: string; profile: { displayName: string } | null } | null
  assignedTo: { id: number; name: string } | null
  replies: { id: number; createdAt: string }[]
}

interface PageData { data: Ticket[]; total: number; page: number; totalPages: number }
interface ApiTech  { id: number; name: string }

const STATUS_LABELS: Record<TicketStatus, string> = {
  PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', IN_PROGRESS: 'Đang xử lý', RESOLVED: 'Đã xử lý',
}
const STATUS_TONES: Record<TicketStatus, string> = {
  PENDING: 'both', APPROVED: 'info', REJECTED: 'err', IN_PROGRESS: 'teacher', RESOLVED: 'good',
}
const STATUS_CHIP: Record<TicketStatus | '', { dot: string; activeBg: string; activeBorder: string; shadow: string }> = {
  '':          { dot: 'var(--primary)',  activeBg: 'var(--primary)',  activeBorder: 'var(--primary)',  shadow: 'rgba(59,130,246,.35)' },
  PENDING:     { dot: 'var(--both)',     activeBg: 'var(--both)',     activeBorder: 'var(--both)',     shadow: 'rgba(168,85,247,.35)' },
  APPROVED:    { dot: 'var(--primary)',  activeBg: 'var(--primary)',  activeBorder: 'var(--primary)',  shadow: 'rgba(59,130,246,.35)' },
  REJECTED:    { dot: 'var(--err)',      activeBg: 'var(--err)',      activeBorder: 'var(--err)',      shadow: 'rgba(239,68,68,.35)'  },
  IN_PROGRESS: { dot: 'var(--teacher)', activeBg: 'var(--teacher)', activeBorder: 'var(--teacher)', shadow: 'rgba(6,182,212,.35)'  },
  RESOLVED:    { dot: 'var(--good)',     activeBg: 'var(--good)',     activeBorder: 'var(--good)',     shadow: 'rgba(34,197,94,.35)'  },
}
const SEVERITY_LABELS: Record<TicketSeverity, string> = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', CRITICAL: 'Khẩn cấp' }
const SEVERITY_TONES:  Record<TicketSeverity, string> = { LOW: 'good', MEDIUM: 'soft', HIGH: 'both', CRITICAL: 'err' }

function fmtDt(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

// ── ReplySheet ─────────────────────────────────────────────────────────────
function ReplySheet({ ticket, techs, open, onClose, onSaved }: {
  ticket: Ticket | null; techs: ApiTech[]; open: boolean; onClose: () => void; onSaved: () => void
}) {
  const [content,      setContent]      = useState('')
  const [statusChange, setStatusChange] = useState<TicketStatus | ''>('')
  const [assignTechId, setAssignTechId] = useState('')
  const [saving,       setSaving]       = useState(false)
  const [errMsg,       setErrMsg]       = useState('')

  const handleSave = async () => {
    if (!ticket) return
    if (!content.trim()) { setErrMsg('Vui lòng nhập nội dung phản hồi'); return }
    setSaving(true); setErrMsg('')
    try {
      const res = await csrfFetch(`/api/tickets/${ticket.id}/reply`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          content:            content.trim(),
          statusChange:       statusChange || null,
          assignToTechnicianId: assignTechId ? Number(assignTechId) : null,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErrMsg(d.error ?? 'Lỗi khi gửi'); return }
      toast.success('Đã gửi phản hồi')
      setContent(''); setStatusChange(''); setAssignTechId(''); setErrMsg('')
      onSaved(); onClose()
    } finally { setSaving(false) }
  }

  const sel = { width: '100%', height: 38, border: '1px solid var(--border-strong)', borderRadius: 10, padding: '0 12px', fontFamily: 'var(--font)', fontSize: 13.5, background: 'var(--surface)', color: 'var(--text)' }

  return (
    <Sheet open={open} onClose={onClose} width={500}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Phản hồi ticket #{ticket?.id}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket?.title}</div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Đổi trạng thái (tùy chọn)">
          <select value={statusChange} onChange={e => setStatusChange(e.target.value as TicketStatus | '')} style={sel}>
            <option value="">— Giữ nguyên trạng thái —</option>
            <option value="APPROVED">Duyệt</option>
            <option value="REJECTED">Từ chối</option>
            <option value="IN_PROGRESS">Chuyển sang Đang xử lý</option>
            <option value="RESOLVED">Đánh dấu Đã xử lý</option>
          </select>
        </Field>
        <Field label="Gán kỹ thuật viên (tùy chọn)">
          <select value={assignTechId} onChange={e => setAssignTechId(e.target.value)} style={sel}>
            <option value="">— Không gán / Giữ nguyên —</option>
            {techs.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Nội dung phản hồi *">
          <textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder="Nhập phản hồi cho người dùng..." rows={5}
            style={{ ...sel, height: 'auto', padding: '10px 12px', resize: 'vertical' }} />
        </Field>
        {errMsg && <div style={{ color: 'var(--err)', fontSize: 13, background: 'rgba(239,68,68,.07)', padding: '8px 12px', borderRadius: 8 }}>{errMsg}</div>}
      </div>
      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Hủy</Button>
        <Button onClick={handleSave} disabled={saving} icon={saving ? 'refresh' : 'send'}>
          {saving ? 'Đang gửi...' : 'Gửi phản hồi'}
        </Button>
      </div>
    </Sheet>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function TicketsAdminPage() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('')
  const [urgentOnly,   setUrgentOnly]   = useState(false)
  const [page, setPage] = useState(1)
  const [replyTicket,  setReplyTicket]  = useState<Ticket | null>(null)
  const [tick, setTick] = useState(0)

  const params = new URLSearchParams({ page: String(page), limit: '20' })
  if (statusFilter) params.set('status', statusFilter)
  if (urgentOnly)   params.set('isUrgent', 'true')

  const { data, loading, refetch } = useFetch<PageData>(`/api/tickets?${params.toString()}&_t=${tick}`)
  const { data: techs }            = useFetch<ApiTech[]>('/api/technicians')

  const reload = useCallback(() => { setTick(t => t + 1); refetch() }, [refetch])

  const tickets   = data?.data      ?? []
  const total     = data?.total     ?? 0
  const totalPages = data?.totalPages ?? 1

  const pendingCount = tickets.filter(t => t.status === 'PENDING').length

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Quản lý Ticker</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-faint)' }}>
            {total} ticket tổng • {pendingCount > 0 ? <><span style={{ color: 'var(--warn)' }}>{pendingCount} chờ duyệt</span></> : 'Không có ticket chờ duyệt'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={urgentOnly} onChange={e => { setUrgentOnly(e.target.checked); setPage(1) }} />
            Chỉ khẩn cấp
          </label>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['', 'PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'RESOLVED'] as const).map(s => {
          const isActive = statusFilter === s
          const chip = STATUS_CHIP[s]
          return (
            <button key={s}
              onClick={() => { setStatusFilter(s as TicketStatus | ''); setPage(1) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                fontFamily: 'var(--font)', fontSize: 15, fontWeight: isActive ? 600 : 500,
                padding: '7px 16px', borderRadius: 99,
                border: `1.5px solid ${isActive ? chip.activeBorder : 'var(--border-strong)'}`,
                background: isActive ? chip.activeBg : 'var(--surface)',
                color: isActive ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer', whiteSpace: 'nowrap' as const, userSelect: 'none' as const,
                transition: 'all .18s ease',
                boxShadow: isActive ? `0 3px 10px -2px ${chip.shadow}` : 'none',
                lineHeight: 1,
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: isActive ? 'rgba(255,255,255,.7)' : chip.dot,
                display: 'inline-block',
              }} />
              {s === '' ? 'Tất cả' : STATUS_LABELS[s as TicketStatus]}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-faint)' }}>Đang tải...</div>
      ) : tickets.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ color: 'var(--text-faint)', fontSize: 14 }}>Không có ticket{statusFilter ? ` với trạng thái "${STATUS_LABELS[statusFilter as TicketStatus]}"` : ''}</div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tickets.map(t => (
            <Card key={t.id} style={{ borderLeft: t.isUrgent ? '4px solid var(--err)' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => router.push(`/tickets/${t.id}`)}
                      style={{ fontWeight: 700, fontSize: 15, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', textAlign: 'left', padding: 0 }}>
                      #{t.id} — {t.title}
                    </button>
                    {t.isUrgent && <Badge tone="err">Khẩn</Badge>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {t.description}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Badge tone={STATUS_TONES[t.status] as never}>{STATUS_LABELS[t.status]}</Badge>
                    <Badge tone={SEVERITY_TONES[t.severity] as never}>{SEVERITY_LABELS[t.severity]}</Badge>
                    {t.room && <Badge tone="soft">P.{t.room.roomCode}</Badge>}
                    {t.machineNo && <Badge tone="soft">Máy {t.machineNo}</Badge>}
                    {t.assignedTo
                      ? <Badge tone="muted">KTV: {t.assignedTo.name}</Badge>
                      : <Badge tone="muted">Chưa gán KTV</Badge>
                    }
                    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                      Từ: {t.createdBy?.profile?.displayName ?? t.createdBy?.username ?? '?'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'right' }}>{fmtDt(t.createdAt)}</div>
                  {t.replies.length > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{t.replies.length} phản hồi</div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button size="sm" variant="ghost" onClick={() => router.push(`/tickets/${t.id}`)}>
                      Xem
                    </Button>
                    <Button size="sm" onClick={() => setReplyTicket(t)} icon="send">
                      Phản hồi
                    </Button>
                  </div>
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

      <ReplySheet
        ticket={replyTicket}
        techs={techs ?? []}
        open={replyTicket !== null}
        onClose={() => setReplyTicket(null)}
        onSaved={reload}
      />
    </div>
  )
}
