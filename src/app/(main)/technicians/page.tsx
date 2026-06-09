'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFetch } from '@/lib/use-fetch'
import { csrfFetch } from '@/lib/csrf'
import { Card, CardHead, Badge } from '@/components/app/primitives'
import { fmtDate } from '@/lib/app-data'
import { Loader2 } from 'lucide-react'
import React from 'react'

interface Technician {
  id: number
  name: string
  phone: string | null
  department: string | null
  notes: string | null
  totalMaintenances: number
  totalPartsReplaced: number
}

interface LogEntry {
  id: number
  date: string
  room: string
  isSupplyIntake: boolean
  swBefore: number
  hwBefore: number
  swAfter: number
  hwAfter: number
  notes: string | null
}

interface TechDetail {
  id: number
  name: string
  phone: string | null
  department: string | null
  notes: string | null
  isActive: boolean
  totalMaintenances: number
  totalPartsReplaced: number
  logs: LogEntry[]
}

interface Me {
  user: { userId: number; role: string } | null
}

interface KtvUser {
  id: number
  email: string
  displayName: string | null
  department: string | null
  lastLoginAt: string | null
  isActive: boolean
}

function btnStyle(bg: string, ghost = false): React.CSSProperties {
  return {
    padding: '7px 14px', borderRadius: 8,
    border: ghost ? '1px solid var(--border)' : 'none',
    background: ghost ? 'transparent' : bg,
    color: ghost ? 'var(--text)' : '#fff',
    fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
  }
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

const EMPTY_FORM = { name: '', phone: '', department: '', notes: '' }

export default function TechniciansPage() {
  const router = useRouter()
  const { data: techs, loading, error, refetch } = useFetch<Technician[]>('/api/technicians')
  const { data: me } = useFetch<Me>('/api/auth/me')
  const { data: ktvUsers } = useFetch<KtvUser[]>('/api/users?role=TECHNICIAN')
  const isAdmin = me?.user?.role === 'ADMIN' || me?.user?.role === 'MANAGER'

  const [selected, setSelected] = useState<number | null>(null)
  const { data: detail, loading: detailLoading, refetch: refetchDetail } = useFetch<TechDetail>(
    selected ? `/api/technicians/${selected}` : ''
  )

  // Thêm mới
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState(EMPTY_FORM)
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Sửa
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const startEdit = () => {
    if (!detail) return
    setEditForm({ name: detail.name, phone: detail.phone ?? '', department: detail.department ?? '', notes: detail.notes ?? '' })
    setEditMode(true)
    setEditError(null)
  }

  const saveEdit = async () => {
    if (!selected) return
    setEditLoading(true)
    setEditError(null)
    try {
      const res = await csrfFetch(`/api/technicians/${selected}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) {
        const d = await res.json()
        setEditError(d.error ?? 'Lỗi cập nhật')
      } else {
        setEditMode(false)
        refetchDetail()
        refetch()
      }
    } catch {
      setEditError('Lỗi kết nối')
    } finally {
      setEditLoading(false)
    }
  }

  const deactivate = async (techId: number) => {
    await csrfFetch(`/api/technicians/${techId}`, {
      method: 'DELETE',
    })
    setSelected(null)
    setEditMode(false)
    refetch()
  }

  const submitAdd = async () => {
    setAddLoading(true)
    setAddError(null)
    try {
      const res = await csrfFetch('/api/technicians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      const d = await res.json()
      if (!res.ok) {
        setAddError(d.error ?? 'Lỗi tạo kỹ thuật viên')
      } else {
        setShowAdd(false)
        setAddForm(EMPTY_FORM)
        refetch()
      }
    } catch {
      setAddError('Lỗi kết nối')
    } finally {
      setAddLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Loader2 size={28} style={{ animation: 'spin .7s linear infinite', color: 'var(--text-faint)' }} />
      </div>
    )
  }
  if (error) return <p style={{ color: 'var(--err-tx)' }}>Lỗi tải dữ liệu</p>

  return (
    <div className="stack">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>

        {/* Danh sách KTV */}
        <Card pad={0} style={{ flex: 1, minWidth: 0 }}>
          <div style={{ padding: '22px 22px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <CardHead title="Danh sách Kỹ thuật viên" sub={`${techs?.length ?? 0} kỹ thuật viên`} />
            {isAdmin && (
              <button
                onClick={() => setShowAdd(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
              >
                + Thêm KTV
              </button>
            )}
          </div>
          <div style={{ padding: '0 22px 12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {techs?.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setSelected(selected === t.id ? null : t.id); setEditMode(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderRadius: 12, border: '1px solid',
                    borderColor: selected === t.id ? 'var(--primary)' : 'var(--border)',
                    background: selected === t.id ? 'var(--primary-soft)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all .14s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 11, background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                      {t.name.trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase() || '?'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{t.department || t.phone || '—'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{t.totalMaintenances}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>lần BT</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{t.totalPartsReplaced}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>vật tư</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Chi tiết KTV */}
        {selected && (
          <Card style={{ width: 460, flexShrink: 0, maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
            {detailLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <Loader2 size={24} style={{ animation: 'spin .7s linear infinite', color: 'var(--text-faint)' }} />
              </div>
            ) : detail ? (
              <div className="stack" style={{ gap: 18 }}>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 50, height: 50, borderRadius: 13, background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 18 }}>
                      {detail.name.trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{detail.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>{detail.department || 'Kỹ thuật viên ngoài'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isAdmin && (
                      <>
                        {editMode ? (
                          <>
                            <button onClick={saveEdit} disabled={editLoading} style={btnStyle('var(--primary)')}>
                              {editLoading ? '...' : 'Lưu'}
                            </button>
                            <button onClick={() => { setEditMode(false); setEditError(null) }} style={btnStyle('', true)}>Hủy</button>
                          </>
                        ) : (
                          <>
                            <button onClick={startEdit} style={btnStyle('var(--primary)')}>Sửa</button>
                            <button onClick={() => deactivate(detail.id)} style={btnStyle('#ef4444')}>Xóa</button>
                          </>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => { setSelected(null); setEditMode(false) }}
                      title="Đóng"
                      style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 16, lineHeight: 1 }}
                    >×</button>
                  </div>
                </div>

                {editError && <p style={{ color: 'var(--err-tx)', fontSize: 13, margin: 0 }}>{editError}</p>}

                {editMode ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {([
                      { l: 'Họ và tên *', k: 'name' as const },
                      { l: 'SĐT', k: 'phone' as const },
                      { l: 'Đơn vị / Công ty', k: 'department' as const },
                      { l: 'Ghi chú', k: 'notes' as const },
                    ]).map(({ l, k }) => (
                      <div key={k}>
                        <label style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: 4 }}>{l}</label>
                        <input value={editForm[k]} onChange={e => setEditForm(f => ({ ...f, [k]: e.target.value }))} style={inputStyle} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { l: 'SĐT', v: detail.phone || '—' },
                      { l: 'Đơn vị', v: detail.department || '—' },
                      { l: 'Tổng lần BT', v: String(detail.totalMaintenances) },
                      { l: 'Tổng vật tư', v: String(detail.totalPartsReplaced) },
                    ].map((r, i) => (
                      <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 13px' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600 }}>{r.l}</div>
                        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, marginTop: 2 }}>{r.v}</div>
                      </div>
                    ))}
                    {detail.notes && (
                      <div style={{ gridColumn: 'span 2', background: 'var(--surface-2)', borderRadius: 10, padding: '10px 13px' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600 }}>Ghi chú</div>
                        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }}>{detail.notes}</div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
                    Lịch sử bảo trì ({detail.logs.length})
                  </div>
                  {detail.logs.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Chưa có bản ghi bảo trì nào</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {detail.logs.map(l => (
                        <div key={l.id} style={{ padding: '10px 13px', borderRadius: 10, background: 'var(--surface-2)', fontSize: 12.5, color: 'var(--text)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontWeight: 600 }}>{fmtDate(l.date)}</span>
                            <Badge tone={l.isSupplyIntake ? 'teacher' : 'info'}>{l.room}</Badge>
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>
                            {!l.isSupplyIntake && <span>SW: {l.swBefore}→{l.swAfter} · HW: {l.hwBefore}→{l.hwAfter}</span>}
                            {l.isSupplyIntake && 'Nhập kho vật tư'}
                            {l.notes && <span style={{ marginLeft: 6 }}>— {l.notes}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            ) : null}
          </Card>
        )}
      </div>

      {/* Tài khoản KTV (User accounts) — Admin xem dashboard từng người */}
      {isAdmin && ktvUsers && ktvUsers.length > 0 && (
        <Card pad={0} style={{ marginTop: 8 }}>
          <div style={{ padding: '20px 22px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <CardHead title="Tài khoản Kỹ thuật viên" sub={`${ktvUsers.length} tài khoản có role KTV`} />
          </div>
          <div style={{ padding: '0 22px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ktvUsers.map(u => (
                <div key={u.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                      {(u.displayName ?? u.email).trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase() || '?'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.displayName ?? u.email}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 1 }}>
                        {u.email}{u.department ? ` · ${u.department}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {u.lastLoginAt && (
                      <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                        Login: {fmtDate(new Date(u.lastLoginAt).toISOString().slice(0, 10))}
                      </span>
                    )}
                    <Badge tone={u.isActive ? 'good' : 'muted'}>{u.isActive ? 'Hoạt động' : 'Vô hiệu'}</Badge>
                    <button
                      onClick={() => router.push(`/dashboard/ktv/${u.id}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', borderRadius: 8, border: '1px solid var(--primary)',
                        background: 'var(--primary-soft)', color: 'var(--primary)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      Xem thông số
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Modal thêm KTV */}
      {showAdd && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { setShowAdd(false); setAddError(null) }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 400, boxShadow: '0 8px 40px rgba(0,0,0,.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 18 }}>Thêm Kỹ thuật viên</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                { l: 'Họ và tên *', k: 'name' as const },
                { l: 'SĐT', k: 'phone' as const },
                { l: 'Đơn vị / Công ty', k: 'department' as const },
                { l: 'Ghi chú', k: 'notes' as const },
              ]).map(({ l, k }) => (
                <div key={k}>
                  <label style={{ fontSize: 11.5, color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: 4 }}>{l}</label>
                  <input value={addForm[k]} onChange={e => setAddForm(f => ({ ...f, [k]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
            </div>
            {addError && <p style={{ color: 'var(--err-tx)', fontSize: 13, marginTop: 12, marginBottom: 0 }}>{addError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setShowAdd(false); setAddError(null) }} style={btnStyle('', true)}>Hủy</button>
              <button onClick={submitAdd} disabled={addLoading} style={btnStyle('var(--primary)')}>
                {addLoading ? 'Đang lưu...' : 'Thêm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
