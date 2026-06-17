'use client'
import { useState, useEffect, Suspense } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { toast } from 'sonner'
import { Icon } from './icons'
import { NotificationDropdown } from './notification-dropdown'
import { ProfileDialog } from './profile-dialog'

interface UserState {
  email: string
  role: string
  profile?: {
    displayName: string
    employeeCode: string | null
    department: string | null
    phone: string | null
    avatar: string | null
  } | null
}

function Avatar({ src, initials, size = 38, radius = 10 }: { src?: string | null; initials: string; size?: number; radius?: number }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="Avatar" style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }} />
    )
  }
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: 'linear-gradient(135deg, #ef4444, #f97316)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.37, flexShrink: 0 }}>
      {initials}
    </div>
  )
}

// ───── Navigation structure grouped by section ─────
const NAV_GROUPS = [
  {
    label: 'QUẢN LÝ',
    items: [
      { key: 'dashboard',     href: '/',              label: 'Dashboard',             icon: 'dashboard', roles: ['ADMIN','MANAGER'] },
      { key: 'dashboard-ktv', href: '/dashboard/ktv', label: 'Dashboard',             icon: 'dashboard', roles: ['TECHNICIAN','GUEST'] },
      { key: 'rooms',         href: '/rooms',         label: 'Phòng Máy',             icon: 'rooms',     roles: ['ADMIN','MANAGER','TECHNICIAN','GUEST'] },
      { key: 'technicians',   href: '/technicians',   label: 'Kỹ Thuật Viên',         icon: 'users',     roles: ['ADMIN','MANAGER'] },
    ],
  },
  {
    label: 'VẬN HÀNH',
    items: [
      { key: 'maintenance',         href: '/maintenance',         label: 'Nhật Ký Kỹ Thuật',     icon: 'wrench',   roles: ['ADMIN','MANAGER'] },
      { key: 'maintenance-history', href: '/maintenance-history', label: 'Lịch Sử Bảo Trì',      icon: 'wrench',   roles: ['TECHNICIAN'] },
      { key: 'pre-repair',          href: '/pre-repair',          label: 'Tình Trạng Trước Sửa', icon: 'camera',   roles: ['ADMIN','MANAGER','TECHNICIAN'] },
      { key: 'recall',              href: '/recall',              label: 'Thu Hồi – Sửa Chữa',   icon: 'recall',   roles: ['ADMIN','MANAGER','TECHNICIAN'] },
    ],
  },
  {
    label: 'HỖ TRỢ',
    items: [
      { key: 'tickets',  href: '/tickets',  label: 'Ticker Báo Lỗi',       icon: 'ticket',   roles: ['ADMIN','MANAGER','TECHNICIAN','GUEST'] },
      { key: 'software', href: '/software', label: 'Phần Mềm - Phần Cứng', icon: 'software', roles: ['ADMIN','MANAGER','TECHNICIAN'] },
    ],
  },
  {
    label: 'KHO · BÁO CÁO',
    items: [
      { key: 'supplies',    href: '/supplies', label: 'Vật Tư Tồn Kho', icon: 'supplies', roles: ['ADMIN','MANAGER'] },
      { key: 'statistics',  href: '/stats',    label: 'Thống Kê',        icon: 'stats',    roles: ['ADMIN','MANAGER'] },
      { key: 'reports',     href: '/reports',  label: 'Báo Cáo',         icon: 'report',   roles: ['ADMIN','MANAGER'] },
    ],
  },
]

const ROLE_LABELS: Record<import('@/lib/edge/jwt').UserRole, string> = {
  ADMIN: 'Quản trị viên',
  MANAGER: 'Quản lý',
  TECHNICIAN: 'Kỹ thuật viên',
  GUEST: 'Khách',
}

const SB_FULL = 240
const SB_MINI = 68

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.trim().slice(0, 2).toUpperCase()
}

