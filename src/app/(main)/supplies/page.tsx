'use client'
import { useFetch } from '@/lib/use-fetch'
import { supplyLevel } from '@/lib/app-data'
import { Card, CardHead, Badge, Button } from '@/components/app/primitives'
import { Progress } from '@/components/app/charts'
import { Icon } from '@/components/app/icons'

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

export default function SuppliesPage() {
  const { data: raw, loading, error, refetch } = useFetch<SupplyBalance[]>('/api/supplies/balance')

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
  if (!raw) return null

  const supplies = raw.map(s => {
    const remain = s.balance
    const pct = s.intake > 0 ? Math.round((remain / s.intake) * 100) : 0
    return { ...s, icon: SUPPLY_ICON[s.type] ?? 'box', remain, pct }
  })

  const totalReceived = supplies.reduce((s, x) => s + x.intake, 0)
  const lowCount = supplies.filter(s => s.pct < 30).length

  const overview = [
    { label: 'Tổng loại vật tư',  val: supplies.length,                        icon: 'supplies', tone: 'info' },
    { label: 'Loại sắp hết',       val: lowCount,                                icon: 'warning',  tone: 'err' },
    { label: 'Tổng đã nhận kho',   val: totalReceived.toLocaleString('vi-VN'),   icon: 'pkgIn',    tone: 'good' },
  ]
  const toneColor: Record<string, string> = { info: 'var(--primary)', err: 'var(--err)', good: 'var(--good)' }
  const toneBg:    Record<string, string> = { info: 'var(--primary-soft)', err: 'var(--err-bg)', good: 'var(--good-bg)' }

  return (
    <div className="stack">
      <div className="grid-3">
        {overview.map(o => (
          <Card key={o.label} className="lift" pad={20} style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            <div style={{ width: 50, height: 50, borderRadius: 14, background: toneBg[o.tone], color: toneColor[o.tone], display: 'grid', placeItems: 'center' }}>
              <Icon name={o.icon} size={24} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>{o.val}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5 }}>{o.label}</div>
            </div>
          </Card>
        ))}
      </div>

      <Card pad={0}>
        <div style={{ padding: '20px 22px 4px' }}>
          <CardHead title="Tồn kho vật tư" sub="Theo dõi mức tồn từng loại linh kiện" />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ minWidth: 760 }}>
            <thead><tr>
              <th style={{ paddingLeft: 22 }}>Loại vật tư</th>
              <th style={{ textAlign: 'center' }}>Đã nhận</th>
              <th style={{ textAlign: 'center' }}>Đã dùng</th>
              <th style={{ textAlign: 'center' }}>Còn lại</th>
              <th style={{ width: 200 }}>Mức tồn</th>
              <th style={{ textAlign: 'right', paddingRight: 22 }}>Trạng thái</th>
            </tr></thead>
            <tbody>
              {supplies.slice().sort((a, b) => a.pct - b.pct).map(s => {
                const lv = supplyLevel({ key: s.type, received: s.intake, used: s.used, label: s.label, icon: s.icon, remain: s.remain, pct: s.pct })
                return (
                  <tr key={s.type} className="trow">
                    <td style={{ paddingLeft: 22 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-3)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={s.icon} size={18} /></div>
                        <span style={{ fontWeight: 600 }}>{s.label}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{s.intake}</td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{s.used}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: s.remain < 5 ? 'var(--err-tx)' : 'var(--text)' }}>{s.remain}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1 }}><Progress value={s.pct} tone={`var(--${lv.tone})`} height={8} /></div>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: `var(--${lv.tone}-tx)`, width: 36, textAlign: 'right' }}>{s.pct}%</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: 22 }}>
                      {s.remain < 5
                        ? <Badge tone="err" icon="warning">Cần nhập thêm</Badge>
                        : <Badge tone={lv.tone as 'good' | 'both' | 'err'} dot>{lv.label}</Badge>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
