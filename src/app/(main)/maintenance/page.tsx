'use client'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFetch } from '@/lib/use-fetch'
import { csrfFetch } from '@/lib/csrf'
import { SUPPLY_TYPES, ERROR_TYPES, fmtDate } from '@/lib/app-data'
import { Card, Button, Badge, Select, Sheet, Field } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'

// ── Types ──────────────────────────────────────────────────────────────────
interface ApiRoom { id: number; roomCode: string }
interface Tech { id: number; name: string }

interface ApiLog {
  id: number
  maintenanceDate: string
  isSupplyIntake: boolean
  technicianName: string | null
  technicianId: number | null
  technician: Tech | null
  createdBy: { username: string | null; email: string | null; profile: { displayName: string | null } | null } | null
  notes: string | null
  room: { roomCode: string } | null
  caseQty: number; cpuQty: number; ramQty: number; diskQty: number; powerQty: number
  monitorQty: number; monitorCableQty: number; powerCableQty: number
  mouseQty: number; networkQty: number; keyboardQty: number
  recCaseQty: number; recCpuQty: number; recRamQty: number; recDiskQty: number; recPowerQty: number
  recMonitorQty: number; recMonitorCableQty: number; recPowerCableQty: number
  recMouseQty: number; recNetworkQty: number; recKeyboardQty: number
  softwareErrorsBefore: number; hardwareErrorsBefore: number
  softwareErrorsAfter: number; hardwareErrorsAfter: number
}

interface PaginatedLogs { data: ApiLog[]; total: number; page: number; totalPages: number }

// ── Helpers ────────────────────────────────────────────────────────────────
const QTY_MAP: { field: keyof ApiLog; key: string }[] = [
  { field: 'caseQty', key: 'case' }, { field: 'cpuQty', key: 'cpu' },
  { field: 'ramQty', key: 'ram' }, { field: 'diskQty', key: 'disk' },
  { field: 'powerQty', key: 'power' }, { field: 'monitorQty', key: 'monitor' },
  { field: 'monitorCableQty', key: 'monitorCable' }, { field: 'powerCableQty', key: 'powerCable' },
  { field: 'mouseQty', key: 'mouse' }, { field: 'networkQty', key: 'network' },
  { field: 'keyboardQty', key: 'keyboard' },
]

const REC_QTY_MAP: { field: keyof ApiLog; key: string }[] = [
  { field: 'recCaseQty', key: 'case' }, { field: 'recCpuQty', key: 'cpu' },
  { field: 'recRamQty', key: 'ram' }, { field: 'recDiskQty', key: 'disk' },
  { field: 'recPowerQty', key: 'power' }, { field: 'recMonitorQty', key: 'monitor' },
  { field: 'recMonitorCableQty', key: 'monitorCable' }, { field: 'recPowerCableQty', key: 'powerCable' },
  { field: 'recMouseQty', key: 'mouse' }, { field: 'recNetworkQty', key: 'network' },
  { field: 'recKeyboardQty', key: 'keyboard' },
]

function logToItems(log: ApiLog, map: typeof QTY_MAP): Record<string, number> {
  const items: Record<string, number> = {}
  for (const { field, key } of map) {
    const v = log[field] as number
    if (v > 0) items[key] = v
  }
  return items
}

function logId(log: ApiLog): string {
  return (log.isSupplyIntake ? 'NK' : 'BT') + '-' + String(log.id).padStart(4, '0')
}

// ── ItemChips ──────────────────────────────────────────────────────────────
function ItemChips({ items, max = 4, bgColor }: { items: Record<string, number>; max?: number; bgColor?: string }) {
  const entries = Object.entries(items)
  const shown = entries.slice(0, max)
  if (entries.length === 0) return <span style={{ color: 'var(--text-faint)' }}>—</span>
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {shown.map(([k, v]) => {
        const meta = ERROR_TYPES.find(e => e.key === k)
        return <span key={k} className="chip" style={{ background: bgColor ?? 'var(--surface-3)', color: 'var(--text-muted)', fontSize: 11.5, padding: '3px 8px' }}><Icon name={meta?.icon || 'box'} size={12} />{meta?.short || k}<strong style={{ color: 'var(--text)' }}>{v}</strong></span>
      })}
      {entries.length > max && <span className="chip" style={{ background: bgColor ?? 'var(--surface-3)', color: 'var(--text-faint)', fontSize: 11.5, padding: '3px 8px' }}>+{entries.length - max}</span>}
    </div>
  )
}