function SidebarNavBtn({
  icon, label, active, collapsed, badge, onClick, ariaLabel,
}: {
  icon: string; label: string; active: boolean; collapsed: boolean
  badge?: number; onClick: () => void; ariaLabel?: string
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        aria-label={ariaLabel ?? label}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? label : undefined}
        style={{
          display: 'flex', alignItems: 'center',
          gap: collapsed ? 0 : 12,
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '10px 0' : '10px 12px',
          borderRadius: 11, border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: active ? 600 : 500,
          textAlign: 'left', width: '100%', transition: 'all .16s ease',
          background: active ? 'var(--sidebar-active)' : 'transparent',
          color: active ? '#fff' : 'var(--sidebar-text)',
          borderLeft: active ? '3px solid rgba(255,255,255,.9)' : '3px solid transparent',
          boxShadow: active ? '0 4px 12px -4px rgba(0,0,0,.4)' : 'none',
          position: 'relative',
        }}
        className="nav-btn"
      >
        <Icon name={icon} size={19} stroke={active ? 2.3 : 2} />
        {!collapsed && label}
        {badge != null && badge > 0 && !collapsed && (
          <span style={{
            marginLeft: 'auto', minWidth: 18, height: 18, padding: '0 5px',
            borderRadius: 99, background: 'var(--err)', color: '#fff',
            fontSize: 10.5, fontWeight: 700, display: 'grid', placeItems: 'center',
          }}>{badge > 99 ? '99+' : badge}</span>
        )}
        {badge != null && badge > 0 && collapsed && (
          <span style={{
            position: 'absolute', top: 6, right: 6, width: 8, height: 8,
            borderRadius: 99, background: 'var(--err)', border: '2px solid var(--sidebar)',
          }} />
        )}
      </button>

      {/* CSS tooltip in collapsed mode */}
      {collapsed && (
        <span style={{
          position: 'absolute', left: '100%', top: '50%', transform: 'translateY(-50%)',
          marginLeft: 10, padding: '5px 10px',
          background: 'rgba(15,23,42,.92)', color: '#fff',
          fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
          borderRadius: 7, pointerEvents: 'none',
          opacity: 0, transition: 'opacity .15s ease',
          zIndex: 200,
        }} className="sb-tooltip">
          {label}
        </span>
      )}
    </div>
  )
}

