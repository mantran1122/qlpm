'use client'

import { useState, useEffect } from 'react'
import { Card, CardHead, Button } from '@/components/app/primitives'
import { csrfFetch } from '@/lib/csrf'

interface SystemSettings {
  school_name?: string
  school_logo?: string
  audit_retention_days?: string
  app_version?: string
}

export function SystemTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<SystemSettings>({})
  const [edit, setEdit] = useState({ schoolName: '', retention: '90' })

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setSettings(data)
        setEdit({
          schoolName: data.school_name ?? 'Trường Đại học Nam Cần Thơ',
          retention: data.audit_retention_days ?? '90',
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async (key: string, value: string) => {
    setSaving(true)
    try {
      await csrfFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      setSettings(prev => ({ ...prev, [key]: value }))
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>Đang tải...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <CardHead title="Thông tin trường" sub="Tên trường và logo hiển thị trên hệ thống" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
              Tên trường
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={edit.schoolName}
                onChange={e => setEdit(prev => ({ ...prev, schoolName: e.target.value }))}
                style={{
                  flex: 1, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)',
                  outline: 'none',
                }}
              />
              <Button
                variant="primary" size="sm"
                disabled={saving}
                onClick={() => save('school_name', edit.schoolName)}
              >
                {saving ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Nhật ký hệ thống" sub="Cấu hình thời gian lưu trữ nhật ký" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
              Số ngày lưu trữ nhật ký (mặc định 90 ngày)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                min={7}
                max={365}
                value={edit.retention}
                onChange={e => setEdit(prev => ({ ...prev, retention: e.target.value }))}
                style={{
                  width: 120, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)',
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-faint)', display: 'flex', alignItems: 'center' }}>ngày</span>
              <Button
                variant="primary" size="sm"
                disabled={saving}
                onClick={() => save('audit_retention_days', String(edit.retention))}
              >
                {saving ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Phiên bản hệ thống" sub="Thông tin phiên bản" />
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>
          <div>Hệ thống Quản lý Phòng Máy · v1.0</div>
          <div style={{ marginTop: 4 }}>Next.js 16 · Prisma · MySQL</div>
        </div>
      </Card>
    </div>
  )
}
