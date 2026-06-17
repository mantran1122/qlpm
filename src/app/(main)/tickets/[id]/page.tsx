'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { csrfFetch } from '@/lib/csrf'
import { Card, Button, Badge } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'
import { toast } from 'sonner'

type TicketStatus   = 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'RESOLVED'
type TicketSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

interface TicketReply {
  id: number
  content: string
  statusChange: TicketStatus | null
  createdAt: string
  createdBy: { id: number; username: string; role: string; profile: { displayName: string } | null } | null
}

interface TicketDetail {
  id: number
  title: string
  description: string
  roomId: number | null
  machineNo: number | null
  severity: TicketSeverity
  status: TicketStatus
  isUrgent: boolean
  urgentReason: string | null
  imageUrls: string | null
  createdAt: string
  updatedAt: string
  room: { roomCode: string; floor: { name: string } | null } | null
  createdBy: { id: number; username: string; profile: { displayName: string; phone: string | null } | null } | null
  assignedTo: { id: number; name: string; phone: string | null } | null
  replies: TicketReply[]
}

interface UserProfile { id: number; role: string; profile: { displayName: string } | null }

const STATUS_LABELS: Record<TicketStatus, string> = {
  PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', IN_PROGRESS: 'Đang xử lý', RESOLVED: 'Đã xử lý',
}
const STATUS_TONES: Record<TicketStatus, string> = {
  PENDING: 'both', APPROVED: 'info', REJECTED: 'err', IN_PROGRESS: 'teacher', RESOLVED: 'good',
}
const SEVERITY_LABELS: Record<TicketSeverity, string> = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', CRITICAL: 'Khẩn cấp' }

