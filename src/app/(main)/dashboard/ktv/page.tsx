'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useFetch } from '@/lib/use-fetch'
import { fmtDate } from '@/lib/app-data'
import { Card, CardHead, Badge, Button } from '@/components/app/primitives'
import { BarChart, DonutChart } from '@/components/app/charts'
import { Icon } from '@/components/app/icons'

// ── Guest Welcome ───────────────────────────────────────────────────────────
const SPARKLES = [
  { top: '8%',  left: '6%',   size: 20, dur: 2.4, delay: 0.0, color: '#fbbf24' },
  { top: '15%', left: '88%',  size: 14, dur: 1.9, delay: 0.4, color: '#a78bfa' },
  { top: '4%',  left: '52%',  size: 26, dur: 2.7, delay: 0.7, color: '#60a5fa' },
  { top: '72%', left: '4%',   size: 18, dur: 2.1, delay: 0.2, color: '#34d399' },
  { top: '80%', left: '91%',  size: 16, dur: 2.3, delay: 1.0, color: '#f472b6' },
  { top: '50%', left: '96%',  size: 12, dur: 1.8, delay: 0.6, color: '#fbbf24' },
  { top: '60%', left: '2%',   size: 22, dur: 2.5, delay: 0.9, color: '#60a5fa' },
  { top: '30%', left: '93%',  size: 10, dur: 2.0, delay: 1.3, color: '#a78bfa' },
  { top: '88%', left: '45%',  size: 14, dur: 2.2, delay: 0.3, color: '#34d399' },
  { top: '22%', left: '2%',   size: 10, dur: 1.7, delay: 1.5, color: '#f472b6' },
]

function StarIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2 L13.5 9.5 L21 12 L13.5 14.5 L12 22 L10.5 14.5 L3 12 L10.5 9.5 Z" />
    </svg>
  )
}

