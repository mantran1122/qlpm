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
    <div className="login-alert" role="alert">
      <AlertCircle size={18} strokeWidth={2.2} />
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
    <form onSubmit={handleSubmit} className="login-form">
      <label className="login-label">
        <span>Tên đăng nhập hoặc Email</span>
        <div className="login-field">
          <input
            type="text"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            placeholder="username hoặc email@domain.com"
            autoComplete="username"
            disabled={loading}
          />
        </div>
      </label>

      <label className="login-label">
        <span>Mật khẩu</span>
        <div className="login-field">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Nhập mật khẩu"
            autoComplete="current-password"
            disabled={loading}
          />
        </div>
      </label>

      {error && (
        <div className="login-alert" role="alert">
          <AlertCircle size={18} strokeWidth={2.2} />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !identifier.trim() || !password}
        className="login-primary-btn"
      >
        {loading ? (
          <>
            <Loader2 size={19} className="login-spin" />
            Đang đăng nhập...
          </>
        ) : (
          'Đăng nhập'
        )}
      </button>
    </form>
  )
}

export default function LoginPage() {
  const [googleLoading, setGoogleLoading] = useState(false)

  function handleGoogleLogin() {
    setGoogleLoading(true)
    window.location.href = '/api/auth/google/login'
  }

  return (
    <div className="login-shell">
      <section className="login-brand-panel" aria-label="Giới thiệu hệ thống">
        <div className="login-brand-mark">
          <Image
            src="/logo_truong.png"
            alt="Trường Đại học Nam Cần Thơ"
            width={196}
            height={96}
            className="login-school-logo"
            priority
          />
        </div>

        <div className="login-hero-copy">
          <h1>
            Quản lý<br />
            <span>phòng máy</span>
          </h1>
        </div>

        <div className="login-visual-stack" aria-hidden="true">
          <div className="login-circle-card login-circle-card-a">
            <span>N</span>
          </div>
          <div className="login-circle-card login-circle-card-b">
            <span>♥</span>
          </div>
          <div className="login-circle-card login-circle-card-c">
            <Image src="/logo_truong.png" alt="" width={120} height={58} />
          </div>
          <div className="login-circle-card login-circle-card-d">
            <span>●</span>
          </div>
        </div>
      </section>

      <section className="login-form-panel" aria-label="Đăng nhập hệ thống">
        <div className="login-card-wrap">
          <div className="login-mobile-brand">
            <Image src="/logo_don.png" alt="NCTU" width={58} height={58} />
            <span>QL Phòng Máy NCTU</span>
          </div>

          <div className="login-title-block">
            <h2>Đăng nhập vào NCTU</h2>
          </div>

          <div className="login-card">
            <Suspense fallback={null}>
              <LoginError />
            </Suspense>

            <CredentialsForm />

            <p className="login-forgot-note">
              Quên mật khẩu? Liên hệ quản trị viên.
            </p>

            {!disableGoogle && (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="login-google-btn"
              >
                {googleLoading ? (
                  <>
                    <Loader2 size={19} className="login-spin" />
                    Đang chuyển hướng...
                  </>
                ) : (
                  <>
                    <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true">
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
          </div>

          <p className="login-footer">
            © 2026 Trường Đại học Nam Cần Thơ · Hệ thống QL Phòng Máy
          </p>
        </div>
      </section>
    </div>
  )
}
