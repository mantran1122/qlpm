'use client'
import { use, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useFetch } from '@/lib/use-fetch'
import { csrfFetch } from '@/lib/csrf'
import { Card, CardHead, Button, Badge } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────
type RecallType = 'RECALL_FOR_REPAIR' | 'RECALL_STILL_USABLE' | 'RETURN_AFTER_REPAIR'
type RecallComplexity = 'LOW' | 'MEDIUM' | 'HIGH'

interface RecallDetail {
  id: number
  machineNo: number
  recallType: RecallType
  complexity: RecallComplexity
  recalledAt: string
  repairStartedAt: string | null
  repairFinishedAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  machine:              { machineNo: number; isTeacher: boolean; isFaulty: boolean } | null
  room:                 { roomCode: string; floor: { name: string } | null } | null
  recalledBy:           { id: number; username: string; profile: { displayName: string } | null } | null
  recalledByTechnician: { id: number; name: string; phone: string | null } | null
  repairedBy:           { id: number; username: string; profile: { displayName: string } | null } | null
  repairedByTechnician: { id: number; name: string; phone: string | null } | null
  preRepairStatus:      { id: number; description: string; reportedAt: string; imageUrls: string | null; reportedBy: string | null } | null
  alerts:               { id: number; daysOverdue: number; sentAt: string; dismissedAt: string | null; dismissedById: number | null }[]
  maintenanceLogs:      { id: number; maintenanceDate: string; actionType: string | null; notes: string | null; technicianName: string | null; createdAt: string }[]
}

interface ApiTech { id: number; name: string }

// ── Helpers ────────────────────────────────────────────────────────────────
const RECALL_TYPE_LABELS: Record<RecallType, string> = {
  RECALL_FOR_REPAIR:   'Thu hồi để sửa',
  RECALL_STILL_USABLE: 'Thu hồi còn dùng được',
  RETURN_AFTER_REPAIR: 'Trả lại sau khi sửa',
}
const RECALL_TYPE_TONES: Record<RecallType, 'err' | 'good' | 'both' | 'muted' | 'info'> = {
  RECALL_FOR_REPAIR:   'err',
  RECALL_STILL_USABLE: 'both',
  RETURN_AFTER_REPAIR: 'good',
}
const COMPLEXITY_LABELS: Record<RecallComplexity, string> = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao' }
const COMPLEXITY_TONES:  Record<RecallComplexity, 'err' | 'good' | 'both' | 'muted' | 'info'> = { LOW: 'good', MEDIUM: 'both', HIGH: 'err' }

function fmtDt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

function diffMinutes(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
}

function fmtDuration(minutes: number) {
  if (minutes < 60)  return `${minutes} phút`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}g ${m}p` : `${h} giờ`
}

function displayName(user: { username: string; profile: { displayName: string } | null } | null, tech: { name: string } | null): string {
  if (tech) return tech.name
  if (user?.profile?.displayName) return user.profile.displayName
  return user?.username ?? '—'
}

// ── TimelineDot ────────────────────────────────────────────────────────────
function TimelineDot({ done, active }: { done: boolean; active?: boolean }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 99, flexShrink: 0,
      background: done ? 'var(--good)' : active ? 'var(--primary)' : 'var(--surface-3)',
      border: active ? '3px solid var(--primary-soft)' : '3px solid transparent',
      display: 'grid', placeItems: 'center',
    }}>
      {done
        ? <Icon name="checkCircle" size={18} style={{ color: '#fff' }} />
        : <Icon name="clock" size={16} style={{ color: active ? '#fff' : 'var(--text-faint)' }} />
      }
    </div>
  )
}

// ── StartRepairForm ────────────────────────────────────────────────────────
function StartRepairForm({ recordId, onDone }: { recordId: number; onDone: () => void }) {
  const [techId,          setTechId]          = useState('')
  const [repairStartedAt, setRepairStartedAt] = useState(new Date().toISOString().slice(0, 16))
  const [saving,          setSaving]          = useState(false)
  const { data: techs } = useFetch<ApiTech[]>('/api/technicians')

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await csrfFetch(`/api/recalls/${recordId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          repairStartedAt:       new Date(repairStartedAt).toISOString(),
          repairedByTechnicianId: techId ? Number(techId) : undefined,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Lỗi cập nhật'); return }
      toast.success('Đã bắt đầu sửa chữa')
      onDone()
    } finally { setSaving(false) }
  }

  const selectStyle = { height: 36, border: '1px solid var(--border-strong)', borderRadius: 9, padding: '0 12px', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', flex: 1 }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
      <div style={{ flex: '1 1 160px' }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 5 }}>KTV sửa chữa</div>
        <select value={techId} onChange={e => setTechId(e.target.value)} style={selectStyle}>
          <option value="">— Để trống (tự detect) —</option>
          {(techs ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div style={{ flex: '1 1 160px' }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 5 }}>Thời điểm bắt đầu</div>
        <div className="field" style={{ height: 36 }}>
          <Icon name="calendar" size={15} style={{ color: 'var(--text-faint)' }} />
          <input type="datetime-local" value={repairStartedAt} onChange={e => setRepairStartedAt(e.target.value)} />
        </div>
      </div>
      <Button variant="primary" icon="wrench" onClick={handleSave} disabled={saving}>
        {saving ? 'Đang lưu…' : 'Nhận sửa'}
      </Button>
    </div>
  )
}

