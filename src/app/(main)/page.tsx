'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useNav } from '@/lib/use-nav'
import { useFetch } from '@/lib/use-fetch'
import { supplyLevel, fmtDate } from '@/lib/app-data'
import { Card, CardHead, Button, Badge } from '@/components/app/primitives'
import { BarChart, DonutChart, Progress } from '@/components/app/charts'
import { Icon } from '@/components/app/icons'

interface SummaryData {
  totalMachines: number
  totalErrors: number
  errorRate: number
  goodRate: number
  swMachines: number
  hwMachines: number
  maintenanceThisMonth: number
  errorsByFloor: { floor: string; sw: number; hw: number; errorCount: number; totalCount: number }[]
  recentMaintenance: {
    id: number
    maintenanceDate: string
    room: { roomCode: string } | null
    technician: string | null
    softwareErrorsBefore: number
    hardwareErrorsBefore: number
    softwareErrorsAfter: number
    hardwareErrorsAfter: number
  }[]
}

interface SupplyBalance {
  type: string
  label: string
  intake: number
  used: number
  balance: number
}

const SUPPLY_ICON: Record<string, string> = {
  caseQty: 'case', cpuQty: 'cpu', ramQty: 'ram', diskQty: 'disk',
  powerQty: 'power', monitorQty: 'screen', monitorCableQty: 'cable',
  powerCableQty: 'cable', mouseQty: 'mouse', networkQty: 'network',
  keyboardQty: 'keyboard',
}

function Kpi({ icon, tone, label, value, foot }: { icon: string; tone: string; label: string; value: string; foot: React.ReactNode }) {
  const map: Record<string, string> = { info: 'var(--primary)', err: 'var(--err)', good: 'var(--good)', soft: 'var(--soft)', teacher: 'var(--teacher)' }
  const bgMap: Record<string, string> = { info: 'var(--primary-soft)', err: 'var(--err-bg)', good: 'var(--good-bg)', soft: 'var(--soft-bg)', teacher: 'var(--teacher-bg)' }
  return (
    <Card className="lift" pad={20}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, background: bgMap[tone], display: 'grid', placeItems: 'center', color: map[tone] }}>
          <Icon name={icon} size={23} stroke={2.1} />
        </div>
        {foot}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 7, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
    </Card>
  )
}

function LoadingPlaceholder() {
  return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>Đang tải dữ liệu...</div>
}

function ErrorPlaceholder({ msg }: { msg: string }) {
  return <div style={{ padding: 60, textAlign: 'center', color: 'var(--err-tx)', fontSize: 14 }}>Lỗi tải dữ liệu: {msg}</div>
}