function GuestWelcome({ displayName }: { displayName: string }) {
  return (
    <>
      <style>{`
        @keyframes guestSparkle {
          0%,100% { opacity:0; transform:scale(0) rotate(0deg); }
          40%,60% { opacity:1; transform:scale(1) rotate(180deg); }
        }
        @keyframes guestFloat {
          0%,100% { transform:translateY(0px); }
          50%      { transform:translateY(-14px); }
        }
        @keyframes guestShimmer {
          0%   { background-position: -300% center; }
          100% { background-position:  300% center; }
        }
        @keyframes guestFadeIn {
          from { opacity:0; transform:translateY(20px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>

      <div style={{
        position: 'relative', overflow: 'hidden',
        borderRadius: 24,
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2d1b69 50%, #1e3a5f 100%)',
        padding: '60px 32px 56px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        animation: 'guestFadeIn .6s ease both',
        boxShadow: '0 20px 60px rgba(0,0,0,.25)',
      }}>
        {/* Sparkle stars */}
        {SPARKLES.map((s, i) => (
          <span key={i} style={{
            position: 'absolute',
            top: s.top, left: s.left,
            animation: `guestSparkle ${s.dur}s ${s.delay}s ease-in-out infinite`,
            pointerEvents: 'none',
          }}>
            <StarIcon size={s.size} color={s.color} />
          </span>
        ))}

        {/* Logo */}
        <div style={{ animation: 'guestFloat 3s ease-in-out infinite', marginBottom: 28 }}>
          <Image
            src="/logo_don.png"
            alt="ĐH Nam Cần Thơ"
            width={90}
            height={90}
            style={{ objectFit: 'contain', filter: 'drop-shadow(0 4px 16px rgba(255,255,255,.25))' }}
          />
        </div>

        {/* Greeting */}
        <h2 style={{
          margin: 0, fontSize: 32, fontWeight: 800, textAlign: 'center',
          background: 'linear-gradient(90deg, #fbbf24, #f9fafb, #a78bfa, #60a5fa, #fbbf24)',
          backgroundSize: '300% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'guestShimmer 4s linear infinite',
          letterSpacing: '-.02em',
        }}>
          Chào mừng {displayName}! ✨
        </h2>

        <p style={{
          marginTop: 14, fontSize: 15, color: 'rgba(255,255,255,.75)',
          textAlign: 'center', lineHeight: 1.7, maxWidth: 480,
        }}>
          Bạn đang truy cập <strong style={{ color: '#fff' }}>Hệ thống Quản lý Phòng Máy</strong><br />
          Trường Đại học Nam Cần Thơ với tư cách <strong style={{ color: '#fbbf24' }}>Khách</strong>.
        </p>

        {/* Quick links */}
        <div style={{
          marginTop: 32, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
        }}>
          {[
            { label: '🖥️  Phòng Máy',      href: '/rooms' },
            { label: '🔧  Lịch Sử Bảo Trì', href: '/maintenance-history' },
          ].map(l => (
            <a key={l.href} href={l.href} style={{
              padding: '9px 20px', borderRadius: 99,
              background: 'rgba(255,255,255,.12)',
              border: '1px solid rgba(255,255,255,.2)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              textDecoration: 'none',
              backdropFilter: 'blur(8px)',
              transition: 'background .15s',
            }}>
              {l.label}
            </a>
          ))}
        </div>

        {/* Ticket suggestion */}
        <div style={{
          marginTop: 28,
          padding: '14px 22px',
          borderRadius: 14,
          background: 'rgba(255,255,255,.08)',
          border: '1px solid rgba(255,255,255,.15)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center',
          maxWidth: 520,
        }}>
          <span style={{ fontSize: 22 }}>🛠️</span>
          <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,.85)', lineHeight: 1.55, flex: 1, minWidth: 200, textAlign: 'left' }}>
            Phát hiện sự cố hoặc máy hỏng?{' '}
            <strong style={{ color: '#fff' }}>Gửi Ticker Báo Lỗi</strong>{' '}
            — đội kỹ thuật sẽ xử lý ngay cho bạn.
          </p>
          <a href="/tickets" style={{
            padding: '8px 18px', borderRadius: 99, flexShrink: 0,
            background: '#fbbf24', color: '#1e1b00',
            fontSize: 13, fontWeight: 700, textDecoration: 'none',
            boxShadow: '0 4px 14px rgba(251,191,36,.35)',
            transition: 'opacity .15s',
          }}>
            Gửi Ticker →
          </a>
        </div>
      </div>
    </>
  )
}

// ── Types ──────────────────────────────────────────────────────────────────
interface KtvStats {
  userId: number
  user: { id: number; email: string; profile?: { displayName: string; department?: string | null; avatar?: string | null } | null } | null
  range: { start: string; end: string; type: string }
  kpi: {
    restoreCount: number
    incidentCount: number
    totalCount: number
    roomCount: number
    allTimeTotal: number
  }
  dailyChart: { date: string; label: string; bt: number; disable: number; restore: number; total: number }[]
  workTypeChart: { label: string; value: number }[]
  recentLogs: {
    id: number
    maintenanceDate: string
    roomCode: string | null
    machineNo: number | null
    actionType: string | null
    notes: string | null
    softwareErrorsBefore: number
    hardwareErrorsBefore: number
    softwareErrorsAfter: number
    hardwareErrorsAfter: number
    completedAt: string | null
  }[]
}

type Range = 'today' | 'week' | 'month'

// ── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, tone, sub }: {
  icon: string; label: string; value: string | number; tone: string; sub?: string
}) {
  const colors: Record<string, { bg: string; fg: string }> = {
    info:  { bg: 'var(--primary-soft)', fg: 'var(--primary)' },
    good:  { bg: 'var(--good-bg)',      fg: 'var(--good)' },
    soft:  { bg: 'var(--soft-bg)',      fg: 'var(--soft)' },
    err:   { bg: 'var(--err-bg)',       fg: 'var(--err)' },
    muted: { bg: 'var(--surface-3)',    fg: 'var(--text-muted)' },
  }
  const c = colors[tone] ?? colors.info
  return (
    <Card className="lift" pad={20}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: c.bg, display: 'grid', placeItems: 'center', color: c.fg }}>
          <Icon name={icon} size={22} stroke={2.1} />
        </div>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--text-faint)' }}>{sub}</div>}
    </Card>
  )
}

const RANGE_OPTS: { k: Range; l: string }[] = [
  { k: 'today', l: 'Hôm nay' },
  { k: 'week',  l: 'Tuần này' },
  { k: 'month', l: 'Tháng này' },
]

const ACTION_LABEL: Record<string, { label: string; tone: 'err' | 'good' | 'soft'; icon: string }> = {
  DISABLE_FAULTY_MACHINE: { label: 'Báo lỗi máy',   tone: 'err',  icon: 'alert' },
  RESTORE_MACHINE:        { label: 'Sửa chữa máy',  tone: 'good', icon: 'check' },
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function KtvDashboardPage() {
  const router = useRouter()
  const [range, setRange] = useState<Range>('month')

  const { data: me } = useFetch<{ user: { userId: number; role: string } | null }>('/api/auth/me')

  // ADMIN/MANAGER truy cập qua /dashboard/ktv/[userId], redirect ra ngoài
  useEffect(() => {
    if (me && me.user && me.user.role !== 'TECHNICIAN' && me.user.role !== 'GUEST') {
      router.replace('/')
    }
  }, [me, router])

  const apiUrl = `/api/dashboard/ktv?range=${range}`
  const { data: stats, loading, error } = useFetch<KtvStats>(apiUrl)

  const displayName = stats?.user?.profile?.displayName
    ?? me?.user?.userId?.toString()
    ?? 'Kỹ thuật viên'

  if (loading || !me?.user) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Đang tải dữ liệu...</div>
  }

  // GUEST thấy welcome card thay vì dashboard KTV
  if (me.user.role === 'GUEST') {
    return <GuestWelcome displayName={displayName} />
  }

  if (error) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--err-tx)' }}>Lỗi tải dữ liệu: {error}</div>
  }
  if (!stats) return null

  const barKeys = [
    { k: 'restore', color: 'var(--good)', label: 'Sửa chữa máy' },
    { k: 'disable', color: 'var(--err)',  label: 'Báo lỗi máy' },
  ]
  const WORK_TYPE_COLOR: Record<string, string> = {
    'Báo lỗi máy':  'var(--err)',
    'Sửa chữa máy': 'var(--good)',
  }
  const donutData = stats.workTypeChart.map(d => ({ ...d, color: WORK_TYPE_COLOR[d.label] ?? 'var(--primary)' }))

  return (
    <div className="stack">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 36, fontWeight: 700, letterSpacing: '-.02em' }}>
            Xin chào, {displayName} 👋
          </h2>
          <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Dashboard cá nhân · Tổng {stats.kpi.allTimeTotal} lần bảo trì
          </p>
        </div>

        {/* Bộ chọn khoảng thời gian */}
        <div style={{ display: 'flex', gap: 6, padding: 4, background: 'var(--surface-3)', borderRadius: 12 }}>
          {RANGE_OPTS.map(o => (
            <button key={o.k} onClick={() => setRange(o.k)} style={{
              padding: '7px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 600,
              background: range === o.k ? 'var(--surface)' : 'transparent',
              color: range === o.k ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: range === o.k ? 'var(--shadow-sm)' : 'none',
              transition: 'all .14s',
            }}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid-kpi">
        <KpiCard icon="check"  tone="good" value={stats.kpi.restoreCount}  label="Đã sửa chữa máy"  sub={`${RANGE_OPTS.find(r => r.k === range)?.l}`} />
        <KpiCard icon="alert"  tone="err"  value={stats.kpi.incidentCount} label="Báo lỗi máy"        sub={`${RANGE_OPTS.find(r => r.k === range)?.l}`} />
        <KpiCard icon="rooms"       tone="soft"  value={stats.kpi.roomCount}        label="Phòng đã bảo trì"  sub={`${RANGE_OPTS.find(r => r.k === range)?.l}`} />
        <KpiCard icon="checkCircle" tone="good"  value={stats.kpi.allTimeTotal}     label="Tổng lần bảo trì"  sub="Toàn thời gian" />
      </div>

      {/* Charts */}
      <div className="grid-chart">
        <Card pad={22}>
          <CardHead title="Hoạt động 30 ngày gần nhất" sub="Số lần bảo trì và xử lý sự cố mỗi ngày"
            action={
              <div style={{ display: 'flex', gap: 12 }}>
                {barKeys.map(k => (
                  <span key={k.k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: k.color }} />
                    {k.label}
                  </span>
                ))}
              </div>
            }
          />
          <BarChart data={stats.dailyChart} keys={barKeys} height={220} />
        </Card>

        <Card pad={22}>
          <CardHead title="Cơ cấu loại công việc" sub="Tỉ trọng từng loại (toàn thời gian)" />
          {donutData.every(d => d.value === 0) ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
              Chưa có dữ liệu
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 6 }}>
              <DonutChart
                data={donutData}
                center={
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.03em' }}>{stats.kpi.allTimeTotal}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>tổng</div>
                  </div>
                }
              />
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {donutData.map(d => (
                  <div key={d.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 4, background: d.color }} />
                      {d.label}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>
                      {d.value}
                      <span style={{ color: 'var(--text-faint)', fontWeight: 400, fontSize: 11, marginLeft: 4 }}>
                        ({stats.kpi.allTimeTotal > 0 ? Math.round(d.value / stats.kpi.allTimeTotal * 100) : 0}%)
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Lịch sử cá nhân */}
      <Card pad={22}>
        <CardHead
          title="Lịch sử bảo trì của tôi"
          sub="10 bản ghi gần nhất"
          action={
            <Button variant="outline" size="sm" icon="arrowR" onClick={() => router.push('/maintenance-history')}>
              Xem tất cả
            </Button>
          }
        />
        {stats.recentLogs.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
            Chưa có bản ghi bảo trì nào.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Phòng / Máy</th>
                  <th>Loại</th>
                  <th>Ghi chú</th>
                  <th style={{ textAlign: 'center' }}>Lỗi trước → sau</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentLogs.map(log => {
                  const before = log.softwareErrorsBefore + log.hardwareErrorsBefore
                  const after  = log.softwareErrorsAfter  + log.hardwareErrorsAfter
                  const actionMeta = log.actionType ? ACTION_LABEL[log.actionType] : null
                  return (
                    <tr key={log.id} className="trow">
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {fmtDate(log.maintenanceDate)}
                      </td>
                      <td>
                        {log.roomCode
                          ? <Badge tone="info">{log.roomCode}{log.machineNo ? ` · Máy ${log.machineNo}` : ''}</Badge>
                          : <span style={{ color: 'var(--text-faint)' }}>—</span>
                        }
                      </td>
                      <td>
                        {actionMeta
                          ? <Badge tone={actionMeta.tone} icon={actionMeta.icon}>{actionMeta.label}</Badge>
                          : <Badge tone="soft" icon="wrench">Bảo trì phòng</Badge>
                        }
                      </td>
                      <td style={{ color: 'var(--text-muted)', maxWidth: 220, fontSize: 13 }}>
                        {log.notes ?? '—'}
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {!log.actionType
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                              <span style={{ color: 'var(--err-tx)' }}>{before}</span>
                              <Icon name="arrowR" size={13} style={{ color: 'var(--good)' }} />
                              <span style={{ color: 'var(--good-tx)' }}>{after}</span>
                            </span>
                          : <span style={{ color: 'var(--text-faint)' }}>—</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
