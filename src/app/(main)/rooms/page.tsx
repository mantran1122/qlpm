'use client'
import { useState, useMemo, useCallback } from 'react'
import { useNav } from '@/lib/use-nav'
import { useFetch } from '@/lib/use-fetch'
import { csrfFetch } from '@/lib/csrf'
import { Card, Button, Badge, Dialog, Field, Input } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'

interface ApiRoom {
  id: number
  roomCode: string
  floor: { name: string }
  totalMachines: number
  cpuSpec: string | null
  ramSpec: string | null
  diskSpec: string | null
  monitorSpec: string | null
  notes: string | null
  errorCount: number
  goodCount: number
  softwareCount: number
  softwareMachineNos: number[]
}

interface FolderGroup {
  prefix: string
  rooms: ApiRoom[]
  totalErrors: number
}

interface RoomFormState {
  code: string
  machines: string
  cpu: string
  ram: string
  disk: string
  monitor: string
  notes: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

// Hiển thị tên nhóm: số thuần ("2") → "Tầng 2"; code có chữ ("I2", "T3") → giữ nguyên
function displayGroup(prefix: string) {
  return /^\d+$/.test(prefix) ? `Tầng ${prefix}` : prefix
}

function groupRooms(rooms: ApiRoom[]): FolderGroup[] {
  const map = new Map<string, ApiRoom[]>()
  for (const r of rooms) {
    const p = r.floor.name
    if (!map.has(p)) map.set(p, [])
    map.get(p)!.push(r)
  }
  return Array.from(map.entries())
    .map(([prefix, rs]) => ({
      prefix,
      rooms: [...rs].sort((a, b) => naturalSort(a.roomCode, b.roomCode)),
      totalErrors: rs.reduce((s, r) => s + r.errorCount, 0),
    }))
    .sort((a, b) => naturalSort(a.prefix, b.prefix))
}

function extractPrefix(code: string): string {
  return code.trim().toUpperCase().split('-')[0] ?? ''
}

const ROOM_CODE_RE = /^[A-Z0-9]+-[A-Z0-9]/

function emptyForm(prefill = ''): RoomFormState {
  return { code: prefill, machines: '', cpu: '', ram: '', disk: '', monitor: '', notes: '' }
}

function roomToForm(r: ApiRoom): RoomFormState {
  return {
    code: r.roomCode,
    machines: String(r.totalMachines),
    cpu: r.cpuSpec ?? '',
    ram: r.ramSpec ?? '',
    disk: r.diskSpec ?? '',
    monitor: r.monitorSpec ?? '',
    notes: r.notes ?? '',
  }
}

// ─── Add / Edit dialog ────────────────────────────────────────────────────

function RoomFormDialog({ open, onClose, onSave, title, initialForm, prefixHint, editRoom }: {
  open: boolean
  onClose: () => void
  onSave: (form: RoomFormState) => Promise<void>
  title: string
  initialForm: RoomFormState
  prefixHint?: string
  editRoom?: ApiRoom
}) {
  const [form, setForm] = useState<RoomFormState>(initialForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const newPrefix = extractPrefix(form.code)
  const oldPrefix = editRoom?.floor.name ?? ''
  const prefixChanged = !!(editRoom && newPrefix && newPrefix !== oldPrefix)

  const prefixError = useMemo(() => {
    if (!prefixHint || !form.code.trim()) return null
    if (extractPrefix(form.code) !== prefixHint)
      return `Mã phòng phải thuộc nhóm ${prefixHint} (ví dụ: ${prefixHint}-06)`
    return null
  }, [prefixHint, form.code])

  function set(key: keyof RoomFormState) {
    return (v: string) => setForm(prev => ({ ...prev, [key]: v }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (prefixError) return
    const code = form.code.trim().toUpperCase()
    if (!code || !ROOM_CODE_RE.test(code)) {
      setError('Mã phòng không hợp lệ (ví dụ: I2-01)')
      return
    }
    if (!form.machines || isNaN(Number(form.machines)) || Number(form.machines) <= 0) {
      setError('Số máy tính phải là số dương')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({ ...form, code })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} width={520}>
      <form onSubmit={handleSubmit}>
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{title}</div>

          {prefixChanged && (
            <div style={{
              padding: '10px 14px', borderRadius: 10,
              background: 'var(--both-bg)', color: 'var(--both-tx)',
              fontSize: 13, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <Icon name="warning" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              Phòng này sẽ được chuyển từ nhóm <strong style={{ marginLeft: 4 }}>{displayGroup(oldPrefix)}</strong>
              <span style={{ margin: '0 4px' }}>sang</span>
              <strong>{displayGroup(newPrefix)}</strong> khi lưu.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Mã phòng *">
              <Input
                value={form.code}
                onChange={v => { set('code')(v); setError(null) }}
                placeholder="Ví dụ: I2-01"
              />
              {prefixError && (
                <div style={{ fontSize: 12, color: 'var(--err-tx)', marginTop: 5 }}>{prefixError}</div>
              )}
            </Field>
            <Field label="Số máy tính *">
              <Input value={form.machines} onChange={set('machines')} placeholder="30" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="CPU"><Input value={form.cpu} onChange={set('cpu')} placeholder="i5-11400" /></Field>
              <Field label="RAM"><Input value={form.ram} onChange={set('ram')} placeholder="8GB" /></Field>
              <Field label="Ổ cứng"><Input value={form.disk} onChange={set('disk')} placeholder="SSD 256GB" /></Field>
              <Field label="Màn hình"><Input value={form.monitor} onChange={set('monitor')} placeholder='DELL 22"' /></Field>
            </div>
            <Field label="Ghi chú">
              <Input value={form.notes} onChange={set('notes')} placeholder="Tùy chọn..." />
            </Field>
          </div>

          {error && (
            <div style={{ fontSize: 13, color: 'var(--err-tx)', marginTop: 12 }}>{error}</div>
          )}
        </div>
        <div style={{ padding: '20px 28px', display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)', marginTop: 20 }}>
          <Button variant="ghost" onClick={onClose} type="button">Huỷ</Button>
          <Button variant="primary" type="submit" disabled={saving || !!prefixError}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

// ─── Delete confirm dialog ────────────────────────────────────────────────

function DeleteDialog({ room, onClose, onConfirm }: {
  room: ApiRoom | null
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setDeleting(false)
    }
  }

  return (
    <Dialog open={!!room} onClose={onClose} width={460}>
      {room && (
        <div style={{ padding: 28 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Xoá phòng?</div>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
            Xoá phòng <strong>{room.roomCode}</strong> sẽ xoá luôn{' '}
            <strong style={{ color: 'var(--err-tx)' }}>{room.totalMachines} máy tính</strong>{' '}
            thuộc phòng này. Hành động không thể hoàn tác.
          </p>
          {error && <div style={{ fontSize: 13, color: 'var(--err-tx)', marginBottom: 14 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="ghost" onClick={onClose} type="button">Huỷ</Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Đang xoá...' : 'Xác nhận xoá'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

// ─── Folder block (accordion) ─────────────────────────────────────────────

function FolderBlock({ group, expanded, onToggle, onAddToFolder, onEdit, onDelete, onNavigate }: {
  group: FolderGroup
  expanded: boolean
  onToggle: () => void
  onAddToFolder: (prefix: string) => void
  onEdit: (room: ApiRoom) => void
  onDelete: (room: ApiRoom) => void
  onNavigate: (roomCode: string) => void
}) {
  const hasErrors = group.totalErrors > 0

  return (
    <div style={{ borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--surface)' }}>
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer', userSelect: 'none', background: 'var(--surface-2)',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
        }}
      >
        <Icon
          name={expanded ? 'chevronD' : 'chevronR'}
          size={15}
          style={{ color: 'var(--text-faint)', flexShrink: 0 }}
        />
        <Icon name="folder" size={17} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 14.5, letterSpacing: '-.01em' }}>{displayGroup(group.prefix)}</span>
        <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
          {group.rooms.length} phòng
        </span>
        <Badge tone={hasErrors ? 'err' : 'good'} dot style={{ fontSize: 11.5 }}>
          {hasErrors ? `${group.totalErrors} máy lỗi` : 'Hoạt động tốt'}
        </Badge>
        <div style={{ marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="sm" icon="plus" onClick={() => onAddToFolder(group.prefix)}>
            Thêm vào {displayGroup(group.prefix)}
          </Button>
        </div>
      </div>

      {/* Room rows */}
      {expanded && group.rooms.map((room, i) => (
        <div
          key={room.id}
          style={{
            padding: '10px 18px 10px 46px',
            display: 'flex', alignItems: 'center', gap: 12,
            fontSize: 13.5,
            borderBottom: i < group.rooms.length - 1 ? '1px solid var(--border)' : 'none',
          }}
        >
          <Icon name="monitor" size={15} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          <button
            className="linkbtn"
            onClick={() => onNavigate(room.roomCode)}
            style={{ fontWeight: 700, fontSize: 14, minWidth: 72, textAlign: 'left' }}
          >
            {room.roomCode}
          </button>
          <span style={{ color: 'var(--text-faint)', minWidth: 58, fontSize: 12.5 }}>
            {room.totalMachines} máy
          </span>
          <Badge
            tone={room.errorCount === 0 ? 'good' : room.errorCount <= 5 ? 'both' : 'err'}
            dot
            style={{ fontSize: 11.5 }}
          >
            {room.errorCount === 0 ? 'Hoạt động tốt' : `${room.errorCount} máy lỗi`}
          </Badge>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <Button variant="ghost" size="sm" icon="edit" onClick={() => onEdit(room)}>Sửa</Button>
            <Button variant="ghost" size="sm" icon="trash" onClick={() => onDelete(room)}>Xoá</Button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────

export default function RoomsPage() {
  const { data: rooms, loading, error, refetch } = useFetch<ApiRoom[]>('/api/rooms')
  const go = useNav()

  const groups = useMemo(() => (rooms ? groupRooms(rooms) : []), [rooms])

  // Track which folders are expanded (mặc định tất cả đóng)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleFolder(prefix: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(prefix) ? next.delete(prefix) : next.add(prefix)
      return next
    })
  }

  // Add dialog
  const [addOpen, setAddOpen] = useState(false)
  const [addPrefix, setAddPrefix] = useState<string | null>(null)

  function openAdd(prefix?: string) {
    setAddPrefix(prefix ?? null)
    setAddOpen(true)
  }

  // Edit dialog
  const [editRoom, setEditRoom] = useState<ApiRoom | null>(null)

  // Delete dialog
  const [deleteRoom, setDeleteRoom] = useState<ApiRoom | null>(null)

  // ── Mutations ──────────────────────────────────────────────────────────

  const handleAdd = useCallback(async (form: RoomFormState) => {
    const res = await csrfFetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomCode: form.code,
        totalMachines: Number(form.machines),
        cpuSpec: form.cpu || null,
        ramSpec: form.ram || null,
        diskSpec: form.disk || null,
        monitorSpec: form.monitor || null,
        notes: form.notes || null,
      }),
    })
    if (!res.ok) {
      const j: { error?: string } = await res.json().catch(() => ({}))
      throw new Error(j.error ?? `Lỗi ${res.status}`)
    }
    setAddOpen(false)
    refetch()
  }, [refetch])

  const handleEdit = useCallback(async (form: RoomFormState) => {
    if (!editRoom) return
    const res = await csrfFetch(`/api/rooms/${editRoom.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomCode: form.code,
        totalMachines: Number(form.machines),
        cpuSpec: form.cpu || null,
        ramSpec: form.ram || null,
        diskSpec: form.disk || null,
        monitorSpec: form.monitor || null,
        notes: form.notes || null,
      }),
    })
    if (!res.ok) {
      const j: { error?: string } = await res.json().catch(() => ({}))
      throw new Error(j.error ?? `Lỗi ${res.status}`)
    }
    setEditRoom(null)
    refetch()
  }, [editRoom, refetch])

  const handleDelete = useCallback(async () => {
    if (!deleteRoom) return
    const res = await csrfFetch(`/api/rooms/${deleteRoom.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j: { error?: string } = await res.json().catch(() => ({}))
      throw new Error(j.error ?? `Lỗi ${res.status}`)
    }
    setDeleteRoom(null)
    refetch()
  }, [deleteRoom, refetch])

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
      Đang tải dữ liệu...
    </div>
  )
  if (error) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--err-tx)', fontSize: 14 }}>
      Lỗi tải dữ liệu: {error}
    </div>
  )
  if (!rooms) return null

  const totalRooms = rooms.length
  const totalErrors = rooms.reduce((s, r) => s + r.errorCount, 0)

  return (
    <div className="stack">
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Badge tone="muted">{groups.length} nhóm</Badge>
          <Badge tone="muted">{totalRooms} phòng</Badge>
          <Badge tone={totalErrors > 0 ? 'err' : 'good'} dot>{totalErrors} máy lỗi</Badge>
        </div>
        {/* <Button variant="primary" icon="plus" onClick={() => openAdd()}>
          Thêm tầng mới
        </Button> */}
      </div>

      {/* Tree */}
      {groups.length === 0 ? (
        <Card pad={48} style={{ textAlign: 'center', color: 'var(--text-faint)' }}>
          Chưa có phòng nào.
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.map(group => (
            <FolderBlock
              key={group.prefix}
              group={group}
              expanded={expanded.has(group.prefix)}
              onToggle={() => toggleFolder(group.prefix)}
              onAddToFolder={openAdd}
              onEdit={setEditRoom}
              onDelete={setDeleteRoom}
              onNavigate={roomCode => go('room-detail', roomCode)}
            />
          ))}
        </div>
      )}

      {/* Add dialog — remount on each open to reset form */}
      <RoomFormDialog
        key={addOpen ? `add-${addPrefix ?? 'global'}` : 'add-closed'}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleAdd}
        title="Thêm tầng mới"
        initialForm={emptyForm(addPrefix ? `${addPrefix}-` : '')}
        prefixHint={addPrefix ?? undefined}
      />

      {/* Edit dialog — remount per room */}
      <RoomFormDialog
        key={editRoom ? `edit-${editRoom.id}` : 'edit-closed'}
        open={!!editRoom}
        onClose={() => setEditRoom(null)}
        onSave={handleEdit}
        title="Sửa thông tin phòng"
        initialForm={editRoom ? roomToForm(editRoom) : emptyForm()}
        editRoom={editRoom ?? undefined}
      />

      {/* Delete dialog */}
      <DeleteDialog
        room={deleteRoom}
        onClose={() => setDeleteRoom(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
