'use client'
import { useState, useEffect } from 'react'
import { ProfileTab } from './tabs/profile-tab'
import { UsersTab } from './tabs/users-tab'
import { SystemTab } from './tabs/system-tab'
import { EmailTab } from './tabs/email-tab'
import { AuditTab } from './tabs/audit-tab'

interface Me {
  role: string
}

export default function SettingsPage() {
  const [active, setActive] = useState('profile')
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/profile')
      .then(r => r.ok ? r.json() : null)
      .then((d: Me | null) => { if (d) setRole(d.role) })
      .catch(() => {})
  }, [])

  const isAdmin = role === 'ADMIN'

  const TABS = [
    { id: 'profile', label: 'Hồ sơ cá nhân',      visible: true },
    { id: 'users',   label: 'Tài khoản & Vai trò', visible: isAdmin },
    { id: 'system',  label: 'Cấu hình hệ thống',   visible: isAdmin },
    { id: 'email',   label: 'Cấu hình Email',      visible: isAdmin },
    { id: 'audit',   label: 'Nhật ký hệ thống',    visible: isAdmin },
  ].filter(t => t.visible)

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '2px solid var(--border)', paddingBottom: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            style={{
              padding: '10px 18px',
              fontSize: 13.5, fontWeight: active === t.id ? 700 : 500,
              color: active === t.id ? 'var(--primary)' : 'var(--text-faint)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: active === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -2,
              transition: 'all .15s',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === 'profile' && <ProfileTab />}
      {active === 'users'   && isAdmin && <UsersTab />}
      {active === 'system'  && isAdmin && <SystemTab />}
      {active === 'email'   && isAdmin && <EmailTab />}
      {active === 'audit'   && isAdmin && <AuditTab />}
    </div>
  )
}