export default function DashboardPage() {
  const router = useRouter()
  const go = useNav()
  const { data: summary, loading: sl, error: se } = useFetch<SummaryData>('/api/statistics/summary')
  const { data: supplies, loading: pl } = useFetch<SupplyBalance[]>('/api/supplies/balance')
  const { data: me } = useFetch<{ email: string; role: string; profile?: { displayName: string } | null }>('/api/auth/profile')
  const isKtv = me?.role === 'TECHNICIAN'
  const isAdmin = me?.role === 'ADMIN'
  const displayName = me?.profile?.displayName ?? me?.email?.split('@')[0] ?? 'Kỹ thuật viên'
  const greeting = isAdmin ? 'Quản trị viên' : isKtv ? displayName : displayName

  // TECHNICIAN được điều hướng về dashboard riêng
  useEffect(() => {
    if (me?.role === 'TECHNICIAN') {
      router.replace('/dashboard/ktv')
    }
  }, [me, router])

  if (sl || isKtv) return <LoadingPlaceholder />
  if (se) return <ErrorPlaceholder msg={se} />
  if (!summary) return null

  const barKeys = [{ k: 'sw', color: 'var(--soft)', label: 'Phần mềm' }, { k: 'hw', color: 'var(--err)', label: 'Phần cứng' }]
  const errorSplit = [
    { label: 'Lỗi phần mềm', value: summary.swMachines, color: 'var(--soft)' },
    { label: 'Lỗi phần cứng', value: summary.hwMachines, color: 'var(--err)' },
  ]
  const totalErr = summary.swMachines + summary.hwMachines
  const totalRooms = summary.errorsByFloor.length

  const suppliesWithMeta = (supplies ?? [])
    .filter(s => s.intake > 0)
    .map(s => {
      const remain = s.balance
      const pct = Math.round((remain / s.intake) * 100)
      return { ...s, icon: SUPPLY_ICON[s.type] ?? 'box', remain, pct }
    })

  return (
    <div className="stack">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: -4 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 42, fontWeight: 700, letterSpacing: '-.02em' }}>Xin chào, {greeting} 👋</h2>
          <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: 13.5 }}>
            Tổng quan tình trạng <strong style={{ color: 'var(--text)' }}>{totalRooms} phòng máy</strong> · <strong style={{ color: 'var(--text)' }}>{summary.totalMachines.toLocaleString('vi-VN')} máy tính</strong>.
          </p>
        </div>
        {!isKtv && <Button variant="outline" size="sm" icon="download" onClick={() => window.open('/report/print?print=1', '_blank')}>Xuất báo cáo PDF</Button>}
      </div>

      <div className="grid-kpi">
        <Kpi icon="monitor" tone="info"  value={summary.totalMachines.toLocaleString('vi-VN')} label="Tổng số máy tính"       foot={<Badge tone="muted" icon="rooms">{totalRooms} phòng</Badge>} />
        <Kpi icon="alert"   tone="err"   value={String(summary.totalErrors)}                    label="Máy đang lỗi"          foot={<Badge tone="err" dot>{summary.errorRate}% tỉ lệ lỗi</Badge>} />
        <Kpi icon="checkCircle" tone="good" value={`${summary.goodRate}%`}                      label="Tỉ lệ hoạt động tốt"   foot={<Badge tone="good" icon="trend">Tháng này</Badge>} />
        <Kpi icon="wrench"  tone="soft"  value={String(summary.maintenanceThisMonth)}            label="Lượt bảo trì tháng này" foot={<Badge tone="soft" dot>Tháng này</Badge>} />
      </div>

      <div className="grid-chart">
        <Card pad={22}>
          <CardHead title="Máy lỗi theo tầng" sub="Số máy lỗi phân theo tầng, tách phần mềm / phần cứng"
            action={<div style={{ display: 'flex', gap: 14 }}>{barKeys.map(k => <span key={k.k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: k.color }} />{k.label}</span>)}</div>} />
          <BarChart data={summary.errorsByFloor} keys={barKeys} height={260} />
        </Card>
        <Card pad={22}>
          <CardHead title="Phân loại lỗi" sub="Tỉ trọng phần mềm và phần cứng" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, paddingTop: 6 }}>
            <DonutChart data={errorSplit} center={<div><div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.03em' }}>{totalErr}</div><div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>tổng lỗi</div></div>} />
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {errorSplit.map(d => (
                <div key={d.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}><span style={{ width: 10, height: 10, borderRadius: 4, background: d.color }} />{d.label}</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{d.value} <span style={{ color: 'var(--text-faint)', fontWeight: 500, fontSize: 12 }}>({totalErr > 0 ? Math.round(d.value / totalErr * 100) : 0}%)</span></span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card pad={22}>
          <CardHead title="Bảo trì gần nhất" sub="5 lượt xử lý mới nhất"
            action={<button className="linkbtn" onClick={() => go('maintenance')}>Xem tất cả <Icon name="arrowR" size={15} /></button>} />
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Ngày</th><th>Phòng</th><th>Kỹ thuật viên</th><th style={{ textAlign: 'center' }}>Số lỗi</th></tr></thead>
              <tbody>
                {summary.recentMaintenance.map(m => {
                  const before = m.softwareErrorsBefore + m.hardwareErrorsBefore
                  const after = m.softwareErrorsAfter + m.hardwareErrorsAfter
                  return (
                    <tr key={m.id} className="trow">
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(m.maintenanceDate)}</td>
                      <td><Badge tone="info">{m.room?.roomCode ?? '—'}</Badge></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{m.technician ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                          <span style={{ color: 'var(--text-faint)' }}>{before}</span>
                          <Icon name="arrowR" size={13} style={{ color: 'var(--good)' }} />
                          <span style={{ color: 'var(--good-tx)' }}>{after}</span>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {!isKtv && (
        <Card pad={22}>
          <CardHead title="Tồn kho vật tư" sub="Mức tồn theo từng loại"
            action={<button className="linkbtn" onClick={() => go('supplies')}>Quản lý kho <Icon name="arrowR" size={15} /></button>} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {suppliesWithMeta.slice().sort((a, b) => a.pct - b.pct).slice(0, 6).map(s => {
              const lv = supplyLevel({ key: s.type, received: s.intake, used: s.used, label: s.label, icon: s.icon, remain: s.remain, pct: s.pct })
              return (
                <div key={s.type} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', color: 'var(--text-muted)', flexShrink: 0 }}><Icon name={s.icon} size={17} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>Còn {s.remain}</span>
                    </div>
                    <Progress value={s.pct} tone={`var(--${lv.tone === 'good' ? 'good' : lv.tone === 'both' ? 'both' : 'err'})`} height={7} />
                  </div>
                  <Badge tone={lv.tone as 'good' | 'both' | 'err'}>{s.pct}%</Badge>
                </div>
              )
            })}
          </div>
        </Card>
        )}
      </div>
    </div>
  )
}