// ── QtyGrid ────────────────────────────────────────────────────────────────
function QtyGrid({ qty, setItem }: { qty: Record<string, string>; setItem: (k: string, v: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {SUPPLY_TYPES.map(s => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <Icon name={s.icon} size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
          <input type="number" min="0" value={qty[s.key] || ''} onChange={e => setItem(s.key, e.target.value)} placeholder="0"
            style={{ width: 46, height: 30, border: '1px solid var(--border-strong)', borderRadius: 8, textAlign: 'center', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, background: 'var(--surface)', color: 'var(--text)' }} />
        </div>
      ))}
    </div>
  )
}

// ── QtyTabSwitcher ─────────────────────────────────────────────────────────
function QtyTabSwitcher({ qty, setItem, recQty, setRecItem, isKtv }: {
  qty: Record<string, string>; setItem: (k: string, v: string) => void
  recQty: Record<string, string>; setRecItem: (k: string, v: string) => void
  isKtv?: boolean
}) {
  const [tab, setTab] = useState<'replace' | 'recover'>('replace')
  const replaceTotal = Object.values(qty).reduce((a, b) => a + (+b || 0), 0)
  const recoverTotal = Object.values(recQty).reduce((a, b) => a + (+b || 0), 0)
  return (
    <div>
      {!isKtv && (
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, padding: 3, background: 'var(--surface-3)', borderRadius: 10 }}>
        {([
          { k: 'replace', l: 'Linh kiện thay thế', count: replaceTotal },
          { k: 'recover', l: 'Thu hồi nhập kho', count: recoverTotal },
        ] as const).map(o => (
          <button key={o.k} onClick={() => setTab(o.k)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 600, transition: 'all .15s ease', background: tab === o.k ? 'var(--surface)' : 'transparent', color: tab === o.k ? 'var(--primary)' : 'var(--text-muted)', boxShadow: tab === o.k ? 'var(--shadow-sm)' : 'none' }}>
            {o.l}
            {o.count > 0 && <span style={{ background: tab === o.k ? 'var(--primary)' : 'var(--text-faint)', color: '#fff', borderRadius: 99, fontSize: 10.5, fontWeight: 700, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>{o.count}</span>}
          </button>
        ))}
      </div>
      )}
      {tab === 'replace'
        ? <QtyGrid qty={qty} setItem={setItem} />
        : <QtyGrid qty={recQty} setItem={setRecItem} />}
    </div>
  )
}

