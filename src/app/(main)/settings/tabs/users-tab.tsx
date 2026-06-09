'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf'

interface ApiUser {
  id: number
  username: string
  email: string
  role: 'ADMIN' | 'MANAGER' | 'TECHNICIAN'
  isActive: boolean
  lockedUntil: string | null
  lastLoginAt: string | null
  displayName: string | null
  department: string | null
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  MANAGER: 'Quản lý',
  TECHNICIAN: 'Kỹ thuật viên',
}

const ROLE_COLOR: Record<string, string> = {
  ADMIN: '#ef4444',
  MANAGER: '#f97316',
  TECHNICIAN: '#3b82f6',
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ user }: { user: ApiUser }) {
  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date()
  if (!user.isActive) return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--err-bg, #fee2e2)', color: '#dc2626' }}>Vô hiệu</span>
  if (isLocked) return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#fef3c7', color: '#d97706' }}>Bị khóa</span>
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#dcfce7', color: '#16a34a' }}>Hoạt động</span>
}

// ─── Add User Dialog ───────────────────────────────────────────────────────

function AddUserDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ email: '', role: 'TECHNICIAN', displayName: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  async function save() {
    setError('')
    if (!form.email.trim()) {
      setError('Vui lòng nhập email'); return
    }
    if (!form.email.toLowerCase().endsWith('@nctu.edu.vn')) {
      setError('Chỉ chấp nhận email @nctu.edu.vn'); return
    }
    setSaving(true)
    try {
      const res = await csrfFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Lỗi tạo tài khoản'); return }
      toast.success(`Đã thêm ${data.email}`)
      onSaved(); onClose()
      setForm({ email: '', role: 'TECHNICIAN', displayName: '' })
    } catch { setError('Lỗi kết nối') }
    finally { setSaving(false) }
  }

  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 16, width: 460, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,.3)', zIndex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Thêm tài khoản</div>
        <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 20 }}>
          Người dùng đăng nhập bằng Google với email <strong>@nctu.edu.vn</strong>.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Email *</label>
            <div className="field"><input type="email" value={form.email} onChange={set('email')} placeholder="nguyen.van.a@nctu.edu.vn" /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Tên hiển thị</label>
            <div className="field"><input type="text" value={form.displayName} onChange={set('displayName')} placeholder="Nguyễn Văn A (để trống = dùng tên email)" /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Vai trò *</label>
            <select value={form.role} onChange={set('role')} className="field" style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13 }}>
              <option value="TECHNICIAN">Kỹ thuật viên</option>
              <option value="MANAGER">Quản lý</option>
              <option value="ADMIN">Quản trị viên</option>
            </select>
          </div>
        </div>
        {error && <div style={{ marginTop: 14, fontSize: 13, color: '#dc2626', padding: '8px 12px', background: '#fee2e2', borderRadius: 8 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button className="btn btn-outline" onClick={onClose}>Hủy</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> Đang thêm...</> : 'Thêm tài khoản'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit User Dialog ──────────────────────────────────────────────────────

function EditUserDialog({ user, onClose, onSaved }: { user: ApiUser | null; onClose: () => void; onSaved: () => void }) {
  const [role, setRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user) { setRole(user.role); setError('') }
  }, [user])

  if (!user) return null

  async function save() {
    setError('')
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      if (role !== user!.role) body.role = role
      if (Object.keys(body).length === 0) { onClose(); return }

      const res = await csrfFetch(`/api/users/${user!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Lỗi cập nhật'); return }
      toast.success('Đã cập nhật tài khoản')
      onSaved(); onClose()
    } catch { setError('Lỗi kết nối') }
    finally { setSaving(false) }
  }

  async function toggleActive() {
    setSaving(true)
    try {
      const res = await csrfFetch(`/api/users/${user!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user!.isActive }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Lỗi'); return }
      toast.success(user!.isActive ? 'Đã vô hiệu hóa tài khoản' : 'Đã kích hoạt tài khoản')
      onSaved(); onClose()
    } catch { setError('Lỗi kết nối') }
    finally { setSaving(false) }
  }

  async function unlock() {
    setSaving(true)
    try {
      const res = await csrfFetch(`/api/users/${user!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockedUntil: null, isActive: true }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Lỗi'); return }
      toast.success('Đã mở khóa tài khoản')
      onSaved(); onClose()
    } catch { setError('Lỗi kết nối') }
    finally { setSaving(false) }
  }

  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date()

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 16, width: 480, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,.3)', zIndex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Chỉnh sửa tài khoản</div>
        <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 22 }}>{user.displayName ?? user.username} · {user.email}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Vai trò</label>
            <select value={role} onChange={e => setRole(e.target.value)} className="field" style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13 }}>
              <option value="TECHNICIAN">Kỹ thuật viên</option>
              <option value="MANAGER">Quản lý</option>
              <option value="ADMIN">Quản trị viên</option>
            </select>
            {role !== user.role && (
              <div style={{ fontSize: 12, color: '#d97706' }}>Thay đổi vai trò sẽ vô hiệu hóa phiên đăng nhập hiện tại của người dùng.</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
            {isLocked && (
              <button className="btn btn-outline" onClick={unlock} disabled={saving} style={{ flex: 1 }}>
                Mở khóa
              </button>
            )}
            <button
              className={`btn ${user.isActive ? 'btn-outline' : 'btn-primary'}`}
              onClick={toggleActive}
              disabled={saving}
              style={{ flex: 1, ...(user.isActive ? { color: '#dc2626', borderColor: '#dc2626' } : {}) }}
            >
              {user.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}
            </button>
          </div>
        </div>

        {error && <div style={{ marginTop: 14, fontSize: 13, color: '#dc2626', padding: '8px 12px', background: '#fee2e2', borderRadius: 8 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button className="btn btn-outline" onClick={onClose}>Hủy</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> Đang lưu...</> : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Tab ──────────────────────────────────────────────────────────────

export function UsersTab() {
  const [users, setUsers] = useState<ApiUser[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editUser, setEditUser] = useState<ApiUser | null>(null)

  function loadUsers(signal?: AbortSignal) {
    setLoading(true)
    fetch('/api/users', signal ? { signal } : undefined)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setUsers)
      .catch(e => {
        if ((e as Error)?.name === 'AbortError') return
        toast.error('Không thể tải danh sách tài khoản')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const ctrl = new AbortController()
    loadUsers(ctrl.signal)
    return () => ctrl.abort()
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Loader2 size={28} style={{ animation: 'spin .7s linear infinite', color: 'var(--text-faint)' }} />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Quản lý tài khoản</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>{users.length} tài khoản</div>
        </div>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}>+ Tạo tài khoản</button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 20 }}>Người dùng</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Đăng nhập lần cuối</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="trow">
                  <td style={{ paddingLeft: 20 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{u.displayName ?? u.username}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{u.email}</div>
                  </td>
                  <td>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: `${ROLE_COLOR[u.role]}22`, color: ROLE_COLOR[u.role] }}>
                      {ROLE_LABEL[u.role]}
                    </span>
                  </td>
                  <td><StatusBadge user={u} /></td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{fmtDate(u.lastLoginAt)}</td>
                  <td style={{ paddingRight: 14 }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setEditUser(u)}
                    >
                      Sửa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddUserDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={loadUsers} />
      <EditUserDialog user={editUser} onClose={() => setEditUser(null)} onSaved={loadUsers} />
    </div>
  )
}
