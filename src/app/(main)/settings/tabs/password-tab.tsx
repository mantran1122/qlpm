'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf'

function StrengthBar({ score }: { score: number | null }) {
  if (score === null) return null
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a']
  const labels = ['Rất yếu', 'Yếu', 'Trung bình', 'Tốt', 'Rất mạnh']
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 4,
            background: i <= score ? colors[score] : 'var(--border)',
            transition: 'background .2s',
          }} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: colors[score], fontWeight: 600 }}>{labels[score]}</div>
    </div>
  )
}

export function PasswordTab() {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  async function handleNewPwChange(val: string) {
    setNewPw(val)
    if (!val) { setScore(null); setErrors([]); return }
    // Gọi API để check strength (hoặc gọi trực tiếp thư viện nếu dùng client bundle)
    // Để tránh bundle zxcvbn vào client, check qua API nhỏ
    try {
      const res = await fetch('/api/auth/check-password-strength', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: val }),
      })
      if (res.ok) {
        const data = await res.json()
        setScore(data.score)
        setErrors(data.errors ?? [])
      }
    } catch {
      // Fallback: chỉ check length
      setScore(val.length >= 8 ? 2 : 0)
      setErrors(val.length < 8 ? ['Mật khẩu phải có ít nhất 8 ký tự'] : [])
    }
  }

  async function save() {
    if (!oldPw || !newPw || !confirmPw) { toast.error('Vui lòng điền đầy đủ thông tin'); return }
    if (newPw !== confirmPw) { toast.error('Mật khẩu mới không khớp'); return }
    if (errors.length > 0) { toast.error(errors[0]); return }
    setSaving(true)
    try {
      const res = await csrfFetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Lỗi đổi mật khẩu'); return }
      toast.success('Đã đổi mật khẩu thành công')
      setOldPw(''); setNewPw(''); setConfirmPw('')
      setScore(null); setErrors([])
    } catch {
      toast.error('Lỗi kết nối')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Đổi mật khẩu</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-faint)' }}>
          Mật khẩu tối thiểu 8 ký tự. Khuyến khích dùng kết hợp chữ hoa, số và ký tự đặc biệt.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Mật khẩu cũ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Mật khẩu hiện tại</label>
            <div className="field" style={{ position: 'relative' }}>
              <input
                type={showOld ? 'text' : 'password'}
                value={oldPw}
                onChange={e => setOldPw(e.target.value)}
                placeholder="Nhập mật khẩu hiện tại"
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowOld(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 2 }}
              >
                {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Mật khẩu mới */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Mật khẩu mới</label>
            <div className="field" style={{ position: 'relative' }}>
              <input
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={e => handleNewPwChange(e.target.value)}
                placeholder="Tối thiểu 8 ký tự"
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowNew(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 2 }}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <StrengthBar score={score} />
            {errors.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--err)', marginTop: 4 }}>
                {errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
          </div>

          {/* Xác nhận */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Xác nhận mật khẩu mới</label>
            <div className="field"><input
              type="password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
            /></div>
            {confirmPw && newPw !== confirmPw && (
              <div style={{ fontSize: 12, color: 'var(--err)' }}>Mật khẩu không khớp</div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving || errors.length > 0}>
              {saving ? <><Loader2 size={15} style={{ animation: 'spin .7s linear infinite' }} /> Đang lưu...</> : 'Đổi mật khẩu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