// ── RecordSheet ────────────────────────────────────────────────────────────
function RecordSheet({ open, onClose, onSaved, rooms, editLog, isKtv }: {
  open: boolean; onClose: () => void; onSaved: () => void; rooms: ApiRoom[]; editLog?: ApiLog; isKtv?: boolean
}) {
  const isEdit = !!editLog
  const [mode, setMode] = useState<'bt' | 'nk'>(isKtv ? 'bt' : 'bt')
  const [room, setRoom] = useState('')
  const [techId, setTechId] = useState<number>(0)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [qty, setQty] = useState<Record<string, string>>({})
  const [recQty, setRecQty] = useState<Record<string, string>>({})
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [techs, setTechs] = useState<Tech[]>([])

  useEffect(() => {
    if (!open) return
    fetch('/api/technicians').then(r => r.json()).then(setTechs).catch(() => {})
    if (editLog) {
      setMode(editLog.isSupplyIntake ? 'nk' : 'bt')
      setRoom(editLog.room?.roomCode ?? '')
      setTechId(editLog.technicianId ?? 0)
      setDate(editLog.maintenanceDate.slice(0, 10))
      const q: Record<string, string> = {}
      for (const { field, key } of QTY_MAP) { const v = editLog[field] as number; if (v > 0) q[key] = String(v) }
      setQty(q)
      const rq: Record<string, string> = {}
      for (const { field, key } of REC_QTY_MAP) { const v = editLog[field] as number; if (v > 0) rq[key] = String(v) }
      setRecQty(rq)
      setBefore(String(editLog.softwareErrorsBefore + editLog.hardwareErrorsBefore || ''))
      setAfter(String(editLog.softwareErrorsAfter + editLog.hardwareErrorsAfter || ''))
      setNote(editLog.notes ?? '')
    } else {
      setMode('bt'); setRoom(''); setTechId(0)
      setDate(new Date().toISOString().slice(0, 10))
      setQty({}); setRecQty({}); setBefore(''); setAfter(''); setNote('')
    }
    setErrMsg('')
  }, [open, editLog])

  const setItem = (k: string, v: string) => setQty(p => ({ ...p, [k]: v }))
  const setRecItem = (k: string, v: string) => setRecQty(p => ({ ...p, [k]: v }))
  const totalQty = Object.values(qty).reduce((a, b) => a + (+b || 0), 0)

  const techOpts = useMemo(() => techs.map(t => ({ value: String(t.id), label: t.name })), [techs])
  const roomOpts = useMemo(() => rooms.map(r => ({ value: r.roomCode, label: r.roomCode })), [rooms])
  const firstRoom = rooms[0]?.roomCode ?? ''

  const handleSave = async () => {
    setSaving(true); setErrMsg('')
    try {
      const body: Record<string, unknown> = {
        isSupplyIntake: mode === 'nk',
        maintenanceDate: date,
        notes: note,
        softwareErrorsBefore: +(before || 0),
        softwareErrorsAfter: +(after || 0),
        hardwareErrorsBefore: 0,
        hardwareErrorsAfter: 0,
        technicianId: techId > 0 ? techId : null,
        technicianName: techId > 0 ? (techs.find(t => t.id === techId)?.name ?? '') : null,
      }
      if (mode === 'bt') body.roomCode = room || firstRoom
      for (const { field, key } of QTY_MAP) body[field] = +(qty[key] || 0)
      for (const { field, key } of REC_QTY_MAP) body[field] = +(recQty[key] || 0)

      const url = isEdit ? `/api/maintenance/${editLog!.id}` : '/api/maintenance'
      const res = await csrfFetch(url, { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErrMsg(d.error ?? 'Lỗi khi lưu'); return }
      onSaved(); onClose()
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} width={480}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{isEdit ? 'Sửa bản ghi' : 'Thêm bản ghi'}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>{isEdit ? `Đang chỉnh sửa ${logId(editLog!)}` : 'Ghi nhận hoạt động kỹ thuật'}</div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!isEdit ? (
          <div style={{ display: 'flex', gap: 8, padding: 4, background: 'var(--surface-3)', borderRadius: 12 }}>
            {([{ k: 'bt', l: 'Bảo trì phòng', i: 'wrench' }, { k: 'nk', l: 'Nhập kho vật tư', i: 'pkgIn' }] as const)
              .filter(o => o.k !== 'nk' || !isKtv)
              .map(o => (
              <button key={o.k} onClick={() => setMode(o.k)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, transition: 'all .16s ease', background: mode === o.k ? 'var(--surface)' : 'transparent', color: mode === o.k ? 'var(--primary)' : 'var(--text-muted)', boxShadow: mode === o.k ? 'var(--shadow-sm)' : 'none' }}>
                <Icon name={o.i} size={16} />{o.l}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: 'var(--surface-3)', fontSize: 13, fontWeight: 600, color: mode === 'nk' ? 'var(--primary)' : 'var(--text-muted)', alignSelf: 'flex-start' }}>
            <Icon name={mode === 'nk' ? 'pkgIn' : 'wrench'} size={15} />
            {mode === 'nk' ? 'Nhập kho vật tư' : 'Bảo trì phòng'}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: mode === 'bt' ? '1fr 1fr' : '1fr', gap: 12 }}>
          {mode === 'bt' && (
            <Field label="Phòng máy">
              <Select value={room || firstRoom} onChange={setRoom} options={roomOpts} style={{ width: '100%' }} />
            </Field>
          )}
          <Field label="Ngày">
            <div className="field"><Icon name="calendar" size={16} style={{ color: 'var(--text-faint)' }} /><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          </Field>
        </div>

        <Field label="Kỹ thuật viên">
          <Select value={String(techId)} onChange={v => setTechId(+v)} options={[{ value: '0', label: '— Chọn KTV —' }, ...techOpts]} style={{ width: '100%' }} />
        </Field>

        {mode === 'bt' ? (
          <QtyTabSwitcher
            qty={qty} setItem={setItem}
            recQty={recQty} setRecItem={setRecItem}
            isKtv={isKtv}
          />
        ) : (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Số lượng nhập kho</div>
            <QtyGrid qty={qty} setItem={setItem} />
          </div>
        )}

        {mode === 'bt' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Số lỗi trước bảo trì">
              <input type="number" min="0" value={before} onChange={e => setBefore(e.target.value)} className="numfield" placeholder="0" />
            </Field>
            <Field label="Số lỗi sau bảo trì">
              <input type="number" min="0" value={after} onChange={e => setAfter(e.target.value)} className="numfield" placeholder="0" />
            </Field>
          </div>
        )}

        <Field label="Ghi chú">
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Nội dung công việc…" rows={3} style={{ width: '100%', border: '1px solid var(--border-strong)', borderRadius: 11, padding: 12, fontFamily: 'var(--font)', fontSize: 13.5, resize: 'vertical', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }} />
        </Field>
        {errMsg && <div style={{ color: 'var(--err-tx)', fontSize: 13, padding: '8px 12px', background: 'var(--err-bg)', borderRadius: 8 }}>{errMsg}</div>}
      </div>

      <div style={{ padding: 20, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{totalQty > 0 ? `${totalQty} linh kiện` : 'Chưa nhập số lượng'}</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button variant="primary" icon={isEdit ? 'edit' : 'save'} onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu…' : (isEdit ? 'Cập nhật' : 'Lưu bản ghi')}</Button>
        </div>
      </div>
    </Sheet>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function MaintenancePage() {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [sheet, setSheet] = useState(false)
  const [editLog, setEditLog] = useState<ApiLog | undefined>(undefined)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [roomFilter, setRoomFilter] = useState('all')
  const [techFilter, setTechFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const perPage = 8

  const { data: me } = useFetch<{ user: { role: string } | null }>('/api/auth/me')
  const isKtv = me?.user?.role === 'TECHNICIAN'

  // Block TECHNICIAN — điều hướng về /dashboard/ktv
  useEffect(() => {
    if (me?.user?.role === 'TECHNICIAN') {
      router.replace('/dashboard/ktv')
    }
  }, [me, router])

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams({ page: '1', limit: '200' })
    if (roomFilter !== 'all') p.set('roomCode', roomFilter)
    return `/api/maintenance?${p}`
  }, [roomFilter])

  const { data: resp, loading, error, refetch } = useFetch<PaginatedLogs>(apiUrl)
  const { data: rooms } = useFetch<ApiRoom[]>('/api/rooms')

  const handleSaved = useCallback(() => { refetch(); setPage(1) }, [refetch])
  const openEdit = (log: ApiLog) => { setEditLog(log); setSheet(true) }
  const openAdd = () => { setEditLog(undefined); setSheet(true) }
  const closeSheet = () => { setSheet(false); setEditLog(undefined) }

  const handleDelete = async (log: ApiLog) => {
    if (!confirm(`Xóa bản ghi ${logId(log)}? Hành động này không thể hoàn tác.`)) return
    setDeletingId(log.id)
    try { await csrfFetch(`/api/maintenance/${log.id}`, { method: 'DELETE' }); refetch() }
    finally { setDeletingId(null) }
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>Đang tải dữ liệu...</div>
  if (error)   return <div style={{ padding: 60, textAlign: 'center', color: 'var(--err-tx)', fontSize: 14 }}>Lỗi tải dữ liệu: {error}</div>
  if (!resp)   return null

  const allLogs = resp.data
  const uniqueTechs = Array.from(
    new Map(allLogs.filter(l => l.technician).map(l => [l.technicianId, l.technician!.name])).entries()
  ).map(([id, name]) => ({ id: Number(id), name })).sort((a, b) => a.name.localeCompare(b.name))

  const filtered = allLogs.filter(m =>
    (techFilter === 'all' || String(m.technicianId) === techFilter) &&
    (typeFilter === 'all' || (typeFilter === 'nk') === m.isSupplyIntake)
  )
  const pages = Math.max(1, Math.ceil(filtered.length / perPage))
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage)

  const roomOpts = [{ value: 'all', label: 'Tất cả phòng' }, ...(rooms ?? []).map(r => ({ value: r.roomCode, label: r.roomCode }))]
  const techOpts = [{ value: 'all', label: 'Tất cả KTV' }, ...uniqueTechs.map(t => ({ value: String(t.id), label: t.name }))]

  return (
    <div className="stack">
      <Card pad={16} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 600 }}><Icon name="filter" size={16} />Lọc</div>
        <Select value={roomFilter} onChange={v => { setRoomFilter(v); setPage(1) }} options={roomOpts} />
        <Select value={techFilter} onChange={v => { setTechFilter(v); setPage(1) }} options={techOpts} />
        <Select value={typeFilter} onChange={v => { setTypeFilter(v); setPage(1) }} options={[
          { value: 'all', label: 'Tất cả loại' },
          { value: 'bt', label: 'Bảo trì' },
          ...(isKtv ? [] : [{ value: 'nk', label: 'Nhập kho' }]),
        ]} />
        <Button variant="primary" icon="plus" style={{ marginLeft: 'auto' }} onClick={openAdd}>Thêm bản ghi</Button>
      </Card>

      <Card pad={0}>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ minWidth: 900 }}>
            <thead><tr>
              <th style={{ paddingLeft: 22, whiteSpace: 'nowrap' }}>Mã / Ngày</th>
              <th style={{ whiteSpace: 'nowrap' }}>Phòng</th>
              <th style={{ whiteSpace: 'nowrap' }}>Kỹ thuật viên</th>
              <th style={{ whiteSpace: 'nowrap' }}>Linh kiện thay thế</th>
              <th style={{ whiteSpace: 'nowrap' }}>Thu hồi nhập kho</th>
              <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Trước → Sau</th>
              <th style={{ whiteSpace: 'nowrap' }}>Ghi chú</th>
              <th style={{ width: 80 }}></th>
            </tr></thead>
            <tbody>
              {pageItems.map(m => {
                const items = logToItems(m, QTY_MAP)
                const recItems = logToItems(m, REC_QTY_MAP)
                const before = m.softwareErrorsBefore + m.hardwareErrorsBefore
                const after  = m.softwareErrorsAfter  + m.hardwareErrorsAfter
                const isDeleting = deletingId === m.id
                return (
                  <tr key={m.id} className="trow">
                    <td style={{ paddingLeft: 22, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600, color: m.isSupplyIntake ? 'var(--primary)' : 'var(--text)' }}>{logId(m)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{fmtDate(m.maintenanceDate)}</div>
                    </td>
                    <td>{m.isSupplyIntake ? <Badge tone="info" icon="pkgIn">Nhập kho</Badge> : <Badge tone="muted">{m.room?.roomCode ?? '—'}</Badge>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {m.technician?.name || m.technicianName ||
                       m.createdBy?.profile?.displayName || m.createdBy?.username || m.createdBy?.email || '—'}
                    </td>
                    <td><ItemChips items={items} /></td>
                    <td><ItemChips items={recItems} bgColor="color-mix(in srgb, var(--good) 12%, var(--surface-2))" /></td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {!m.isSupplyIntake
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                            <span style={{ color: 'var(--err-tx)' }}>{before}</span><Icon name="arrowR" size={13} style={{ color: 'var(--good)' }} /><span style={{ color: 'var(--good-tx)' }}>{after}</span>
                          </span>
                        : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                    </td>
                    <td style={{ color: 'var(--text-muted)', maxWidth: 240, fontSize: 13 }}>{m.notes ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', paddingRight: 8 }}>
                        <button className="icon-btn" title="Sửa" onClick={() => openEdit(m)} style={{ color: 'var(--primary)' }}>
                          <Icon name="edit" size={15} />
                        </button>
                        <button className="icon-btn" title="Xóa" onClick={() => handleDelete(m)} disabled={isDeleting} style={{ color: 'var(--err-tx)', opacity: isDeleting ? 0.4 : 1 }}>
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>Hiển thị {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} / {filtered.length} bản ghi</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="icon-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ opacity: page === 1 ? .4 : 1 }}><Icon name="chevronL" size={16} /></button>
            {Array.from({ length: pages }).map((_, i) => (
              <button key={i} onClick={() => setPage(i + 1)} className="icon-btn" style={{ width: 36, fontWeight: 600, fontSize: 13, ...(page === i + 1 ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : {}) }}>{i + 1}</button>
            ))}
            <button className="icon-btn" disabled={page === pages} onClick={() => setPage(p => Math.min(pages, p + 1))} style={{ opacity: page === pages ? .4 : 1 }}><Icon name="chevronR" size={16} /></button>
          </div>
        </div>
      </Card>

      <RecordSheet open={sheet} onClose={closeSheet} onSaved={handleSaved} rooms={rooms ?? []} editLog={editLog} isKtv={isKtv} />
    </div>
  )
}
