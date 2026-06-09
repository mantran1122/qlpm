'use client'

import { useState, useEffect } from 'react'
import { Card, CardHead, Button } from '@/components/app/primitives'
import { csrfFetch } from '@/lib/csrf'

interface SmtpConfig {
  smtp_host?: string
  smtp_port?: string
  smtp_user?: string
  smtp_from?: string
}

export function EmailTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [config, setConfig] = useState({ host: '', port: '587', user: '', pass: '', from: '' })

  useEffect(() => {
    const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_from']
    Promise.all(keys.map(k => fetch(`/api/settings?key=${k}`).then(r => r.json())))
      .then(results => {
        const map: Record<string, string> = {}
        results.forEach(r => { if (r.value) map[r.key] = r.value })
        setConfig({
          host: map.smtp_host ?? '',
          port: map.smtp_port ?? '587',
          user: map.smtp_user ?? '',
          pass: '',
          from: map.smtp_from ?? '',
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    setTestResult(null)
    try {
      await Promise.all([
        csrfFetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'smtp_host', value: config.host }),
        }),
        csrfFetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'smtp_port', value: config.port }),
        }),
        csrfFetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'smtp_user', value: config.user }),
        }),
        csrfFetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'smtp_from', value: config.from }),
        }),
      ])
      if (config.pass.trim()) {
        await csrfFetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'smtp_pass', value: config.pass.trim(), isSecret: true }),
        })
      }
      setTestResult('Đã lưu cấu hình.')
    } catch {
      setTestResult('Lỗi khi lưu cấu hình.')
    }
    finally { setSaving(false) }
  }

  const testEmail = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await csrfFetch('/api/settings/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: config.user }),
      })
      const data = await res.json()
      if (res.ok) setTestResult('Gửi email test thành công!')
      else setTestResult(`Lỗi: ${data.error ?? 'Không thể gửi'}`)
    } catch {
      setTestResult('Lỗi kết nối đến máy chủ.')
    }
    finally { setTesting(false) }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>Đang tải...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <CardHead title="Cấu hình SMTP" sub="Dùng để gửi email thông báo" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Máy chủ SMTP</label>
              <input type="text" value={config.host} onChange={e => setConfig(p => ({ ...p, host: e.target.value }))} placeholder="smtp.gmail.com" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Cổng</label>
              <input type="text" value={config.port} onChange={e => setConfig(p => ({ ...p, port: e.target.value }))} placeholder="587" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Tài khoản SMTP</label>
            <input type="text" value={config.user} onChange={e => setConfig(p => ({ ...p, user: e.target.value }))} placeholder="email@gmail.com" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Mật khẩu SMTP (App Password)</label>
            <input type="password" value={config.pass} onChange={e => setConfig(p => ({ ...p, pass: e.target.value }))} placeholder="Nhập lại mỗi lần cập nhật" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email người gửi</label>
            <input type="text" value={config.from} onChange={e => setConfig(p => ({ ...p, from: e.target.value }))} placeholder='"QL Phòng Máy" <email@gmail.com>' style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" size="sm" disabled={saving} onClick={save}>
              {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
            </Button>
            <Button variant="outline" size="sm" disabled={testing} onClick={testEmail}>
              {testing ? 'Đang gửi...' : 'Gửi email test'}
            </Button>
          </div>
          {testResult && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: testResult.includes('thành công') ? 'var(--good-bg)' : 'rgba(239,68,68,.1)', color: testResult.includes('thành công') ? 'var(--good-tx)' : '#ef4444', fontSize: 12.5 }}>
              {testResult}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 5,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)',
  outline: 'none', boxSizing: 'border-box',
}
