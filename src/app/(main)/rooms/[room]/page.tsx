'use client'
import { useState, useMemo, use, useEffect } from 'react'
import type React from 'react'
import { useRouter } from 'next/navigation'
import { useFetch } from '@/lib/use-fetch'
import { csrfFetch } from '@/lib/csrf'
import { STATUS, STATUS_COLOR, ERROR_TYPES, HW_KEYS, fmtDate } from '@/lib/app-data'
import { Card, CardHead, Button, Badge, Tabs, Dialog } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────
interface ApiMachine {
  id: number
  machineNo: number
  isTeacher: boolean
  softwareError: string | null
  caseError: string | null
  cpuError: string | null
  ramError: string | null
  diskError: string | null
  powerError: string | null
  monitorError: string | null
  monitorCableError: string | null
  powerCableError: string | null
  mouseError: string | null
  networkError: string | null
  keyboardError: string | null
  extraNotes: string | null
  lastMaintainedAt: string | null
}

interface ApiMaintenanceLog {
  id: number
  maintenanceDate: string
  technicianName: string | null
  notes: string | null
  softwareErrorsBefore: number
  hardwareErrorsBefore: number
  softwareErrorsAfter: number
  hardwareErrorsAfter: number
  actionType: string | null
  machineNo: number | null
}


interface ApiRoomDetail {
  id: number
  roomCode: string
  floor: { name: string }
  totalMachines: number
  cpuSpec: string | null
  ramSpec: string | null
  diskSpec: string | null
  monitorSpec: string | null
  machines: ApiMachine[]
  maintenanceLogs: ApiMaintenanceLog[]
}

interface UiMachine {
  dbId: number
  id: number           // machineNo (display)
  isTeacher: boolean
  status: string       // good | sw | hw | both | teacher
  errors: string[]     // error keys
  rawFields: Record<string, string | null>
}

// ── Converters ─────────────────────────────────────────────────────────────
const FIELD_TO_KEY: Record<string, string> = {
  softwareError: 'software', caseError: 'case', cpuError: 'cpu', ramError: 'ram',
  diskError: 'disk', powerError: 'power', monitorError: 'monitor',
  monitorCableError: 'monitorCable', powerCableError: 'powerCable',
  mouseError: 'mouse', networkError: 'network', keyboardError: 'keyboard',
}

function toUiMachine(m: ApiMachine): UiMachine {
  const rawFields: Record<string, string | null> = {
    softwareError: m.softwareError, caseError: m.caseError, cpuError: m.cpuError,
    ramError: m.ramError, diskError: m.diskError, powerError: m.powerError,
    monitorError: m.monitorError, monitorCableError: m.monitorCableError,
    powerCableError: m.powerCableError, mouseError: m.mouseError,
    networkError: m.networkError, keyboardError: m.keyboardError,
    extraNotes: m.extraNotes,
  }
  const errors = Object.entries(FIELD_TO_KEY)
    .filter(([f]) => rawFields[f] != null && rawFields[f] !== '')
    .map(([, k]) => k)

  if (m.isTeacher) return { dbId: m.id, id: m.machineNo, isTeacher: true, status: 'teacher', errors, rawFields }
  const hasSw = errors.includes('software')
  const hasHw = errors.some(e => HW_KEYS.includes(e))
  const status = hasSw && hasHw ? 'both' : hasSw ? 'sw' : hasHw ? 'hw' : 'good'
  return { dbId: m.id, id: m.machineNo, isTeacher: false, status, errors, rawFields }
}

function computeStats(machines: UiMachine[]) {
  const s = { total: machines.length, good: 0, sw: 0, hw: 0, both: 0, teacher: 0 }
  machines.forEach(m => { (s as Record<string, number>)[m.status]++ })
  return s
}

// ── Sub-components ─────────────────────────────────────────────────────────
function MachineCell({ m, onClick, isBulkMode, isSelected, onToggleSelect, bulkMode }: {
  m: UiMachine; onClick: () => void
  isBulkMode?: boolean; isSelected?: boolean; onToggleSelect?: () => void
  bulkMode?: 'error' | 'restore' | null
}) {
  const color = STATUS_COLOR[m.status]
  if (isBulkMode) {
    const isRestoreMode = bulkMode === 'restore'
    const notSelectable = isRestoreMode && (m.status === 'good' || m.isTeacher)
    return (
      <button
        className="mcell"
        onClick={notSelectable ? undefined : onToggleSelect}
        style={{
          background: color,
          position: 'relative',
          boxShadow: isSelected ? '0 0 0 2px var(--primary), 0 0 12px rgba(0,0,0,.3)' : undefined,
          opacity: isSelected ? 1 : notSelectable ? 0.2 : 0.55,
          cursor: notSelectable ? 'not-allowed' : 'pointer',
        }}
        title={`Máy ${m.id} · ${STATUS[m.status as keyof typeof STATUS]?.label}${isSelected ? ' (đã chọn)' : ''}`}
      >
        {isSelected && (
          <span style={{ position: 'absolute', top: -5, right: -5, width: 17, height: 17, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center', border: '2px solid var(--surface)' }}>
            ✓
          </span>
        )}
        {m.isTeacher ? (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, gap: 1 }}>
            <span style={{ fontSize: 9, fontWeight: 700, opacity: .85, letterSpacing: '.04em' }}>GV</span>
            <span style={{ fontSize: 11, fontWeight: 800 }}>{m.id}</span>
          </span>
        ) : m.id}
      </button>
    )
  }
  return (
    <button className="mcell" onClick={onClick} style={{ background: color }} title={`Máy ${m.id} · ${STATUS[m.status as keyof typeof STATUS]?.label}`}>
      {m.isTeacher ? (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, gap: 1 }}>
          <span style={{ fontSize: 9, fontWeight: 700, opacity: .85, letterSpacing: '.04em' }}>GV</span>
          <span style={{ fontSize: 11, fontWeight: 800 }}>{m.id}</span>
        </span>
      ) : m.id}
    </button>
  )
}

