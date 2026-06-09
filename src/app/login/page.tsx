'use client'

import { useState, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { AlertCircle, Loader2 } from 'lucide-react'

const ERROR_MAP: Record<string, string> = {
  access_denied: 'Bạn đã từ chối cấp quyền đăng nhập Google.',
  invalid_state: 'Lỗi bảo mật. Vui lòng thử lại.',
  no_code: 'Lỗi xác thực. Vui lòng thử lại.',
  google_failed: 'Không thể kết nối với Google. Vui lòng thử lại.',
  invalid_domain: 'Email này không thuộc trường Đại học Nam Cần Thơ. Chỉ chấp nhận email @nctu.edu.vn.',
  disabled: 'Tài khoản này đã bị vô hiệu hóa.',
  unauthenticated: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
}

const disableGoogle = process.env.NEXT_PUBLIC_DISABLE_GOOGLE_OAUTH === 'true'

function LoginError() {
  const params = useSearchParams()
  const error = useMemo(() => {
    const code = params.get('error')
    const email = params.get('email')
    if (!code) return ''
    if (code === 'invalid_domain' && email) {
      return `${email} không thuộc trường. Chỉ chấp nhận email @nctu.edu.vn.`
    }
    return ERROR_MAP[code] ?? 'Đã xảy ra lỗi khi đăng nhập.'
  }, [params])

  if (!error) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '10px 14px', borderRadius: 10,
      background: 'var(--err-bg)', color: 'var(--err-tx)',
      fontSize: 13, fontWeight: 500, lineHeight: 1.4,
    }}>
      <AlertCircle size={17} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{error}</span>
    </div>
  )
}

function CredentialsForm() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!identifier.trim() || !password) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 403) {
          setError('Tài khoản đã bị vô hiệu hóa')
        } else {
          setError(data.error ?? 'Đăng nhập thất bại')
        }
        return
      }
      const role = data.user?.role
      router.push(role === 'GUEST' ? '/dashboard/ktv?login=success' : '/?login=success')
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Tên đăng nhập hoặc Email</label>
        <div className="field">
          <input
            type="text"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            placeholder="username hoặc email@domain.com"
            autoComplete="username"
            disabled={loading}
          />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Mật khẩu</label>
        <div className="field">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••••"
            autoComplete="current-password"
            disabled={loading}
          />
        </div>
      </div>
      {error && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '10px 14px', borderRadius: 10,
          background: 'var(--err-bg)', color: 'var(--err-tx)',
          fontSize: 13, fontWeight: 500, lineHeight: 1.4,
        }}>
          <AlertCircle size={17} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}
      <button
        type="submit"
        disabled={loading || !identifier.trim() || !password}
        style={{
          width: '100%', height: 46,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          borderRadius: 11, border: 'none',
          background: 'var(--primary, #2563eb)', color: '#fff',
          fontSize: 14, fontWeight: 600,
          cursor: loading || !identifier.trim() || !password ? 'not-allowed' : 'pointer',
          opacity: loading || !identifier.trim() || !password ? 0.7 : 1,
          fontFamily: 'var(--font)',
        }}
      >
        {loading ? <><Loader2 size={18} style={{ animation: 'spin .7s linear infinite' }} /> Đang đăng nhập...</> : 'Đăng nhập'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  const [googleLoading, setGoogleLoading] = useState(false)
  const [tab, setTab] = useState<'google' | 'credentials'>(disableGoogle ? 'credentials' : 'google')

  function handleGoogleLogin() {
    setGoogleLoading(true)
    window.location.href = '/api/auth/google/login'
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 0', fontSize: 13, fontWeight: active ? 700 : 500,
    background: 'none', border: 'none', cursor: 'pointer',
    borderBottom: active ? '2px solid var(--primary, #2563eb)' : '2px solid transparent',
    color: active ? 'var(--primary, #2563eb)' : 'var(--text-faint)',
    transition: 'all .15s ease', fontFamily: 'var(--font)',
  })

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 440,
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
      }}>
        {/* Logo & Title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Image
            src="/logo_truong.png"
            alt="ĐH Nam Cần Thơ"
            width={200}
            height={97}
            style={{ objectFit: 'contain' }}
            priority
          />
        </div>

        {/* Login Card */}
        <div className="card" style={{ padding: '28px 32px 32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{
                margin: 0, fontSize: 42, fontWeight: 700,
                color: 'var(--text)', letterSpacing: '-.02em',
              }}>
                Quản Lý Phòng Máy
              </h1>
              <p style={{
                margin: '6px 0 0', fontSize: 13.5,
                color: 'var(--text-muted)', lineHeight: 1.5,
              }}>
                Đại học Nam Cần Thơ —Trung tâm Ứng dụng phần mềm
              </p>
            </div>

            {/* Error from OAuth redirect */}
            <Suspense fallback={null}><LoginError /></Suspense>

            {/* Tab switcher — ẩn khi Google bị tắt */}
            {!disableGoogle && (
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                <button style={tabStyle(tab === 'google')} onClick={() => setTab('google')}>Google</button>
                <button style={tabStyle(tab === 'credentials')} onClick={() => setTab('credentials')}>Tài khoản</button>
              </div>
            )}

            {/* Google Sign-In */}
            {!disableGoogle && tab === 'google' && (
              <button
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                style={{
                  width: '100%', height: 46,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  borderRadius: 11, border: '1px solid var(--border-strong)',
                  background: 'var(--surface)', color: 'var(--text)',
                  fontSize: 14, fontWeight: 600,
                  cursor: googleLoading ? 'not-allowed' : 'pointer',
                  transition: 'all .16s ease', fontFamily: 'var(--font)',
                  opacity: googleLoading ? 0.7 : 1,
                }}
              >
                {googleLoading ? (
                  <><Loader2 size={18} style={{ animation: 'spin .7s linear infinite' }} /> Đang chuyển hướng...</>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Đăng nhập với Google
                  </>
                )}
              </button>
            )}

            {/* Credentials form */}
            {(disableGoogle || tab === 'credentials') && <CredentialsForm />}
          </div>
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center', fontSize: 12,
          color: 'var(--text-faint)', margin: 0,
        }}>
          © 2026 Trường Đại học Nam Cần Thơ · Hệ thống QL Phòng Máy v1.0
        </p>
      </div>
    </div>
  )
}
