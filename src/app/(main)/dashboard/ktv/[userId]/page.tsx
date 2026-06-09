'use client'
import { useState, use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFetch } from '@/lib/use-fetch'
import { fmtDate } from '@/lib/app-data'
import { Card, CardHead, Badge, Button } from '@/components/app/primitives'
import { BarChart, DonutChart } from '@/components/app/charts'
import { Icon } from '@/components/app/icons'

interface KtvStats {
  userId: number
  user: { id: number; email: string; profile?: { displayName: string; department?: string | null } | null } | null
  range: { start: string; end: string; type: string }
  kpi: { restoreCount: number; incidentCount: number; totalCount: number; roomCount: number; allTimeTotal: number }
  dailyChart: { date: string; label: string; bt: number; disable: number; restore: number; total: number }[]
  workTypeChart: { label: string; value: number }[]
  recentLogs: {
    id: number; maintenanceDate: string; roomCode: string | null; machineNo: number | null
    actionType: string | null; notes: string | null
    softwareErrorsBefore: number; hardwareErrorsBefore: number
    softwareErrorsAfter: number; hardwareErrorsAfter: number
    completedAt: string | null
  }[]
}

type Range = 'today' | 'week' | 'month'
const RANGE_OPTS: { k: Range; l: string }[] = [
  { k: 'today', l: 'Hôm nay' },
  { k: 'week',  l: 'Tuần này' },
  { k: 'month', l: 'Tháng này' },
]

function KpiCard({ icon, label, value, tone, sub }: { icon: string; label: string; value: string | number; tone: string; sub?: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    info:  { bg: 'var(--primary-soft)', fg: 'var(--primary)' },
    good:  { bg: 'var(--good-bg)',      fg: 'var(--good)' },
    soft:  { bg: 'var(--soft-bg)',      fg: 'var(--soft)' },
    err:   { bg: 'var(--err-bg)',       fg: 'var(--err)' },
    muted: { bg: 'var(--surface-3)',    fg: 'var(--text-muted)' },
  }
  const c = colors[tone] ?? colors.info
  return (
    <Card pad={20}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: c.bg, display: 'grid', placeItems: 'center', color: c.fg, marginBottom: 14 }}>
        <Icon name={icon} size={22} stroke={2.1} />
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--text-faint)' }}>{sub}</div>}
    </Card>
  )
}

export default function AdminKtvDashboardPage({ params }: { params: Promise<{ userId: string }> }) {
  const router = useRouter()
  const { userId: rawId } = use(params)
  const userId = parseInt(rawId)
  const [range, setRange] = useState<Range>('month')

  const { data: me } = useFetch<{ user: { userId: number; role: string } | null }>('/api/auth/me')

  // Chỉ ADMIN/MANAGER được xem dashboard của người khác
  // TECHNICIAN chỉ được xem của chính mình
  useEffect(() => {
    if (!me?.user) return
    const role = me.user.role
    if (role === 'TECHNICIAN' && me.user.userId !== userId) {
      router.replace('/dashboard/ktv')
    }
    if (role !== 'ADMIN' && role !== 'MANAGER' && role !== 'TECHNICIAN') {
      router.replace('/')
    }
  }, [me, userId, router])

  const apiUrl = !isNaN(userId) ? `/api/dashboard/ktv?userId=${userId}&range=${range}` : ''
  const { data: stats, loading, error } = useFetch<KtvStats>(apiUrl)

  if (loading || !me?.user) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Đang tải dữ liệu...</div>
  }
  if (error) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--err-tx)' }}>Lỗi: {error}</div>
  }
  if (!stats) return null

  const displayName = stats.user?.profile?.displayName ?? stats.user?.email ?? `User #${userId}`
  const isAdminView = me.user.role === 'ADMIN' || me.user.role === 'MANAGER'

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
      <button className="linkbtn" onClick={() => router.push('/technicians')} style={{ color: 'var(--text-muted)', marginBottom: -6 }}>
        <Icon name="chevronL" size={15} /> Quay lại danh sách KTV
      </button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: '-.02em' }}>
            {displayName}
          </h2>
          {isAdminView && (
            <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="alert" size={13} style={{ color: 'var(--soft)' }} />
              Chế độ xem của Admin — không thể thao tác thay KTV
            </p>
          )}
        </div>

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

      {/* KPI */}
      <div className="grid-kpi">
        <KpiCard icon="check"  tone="good" value={stats.kpi.restoreCount}  label="Đã sửa chữa máy"  sub={RANGE_OPTS.find(r => r.k === range)?.l} />
        <KpiCard icon="alert"  tone="err"  value={stats.kpi.incidentCount} label="Báo lỗi máy"        sub={RANGE_OPTS.find(r => r.k === range)?.l} />
        <KpiCard icon="rooms"       tone="soft"  value={stats.kpi.roomCount}        label="Phòng đã bảo trì"  sub={RANGE_OPTS.find(r => r.k === range)?.l} />
        <KpiCard icon="checkCircle" tone="good"  value={stats.kpi.allTimeTotal}     label="Tổng lần bảo trì"  sub="Toàn thời gian" />
      </div>

      {/* Charts */}
      <div className="grid-chart">
        <Card pad={22}>
          <CardHead title="Hoạt động 30 ngày gần nhất" sub="Bảo trì và xử lý sự cố theo ngày"
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
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>Chưa có dữ liệu</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 6 }}>
              <DonutChart
                data={donutData}
                center={<div><div style={{ fontSize: 24, fontWeight: 800 }}>{stats.kpi.allTimeTotal}</div><div style={{ fontSize: 11, color: 'var(--text-faint)' }}>tổng</div></div>}
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

      {/* Lịch sử */}
      <Card pad={22}>
        <CardHead title={`Lịch sử bảo trì — ${displayName}`} sub="10 bản ghi gần nhất (chỉ đọc)" />
        {stats.recentLogs.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>Chưa có bản ghi.</div>
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
                  const actionMeta: Record<string, { label: string; tone: 'err' | 'good' | 'soft'; icon: string }> = {
                    DISABLE_FAULTY_MACHINE: { label: 'Báo lỗi máy',  tone: 'err',  icon: 'alert' },
                    RESTORE_MACHINE:        { label: 'Sửa chữa máy', tone: 'good', icon: 'check' },
                  }
                  const meta = log.actionType ? actionMeta[log.actionType] : null
                  return (
                    <tr key={log.id} className="trow">
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {fmtDate(new Date(log.maintenanceDate).toISOString().slice(0, 10))}
                      </td>
                      <td>
                        {log.roomCode
                          ? <Badge tone="info">{log.roomCode}{log.machineNo ? ` · Máy ${log.machineNo}` : ''}</Badge>
                          : <span style={{ color: 'var(--text-faint)' }}>—</span>
                        }
                      </td>
                      <td>
                        {meta
                          ? <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>
                          : <Badge tone="soft" icon="wrench">Bảo trì phòng</Badge>
                        }
                      </td>
                      <td style={{ color: 'var(--text-muted)', maxWidth: 220, fontSize: 13 }}>{log.notes ?? '—'}</td>
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
