'use client'
import { useFetch } from '@/lib/use-fetch'
import { Card, CardHead, Badge, Button } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'
import { BarChart, DonutChart, Sparkline, Progress } from '@/components/app/charts'

interface SummaryData {
  totalMachines: number
  totalErrors: number
  goodRate: number
  swMachines: number
  hwMachines: number
  errorsByFloor: {
    floor: string
    sw: number
    hw: number
    errorCount: number
    totalCount: number
  }[]
  weeklyErrors: { date: string; softwareErrors: number; hardwareErrors: number }[]
}

export default function StatsPage() {
  const { data: summary, loading, error, refetch } = useFetch<SummaryData>('/api/statistics/summary')

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
      <Icon name="refresh" size={28} style={{ marginBottom: 12, opacity: 0.4, animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 12px' }} />
      <div>Đang tải dữ liệu...</div>
    </div>
  )
  if (error) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <Icon name="alert" size={28} style={{ color: 'var(--err)', display: 'block', margin: '0 auto 12px' }} />
      <div style={{ color: 'var(--err-tx)', fontSize: 14, marginBottom: 16 }}>Không tải được dữ liệu. Vui lòng thử lại.</div>
      <Button variant="outline" size="sm" onClick={() => refetch()} icon="refresh">Thử lại</Button>
    </div>
  )
  if (!summary) return null

  const barKeys = [{ k: 'sw', color: 'var(--soft)', label: 'Phần mềm' }, { k: 'hw', color: 'var(--err)', label: 'Phần cứng' }]
  const errorSplit = [
    { label: 'Lỗi phần mềm',  value: summary.swMachines, color: 'var(--soft)' },
    { label: 'Lỗi phần cứng', value: summary.hwMachines, color: 'var(--err)' },
  ]
  const totalErr = summary.swMachines + summary.hwMachines

  // Uptime trend từ weeklyErrors: tính tỉ lệ không bị lỗi (mock goodRate stable)
  const uptimeTrend = summary.weeklyErrors.map(w =>
    summary.totalMachines > 0
      ? Math.round((1 - (w.softwareErrors + w.hardwareErrors) / summary.totalMachines) * 1000) / 10
      : summary.goodRate
  )
  const uptimeDisplay = uptimeTrend.every(v => v === 100) ? Array(7).fill(summary.goodRate) : uptimeTrend

  const byRoom = summary.errorsByFloor.slice().sort((a, b) => b.errorCount - a.errorCount)
  const maxErr = Math.max(...byRoom.map(r => r.errorCount), 1)

  return (
    <div className="stack">
      <div className="grid-chart">
        <Card pad={22}>
          <CardHead title="Xu hướng tỉ lệ hoạt động" sub="7 ngày gần nhất (%)" action={<Badge tone="good" icon="trend">{summary.goodRate}%</Badge>} />
          <Sparkline values={uptimeDisplay} height={180} color="var(--primary)" />
        </Card>
        <Card pad={22}>
          <CardHead title="Phân loại lỗi" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <DonutChart data={errorSplit} center={<div><div style={{ fontSize: 26, fontWeight: 800 }}>{totalErr}</div><div style={{ fontSize: 11, color: 'var(--text-faint)' }}>lỗi</div></div>} />
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {errorSplit.map(d => (
                <div key={d.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 4, background: d.color }} />{d.label}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{d.value} <span style={{ color: 'var(--text-faint)', fontWeight: 500, fontSize: 12 }}>({totalErr > 0 ? Math.round(d.value / totalErr * 100) : 0}%)</span></span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card pad={22}>
          <CardHead title="Máy lỗi theo tầng" action={
            <div style={{ display: 'flex', gap: 12 }}>
              {barKeys.map(k => <span key={k.k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}><span style={{ width: 9, height: 9, borderRadius: 3, background: k.color }} />{k.label}</span>)}
            </div>
          } />
          <BarChart data={summary.errorsByFloor} keys={barKeys} height={250} />
        </Card>
        <Card pad={22}>
          <CardHead title="Tầng nhiều lỗi nhất" sub="Phân bố lỗi theo tầng" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {byRoom.map(r => (
              <div key={r.floor} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Badge tone="info" style={{ width: 72, flexShrink: 0 }}>{r.floor}</Badge>
                <div style={{ flex: 1 }}>
                  <Progress value={maxErr > 0 ? (r.errorCount / maxErr) * 100 : 0} tone={r.errorCount > 5 ? 'var(--err)' : r.errorCount > 0 ? 'var(--both)' : 'var(--good)'} height={8} />
                </div>
                <span style={{ fontWeight: 700, fontSize: 13.5, width: 64, textAlign: 'right', color: r.errorCount > 5 ? 'var(--err-tx)' : 'var(--text)', flexShrink: 0 }}>{r.errorCount} lỗi</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