function Sidebar({ open, onClose, collapsed, onToggle, user, onProfile, ticketBadge }: {
  open: boolean; onClose: () => void; collapsed: boolean; onToggle: () => void
  user: UserState | null; onProfile: () => void; ticketBadge: number
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isActive = (key: string) => {
    if (key === 'dashboard')     return pathname === '/'
    if (key === 'dashboard-ktv') return pathname === '/dashboard/ktv' || pathname.startsWith('/dashboard/ktv/')
    if (key === 'rooms')         return pathname.startsWith('/rooms')
    if (key === 'technicians')   return pathname.startsWith('/technicians')
    if (key === 'recall')        return pathname === '/recall' || pathname.startsWith('/recall/')
    if (key === 'tickets')       return pathname === '/tickets' || pathname.startsWith('/tickets/')
    return pathname === '/' + key
  }

  function handleLogout() {
    fetch('/api/auth/logout', { method: 'POST' })
      .then(() => {
        toast.success('Đã đăng xuất')
        router.push('/login')
      })
      .catch(() => router.push('/login'))
  }

  const displayName = user?.profile?.displayName ?? user?.email?.split('@')[0] ?? 'Người dùng'
  const department = user?.profile?.department ?? ''
  const initials = getInitials(displayName)
  const roleLabel = user?.role ? ROLE_LABELS[user.role as import('@/lib/edge/jwt').UserRole] ?? 'Khách' : 'Khách'
  const userRole = user?.role ?? 'TECHNICIAN'

  return (
    <>
      <style>{`
        .nav-btn-wrap:hover .sb-tooltip { opacity: 1 !important; }
        .sb-tooltip-wrap { position: relative; }
        .sb-tooltip-wrap:hover .sb-tooltip { opacity: 1 !important; }
      `}</style>
      {open && <div className="dim-overlay" style={{ zIndex: 60 }} onClick={onClose} />}
      <aside style={{
        width: collapsed ? SB_MINI : SB_FULL,
        flexShrink: 0, background: 'var(--sidebar)', color: 'var(--sidebar-text)',
        display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 70,
        transform: open ? 'none' : 'var(--sb-transform, none)',
        transition: 'width .25s cubic-bezier(.3,.9,.3,1), transform .3s cubic-bezier(.3,.9,.3,1)',
        overflow: 'hidden',
      }} className="sidebar">

        {/* Brand */}
        <div style={{ flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,.07)', padding: collapsed ? '16px 0' : '16px 14px', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          {collapsed
            ? <Image src="/logo_don.png" alt="NCTU" width={36} height={36} style={{ objectFit: 'contain' }} />
            : <Image src="/logo_truong.png" alt="NCTU" width={148} height={72} style={{ objectFit: 'contain' }} />
          }
        </div>

        <div style={{ padding: collapsed ? '6px 8px' : '6px 10px', flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {/* Toggle button */}
          <button
            onClick={onToggle}
            aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            title={collapsed ? 'Mở rộng' : 'Thu gọn'}
            style={{
              display: 'flex', alignItems: 'center',
              gap: collapsed ? 0 : 12,
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '10px 0' : '10px 12px',
              borderRadius: 11, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: 500,
              textAlign: 'left', width: '100%', transition: 'all .16s ease',
              background: 'transparent', color: 'var(--sidebar-text)',
              borderLeft: '3px solid transparent',
              marginBottom: 4,
            }}
            className="nav-btn"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            {!collapsed && ''}
          </button>

          {/* Grouped navigation */}
          {NAV_GROUPS.map(group => {
            const visibleItems = group.items.filter(n => n.roles.includes(userRole))
            if (visibleItems.length === 0) return null
            return (
              <div key={group.label} style={{ marginTop: 8 }}>
                {!collapsed && (
                  <div style={{
                    color: 'rgba(255,255,255,.30)',
                    fontSize: 10, fontWeight: 700,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    padding: '12px 10px 6px',
                    userSelect: 'none',
                  }}>
                    {group.label}
                  </div>
                )}
                {collapsed && <div style={{ height: 8 }} />}
                <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {visibleItems.map(n => {
                    const active = isActive(n.key)
                    const badge = n.key === 'tickets' && ticketBadge > 0 ? ticketBadge : 0
                    return (
                      <div key={n.key} className="sb-tooltip-wrap">
                        <SidebarNavBtn
                          icon={n.icon}
                          label={n.label}
                          active={active}
                          collapsed={collapsed}
                          badge={badge}
                          onClick={() => router.push(n.href)}
                          ariaLabel={n.label}
                        />
                      </div>
                    )
                  })}
                </nav>
              </div>
            )
          })}

          {/* HỆ THỐNG group */}
          <div style={{ marginTop: 8 }}>
            {!collapsed && (
              <div style={{
                color: 'rgba(255,255,255,.30)',
                fontSize: 10, fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                padding: '12px 10px 6px',
                userSelect: 'none',
              }}>
                HỆ THỐNG
              </div>
            )}
            {collapsed && <div style={{ height: 8 }} />}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { k: 'settings', l: 'Cài đặt',   i: 'settings', href: '/settings' },
                { k: 'logout',   l: 'Đăng xuất', i: 'logout',   href: '' },
              ].map(n => (
                <div key={n.k} className="sb-tooltip-wrap">
                  <button
                    onClick={() => n.k === 'logout' ? handleLogout() : router.push(n.href)}
                    aria-label={n.l}
                    aria-current={n.k === 'settings' && pathname === '/settings' ? 'page' : undefined}
                    title={collapsed ? n.l : undefined}
                    style={{
                      display: 'flex', alignItems: 'center',
                      gap: collapsed ? 0 : 12,
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      padding: collapsed ? '10px 0' : '10px 12px',
                      borderRadius: 11, border: 'none', cursor: 'pointer',
                      fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: 500,
                      textAlign: 'left', width: '100%',
                      background: n.k === 'settings' && pathname === '/settings' ? 'var(--sidebar-active)' : 'transparent',
                      color: n.k === 'settings' && pathname === '/settings' ? '#fff' : 'var(--sidebar-text)',
                      borderLeft: n.k === 'settings' && pathname === '/settings' ? '3px solid rgba(255,255,255,.9)' : '3px solid transparent',
                      transition: 'all .16s ease',
                    }}
                    className="nav-btn"
                  >
                    <Icon name={n.i} size={19} stroke={2} />
                    {!collapsed && n.l}
                  </button>
                  {collapsed && (
                    <span style={{
                      position: 'absolute', left: '100%', top: '50%', transform: 'translateY(-50%)',
                      marginLeft: 10, padding: '5px 10px',
                      background: 'rgba(15,23,42,.92)', color: '#fff',
                      fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                      borderRadius: 7, pointerEvents: 'none',
                      opacity: 0, transition: 'opacity .15s ease',
                      zIndex: 200,
                    }} className="sb-tooltip">
                      {n.l}
                    </span>
                  )}
                </div>
              ))}
            </nav>
          </div>
        </div>

        {/* User card */}
        {!collapsed && (
          <div style={{ padding: 14, borderTop: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
            <div onClick={onProfile} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 8, borderRadius: 12, background: 'rgba(255,255,255,.05)', cursor: 'pointer' }}>
              <Avatar src={user?.profile?.avatar} initials={initials} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
                <div style={{ color: 'var(--sidebar-text-faint)', fontSize: 11 }}>{department || roleLabel}</div>
              </div>
              <Icon name="chevronR" size={16} style={{ color: 'var(--sidebar-text-faint)' }} />
            </div>
          </div>
        )}
        {collapsed && (
          <div style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,.08)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <div onClick={onProfile} style={{ cursor: 'pointer' }}>
              <Avatar src={user?.profile?.avatar} initials={initials} />
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

function Topbar({ breadcrumb, onMenu, theme, setTheme, user, onProfile }: {
  breadcrumb: string[]; onMenu: () => void; theme: string; setTheme: (t: string) => void
  user: UserState | null; onProfile: () => void
}) {
  const [now, setNow] = useState(new Date())
  const [spin, setSpin] = useState(false)
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t) }, [])
  const days = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']
  const dateStr = `${days[now.getDay()]}, ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const displayName = user?.profile?.displayName ?? user?.email?.split('@')[0] ?? 'Người dùng'
  const initials = (() => {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase()
    return displayName.trim().slice(0, 2).toUpperCase()
  })()
  void initials

  return (
    <header style={{ height: 90, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '0 26px', background: 'color-mix(in srgb, var(--bg) 80%, transparent)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <button className="icon-btn menu-toggle" onClick={onMenu} style={{ display: 'none' }}><Icon name="menu" size={19} /></button>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-faint)', fontSize: 12, fontWeight: 500 }}>
            {breadcrumb.map((b, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 && <Icon name="chevronR" size={13} />}
                <span style={{ color: i === breadcrumb.length - 1 ? 'var(--text)' : 'var(--text-faint)', fontWeight: i === breadcrumb.length - 1 ? 600 : 500 }}>{b}</span>
              </span>
            ))}
          </div>
          <h1 style={{ margin: '2px 0 0', fontSize: 42, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', whiteSpace: 'nowrap' }}>{breadcrumb[breadcrumb.length - 1]}</h1>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="dt-pill" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginRight: 4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{timeStr} · {dateStr}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Cập nhật tự động</div>
        </div>
        <button className="icon-btn" title="Làm mới" onClick={() => { setSpin(true); setTimeout(() => setSpin(false), 700) }}>
          <Icon name="refresh" size={18} style={{ animation: spin ? 'spin .7s ease' : 'none' }} />
        </button>
        <NotificationDropdown />
        <button className="icon-btn" title="Đổi giao diện" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
        <div style={{ width: 1, height: 26, background: 'var(--border)', margin: '0 2px' }} />
      </div>
    </header>
  )
}

function useBreadcrumb() {
  const pathname = usePathname()
  const map: Record<string, [string, string]> = {
    '/':                     ['Tổng quan',   'Dashboard'],
    '/dashboard/ktv':        ['Tổng quan',   'Dashboard KTV'],
    '/rooms':                ['Quản lý',     'Phòng Máy'],
    '/maintenance':          ['Vận hành',    'Nhật Ký Kỹ Thuật'],
    '/maintenance-history':  ['Vận hành',    'Lịch Sử Bảo Trì'],
    '/pre-repair':           ['Vận hành',    'Tình Trạng Trước Sửa'],
    '/recall':               ['Vận hành',    'Thu Hồi – Sửa Chữa'],
    '/tickets':              ['Hỗ trợ',      'Ticker Báo Lỗi'],
    '/tickets/admin':        ['Hỗ trợ',      'Quản Lý Ticker'],
    '/software':             ['Vận hành',    'Phần Mềm'],
    '/supplies':             ['Kho',         'Vật Tư'],
    '/stats':                ['Báo cáo',     'Thống Kê'],
    '/reports':              ['Báo cáo',     'Báo Cáo Đa Mẫu'],
    '/technicians':          ['Nhân sự',     'Kỹ Thuật Viên'],
    '/settings':             ['Hệ thống',    'Cài Đặt'],
  }
  if (pathname.startsWith('/rooms/')) {
    const room = decodeURIComponent(pathname.split('/rooms/')[1] ?? '')
    return ['Hệ thống', 'Phòng Máy', 'Phòng ' + room]
  }
  if (pathname.startsWith('/dashboard/ktv/')) {
    return ['Tổng quan', 'Dashboard KTV', 'Chi tiết KTV']
  }
  return ['Hệ thống', ...(map[pathname] ?? ['—'])]
}

function LoginSuccessToast() {
  const searchParams = useSearchParams()
  useEffect(() => {
    if (searchParams.get('login') === 'success') {
      toast.success('Đăng nhập thành công')
    }
  }, [searchParams])
  return null
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const [theme, setThemeState] = useState('light')
  const [user, setUser] = useState<UserState | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [ticketBadge, setTicketBadge] = useState(0)
  const rawBreadcrumb = useBreadcrumb()
  const breadcrumb = (pathname === '/dashboard/ktv' && user?.role === 'GUEST')
    ? ['Tổng quan', 'Dashboard']
    : rawBreadcrumb

  useEffect(() => {
    const saved = localStorage.getItem('qlpm-theme') ?? 'light'
    setThemeState(saved)
    document.documentElement.classList.toggle('dark', saved === 'dark')
    const savedCollapsed = localStorage.getItem('qlpm-sidebar') === 'collapsed'
    setCollapsed(savedCollapsed)
  }, [])

  useEffect(() => { setOpen(false) }, [pathname])

  const refreshUser = () => {
    fetch('/api/auth/profile')
      .then(r => r.ok ? r.json() : null)
      .then((data: UserState | null) => { if (data) setUser(data) })
      .catch(() => {})
  }

  useEffect(() => {
    refreshUser()
    window.addEventListener('profile-updated', refreshUser)
    return () => window.removeEventListener('profile-updated', refreshUser)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fetchBadge = () => {
      const role = (user as (UserState & { role?: string }) | null)?.role
      if (!role) return
      if (role === 'ADMIN' || role === 'MANAGER') {
        fetch('/api/tickets/unresolved-count')
          .then(r => r.ok ? r.json() : { count: 0 })
          .then((d: { count: number }) => setTicketBadge(d.count ?? 0))
          .catch(() => {})
      } else if (role === 'GUEST') {
        fetch('/api/tickets?limit=20&page=1')
          .then(r => r.ok ? r.json() : null)
          .then((d: { data: { hasUnreadReply?: boolean }[] } | null) => {
            if (!d) return
            const n = d.data.filter(t => t.hasUnreadReply).length
            setTicketBadge(n)
          })
          .catch(() => {})
      } else {
        setTicketBadge(0)
      }
    }
    fetchBadge()
    const timer = setInterval(fetchBadge, 60000)
    return () => clearInterval(timer)
  }, [user, pathname])

  const setTheme = (t: string) => {
    setThemeState(t)
    document.documentElement.classList.toggle('dark', t === 'dark')
    localStorage.setItem('qlpm-theme', t)
  }

  const toggleCollapsed = () => {
    setCollapsed(c => {
      localStorage.setItem('qlpm-sidebar', !c ? 'collapsed' : 'expanded')
      return !c
    })
  }

  const handleProfileSaved = () => {
    fetch('/api/auth/profile')
      .then(r => r.ok ? r.json() : null)
      .then((data: UserState | null) => { if (data) setUser(data) })
      .catch(() => {})
  }

  const sbWidth = collapsed ? SB_MINI : SB_FULL

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Suspense fallback={null}><LoginSuccessToast /></Suspense>
      <Sidebar open={open} onClose={() => setOpen(false)} collapsed={collapsed} onToggle={toggleCollapsed} user={user} onProfile={() => setProfileOpen(true)} ticketBadge={ticketBadge} />
      <div className="main-area" style={{ flex: 1, minWidth: 0, marginLeft: sbWidth, display: 'flex', flexDirection: 'column', transition: 'margin-left .25s cubic-bezier(.3,.9,.3,1)' }}>
        <Topbar breadcrumb={breadcrumb} onMenu={() => setOpen(true)} theme={theme} setTheme={setTheme} user={user} onProfile={() => setProfileOpen(true)} />
        <main style={{ flex: 1, padding: 26, animation: 'pageIn .35s ease' }}>{children}</main>
        <footer style={{ padding: '16px 26px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, color: 'var(--text-faint)', fontSize: 12 }}>
          <span>© 2026 Trường Đại học Nam Cần Thơ — Trung tâm Ứng dụng và Phát triển phần mềm</span>
          <span>Hệ thống Quản lý Phòng Máy · v1.0</span>
        </footer>
      </div>

      <ProfileDialog open={profileOpen} onClose={() => { setProfileOpen(false); handleProfileSaved() }} />
    </div>
  )
}