function fmtDt(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

function getRoleLabel(role: string) {
  const map: Record<string, string> = { ADMIN: 'Admin', MANAGER: 'Quản lý', TECHNICIAN: 'KTV', GUEST: 'Người dùng' }
  return map[role] ?? role
}

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [ticket,    setTicket]    = useState<TicketDetail | null>(null)
  const [userInfo,  setUserInfo]  = useState<UserProfile | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)

  const [replyContent, setReplyContent] = useState('')
  const [statusChange, setStatusChange] = useState<TicketStatus | ''>('')
  const [sending,      setSending]      = useState(false)
  const [replyErr,     setReplyErr]     = useState('')

  const loadTicket = async () => {
    setLoading(true)
    const res = await fetch(`/api/tickets/${id}`)
    if (res.status === 404 || res.status === 403) { setNotFound(true); setLoading(false); return }
    if (res.ok) { setTicket(await res.json()) }
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/auth/profile').then(r => r.ok ? r.json() : null).then(d => { if (d) setUserInfo(d) })
    loadTicket()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleReply = async () => {
    if (!replyContent.trim()) { setReplyErr('Vui lòng nhập nội dung'); return }
    setSending(true); setReplyErr('')
    try {
      const res = await csrfFetch(`/api/tickets/${id}/reply`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          content:      replyContent.trim(),
          statusChange: statusChange || null,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setReplyErr(d.error ?? 'Lỗi khi gửi'); return }
      toast.success('Đã gửi phản hồi')
      setReplyContent(''); setStatusChange('')
      loadTicket()
    } finally { setSending(false) }
  }

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
      <Icon name="refresh" size={28} style={{ marginBottom: 12, opacity: 0.4, animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 12px' }} />
      <div>Đang tải dữ liệu...</div>
    </div>
  )
  if (notFound) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <Icon name="alert" size={28} style={{ color: 'var(--err)', display: 'block', margin: '0 auto 12px' }} />
      <div style={{ color: 'var(--err-tx)', fontSize: 14, marginBottom: 16 }}>Không tìm thấy ticket hoặc bạn không có quyền xem.</div>
      <Button onClick={() => router.back()} variant="outline" size="sm" icon="chevronL">Quay lại</Button>
    </div>
  )
  if (!ticket || !userInfo) return null

  const role = userInfo.role
  const isAdmin   = role === 'ADMIN' || role === 'MANAGER'
  const isTech    = role === 'TECHNICIAN'
  const isGuest   = role === 'GUEST'
  const canReply  = isAdmin || isTech

  const imageList: string[] = ticket.imageUrls ? JSON.parse(ticket.imageUrls) : []

  const TECH_STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
    { value: 'IN_PROGRESS', label: 'Nhận việc – Đang xử lý' },
    { value: 'RESOLVED',    label: 'Đã xử lý xong' },
  ]
  const ADMIN_STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
    { value: 'APPROVED',    label: 'Duyệt' },
    { value: 'REJECTED',    label: 'Từ chối' },
    { value: 'IN_PROGRESS', label: 'Chuyển sang Đang xử lý' },
    { value: 'RESOLVED',    label: 'Đánh dấu Đã xử lý' },
  ]
  const statusOptions = isAdmin ? ADMIN_STATUS_OPTIONS : TECH_STATUS_OPTIONS

  const sel = { width: '100%', height: 38, border: '1px solid var(--border-strong)', borderRadius: 10, padding: '0 12px', fontFamily: 'var(--font)', fontSize: 13.5, background: 'var(--surface)', color: 'var(--text)' }

  return (
    <div className="stack">
      {/* Back */}
      <div>
        <button onClick={() => router.back()} className="icon-btn" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-faint)' }}>
          <Icon name="chevronL" size={16} /> Quay lại danh sách
        </button>
      </div>

      {/* Header */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>#{ticket.id}</span>
              <Badge tone={STATUS_TONES[ticket.status] as never}>{STATUS_LABELS[ticket.status]}</Badge>
              {ticket.isUrgent && <Badge tone="err">Khẩn cấp</Badge>}
              <Badge tone="soft">{SEVERITY_LABELS[ticket.severity]}</Badge>
            </div>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 700 }}>{ticket.title}</h2>
            <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--text-faint)', lineHeight: 1.6 }}>{ticket.description}</p>
            {ticket.isUrgent && ticket.urgentReason && (
              <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--err)' }}>
                <strong>Lý do khẩn:</strong> {ticket.urgentReason}
              </div>
            )}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text-faint)' }}>
              {ticket.room && <span>Phòng: <strong>{ticket.room.roomCode}</strong>{ticket.room.floor ? ` (${ticket.room.floor.name})` : ''}</span>}
              {ticket.machineNo && <span>Máy: <strong>{ticket.machineNo}</strong></span>}
              <span>Tạo: {fmtDt(ticket.createdAt)}</span>
              <span>Bởi: {ticket.createdBy?.profile?.displayName ?? ticket.createdBy?.username ?? '?'}</span>
              {ticket.assignedTo && <span>KTV: <strong>{ticket.assignedTo.name}</strong>{ticket.assignedTo.phone ? ` · ${ticket.assignedTo.phone}` : ''}</span>}
            </div>
          </div>
        </div>

        {/* Ảnh đính kèm */}
        {imageList.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {imageList.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt={`Ảnh ${i + 1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
              </a>
            ))}
          </div>
        )}
      </Card>

      {/* Timeline replies */}
      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--text-faint)' }}>
          Lịch sử phản hồi ({ticket.replies.length})
        </div>
        {ticket.replies.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '12px 0' }}>Chưa có phản hồi nào.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ticket.replies.map(r => {
              const name = r.createdBy?.profile?.displayName ?? r.createdBy?.username ?? '?'
              const rRole = r.createdBy?.role ?? ''
              return (
                <div key={r.id} style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 99, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    {name.trim().slice(-1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{name}</span>
                      <Badge tone="muted">{getRoleLabel(rRole)}</Badge>
                      {r.statusChange && <Badge tone={STATUS_TONES[r.statusChange] as never}>→ {STATUS_LABELS[r.statusChange]}</Badge>}
                      <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{fmtDt(r.createdAt)}</span>
                    </div>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {r.content}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Reply form — chỉ hiển thị cho ADMIN/MANAGER/TECHNICIAN */}
      {canReply && (
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 14 }}>Gửi phản hồi</div>
          {isTech && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-faint)', display: 'block', marginBottom: 6 }}>Đổi trạng thái (tùy chọn)</label>
              <select value={statusChange} onChange={e => setStatusChange(e.target.value as TicketStatus | '')} style={sel}>
                <option value="">— Giữ nguyên —</option>
                {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {isAdmin && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-faint)', display: 'block', marginBottom: 6 }}>Đổi trạng thái (tùy chọn)</label>
              <select value={statusChange} onChange={e => setStatusChange(e.target.value as TicketStatus | '')} style={sel}>
                <option value="">— Giữ nguyên —</option>
                {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <textarea value={replyContent} onChange={e => setReplyContent(e.target.value)}
              placeholder="Nhập nội dung phản hồi..." rows={4}
              style={{ ...sel, height: 'auto', padding: '10px 12px', resize: 'vertical', width: '100%' }} />
          </div>
          {replyErr && <div style={{ color: 'var(--err)', fontSize: 13, marginBottom: 8 }}>{replyErr}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={handleReply} disabled={sending} icon={sending ? 'refresh' : 'send'}>
              {sending ? 'Đang gửi...' : 'Gửi phản hồi'}
            </Button>
          </div>
        </Card>
      )}

      {/* Thông báo GUEST: không thể reply */}
      {isGuest && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', fontSize: 13, color: 'var(--text-faint)', textAlign: 'center' }}>
          Theo dõi phản hồi từ đội kỹ thuật tại đây. Phản hồi mới sẽ xuất hiện khi bạn tải lại trang.
          <div style={{ marginTop: 8 }}>
            <Button size="sm" variant="ghost" onClick={loadTicket} icon="refresh">Tải lại</Button>
          </div>
        </div>
      )}
    </div>
  )
}
