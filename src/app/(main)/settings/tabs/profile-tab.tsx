'use client'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf'

interface UserProfile {
  email: string
  role: string
  profile: {
    displayName: string
    employeeCode: string | null
    department: string | null
    phone: string | null
    avatar: string | null
  } | null
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  MANAGER: 'Quản lý',
  TECHNICIAN: 'Kỹ thuật viên',
}

export function ProfileTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<UserProfile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [department, setDepartment] = useState('')
  const [phone, setPhone] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  useEffect(() => {
    fetch('/api/auth/profile')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: UserProfile) => {
        setData(d)
        setDisplayName(d.profile?.displayName ?? '')
        setEmployeeCode(d.profile?.employeeCode ?? '')
        setDepartment(d.profile?.department ?? '')
        setPhone(d.profile?.phone ?? '')
      })
      .catch(() => toast.error('Không thể tải thông tin'))
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    if (!displayName.trim()) { toast.error('Tên hiển thị không được để trống'); return }
    setSaving(true)
    try {
      const res = await csrfFetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim(), employeeCode: employeeCode.trim(), department: department.trim(), phone: phone.trim() }),
      })
      if (!res.ok) throw new Error()
      toast.success('Đã cập nhật thông tin')
      window.dispatchEvent(new Event('profile-updated'))
    } catch {
      toast.error('Lỗi khi lưu thông tin')
    } finally {
      setSaving(false)
    }
  }

  async function uploadAvatar(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    setUploadingAvatar(true)
    try {
      const res = await csrfFetch('/api/upload/avatar', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Lỗi upload avatar')
        return
      }
      const result = await res.json()
      toast.success('Đã cập nhật ảnh đại diện')
      window.dispatchEvent(new Event('profile-updated'))
      // Cập nhật avatar trong state thay vì reload cả trang
      setData(prev => prev ? {
        ...prev,
        profile: prev.profile
          ? { ...prev.profile, avatar: result.avatar }
          : { displayName: '', employeeCode: null, department: null, phone: null, avatar: result.avatar }
      } : prev)
    } catch {
      toast.error('Lỗi upload avatar')
    } finally {
      setUploadingAvatar(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Loader2 size={28} style={{ animation: 'spin .7s linear infinite', color: 'var(--text-faint)' }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 560 }}>
      {/* Avatar */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Ảnh đại diện</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {data?.profile?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.profile.avatar}
              alt="Avatar"
              style={{ width: 72, height: 72, borderRadius: 18, objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 72, height: 72, borderRadius: 18,
              background: 'linear-gradient(135deg, #ef4444, #f97316)',
              display: 'grid', placeItems: 'center',
              color: '#fff', fontWeight: 700, fontSize: 24, flexShrink: 0,
            }}>
              {data?.profile?.displayName
                ? data.profile.displayName.trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase()
                : data?.email?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-faint)' }}>
              JPG, PNG hoặc WebP · tối đa 5 MB · sẽ được resize thành 256×256
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f) }}
            />
            <button
              className="btn btn-outline btn-sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? <><Loader2 size={14} style={{ animation: 'spin .7s linear infinite' }} /> Đang tải...</> : 'Chọn ảnh'}
            </button>
          </div>
        </div>
      </div>

      {/* Profile info */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Thông tin cá nhân</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Email</label>
            <div className="field" style={{ opacity: 0.65 }}>
              <input value={data?.email ?? ''} readOnly style={{ cursor: 'not-allowed' }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
              Tên hiển thị <span style={{ color: 'var(--err)' }}>*</span>
            </label>
            <div className="field"><input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Nguyễn Văn A" /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Mã nhân sự</label>
            <div className="field"><input value={employeeCode} onChange={e => setEmployeeCode(e.target.value)} placeholder="NV00123" /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Phòng ban</label>
            <div className="field"><input value={department} onChange={e => setDepartment(e.target.value)} placeholder="Phòng CNTT" /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Số điện thoại</label>
            <div className="field"><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0912 345 678" /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Vai trò</label>
            <div style={{ fontSize: 13, color: 'var(--text)', padding: '10px 13px', borderRadius: 11, background: 'var(--surface-2)', fontWeight: 500 }}>
              {ROLE_LABEL[data?.role ?? ''] ?? data?.role}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <><Loader2 size={15} style={{ animation: 'spin .7s linear infinite' }} /> Đang lưu...</> : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
