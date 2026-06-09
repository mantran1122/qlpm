'use client'
import React, { useEffect } from 'react'
import { Icon } from './icons'

// ===== Card =====
export function Card({ children, className = '', style = {}, pad = 22, accent }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties; pad?: number; accent?: string
}) {
  return (
    <div className={'card ' + className} style={{ padding: pad, position: 'relative', overflow: 'hidden', ...(accent ? { borderLeft: `4px solid ${accent}` } : {}), ...style }}>
      {children}
    </div>
  )
}
export function CardHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.01em' }}>{title}</h3>
        {sub && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-faint)' }}>{sub}</p>}
      </div>
      {action}
    </div>
  )
}

// ===== Button =====
export function Button({ children, variant = 'primary', size = 'md', icon, iconRight, onClick, type = 'button', disabled, style }: {
  children?: React.ReactNode; variant?: string; size?: string; icon?: string; iconRight?: string
  onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; style?: React.CSSProperties
}) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} style={style}
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : ''}`}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} stroke={2.2} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 15 : 17} stroke={2.2} />}
    </button>
  )
}
export function IconBtn({ name, onClick, badge, size = 18, title, active }: {
  name: string; onClick?: () => void; badge?: number; size?: number; title?: string; active?: boolean
}) {
  return (
    <button className="icon-btn" onClick={onClick} title={title}
      style={active ? { color: 'var(--primary)', borderColor: 'var(--primary)', background: 'var(--primary-soft)' } : {}}>
      <Icon name={name} size={size} stroke={2} />
      {badge != null && (
        <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 99, background: 'var(--err)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center', border: '2px solid var(--surface)' }}>
          {badge}
        </span>
      )}
    </button>
  )
}

// ===== Badge =====
type BadgeTone = 'good' | 'err' | 'soft' | 'both' | 'teacher' | 'info' | 'muted'
const BADGE_MAP: Record<BadgeTone, [string, string, string]> = {
  good:    ['var(--good-bg)',    'var(--good-tx)',    'var(--good)'],
  err:     ['var(--err-bg)',     'var(--err-tx)',     'var(--err)'],
  soft:    ['var(--soft-bg)',    'var(--soft-tx)',    'var(--soft)'],
  both:    ['var(--both-bg)',    'var(--both-tx)',    'var(--both)'],
  teacher: ['var(--teacher-bg)','var(--teacher-tx)', 'var(--teacher)'],
  info:    ['var(--info-bg)',    'var(--info-tx)',    'var(--primary)'],
  muted:   ['var(--surface-3)', 'var(--text-muted)', 'var(--text-faint)'],
}
export function Badge({ children, tone = 'info', icon, dot, solid, style }: {
  children?: React.ReactNode; tone?: BadgeTone; icon?: string; dot?: boolean; solid?: boolean; style?: React.CSSProperties
}) {
  const [bg, tx, accent] = BADGE_MAP[tone] ?? BADGE_MAP.info
  if (solid) return <span className="chip" style={{ background: accent, color: '#fff', ...style }}>{icon && <Icon name={icon} size={13} stroke={2.4} />}{children}</span>
  return (
    <span className="chip" style={{ background: bg, color: tx, ...style }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: 99, background: accent }} />}
      {icon && <Icon name={icon} size={13} stroke={2.4} />}
      {children}
    </span>
  )
}

// ===== Select / Input / Switch / Tabs =====
export function Select({ value, onChange, options, style }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; style?: React.CSSProperties
}) {
  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>
      <select className="select" value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-faint)' }}>
        <Icon name="chevronD" size={16} />
      </span>
    </div>
  )
}
export function Input({ value, onChange, placeholder, icon, style }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; icon?: string; style?: React.CSSProperties
}) {
  return (
    <div className="field" style={style}>
      {icon && <Icon name={icon} size={17} style={{ color: 'var(--text-faint)' }} />}
      <input value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} />
    </div>
  )
}
export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)} aria-pressed={on}><span /></button>
}
export function Tabs({ tabs, value, onChange }: { tabs: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 22, borderBottom: '1px solid var(--border)' }}>
      {tabs.map(t => (
        <button key={t.value} className={'tab' + (value === t.value ? ' active' : '')} onClick={() => onChange(t.value)}>{t.label}</button>
      ))}
    </div>
  )
}

// ===== StatTile =====
export function StatTile({ icon, label, value, tone = 'info' }: { icon?: string; label: string; value: React.ReactNode; tone?: string }) {
  const map: Record<string, string> = { info: 'var(--primary)', good: 'var(--good)', err: 'var(--err)', soft: 'var(--soft)', both: 'var(--both)', teacher: 'var(--teacher)' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 500 }}>
        {icon && <Icon name={icon} size={15} style={{ color: map[tone] }} />}{label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.02em' }}>{value}</div>
    </div>
  )
}

// ===== Dialog =====
export function Dialog({ open, onClose, children, width = 560 }: { open: boolean; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="dim-overlay" onClick={onClose} style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: width, maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 20, boxShadow: 'var(--shadow-lg)', animation: 'popIn .22s cubic-bezier(.2,.9,.3,1)', border: '1px solid var(--border)' }}>
        {children}
      </div>
    </div>
  )
}

// ===== Sheet =====
export function Sheet({ open, onClose, children, width = 460 }: { open: boolean; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="dim-overlay" onClick={onClose} style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: width, height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', animation: 'slideInRight .28s cubic-bezier(.3,.9,.3,1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

// ===== Field (form label wrapper) =====
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 7 }}>{label}</div>{children}</div>
}