function MachineDialog({ room, machine, onClose, onSave, onDelete, history, canManage, canViewNotes }: {
  room: { name: string; spec: { cpu: string; ram: string; disk: string; screen: string } }
  machine: UiMachine
  onClose: () => void
  onSave: (dbId: number, errors: string[], notes: string) => Promise<void>
  onDelete?: (dbId: number) => Promise<void>
  history: ApiMaintenanceLog[]
  canManage?: boolean
  canViewNotes?: boolean
}) {
  const [tab, setTab] = useState('status')
  const [editing, setEditing] = useState(false)
  const [errors, setErrors] = useState(machine.errors)
  const [notes, setNotes] = useState(machine.rawFields['extraNotes'] ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  useEffect(() => { setShowAllHistory(false) }, [machine.dbId])
  const machineHistory = history.filter(h => h.machineNo === machine.id)
  const visibleHistory = showAllHistory ? machineHistory : machineHistory.slice(0, 5)
  const st = machine.isTeacher ? 'teacher' : (() => {
    const hasSw = errors.includes('software')
    const hasHw = errors.some(e => HW_KEYS.includes(e))
    return hasSw && hasHw ? 'both' : hasSw ? 'sw' : hasHw ? 'hw' : 'good'
  })()
  const toggle = (key: string) => setErrors(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const handleSave = async () => {
    setSaving(true)
    await onSave(machine.dbId, errors, notes)
    setSaving(false)
    setEditing(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    await onDelete?.(machine.dbId)
    setDeleting(false)
    onClose()
  }

  return (
    <Dialog open={true} onClose={onClose} width={560}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: STATUS[st as keyof typeof STATUS].bg, color: STATUS[st as keyof typeof STATUS].color, display: 'grid', placeItems: 'center' }}>
            <Icon name={machine.isTeacher ? 'user' : 'monitor'} size={23} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>{machine.isTeacher ? `Máy ${machine.id} · Giảng viên` : `Máy ${machine.id}`}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>Phòng {room.name}</span>
              <Badge tone={st as 'good' | 'err' | 'soft' | 'both' | 'teacher'} dot>{STATUS[st as keyof typeof STATUS].label}</Badge>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {canManage && !confirmDelete && (
            <button className="icon-btn" style={{ color: 'var(--err)' }} title="Xoá máy này" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={17} />
            </button>
          )}
          {canManage && confirmDelete && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--err-tx)' }}>
              Xoá máy?
              <button className="icon-btn" style={{ color: 'var(--err)' }} onClick={handleDelete} disabled={deleting} title="Xác nhận xoá">
                <Icon name="check" size={16} />
              </button>
              <button className="icon-btn" onClick={() => setConfirmDelete(false)} title="Hủy">
                <Icon name="x" size={16} />
              </button>
            </span>
          )}
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
      </div>

      <div style={{ padding: '0 24px' }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'status', label: 'Tình trạng' }, { value: 'history', label: 'Lịch sử bảo trì' }]} />
      </div>

      {tab === 'status' && (
        <div style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{editing ? 'Bấm vào từng mục để bật/tắt lỗi' : `${errors.length} lỗi đang ghi nhận`}</span>
            {!editing
              ? <Button size="sm" variant="soft" icon="edit" onClick={() => setEditing(true)}>Cập nhật tình trạng</Button>
              : <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" variant="ghost" onClick={() => { setErrors(machine.errors); setEditing(false) }}>Hủy</Button>
                  <Button size="sm" variant="primary" icon="save" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</Button>
                </div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {ERROR_TYPES.map(et => {
              const has = errors.includes(et.key)
              return (
                <button key={et.key} disabled={!editing} onClick={() => toggle(et.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 11, textAlign: 'left', border: `1px solid ${has ? 'var(--err)' : 'var(--border)'}`, background: has ? 'var(--err-bg)' : 'var(--surface-2)', cursor: editing ? 'pointer' : 'default', transition: 'all .15s ease', fontFamily: 'var(--font)', opacity: editing || has ? 1 : .85 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', flexShrink: 0, background: has ? 'var(--err)' : 'var(--good-bg)', color: has ? '#fff' : 'var(--good-tx)' }}>
                    <Icon name={has ? 'alert' : 'check'} size={16} stroke={2.3} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{et.label}</div>
                    <div style={{ fontSize: 11, color: has ? 'var(--err-tx)' : 'var(--good-tx)', fontWeight: 500 }}>{has ? 'Có lỗi' : 'Bình thường'}</div>
                  </div>
                  {et.cat === 'sw' ? <Badge tone="soft">PM</Badge> : <Badge tone="muted">PC</Badge>}
                </button>
              )
            })}
          </div>
          {!editing && canViewNotes && (
            <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6, letterSpacing: '.06em', textTransform: 'uppercase' }}>Ghi chú kỹ thuật viên</div>
              <div style={{ fontSize: 13, color: machine.rawFields['extraNotes'] ? 'var(--text)' : 'var(--text-faint)', fontStyle: machine.rawFields['extraNotes'] ? 'normal' : 'italic' }}>
                {machine.rawFields['extraNotes'] || 'Chưa có ghi chú'}
              </div>
            </div>
          )}
          {editing && (
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Lý do / Ghi chú
              </label>
              <textarea
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--text)', fontSize: 13, resize: 'vertical',
                  minHeight: 64, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font)',
                }}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Mô tả lý do, triệu chứng lỗi…"
              />
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div style={{ padding: 24 }}>
          {machineHistory.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 13, padding: 16 }}>Chưa có bản ghi bảo trì cho máy này.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {visibleHistory.map((h, i) => (
                <div key={h.id} style={{ display: 'flex', gap: 13 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--primary-soft)', color: 'var(--primary)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="wrench" size={16} /></div>
                    {i < visibleHistory.length - 1 && <div style={{ flex: 1, width: 2, background: 'var(--border)', marginTop: 4 }} />}
                  </div>
                  <div style={{ paddingBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>Máy {machine.id}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{fmtDate(h.maintenanceDate)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>{h.notes ?? '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3 }}>Thực hiện: {h.technicianName ?? '—'}</div>
                  </div>
                </div>
              ))}
              {machineHistory.length > 5 && (
                <button
                  onClick={() => setShowAllHistory(prev => !prev)}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left', padding: '4px 0', fontFamily: 'var(--font)' }}
                >
                  {showAllHistory ? 'Thu gọn' : `Xem thêm (${machineHistory.length - 5})`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}

// ── Room Spec Edit Dialog ──────────────────────────────────────────────────
function RoomSpecDialog({ roomCode, spec, onClose, onSaved }: {
  roomCode: string
  spec: { cpu: string; ram: string; disk: string; screen: string }
  onClose: () => void
  onSaved: (updated: { cpuSpec: string; ramSpec: string; diskSpec: string; monitorSpec: string }) => void
}) {
  const [form, setForm] = useState({ cpu: spec.cpu, ram: spec.ram, disk: spec.disk, screen: spec.screen })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font)',
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, marginBottom: 5, display: 'block' }

  const handleSave = async () => {
    setSaving(true)
    setErr(null)
    const res = await csrfFetch(`/api/rooms/${encodeURIComponent(roomCode)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpuSpec: form.cpu, ramSpec: form.ram, diskSpec: form.disk, monitorSpec: form.screen }),
    })
    if (!res.ok) {
      const d = await res.json()
      setErr(d.error ?? 'Lỗi cập nhật')
      setSaving(false)
      return
    }
    onSaved({ cpuSpec: form.cpu, ramSpec: form.ram, diskSpec: form.disk, monitorSpec: form.screen })
    onClose()
  }

  return (
    <Dialog open={true} onClose={onClose} width={440}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Cập nhật thông số phòng</div>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
      </div>
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[
          { k: 'cpu' as const, label: 'CPU', icon: 'cpu', placeholder: 'VD: i7-12700' },
          { k: 'ram' as const, label: 'RAM', icon: 'ram', placeholder: 'VD: DDR4 16Gb' },
          { k: 'disk' as const, label: 'Ổ cứng', icon: 'disk', placeholder: 'VD: SSD NVMe 512Gb' },
          { k: 'screen' as const, label: 'Màn hình', icon: 'screen', placeholder: 'VD: DELL 24"' },
        ].map(({ k, label, icon, placeholder }) => (
          <div key={k}>
            <label style={labelStyle}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name={icon} size={13} />
                {label}
              </span>
            </label>
            <input style={fieldStyle} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} />
          </div>
        ))}
        {err && <div style={{ fontSize: 12.5, color: 'var(--err-tx)', padding: '8px 12px', borderRadius: 8, background: 'var(--err-bg)' }}>{err}</div>}
      </div>
      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="ghost" size="sm" onClick={onClose}>Hủy</Button>
        <Button variant="primary" size="sm" icon="save" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thông số'}</Button>
      </div>
    </Dialog>
  )
}

// ── Add Machine Dialog ─────────────────────────────────────────────────────
function AddMachineDialog({ roomId, nextRegularNo, nextTeacherNo, onClose, onAdded }: {
  roomId: number
  nextRegularNo: number
  nextTeacherNo: number
  onClose: () => void
  onAdded: () => void
}) {
  const [isTeacher, setIsTeacher] = useState(false)
  const [machineNo, setMachineNo] = useState(String(nextRegularNo))

  const handleTypeChange = (teacher: boolean) => {
    setIsTeacher(teacher)
    setMachineNo(teacher ? String(nextTeacherNo) : String(nextRegularNo))
  }
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleSave = async () => {
    const no = parseInt(machineNo)
    if (isNaN(no) || no < (isTeacher ? 0 : 1)) { setErr('Số máy không hợp lệ'); return }
    setSaving(true)
    setErr(null)
    const res = await csrfFetch('/api/machines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, machineNo: no, isTeacher }),
    })
    if (!res.ok) {
      const d = await res.json()
      setErr(d.error ?? 'Lỗi không xác định')
      setSaving(false)
      return
    }
    onAdded()
    onClose()
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font)',
  }

  return (
    <Dialog open={true} onClose={onClose} width={360}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Thêm máy mới</div>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
      </div>
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Số máy</label>
          <input type="number" min={1} style={fieldStyle} value={machineNo} onChange={e => setMachineNo(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: 8 }}>Loại máy</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {[{ v: false, label: 'Máy thường', icon: 'monitor' }, { v: true, label: 'Máy giảng viên', icon: 'user' }].map(opt => (
              <button key={String(opt.v)} onClick={() => handleTypeChange(opt.v)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 10,
                  border: `2px solid ${isTeacher === opt.v ? 'var(--primary)' : 'var(--border)'}`,
                  background: isTeacher === opt.v ? 'var(--primary-soft)' : 'var(--surface-2)',
                  color: isTeacher === opt.v ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                <Icon name={opt.icon} size={17} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {err && <div style={{ fontSize: 12.5, color: 'var(--err-tx)', padding: '8px 12px', borderRadius: 8, background: 'var(--err-bg)' }}>{err}</div>}
      </div>
      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="ghost" size="sm" onClick={onClose}>Hủy</Button>
        <Button variant="primary" size="sm" icon="plus" onClick={handleSave} disabled={saving}>{saving ? 'Đang thêm…' : 'Thêm máy'}</Button>
      </div>
    </Dialog>
  )
}

// ── Maintenance Log Edit Dialog ────────────────────────────────────────────
function MaintenanceLogEditDialog({ log, onClose, onSave }: {
  log: ApiMaintenanceLog
  onClose: () => void
  onSave: (id: number, data: Partial<ApiMaintenanceLog>) => Promise<void>
}) {
  const [form, setForm] = useState({
    maintenanceDate: log.maintenanceDate.slice(0, 10),
    technicianName: log.technicianName ?? '',
    notes: log.notes ?? '',
    softwareErrorsBefore: log.softwareErrorsBefore,
    hardwareErrorsBefore: log.hardwareErrorsBefore,
    softwareErrorsAfter: log.softwareErrorsAfter,
    hardwareErrorsAfter: log.hardwareErrorsAfter,
  })
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string | number) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(log.id, {
      maintenanceDate: form.maintenanceDate,
      technicianName: form.technicianName || null,
      notes: form.notes || null,
      softwareErrorsBefore: Number(form.softwareErrorsBefore),
      hardwareErrorsBefore: Number(form.hardwareErrorsBefore),
      softwareErrorsAfter: Number(form.softwareErrorsAfter),
      hardwareErrorsAfter: Number(form.hardwareErrorsAfter),
    })
    setSaving(false)
    onClose()
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font)',
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, marginBottom: 5, display: 'block' }

  return (
    <Dialog open={true} onClose={onClose} width={480}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Sửa bản ghi #{log.id}</div>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
      </div>
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Ngày bảo trì</label>
            <input type="date" style={fieldStyle} value={form.maintenanceDate} onChange={e => set('maintenanceDate', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Kỹ thuật viên</label>
            <input style={fieldStyle} value={form.technicianName} onChange={e => set('technicianName', e.target.value)} placeholder="Tên KTV…" />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Ghi chú</label>
          <textarea style={{ ...fieldStyle, resize: 'vertical', minHeight: 72 }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Ghi chú…" />
        </div>
        <div>
          <label style={{ ...labelStyle, marginBottom: 8 }}>Số lỗi trước / sau bảo trì</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'PM trước', key: 'softwareErrorsBefore' },
              { label: 'PC trước', key: 'hardwareErrorsBefore' },
              { label: 'PM sau',   key: 'softwareErrorsAfter' },
              { label: 'PC sau',   key: 'hardwareErrorsAfter' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label style={{ ...labelStyle, fontSize: 11 }}>{label}</label>
                <input type="number" min={0} style={fieldStyle}
                  value={form[key as keyof typeof form]}
                  onChange={e => set(key, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="ghost" size="sm" onClick={onClose}>Hủy</Button>
        <Button variant="primary" size="sm" icon="save" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</Button>
      </div>
    </Dialog>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
function roomBorder(e: number) { return e === 0 ? 'var(--good)' : e <= 5 ? 'var(--both)' : 'var(--err)' }

export default function RoomDetailPage({ params }: { params: Promise<{ room: string }> }) {
  const router = useRouter()
  const { room } = use(params)
  const roomCode = decodeURIComponent(room)
  const { data: roomData, loading, error, refetch } = useFetch<ApiRoomDetail>(`/api/rooms/${encodeURIComponent(roomCode)}`)
  const { data: me } = useFetch<{ user: { role: string } | null }>('/api/auth/me')
  const isAdmin = me?.user?.role === 'ADMIN'
  const isManager = me?.user?.role === 'MANAGER'
  const isGuest = me?.user?.role === 'GUEST'
  const canManageMachines = isAdmin || isManager

  const [machines, setMachines] = useState<UiMachine[]>([])
  const [initialized, setInitialized] = useState(false)
  const [sel, setSel] = useState<UiMachine | null>(null)
  const [editingLog, setEditingLog] = useState<ApiMaintenanceLog | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [showAddMachine, setShowAddMachine] = useState(false)
  const [showEditSpec, setShowEditSpec] = useState(false)
  const [generatingMachines, setGeneratingMachines] = useState(false)
  const [localSpec, setLocalSpec] = useState<{ cpuSpec: string | null; ramSpec: string | null; diskSpec: string | null; monitorSpec: string | null } | null>(null)
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [bulkMode, setBulkMode] = useState<'error' | 'restore' | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkDialog, setShowBulkDialog] = useState(false)
  const [bulkErrors, setBulkErrors] = useState<string[]>([])
  const [bulkSaving, setBulkSaving] = useState(false)
  const [showBulkRestoreDialog, setShowBulkRestoreDialog] = useState(false)
  const [bulkRestoreNotes, setBulkRestoreNotes] = useState('')
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false)
  const [snapshotNotes, setSnapshotNotes] = useState('')
  const [snapshotSaving, setSnapshotSaving] = useState(false)
  const [bulkRestoreSaving, setBulkRestoreSaving] = useState(false)

  // Initialize machines state once data arrives
  if (roomData && !initialized) {
    setMachines(roomData.machines.map(toUiMachine))
    setInitialized(true)
  }

  const stats = useMemo(() => computeStats(machines), [machines])

  const handleSave = async (dbId: number, errors: string[], notes: string) => {
    const data: Record<string, string | null> = {}
    for (const [field, key] of Object.entries(FIELD_TO_KEY)) {
      const existing = machines.find(m => m.dbId === dbId)?.rawFields[field] ?? null
      data[field] = errors.includes(key) ? (existing ?? 'Lỗi') : null
    }
    data.extraNotes = notes || null
    const res = await csrfFetch(`/api/machines/${dbId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      toast.error('Lưu thất bại, thử lại')
      return
    }

    const hasSw = errors.includes('software')
    const hasHw = errors.some(e => HW_KEYS.includes(e))
    const newStatus = (() => {
      const m = machines.find(m => m.dbId === dbId)
      if (m?.isTeacher) return 'teacher'
      return hasSw && hasHw ? 'both' : hasSw ? 'sw' : hasHw ? 'hw' : 'good'
    })()
    const newRawFields = { ...machines.find(m => m.dbId === dbId)?.rawFields }
    for (const [field, key] of Object.entries(FIELD_TO_KEY)) {
      newRawFields[field] = errors.includes(key) ? (newRawFields[field] ?? 'Lỗi') : null
    }
    newRawFields.extraNotes = notes || null

    setMachines(prev => prev.map(m => m.dbId !== dbId ? m : { ...m, errors, status: newStatus, rawFields: newRawFields }))
    setSel(prev => prev ? { ...prev, errors, status: newStatus, rawFields: newRawFields } : null)
  }

  const handleBulkSave = async () => {
    if (selectedIds.size === 0 || bulkErrors.length === 0) return
    setBulkSaving(true)
    const ids = [...selectedIds]

    // Chỉ gửi các field được chọn (không gửi null) để tránh ghi đè lỗi cũ
    const fields: Record<string, string> = {}
    for (const [field, key] of Object.entries(FIELD_TO_KEY)) {
      if (bulkErrors.includes(key)) fields[field] = 'Lỗi'
    }

    try {
      const res = await csrfFetch('/api/machines/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, fields }),
      })
      if (!res.ok) {
        toast.error('Lỗi khi cập nhật')
        return
      }

      // Cập nhật local state tất cả máy đã chọn
      setMachines(prev => prev.map(m => {
        if (!selectedIds.has(m.dbId)) return m
        const newErrors = [...m.errors]
        for (const key of bulkErrors) {
          if (!newErrors.includes(key)) newErrors.push(key)
        }
        const hasSw = newErrors.includes('software')
        const hasHw = newErrors.some((e: string) => HW_KEYS.includes(e))
        const newStatus = m.isTeacher ? 'teacher' : hasSw && hasHw ? 'both' : hasSw ? 'sw' : hasHw ? 'hw' : 'good'
        const newRawFields = { ...m.rawFields }
        for (const [field, key] of Object.entries(FIELD_TO_KEY)) {
          if (bulkErrors.includes(key)) newRawFields[field] = 'Lỗi'
        }
        return { ...m, errors: newErrors, status: newStatus, rawFields: newRawFields }
      }))

      toast.success(`Đã cập nhật ${ids.length} máy`)
    } catch {
      toast.error('Lỗi khi cập nhật')
    } finally {
      setBulkSaving(false)
      setShowBulkDialog(false)
      setSelectedIds(new Set())
      setIsBulkMode(false)
    }
  }

  const handleBulkRestore = async () => {
    const ids = [...selectedIds].filter(id => {
      const m = machines.find(m => m.dbId === id)
      return m && m.status !== 'good' && !m.isTeacher
    })
    if (ids.length === 0) return
    setBulkRestoreSaving(true)

    const res = await csrfFetch('/api/machines/batch-restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, notes: bulkRestoreNotes || undefined }),
    })

    if (!res.ok) {
      toast.error('Lỗi khi khôi phục máy')
      setBulkRestoreSaving(false)
      return
    }

    setMachines(prev => prev.map(m => {
      if (!ids.includes(m.dbId)) return m
      const newRawFields: Record<string, string | null> = {}
      Object.keys(m.rawFields).forEach(k => {
        newRawFields[k] = k === 'extraNotes' ? m.rawFields[k] : null
      })
      return { ...m, errors: [], status: m.isTeacher ? 'teacher' : 'good', rawFields: newRawFields }
    }))

    toast.success(`Đã sửa chữa ${ids.length} máy`)
    setBulkRestoreSaving(false)
    setShowBulkRestoreDialog(false)
    setSelectedIds(new Set())
    setIsBulkMode(false)
    setBulkMode(null)
    setBulkRestoreNotes('')
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === machines.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(machines.map(m => m.dbId)))
    }
  }

  const handleLogSave = async (id: number, data: Partial<ApiMaintenanceLog>) => {
    await csrfFetch(`/api/maintenance/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    refetch()
  }

  const handleLogDelete = async (id: number) => {
    await csrfFetch(`/api/maintenance/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    refetch()
  }

  const refetchMachines = () => {
    setInitialized(false)
    refetch()
  }

  const handleDeleteMachine = async (dbId: number) => {
    await csrfFetch(`/api/machines/${dbId}`, { method: 'DELETE' })
    setMachines(prev => prev.filter(m => m.dbId !== dbId))
    setSel(null)
  }

  const handleGenerateMachines = async () => {
    setGeneratingMachines(true)
    await csrfFetch(`/api/rooms/${encodeURIComponent(roomCode)}/generate-machines`, { method: 'POST' })
    setGeneratingMachines(false)
    refetchMachines()
  }

  const handleSnapshot = async () => {
    setSnapshotSaving(true)
    const res = await csrfFetch(`/api/rooms/${encodeURIComponent(roomCode)}/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: snapshotNotes }),
    })
    setSnapshotSaving(false)
    if (!res.ok) {
      toast.error('Ghi nhận thất bại')
      return
    }
    toast.success('Đã ghi nhận tình trạng phòng')
    setShowSnapshotDialog(false)
    setSnapshotNotes('')
    refetch()
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>Đang tải dữ liệu...</div>
  if (error)   return <div style={{ padding: 60, textAlign: 'center', color: 'var(--err-tx)', fontSize: 14 }}>Lỗi tải dữ liệu: {error}</div>
  if (!roomData) return null

  const effectiveSpec = localSpec ?? roomData
  const specs = [
    { icon: 'cpu',    label: 'CPU',      val: effectiveSpec.cpuSpec ?? '—' },
    { icon: 'ram',    label: 'RAM',      val: effectiveSpec.ramSpec ?? '—' },
    { icon: 'disk',   label: 'Ổ cứng',  val: effectiveSpec.diskSpec ?? '—' },
    { icon: 'screen', label: 'Màn hình', val: effectiveSpec.monitorSpec ?? '—' },
  ]
  const headStats = [
    { label: 'Tổng số máy',   val: stats.total,                          tone: 'info',  icon: 'monitor'      },
    { label: 'Hoạt động tốt', val: stats.good + stats.teacher,           tone: 'good',  icon: 'checkCircle'  },
    { label: 'Lỗi phần mềm', val: stats.sw + stats.both,                 tone: 'soft',  icon: 'software'     },
    { label: 'Lỗi phần cứng', val: stats.hw + stats.both,                tone: 'err',   icon: 'alert'        },
  ]
  const legend: [string, string][] = [['good','Tốt'],['hw','Lỗi phần cứng'],['sw','Lỗi phần mềm'],['both','Lỗi cả hai'],['teacher','Máy giảng viên']]
  const totalErr = stats.sw + stats.hw + stats.both
  const roomSpec = { cpu: roomData.cpuSpec ?? '—', ram: roomData.ramSpec ?? '—', disk: roomData.diskSpec ?? '—', screen: roomData.monitorSpec ?? '—' }

  return (
    <div className="stack">
      <button className="linkbtn" onClick={() => router.push('/rooms')} style={{ color: 'var(--text-muted)', marginBottom: -6 }}>
        <Icon name="chevronL" size={15} /> Quay lại danh sách phòng
      </button>

      <Card pad={24} accent={roomBorder(totalErr)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 className="room-title" style={{ margin: 0, fontSize: 42, fontWeight: 800, letterSpacing: '-.02em' }}>Phòng {roomData.roomCode}</h2>
              <Badge tone="info" icon="rooms">{roomData.floor.name}</Badge>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14 }}>
              {specs.map(sp => (
                <div key={sp.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-3)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center' }}><Icon name={sp.icon} size={17} /></div>
                  <div><div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{sp.label}</div><div style={{ fontSize: 13, fontWeight: 600 }}>{sp.val}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Button size="sm" variant="outline" icon="checkCircle" onClick={() => setShowSnapshotDialog(true)}>
              Ghi nhận tình trạng
            </Button>
            {isAdmin && (
              <button className="icon-btn" title="Cập nhật thông số" onClick={() => setShowEditSpec(true)}>
                <Icon name="edit" size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="grid-kpi" style={{ marginTop: 22, gap: 14 }}>
          {headStats.map(h => (
            <div key={h.label} style={{ padding: 16, borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
                <Icon name={h.icon} size={15} style={{ color: STATUS_COLOR[h.tone === 'info' ? 'good' : h.tone] || 'var(--primary)' }} />{h.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', marginTop: 6 }}>{h.val}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="room-cards">
        <Card pad={24} style={{ display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
          <CardHead title="Sơ đồ máy tính"
            action={
              <Button size="sm" variant={isBulkMode ? 'primary' : 'outline'} icon="check" onClick={() => { setIsBulkMode(!isBulkMode); setSelectedIds(new Set()) }}>
                {isBulkMode ? 'Thoát chọn nhiều' : 'Chọn nhiều'}
              </Button>
            }
          />
          {isBulkMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '8px 14px', borderRadius: 10, background: 'var(--primary-soft)' }}>
              <button onClick={toggleSelectAll} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                {selectedIds.size === machines.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {selectedIds.size > 0 ? `Đã chọn ${selectedIds.size} máy` : 'Bấm vào máy để chọn'}
              </span>
              <div style={{ flex: 1 }} />
              {selectedIds.size > 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" variant="primary" icon="edit"
                    onClick={() => { setBulkMode('error'); setBulkErrors([]); setShowBulkDialog(true) }}>
                    Cập nhật lỗi
                  </Button>
                  <Button size="sm" variant="soft" icon="check"
                    onClick={() => {
                      setSelectedIds(prev => {
                        const next = new Set(prev)
                        machines
                          .filter(m => m.status === 'good' || m.isTeacher)
                          .forEach(m => next.delete(m.dbId))
                        return next
                      })
                      setBulkMode('restore')
                      setShowBulkRestoreDialog(true)
                    }}>
                    Đã sửa chữa
                  </Button>
                </div>
              )}
            </div>
          )}
          {canManageMachines && machines.length === 0 && roomData.totalMachines > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', marginTop: 14, borderRadius: 10, background: 'var(--primary-soft)', border: '1px solid var(--primary)' }}>
              <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 500 }}>
                Phòng có {roomData.totalMachines} máy chưa được khởi tạo trong hệ thống.
              </span>
              <Button size="sm" variant="primary" icon="plus" onClick={handleGenerateMachines} disabled={generatingMachines}>
                {generatingMachines ? 'Đang tạo…' : `Tạo ${roomData.totalMachines} máy`}
              </Button>
            </div>
          )}
          <div className="machine-grid">
            {[...machines].sort((a, b) => (b.isTeacher ? 1 : 0) - (a.isTeacher ? 1 : 0) || a.id - b.id).map(m =>
              <MachineCell
                key={m.dbId}
                m={m}
                onClick={() => setSel(m)}
                isBulkMode={isBulkMode}
                isSelected={selectedIds.has(m.dbId)}
                bulkMode={bulkMode}
                onToggleSelect={() => {
                  setSelectedIds(prev => {
                    const next = new Set(prev)
                    if (next.has(m.dbId)) next.delete(m.dbId)
                    else next.add(m.dbId)
                    return next
                  })
                }}
              />
            )}
            {canManageMachines && (
              <button className="mcell" onClick={() => setShowAddMachine(true)}
                style={{ background: 'var(--surface-3)', border: '2px dashed var(--border)', color: 'var(--text-faint)', fontSize: 20, fontWeight: 300 }}
                title="Thêm máy mới">
                +
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
            {legend.map(([k, l]) => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                <span style={{ width: 13, height: 13, borderRadius: 4, background: STATUS_COLOR[k] }} />{l}
              </span>
            ))}
          </div>
        </Card>

        <Card pad={22} style={{ display: 'flex', flexDirection: 'column', minHeight: 280 }}>
          <CardHead title="Lịch sử bảo trì phòng này" />
          <div className="history-scroll">
              {roomData.maintenanceLogs.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>Chưa có bản ghi bảo trì.</div>
              ) : (
                <table className="tbl history-tbl">
                  <thead><tr><th>Mã</th><th>Loại</th><th>Ngày</th><th>Người thực hiện</th><th>Ghi chú</th><th style={{ textAlign: 'center' }}>Lỗi trước</th>{isAdmin && <th />}</tr></thead>
                  <tbody>
                    {roomData.maintenanceLogs.map(m => {
                      const before = m.softwareErrorsBefore + m.hardwareErrorsBefore
                      const after  = m.softwareErrorsAfter  + m.hardwareErrorsAfter
                      const isDeleting = deletingId === m.id
                      return (
                        <tr key={m.id} className="trow">
                          <td style={{ fontWeight: 600, color: 'var(--primary)' }}>#{m.id}</td>
                          <td>
                            <Badge tone={
                              m.actionType === 'ROOM_STATUS_SNAPSHOT' ? 'info' :
                              m.actionType === 'DISABLE_FAULTY_MACHINE' ? 'err' :
                              m.actionType === 'RESTORE_MACHINE' ? 'good' : 'muted'
                            }>
                              {m.actionType === 'ROOM_STATUS_SNAPSHOT' ? 'Ghi nhận' :
                               m.actionType === 'DISABLE_FAULTY_MACHINE' ? 'Tắt máy' :
                               m.actionType === 'RESTORE_MACHINE' ? 'Sửa xong' : 'Bảo trì'}
                            </Badge>
                          </td>
                          <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(m.maintenanceDate)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{m.technicianName ?? '—'}</td>
                          <td style={{ color: 'var(--text-muted)', maxWidth: 200 }}>{m.notes ?? '—'}</td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                              <span style={{ color: 'var(--text-faint)' }}>{before}</span>
                              <Icon name="arrowR" size={13} style={{ color: 'var(--good)' }} />
                              <span style={{ color: 'var(--good-tx)' }}>{after}</span>
                            </span>
                          </td>
                          {isAdmin && (
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {isDeleting ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  <button className="icon-btn" style={{ color: 'var(--err)' }} onClick={() => handleLogDelete(m.id)} title="Xác nhận xoá"><Icon name="check" size={15} /></button>
                                  <button className="icon-btn" onClick={() => setDeletingId(null)} title="Hủy"><Icon name="x" size={15} /></button>
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <button className="icon-btn" onClick={() => setEditingLog(m)} title="Sửa"><Icon name="edit" size={15} /></button>
                                  <button className="icon-btn" style={{ color: 'var(--err)' }} onClick={() => setDeletingId(m.id)} title="Xoá"><Icon name="trash" size={15} /></button>
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
          </div>
        </Card>
      </div>

      {sel && (
        <MachineDialog
          room={{ name: roomData.roomCode, spec: roomSpec }}
          machine={sel}
          onClose={() => setSel(null)}
          onSave={handleSave}
          onDelete={canManageMachines ? handleDeleteMachine : undefined}
          history={roomData.maintenanceLogs}
          canManage={canManageMachines}
          canViewNotes={!isGuest}
        />
      )}
      {editingLog && (
        <MaintenanceLogEditDialog
          log={editingLog}
          onClose={() => setEditingLog(null)}
          onSave={handleLogSave}
        />
      )}
      {showAddMachine && (
        <AddMachineDialog
          roomId={roomData.id}
          nextRegularNo={Math.max(0, ...machines.filter(m => !m.isTeacher).map(m => m.id)) + 1}
          nextTeacherNo={Math.max(-1, ...machines.filter(m => m.isTeacher).map(m => m.id)) + 1}
          onClose={() => setShowAddMachine(false)}
          onAdded={refetchMachines}
        />
      )}
      {showEditSpec && (
        <RoomSpecDialog
          roomCode={roomData.roomCode}
          spec={{
            cpu: effectiveSpec.cpuSpec ?? '',
            ram: effectiveSpec.ramSpec ?? '',
            disk: effectiveSpec.diskSpec ?? '',
            screen: effectiveSpec.monitorSpec ?? '',
          }}
          onClose={() => setShowEditSpec(false)}
          onSaved={updated => setLocalSpec(updated)}
        />
      )}
      {showBulkRestoreDialog && (() => {
        const faultyCount = [...selectedIds].filter(id => {
          const m = machines.find(m => m.dbId === id)
          return m && m.status !== 'good' && !m.isTeacher
        }).length
        return (
          <Dialog open={true} onClose={() => setShowBulkRestoreDialog(false)} width={420}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Xác nhận sửa chữa — {faultyCount} máy</div>
              <button className="icon-btn" onClick={() => setShowBulkRestoreDialog(false)}><Icon name="x" size={18} /></button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
                Tất cả lỗi của <strong>{faultyCount} máy</strong> đã chọn sẽ được xóa và chuyển về{' '}
                <span style={{ color: 'var(--good-tx)', fontWeight: 600 }}>Tốt</span>.
                Hành động sẽ được ghi vào lịch sử bảo trì.
              </p>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Ghi chú sửa chữa (tuỳ chọn)
                </label>
                <textarea
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--surface-2)',
                    color: 'var(--text)', fontSize: 13, resize: 'vertical',
                    minHeight: 64, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font)',
                  }}
                  value={bulkRestoreNotes}
                  onChange={e => setBulkRestoreNotes(e.target.value)}
                  placeholder="Mô tả công việc sửa chữa đã thực hiện…"
                />
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={() => setShowBulkRestoreDialog(false)}>Hủy</Button>
              <Button variant="primary" size="sm" icon="check" onClick={handleBulkRestore}
                disabled={bulkRestoreSaving || faultyCount === 0}>
                {bulkRestoreSaving ? 'Đang xử lý…' : `Xác nhận đã sửa (${faultyCount} máy)`}
              </Button>
            </div>
          </Dialog>
        )
      })()}
      {showSnapshotDialog && (
        <Dialog open={true} onClose={() => { setShowSnapshotDialog(false); setSnapshotNotes('') }} width={420}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Ghi nhận tình trạng — Phòng {roomData.roomCode}</div>
            <button className="icon-btn" onClick={() => { setShowSnapshotDialog(false); setSnapshotNotes('') }}><Icon name="x" size={18} /></button>
          </div>
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { label: 'Máy tốt', val: stats.good + stats.teacher, color: 'var(--good-tx)' },
                { label: 'Lỗi PM', val: stats.sw + stats.both, color: 'var(--err-tx)' },
                { label: 'Lỗi PC', val: stats.hw + stats.both, color: 'var(--err-tx)' },
              ].map(s => (
                <div key={s.label} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Ghi chú thêm (tuỳ chọn)
              </label>
              <textarea
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--text)', fontSize: 13, resize: 'vertical',
                  minHeight: 56, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font)',
                }}
                value={snapshotNotes}
                onChange={e => setSnapshotNotes(e.target.value)}
                placeholder="Ghi chú thêm về tình trạng phòng…"
              />
            </div>
          </div>
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => { setShowSnapshotDialog(false); setSnapshotNotes('') }}>Hủy</Button>
            <Button variant="primary" size="sm" icon="checkCircle" onClick={handleSnapshot} disabled={snapshotSaving}>
              {snapshotSaving ? 'Đang ghi…' : 'Ghi nhận'}
            </Button>
          </div>
        </Dialog>
      )}
      {showBulkDialog && (
        <Dialog open={showBulkDialog} onClose={() => setShowBulkDialog(false)} width={480}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em' }}>{`Cập nhật lỗi — ${selectedIds.size} máy`}</div>
          </div>
          <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
              Chọn loại lỗi để áp dụng cho tất cả {selectedIds.size} máy đã chọn.
              Các lỗi hiện có của từng máy sẽ được giữ nguyên, chỉ thêm lỗi mới.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {ERROR_TYPES.map(et => {
                const isOn = bulkErrors.includes(et.key)
                return (
                  <button
                    key={et.key}
                    onClick={() => setBulkErrors(prev => prev.includes(et.key) ? prev.filter(k => k !== et.key) : [...prev, et.key])}
                    style={{
                      padding: '10px 14px', borderRadius: 10, border: isOn ? '2px solid var(--err)' : '2px solid var(--border)',
                      background: isOn ? 'rgba(239,68,68,.08)' : 'var(--surface)',
                      color: isOn ? 'var(--err)' : 'var(--text)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
                      transition: 'all .14s', textAlign: 'left',
                    }}
                  >
                    {isOn ? '✕' : '＋'} {et.label}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={() => setShowBulkDialog(false)}>Hủy</Button>
              <Button variant="primary" size="sm" onClick={handleBulkSave} disabled={bulkErrors.length === 0 || bulkSaving}>
                {bulkSaving ? 'Đang lưu...' : `Áp dụng ${bulkErrors.length} lỗi`}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