// ── FinishRepairForm ───────────────────────────────────────────────────────
function FinishRepairForm({ recordId, onDone }: { recordId: number; onDone: () => void }) {
  const [repairFinishedAt, setRepairFinishedAt] = useState(new Date().toISOString().slice(0, 16))
  const [saving,           setSaving]           = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await csrfFetch(`/api/recalls/${recordId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ repairFinishedAt: new Date(repairFinishedAt).toISOString() }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Lỗi cập nhật'); return }
      toast.success('Đã đánh dấu hoàn thành sửa chữa')
      onDone()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
      <div style={{ flex: '1 1 180px' }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 5 }}>Thời điểm hoàn thành</div>
        <div className="field" style={{ height: 36 }}>
          <Icon name="calendar" size={15} style={{ color: 'var(--text-faint)' }} />
          <input type="datetime-local" value={repairFinishedAt} onChange={e => setRepairFinishedAt(e.target.value)} />
        </div>
      </div>
      <Button variant="primary" icon="checkCircle" onClick={handleSave} disabled={saving}>
        {saving ? 'Đang lưu…' : 'Đánh dấu hoàn thành'}
      </Button>
    </div>
  )
}

// ── DismissAlert ───────────────────────────────────────────────────────────
function DismissAlertBtn({ alertId, onDone }: { alertId: number; onDone: () => void }) {
  const [saving, setSaving] = useState(false)
  const handleDismiss = async () => {
    setSaving(true)
    try {
      const res = await csrfFetch(`/api/recalls/alerts/${alertId}/dismiss`, { method: 'PUT' })
      if (!res.ok) { toast.error('Không thể dismiss'); return }
      toast.success('Đã dismiss cảnh báo')
      onDone()
    } finally { setSaving(false) }
  }
  return (
    <button className="icon-btn" title="Dismiss cảnh báo này" onClick={handleDismiss} disabled={saving}
      style={{ color: 'var(--text-faint)', fontSize: 12 }}>
      <Icon name="x" size={14} />
    </button>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function RecallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router  = useRouter()
  const { data: record, loading, error, refetch } = useFetch<RecallDetail>(`/api/recalls/${id}`)
  const onDone = useCallback(() => refetch(), [refetch])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Đang tải…</div>
  if (error || !record) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <div style={{ color: 'var(--err-tx)', fontSize: 14 }}>Không tìm thấy bản ghi</div>
      <Button variant="outline" style={{ marginTop: 16 }} onClick={() => router.push('/recall')}>Quay lại</Button>
    </div>
  )

  const isForRepair    = record.recallType === 'RECALL_FOR_REPAIR'
  const canStartRepair = isForRepair && !record.repairStartedAt
  const canFinish      = isForRepair && !!record.repairStartedAt && !record.repairFinishedAt
  const isDone         = !!record.repairFinishedAt

  const activeAlerts   = record.alerts.filter(a => !a.dismissedAt)

  // Thời gian sửa
  const repairDuration = record.repairStartedAt && record.repairFinishedAt
    ? fmtDuration(diffMinutes(record.repairStartedAt, record.repairFinishedAt))
    : null
  const responseTime = record.repairStartedAt
    ? fmtDuration(diffMinutes(record.recalledAt, record.repairStartedAt))
    : null

  return (
    <div className="stack">
      {/* Back btn */}
      <div>
        <button className="icon-btn" onClick={() => router.push('/recall')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-faint)' }}>
          <Icon name="chevronL" size={16} /> Quay lại danh sách
        </button>
      </div>

      {/* Header */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>
                REC-{String(record.id).padStart(4, '0')}
              </div>
              <Badge tone={RECALL_TYPE_TONES[record.recallType]}>{RECALL_TYPE_LABELS[record.recallType]}</Badge>
              <Badge tone={COMPLEXITY_TONES[record.complexity]}>{COMPLEXITY_LABELS[record.complexity]}</Badge>
              {activeAlerts.length > 0 && (
                <Badge tone="err" icon="warning">{activeAlerts.length} cảnh báo quá hạn</Badge>
              )}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              {record.room?.roomCode} — Tầng {record.room?.floor?.name} · Máy {record.machineNo}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, fontSize: 12.5, color: 'var(--text-faint)' }}>
            <div>Tạo lúc: {fmtDt(record.createdAt)}</div>
            <div>Cập nhật: {fmtDt(record.updatedAt)}</div>
          </div>
        </div>

        {record.notes && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 10, fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {record.notes}
          </div>
        )}
      </Card>

      {/* Alerts */}
      {activeAlerts.length > 0 && (
        <Card accent="var(--err)" style={{ background: 'var(--err-bg)' }}>
          <CardHead title="⚠ Cảnh báo quá hạn" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeAlerts.map(alert => (
              <div key={alert.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface)', borderRadius: 8 }}>
                <div style={{ fontSize: 13.5, color: 'var(--err-tx)' }}>
                  Đã quá <strong>{alert.daysOverdue}</strong> ngày chưa sửa xong · Cảnh báo lúc {fmtDt(alert.sentAt)}
                </div>
                <DismissAlertBtn alertId={alert.id} onDone={onDone} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 20 }}>
        {/* Timeline */}
        <Card>
          <CardHead title="Tiến trình sửa chữa" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Bước 1: Thu hồi */}
            <TimelineStep
              dot={<TimelineDot done />}
              title="Thu hồi máy"
              time={fmtDt(record.recalledAt)}
              by={displayName(record.recalledBy, record.recalledByTechnician)}
              isLast={!isForRepair}
            />

            {/* Bước 2: Nhận sửa (chỉ cho RECALL_FOR_REPAIR) */}
            {isForRepair && (
              <>
                <TimelineConnector done={!!record.repairStartedAt} />
                <TimelineStep
                  dot={<TimelineDot done={!!record.repairStartedAt} active={canStartRepair} />}
                  title="Nhận sửa chữa"
                  time={record.repairStartedAt ? fmtDt(record.repairStartedAt) : undefined}
                  by={record.repairStartedAt ? displayName(record.repairedBy, record.repairedByTechnician) : undefined}
                  pending={canStartRepair ? 'Chưa có KTV nhận' : undefined}
                  extra={responseTime ? <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Phản hồi sau {responseTime}</span> : undefined}
                  isLast={false}
                />
              </>
            )}

            {/* Bước 3: Hoàn thành */}
            {isForRepair && (
              <>
                <TimelineConnector done={isDone} />
                <TimelineStep
                  dot={<TimelineDot done={isDone} active={canFinish} />}
                  title="Sửa chữa hoàn thành"
                  time={record.repairFinishedAt ? fmtDt(record.repairFinishedAt) : undefined}
                  by={record.repairFinishedAt ? displayName(record.repairedBy, record.repairedByTechnician) : undefined}
                  pending={canFinish ? 'Đang sửa…' : (!record.repairStartedAt ? 'Chờ nhận sửa' : undefined)}
                  extra={repairDuration ? <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Tổng thời gian: {repairDuration}</span> : undefined}
                  isLast
                />
              </>
            )}
          </div>

          {/* Action forms */}
          {(canStartRepair || canFinish) && (
            <div style={{ marginTop: 24, padding: '16px 0 0', borderTop: '1px solid var(--border)' }}>
              {canStartRepair && <StartRepairForm recordId={record.id} onDone={onDone} />}
              {canFinish      && <FinishRepairForm recordId={record.id} onDone={onDone} />}
            </div>
          )}
        </Card>

        {/* Sidebar info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Thông tin chi tiết */}
          <Card>
            <CardHead title="Thông tin" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <InfoRow icon="rooms"    label="Phòng"        value={record.room?.roomCode ?? '—'} />
              <InfoRow icon="monitor"  label="Máy số"       value={`Máy ${record.machineNo}${record.machine?.isFaulty ? ' (đang lỗi)' : ''}`} />
              <InfoRow icon="users"    label="KTV thu hồi"  value={displayName(record.recalledBy, record.recalledByTechnician)} />
              <InfoRow icon="calendar" label="Thời điểm TH" value={fmtDt(record.recalledAt)} />
              {record.repairedByTechnician || record.repairedBy ? (
                <InfoRow icon="wrench" label="KTV sửa chữa" value={displayName(record.repairedBy, record.repairedByTechnician)} />
              ) : null}
            </div>
          </Card>

          {/* Pre-repair link */}
          {record.preRepairStatus && (
            <Card accent="var(--primary-soft)">
              <CardHead title="Tình trạng trước sửa" />
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 10 }}>
                {record.preRepairStatus.description.slice(0, 150)}{record.preRepairStatus.description.length > 150 ? '…' : ''}
              </div>
              {record.preRepairStatus.reportedBy && (
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>
                  Người báo: {record.preRepairStatus.reportedBy}
                </div>
              )}
              <Button variant="outline" size="sm" iconRight="arrowR"
                onClick={() => router.push(`/pre-repair?highlight=${record.preRepairStatus!.id}`)}>
                Xem bản ghi PRS-{String(record.preRepairStatus.id).padStart(4, '0')}
              </Button>
            </Card>
          )}

          {/* Maintenance logs */}
          {record.maintenanceLogs.length > 0 && (
            <Card>
              <CardHead title="Nhật ký bảo trì liên quan" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {record.maintenanceLogs.map(log => (
                  <div key={log.id} style={{ padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                      {log.actionType ?? 'Bảo trì'} · {new Date(log.maintenanceDate).toLocaleDateString('vi-VN')}
                    </div>
                    {log.technicianName && <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>KTV: {log.technicianName}</div>}
                    {log.notes && <div style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 12.5 }}>{log.notes}</div>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────
function TimelineStep({ dot, title, time, by, pending, extra, isLast }: {
  dot: React.ReactNode; title: string; time?: string; by?: string; pending?: string; extra?: React.ReactNode; isLast: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 16, paddingBottom: isLast ? 0 : 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {dot}
      </div>
      <div style={{ flex: 1, paddingTop: 6, paddingBottom: isLast ? 0 : 24 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</div>
        {time && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Lúc {time}</div>}
        {by   && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Bởi {by}</div>}
        {pending && <div style={{ fontSize: 13, color: 'var(--text-faint)', fontStyle: 'italic', marginTop: 2 }}>{pending}</div>}
        {extra && <div style={{ marginTop: 4 }}>{extra}</div>}
      </div>
    </div>
  )
}

function TimelineConnector({ done }: { done: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ width: 36, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 2, flex: 1, background: done ? 'var(--good)' : 'var(--border)', minHeight: 24 }} />
      </div>
      <div style={{ flex: 1 }} />
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <Icon name={icon} size={15} style={{ color: 'var(--text-faint)', marginTop: 2, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)' }}>{value}</div>
      </div>
    </div>
  )
}
