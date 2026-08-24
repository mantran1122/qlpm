'use client'
import { useState, useCallback } from 'react'
import { useFetch } from '@/lib/use-fetch'
import { supplyLevel } from '@/lib/app-data'
import { Card, CardHead, Badge, Button, Sheet, Field, Input, IconBtn } from '@/components/app/primitives'
import { Progress } from '@/components/app/charts'
import { Icon } from '@/components/app/icons'
import { csrfFetch } from '@/lib/csrf'

interface SupplyBalance {
  id: number
  type: string
  label: string
  icon: string
  isBuiltin: boolean
  intake: number
  used: number
  adjustment: number
  balance: number
}

interface AdjHistory {
  id: number
  delta: number
  movementType: 'ADJUSTMENT' | 'EXTERNAL_ISSUE'
  reason: string
  coordinatorName: string
  recipientName: string | null
  recipientUnit: string | null
  documentRef: string | null
  note: string | null
  createdAt: string
  supplyItem: { label: string; code: string; icon: string | null }
  createdBy: { username: string; profile: { displayName: string | null } | null }
}

function IssueSheet({ item, onClose, onDone }: { item: SupplyBalance; onClose: () => void; onDone: () => void }) {
  const [quantity, setQuantity] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientUnit, setRecipientUnit] = useState('')
  const [reason, setReason] = useState('')
  const [documentRef, setDocumentRef] = useState('')
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const submit = async () => {
    const amount = Number(quantity)
    if (!Number.isInteger(amount) || amount <= 0) return setErr('So luong phai la so nguyen duong')
    if (amount > item.balance) return setErr(`Khong du ton kho (con ${item.balance})`)
    if (!recipientName.trim() || !recipientUnit.trim() || !reason.trim() || !documentRef.trim() || !confirmed) return setErr('Hay dien du thong tin ban giao va xac nhan')
    setSaving(true); setErr('')
    const res = await csrfFetch('/api/supplies/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supplyItemId: item.id, quantity: amount, recipientName: recipientName.trim(), recipientUnit: recipientUnit.trim(), reason: reason.trim(), documentRef: documentRef.trim(), note: note.trim() || undefined, confirmed }) })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); return setErr(d.error ?? 'Loi khong xac dinh') }
    onDone()
  }
  return <Sheet open onClose={onClose} width={460}>
    <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border)' }}><div style={{ fontWeight: 700, fontSize: 15 }}>Xuat vat tu ngoai kho</div><div style={{ fontSize: 12.5, color: 'var(--err-tx)', marginTop: 3 }}>{item.label} - ton kha dung: {item.balance}. Giao dich nay khong the sua/xoa.</div></div>
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="So luong xuat *"><Input value={quantity} onChange={setQuantity} placeholder="So nguyen duong" icon="supplies" /></Field>
      <Field label="Nguoi nhan *"><Input value={recipientName} onChange={setRecipientName} placeholder="Ho va ten nguoi nhan" icon="user" /></Field>
      <Field label="Don vi / noi nhan *"><Input value={recipientUnit} onChange={setRecipientUnit} placeholder="VD: Phong Dao tao" icon="folder" /></Field>
      <Field label="Muc dich xuat *"><Input value={reason} onChange={setReason} placeholder="Mo ta ro muc dich su dung" icon="edit" /></Field>
      <Field label="So phieu / chung tu *"><Input value={documentRef} onChange={setDocumentRef} placeholder="VD: PXK-2026-001" icon="folder" /></Field>
      <Field label="Ghi chu"><textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13.5, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} /></Field>
      <label style={{ display: 'flex', gap: 9, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Toi xac nhan da kiem dem va ban giao dung thong tin tren.</label>
      {err && <div style={{ background: 'var(--err-bg)', color: 'var(--err-tx)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>{err}</div>}
    </div>
    <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}><Button variant="ghost" onClick={onClose}>Huy</Button><Button variant="danger" onClick={submit} disabled={saving} icon="trendDown">{saving ? 'Dang xuat...' : 'Xac nhan xuat kho'}</Button></div>
  </Sheet>
}

interface HistoryResp { data: AdjHistory[]; total: number }

const ICON_OPTS = [
  'box','case','cpu','ram','disk','power','screen','cable','mouse','network','keyboard',
  'supplies','tools','folder','inbox','wrench',
]

function fmtDt(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ── AdjustSheet ──────────────────────────────────────────────────────────────
function AdjustSheet({ item, onClose, onDone }: {
  item: SupplyBalance; onClose: () => void; onDone: () => void
}) {
  const [mode, setMode] = useState<'+' | '-'>('+')
  const [amount, setAmount] = useState('')
  const [coordinator, setCoordinator] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    const amt = Number(amount)
    if (!amt || amt <= 0) return setErr('Số lượng phải lớn hơn 0')
    if (!coordinator.trim()) return setErr('Nhập tên người điều phối')
    if (!reason.trim()) return setErr('Nhập lý do điều chỉnh')
    setSaving(true); setErr('')
    const res = await csrfFetch('/api/supplies/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplyItemId: item.id,
        delta: mode === '+' ? amt : -amt,
        reason: reason.trim(),
        coordinatorName: coordinator.trim(),
        note: note.trim() || undefined,
      }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); return setErr(d.error ?? 'Lỗi không xác định') }
    onDone()
  }

  return (
    <Sheet open onClose={onClose} width={440}>
      <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--primary-soft)', color: 'var(--primary)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name={item.icon} size={20} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Điều chỉnh tồn kho</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
            {item.label} — hiện còn <strong style={{ color: item.balance < 5 ? 'var(--err-tx)' : 'var(--text)' }}>{item.balance}</strong>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Loại điều chỉnh">
          <div style={{ display: 'flex', gap: 8 }}>
            {(['+', '-'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: '2px solid',
                borderColor: mode === m ? (m === '+' ? 'var(--good)' : 'var(--err)') : 'var(--border)',
                background: mode === m ? (m === '+' ? 'var(--good-bg)' : 'var(--err-bg)') : 'var(--surface-2)',
                color: mode === m ? (m === '+' ? 'var(--good-tx)' : 'var(--err-tx)') : 'var(--text-muted)',
                fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all .15s',
              }}>
                {m === '+' ? '+ Nhập / Thêm vào' : '− Xuất / Giảm đi'}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Số lượng *">
          <Input value={amount} onChange={setAmount} placeholder="Nhập số lượng..." icon="supplies" />
        </Field>

        <Field label="Người điều phối *">
          <Input value={coordinator} onChange={setCoordinator} placeholder="Họ tên người điều phối..." icon="user" />
        </Field>

        <Field label="Lý do điều chỉnh *">
          <Input value={reason} onChange={setReason} placeholder="VD: Nhập thêm từ kho trung tâm..." icon="edit" />
        </Field>

        <Field label="Ghi chú (tùy chọn)">
          <textarea
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="Thông tin bổ sung..."
            rows={3}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: '1.5px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text)', fontSize: 13.5, resize: 'vertical',
              outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </Field>

        {err && (
          <div style={{ background: 'var(--err-bg)', color: 'var(--err-tx)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
            <Icon name="alert" size={14} style={{ marginRight: 6 }} />{err}
          </div>
        )}
      </div>
      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Hủy</Button>
        <Button onClick={submit} disabled={saving} icon={mode === '+' ? 'pkgIn' : 'trendDown'}>
          {saving ? 'Đang lưu...' : mode === '+' ? 'Xác nhận nhập' : 'Xác nhận xuất'}
        </Button>
      </div>
    </Sheet>
  )
}

// ── HistorySheet ─────────────────────────────────────────────────────────────
function HistorySheet({ item, onClose }: { item: SupplyBalance; onClose: () => void }) {
  const { data, loading } = useFetch<HistoryResp>(`/api/supplies/history?itemId=${item.id}&limit=50`)

  return (
    <Sheet open onClose={onClose} width={500}>
      <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface-3)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="history" size={20} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Lịch sử điều chỉnh</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>{item.label}</div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 24px 16px' }}>
        {loading && (
          <div style={{ color: 'var(--text-faint)', fontSize: 13, textAlign: 'center', padding: 40 }}>Đang tải...</div>
        )}
        {!loading && !data?.data?.length && (
          <div style={{ color: 'var(--text-faint)', fontSize: 13, textAlign: 'center', padding: 40 }}>
            <Icon name="history" size={28} style={{ opacity: .3, display: 'block', margin: '0 auto 10px' }} />
            Chưa có điều chỉnh nào
          </div>
        )}
        {data?.data?.map(h => (
          <div key={h.id} style={{ padding: '13px 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center',
              background: h.delta > 0 ? 'var(--good-bg)' : 'var(--err-bg)',
              color: h.delta > 0 ? 'var(--good-tx)' : 'var(--err-tx)',
              fontWeight: 800, fontSize: 15,
            }}>
              {h.delta > 0 ? '+' : '−'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, color: h.delta > 0 ? 'var(--good-tx)' : 'var(--err-tx)', fontSize: 15 }}>
                  {h.delta > 0 ? `+${h.delta}` : h.delta}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--text-faint)', flexShrink: 0 }}>{fmtDt(h.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 3 }}>{h.reason}</div>
              {h.movementType === 'EXTERNAL_ISSUE' && (
                <div style={{ fontSize: 12, color: 'var(--err-tx)', marginTop: 3 }}>
                  Xuất ngoài kho: {h.recipientName} · {h.recipientUnit} · Chứng từ: {h.documentRef}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                Điều phối: <strong>{h.coordinatorName}</strong>
                {' · '}Bởi: {h.createdBy.profile?.displayName ?? h.createdBy.username}
              </div>
              {h.note && (
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3, fontStyle: 'italic' }}>{h.note}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

// ── AddEditItemSheet ─────────────────────────────────────────────────────────
function AddEditItemSheet({ item, onClose, onDone }: {
  item?: SupplyBalance | null; onClose: () => void; onDone: () => void
}) {
  const [label, setLabel] = useState(item?.label ?? '')
  const [icon, setIcon] = useState(item?.icon ?? 'box')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!label.trim()) return setErr('Tên vật tư không được để trống')
    setSaving(true); setErr('')
    const res = item
      ? await csrfFetch(`/api/supplies/items/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: label.trim(), icon }),
        })
      : await csrfFetch('/api/supplies/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: label.trim(), icon }),
        })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); return setErr(d.error ?? 'Lỗi') }
    onDone()
  }

  return (
    <Sheet open onClose={onClose} width={400}>
      <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{item ? 'Sửa tên vật tư' : 'Thêm vật tư mới'}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>
          {item ? 'Cập nhật tên hiển thị và icon' : 'Thêm loại phát sinh: router, thiết bị cũ, v.v.'}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Tên vật tư *">
          <Input value={label} onChange={setLabel} placeholder="VD: Router, Vật phẩm cũ..." icon="edit" />
        </Field>
        <Field label="Chọn icon">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {ICON_OPTS.map(ic => (
              <button key={ic} onClick={() => setIcon(ic)} title={ic} style={{
                width: 36, height: 36, borderRadius: 8, border: '2px solid',
                borderColor: icon === ic ? 'var(--primary)' : 'var(--border)',
                background: icon === ic ? 'var(--primary-soft)' : 'var(--surface-2)',
                color: icon === ic ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer', display: 'grid', placeItems: 'center', transition: 'all .12s',
              }}>
                <Icon name={ic} size={17} />
              </button>
            ))}
          </div>
        </Field>
        {err && (
          <div style={{ background: 'var(--err-bg)', color: 'var(--err-tx)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>{err}</div>
        )}
      </div>
      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Hủy</Button>
        <Button onClick={submit} disabled={saving} icon="save">
          {saving ? 'Đang lưu...' : item ? 'Lưu thay đổi' : 'Thêm vật tư'}
        </Button>
      </div>
    </Sheet>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SuppliesPage() {
  const { data: raw, loading, error, refetch } = useFetch<SupplyBalance[]>('/api/supplies/balance')
  const { data: me } = useFetch<{ user: { role: string } | null }>('/api/auth/me')

  // undefined = sheet closed; null = add-new mode; SupplyBalance = edit mode
  const [editItem, setEditItem] = useState<SupplyBalance | null | undefined>(undefined)
  const [adjustItem, setAdjustItem] = useState<SupplyBalance | null>(null)
  const [issueItem, setIssueItem] = useState<SupplyBalance | null>(null)
  const [historyItem, setHistoryItem] = useState<SupplyBalance | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canManage = me?.user?.role === 'ADMIN' || me?.user?.role === 'MANAGER'
  const isAdmin = me?.user?.role === 'ADMIN'

  const handleDelete = useCallback(async (id: number) => {
    setDeleting(true)
    await csrfFetch(`/api/supplies/items/${id}`, { method: 'DELETE' })
    setDeleting(false); setDeleteId(null); refetch()
  }, [refetch])

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
      <Icon name="refresh" size={28} style={{ marginBottom: 12, opacity: 0.4, animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 12px' }} />
      <div>Đang tải dữ liệu...</div>
    </div>
  )
  if (error) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <Icon name="alert" size={28} style={{ color: 'var(--err)', display: 'block', margin: '0 auto 12px' }} />
      <div style={{ color: 'var(--err-tx)', fontSize: 14, marginBottom: 16 }}>Không tải được dữ liệu.</div>
      <Button variant="outline" size="sm" onClick={() => refetch()} icon="refresh">Thử lại</Button>
    </div>
  )
  if (!raw) return null

  const supplies = raw.map(s => {
    const base = s.intake + Math.max(0, s.adjustment)
    const pct = base > 0 ? Math.round((s.balance / base) * 100) : 0
    return { ...s, pct }
  })

  const totalItems = supplies.length
  const lowCount = supplies.filter(s => s.balance < 5).length
  const totalReceived = supplies.reduce((acc, x) => acc + x.intake, 0)

  const overview = [
    { label: 'Tổng loại vật tư', val: totalItems, icon: 'supplies', tone: 'info' },
    { label: 'Loại sắp hết', val: lowCount, icon: 'warning', tone: 'err' },
    { label: 'Tổng đã nhận kho', val: totalReceived.toLocaleString('vi-VN'), icon: 'pkgIn', tone: 'good' },
  ]
  const toneColor: Record<string, string> = { info: 'var(--primary)', err: 'var(--err)', good: 'var(--good)' }
  const toneBg: Record<string, string> = { info: 'var(--primary-soft)', err: 'var(--err-bg)', good: 'var(--good-bg)' }

  return (
    <div className="stack">
      <div className="grid-3">
        {overview.map(o => (
          <Card key={o.label} className="lift" pad={20} style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            <div style={{ width: 50, height: 50, borderRadius: 14, background: toneBg[o.tone], color: toneColor[o.tone], display: 'grid', placeItems: 'center' }}>
              <Icon name={o.icon} size={24} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>{o.val}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5 }}>{o.label}</div>
            </div>
          </Card>
        ))}
      </div>

      <Card pad={0}>
        <div style={{ padding: '20px 22px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <CardHead title="Tồn kho vật tư" sub="Điều chỉnh trực tiếp hoặc qua phiếu bảo trì — đều được ghi lại" />
          {canManage && (
            <Button size="sm" icon="plus" onClick={() => setEditItem(null)}>Thêm vật tư</Button>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ minWidth: 880 }}>
            <thead><tr>
              <th style={{ paddingLeft: 22 }}>Loại vật tư</th>
              <th style={{ textAlign: 'center' }}>Đã nhận</th>
              <th style={{ textAlign: 'center' }}>Đã dùng</th>
              <th style={{ textAlign: 'center' }}>Điều chỉnh</th>
              <th style={{ textAlign: 'center' }}>Còn lại</th>
              <th style={{ width: 190 }}>Mức tồn</th>
              <th style={{ textAlign: 'center' }}>Trạng thái</th>
              <th style={{ textAlign: 'right', paddingRight: 16, width: 160 }}>Thao tác</th>
            </tr></thead>
            <tbody>
              {supplies.slice().sort((a, b) => a.pct - b.pct).map(s => {
                const lv = supplyLevel({ key: s.type, received: s.intake, used: s.used, label: s.label, icon: s.icon, remain: s.balance, pct: s.pct })
                return (
                  <tr key={s.id} className="trow">
                    <td style={{ paddingLeft: 22 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-3)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                          <Icon name={s.icon} size={18} />
                        </div>
                        <div>
                          <span style={{ fontWeight: 600 }}>{s.label}</span>
                          {!s.isBuiltin && (
                            <span style={{ marginLeft: 6, fontSize: 10.5, background: 'var(--surface-3)', color: 'var(--text-faint)', borderRadius: 4, padding: '1px 5px' }}>tùy chỉnh</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{s.intake}</td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{s.used}</td>
                    <td style={{ textAlign: 'center' }}>
                      {s.adjustment !== 0
                        ? <span style={{ fontWeight: 600, color: s.adjustment > 0 ? 'var(--good-tx)' : 'var(--err-tx)', fontSize: 13 }}>
                            {s.adjustment > 0 ? `+${s.adjustment}` : s.adjustment}
                          </span>
                        : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, color: s.balance < 1 ? 'var(--err-tx)' : s.balance < 5 ? 'var(--err-tx)' : 'var(--text)' }}>
                      {s.balance}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1 }}><Progress value={s.pct} tone={`var(--${lv.tone})`} height={8} /></div>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: `var(--${lv.tone}-tx)`, width: 36, textAlign: 'right' }}>{s.pct}%</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {s.balance < 1
                        ? <Badge tone="err" icon="warning">Hết hàng</Badge>
                        : s.balance < 5
                          ? <Badge tone="err" icon="warning">Cần nhập thêm</Badge>
                          : <Badge tone={lv.tone as 'good' | 'both' | 'err'} dot>{lv.label}</Badge>}
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: 16 }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <IconBtn name="history" size={16} title="Lịch sử điều chỉnh" onClick={() => setHistoryItem(s)} />
                        {isAdmin && <Button size="sm" variant="outline" icon="edit" onClick={() => setAdjustItem(s)}>Điều chỉnh</Button>}
                        {isAdmin && <Button size="sm" variant="danger" icon="trendDown" onClick={() => setIssueItem(s)}>Xuất kho</Button>}
                        {canManage && !s.isBuiltin && (
                          <>
                            <IconBtn name="edit" size={16} title="Sửa tên" onClick={() => setEditItem(s)} />
                            <IconBtn name="trash" size={16} title="Xóa vật tư" onClick={() => setDeleteId(s.id)} />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Sheets */}
      {adjustItem && (
        <AdjustSheet item={adjustItem} onClose={() => setAdjustItem(null)} onDone={() => { setAdjustItem(null); refetch() }} />
      )}
      {issueItem && (
        <IssueSheet item={issueItem} onClose={() => setIssueItem(null)} onDone={() => { setIssueItem(null); refetch() }} />
      )}
      {historyItem && (
        <HistorySheet item={historyItem} onClose={() => setHistoryItem(null)} />
      )}
      {editItem !== undefined && (
        <AddEditItemSheet item={editItem} onClose={() => setEditItem(undefined)} onDone={() => { setEditItem(undefined); refetch() }} />
      )}

      {/* Delete confirm */}
      {deleteId !== null && (
        <div className="dim-overlay" onClick={() => setDeleteId(null)} style={{ display: 'grid', placeItems: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 14, padding: '28px 32px', maxWidth: 380, width: '90%', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>Xóa vật tư?</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 22 }}>
              Vật tư sẽ bị ẩn khỏi danh sách. Lịch sử điều chỉnh vẫn được giữ lại.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setDeleteId(null)}>Hủy</Button>
              <Button variant="danger" disabled={deleting} onClick={() => handleDelete(deleteId)} icon="trash">
                {deleting ? 'Đang xóa...' : 'Xóa'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
