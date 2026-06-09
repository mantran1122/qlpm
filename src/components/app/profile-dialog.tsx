'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog } from './primitives'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface UserInfo {
  email: string; role: string
  profile: { displayName: string; employeeCode: string | null; department: string | null; phone: string | null } | null
}

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [department, setDepartment] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const fetchingRef = useRef(false)

  useEffect(() => {
    if (!open || fetchingRef.current) return
    fetchingRef.current = true
    fetch('/api/auth/profile')
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d: UserInfo) => {
        setEmail(d.email)
        setRole(d.role)
        setDisplayName(d.profile?.displayName ?? '')
        setEmployeeCode(d.profile?.employeeCode ?? '')
        setDepartment(d.profile?.department ?? '')
        setPhone(d.profile?.phone ?? '')
      })
      .catch(() => toast.error('Không thể tải thông tin'))
      .finally(() => setLoading(false))
  }, [open])

  function close() {
    fetchingRef.current = false
    onClose()
  }

  async function save() {
    if (!displayName.trim()) { toast.error('Tên hiển thị không được để trống'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim(), employeeCode: employeeCode.trim(), department: department.trim(), phone: phone.trim() }),
      })
      if (!res.ok) throw new Error()
      toast.success('Đã cập nhật thông tin')
      fetchingRef.current = false
      onClose()
    } catch {
      toast.error('Lỗi khi lưu')
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onClose={close} width={480}>
      <div style={{ padding: '26px 28px 28px' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Thông tin cá nhân</h2>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--text-faint)' }}>Cập nhật thông tin hiển thị của bạn</p>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Loader2 size={24} style={{ animation: 'spin .7s linear infinite', color: 'var(--text-faint)' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Email</label>
              <div className="field" style={{ opacity: 0.7 }}>
                <input value={email} readOnly style={{ cursor: 'not-allowed' }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Tên hiển thị <span style={{ color: 'var(--err)' }}>*</span></label>
              <div className="field"><input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Nguyễn Văn A" /></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Mã nhân sự</label>
              <div className="field"><input value={employeeCode} onChange={e => setEmployeeCode(e.target.value)} placeholder="NV00123" /></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Phòng ban</label>
              <div className="field"><input value={department} onChange={e => setDepartment(e.target.value)} placeholder="Phòng Công nghệ Thông tin" /></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Số điện thoại</label>
              <div className="field"><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0912 345 678" /></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Vai trò</label>
              <div style={{ fontSize: 13, color: 'var(--text)', padding: '10px 13px', borderRadius: 11, background: 'var(--surface-2)', fontWeight: 500 }}>
                {role === 'ADMIN' ? 'Quản trị viên' : role === 'MANAGER' ? 'Quản lý' : 'Kỹ thuật viên'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={close} disabled={saving} className="btn btn-outline">Huỷ</button>
              <button onClick={save} disabled={saving} className="btn btn-primary">
                {saving ? <><Loader2 size={16} style={{ animation: 'spin .7s linear infinite' }} /> Đang lưu...</> : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
