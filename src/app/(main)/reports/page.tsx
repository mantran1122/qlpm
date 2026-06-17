'use client'
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHead, Badge, Button } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'
import { Progress } from '@/components/app/charts'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────────
type TabKey = 'machines' | 'supply' | 'parts-usage' | 'recall-kpi' | 'daily'

interface Period { from: string; to: string }

interface MachinesReport {
  type: 'machines'; period: Period; generatedAt: string
  summary: { totalMachines: number; totalErrors: number; swMachines: number; hwMachines: number; goodRate: number; errorRate: number; totalRooms: number; maintenanceInPeriod: number }
  rooms: { roomCode: string; floor: string; totalMachines: number; goodCount: number; swCount: number; hwCount: number; bothCount: number; errorCount: number; errorRate: number }[]
  floorStats: { floor: string; total: number; errors: number; sw: number; hw: number; rate: number }[]
  errorByType: { field: string; label: string; count: number }[]
  maintenanceLogs: { id: number; date: string; room: string; technicianName: string; softwareErrorsBefore: number; hardwareErrorsBefore: number; softwareErrorsAfter: number; hardwareErrorsAfter: number; notes: string }[]
  supplies: { type: string; label: string; intake: number; used: number; balance: number; pct: number }[]
}

interface SupplyReport {
  type: 'supply'; period: Period; generatedAt: string
  summary: { totalTypes: number; totalBalance: number; periodNetTotal: number; lowCount: number }
  supplies: { type: string; label: string; totalIntake: number; totalUsed: number; balance: number; pct: number; periodIntake: number; periodUsed: number; periodNet: number }[]
}

interface PartsUsageReport {
  type: 'parts-usage'; period: Period; generatedAt: string
  summary: { grandTotal: number; totalLogs: number; byType: { type: string; label: string; total: number }[] }
  rows: ({ id: number; date: string; room: string; technicianName: string; notes: string } & Record<string, number>)[]
}

interface RecallKpiReport {
  type: 'recall-kpi'; period: Period; generatedAt: string
  data: { technicianId: number; technicianName: string; totalRecalls: number; recallsByType: Record<string, number>; totalRepairsCompleted: number; repairsInProgress: number; repairsNotStarted: number; avgRepairMinutes: number | null; minRepairMinutes: number | null; maxRepairMinutes: number | null; avgResponseMinutes: number | null }[]
}

interface DailyReport {
  type: 'daily'; period: Period; generatedAt: string
  summary: { totalMachines: number; goodMachines: number; errorMachines: number; maintenanceToday: number }
  errorMachinesList: { roomCode: string; floor: string; machineNo: number; isTeacher: boolean; errorTypes: string[]; technicianNote: string | null }[]
  maintenanceLogs: { id: number; date: string; room: string; technicianName: string; notes: string }[]
  floorStats: { floor: string; total: number; errors: number; sw: number; hw: number; rate: number }[]
  byRoom: { roomCode: string; floor: string; totalMachines: number; errorMachines: number; goodMachines: number }[]
  supplies: { type: string; label: string; intake: number; used: number; balance: number; pct: number }[]
}

type ReportData = MachinesReport | SupplyReport | PartsUsageReport | RecallKpiReport | DailyReport

interface Room { id: number; roomCode: string }
interface Technician { id: number; name: string }

// ── Helpers ────────────────────────────────────────────────────────────────────
const SUPPLY_FIELDS = ['caseQty','cpuQty','ramQty','diskQty','powerQty','monitorQty','monitorCableQty','powerCableQty','mouseQty','networkQty','keyboardQty']
const SUPPLY_LABELS: Record<string, string> = { caseQty:'Vỏ máy', cpuQty:'CPU', ramQty:'RAM', diskQty:'Ổ cứng', powerQty:'Nguồn', monitorQty:'Màn hình', monitorCableQty:'Dây màn hình', powerCableQty:'Dây nguồn', mouseQty:'Chuột', networkQty:'Mạng', keyboardQty:'Bàn phím' }

function fmtDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
function fmtMinutes(min: number | null) {
  if (min == null) return '—'
  if (min < 60) return `${min} phút`
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}m`
}
function toISO(dateStr: string) {
  return dateStr ? new Date(dateStr).toISOString() : ''
}

// ── Period Selector ────────────────────────────────────────────────────────────
function PeriodSelector({ period, setPeriod, from, setFrom, to, setTo }: {
  period: string; setPeriod: (v: string) => void
  from: string; setFrom: (v: string) => void
  to: string; setTo: (v: string) => void
}) {
  const inp: React.CSSProperties = { height: 36, border: '1px solid var(--border-strong)', borderRadius: 9, padding: '0 10px', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }
  const sel: React.CSSProperties = { ...inp, paddingRight: 28 }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <select value={period} onChange={e => setPeriod(e.target.value)} style={sel}>
        <option value="today">Hôm nay</option>
        <option value="month">Tháng này</option>
        <option value="week">7 ngày qua</option>
        <option value="quarter">Quý này</option>
        <option value="year">Năm nay</option>
        <option value="custom">Tùy chọn</option>
      </select>
      {period === 'custom' && (
        <>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp} max={to || undefined} />
          <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inp} min={from || undefined} />
        </>
      )}
    </div>
  )
}

// ── Tab: Máy lỗi ──────────────────────────────────────────────────────────────
function TabMachines({ data }: { data: MachinesReport }) {
  const s = data.summary
  const maxErr = Math.max(...data.rooms.map(r => r.errorCount), 1)
  return (
    <div className="stack">
      {/* KPIs */}
      <div className="grid-4">
        {[
          { l: 'Tổng máy tính',    v: s.totalMachines,         tone: 'info'    },
          { l: 'Máy đang lỗi',     v: s.totalErrors,           tone: 'err'     },
          { l: 'Tỉ lệ hoạt động',  v: `${s.goodRate}%`,        tone: 'good'    },
          { l: 'Bảo trì trong kỳ', v: s.maintenanceInPeriod,   tone: 'soft'    },
        ].map(k => (
          <Card key={k.l} pad={20}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6 }}>{k.l}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: `var(--${k.tone === 'err' && s.totalErrors > 0 ? 'err-tx' : k.tone === 'good' ? 'good-tx' : 'text'})` }}>{k.v}</div>
          </Card>
        ))}
      </div>

      <div className="grid-2">
        {/* Per-room errors */}
        <Card pad={22}>
          <CardHead title="Phân bố lỗi theo phòng" sub={`${data.rooms.filter(r => r.errorCount > 0).length}/${data.rooms.length} phòng có lỗi`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.rooms.filter(r => r.errorCount > 0).slice(0, 15).map(r => (
              <div key={r.roomCode} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Badge tone="info" style={{ width: 56, flexShrink: 0, justifyContent: 'center' }}>{r.roomCode}</Badge>
                <div style={{ flex: 1 }}>
                  <Progress value={maxErr > 0 ? (r.errorCount / maxErr) * 100 : 0} tone={r.errorRate > 30 ? 'var(--err)' : r.errorRate > 10 ? 'var(--err)' : 'var(--soft)'} height={7} />
                </div>
                <span style={{ width: 80, textAlign: 'right', fontSize: 13, fontWeight: 600, color: r.errorRate > 20 ? 'var(--err-tx)' : 'var(--text)', flexShrink: 0 }}>
                  {r.errorCount}/{r.totalMachines} ({r.errorRate}%)
                </span>
              </div>
            ))}
            {data.rooms.filter(r => r.errorCount === 0).length > 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 4 }}>
                + {data.rooms.filter(r => r.errorCount === 0).length} phòng không có lỗi
              </div>
            )}
          </div>
        </Card>

        {/* Error by type */}
        <Card pad={22}>
          <CardHead title="Lỗi theo loại linh kiện" />
          {data.errorByType.length === 0 ? (
            <div style={{ color: 'var(--text-faint)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Không có lỗi</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.errorByType.map(e => (
                <div key={e.field} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)' }}>{e.label}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, minWidth: 28, textAlign: 'right' }}>{e.count}</span>
                  <div style={{ width: 80 }}><Progress value={s.totalMachines > 0 ? (e.count / s.totalMachines) * 100 : 0} tone="var(--err)" height={6} /></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Floor stats */}
      {data.floorStats.length > 0 && (
        <Card pad={22}>
          <CardHead title="So sánh theo tầng" sub={`${data.floorStats.length} tầng`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.floorStats.map(f => (
              <div key={f.floor} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 64, fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{f.floor}</span>
                <div style={{ flex: 1 }}>
                  <Progress value={f.total > 0 ? (f.errors / f.total) * 100 : 0} tone={f.rate > 30 ? 'var(--err)' : f.rate > 10 ? 'var(--soft)' : 'var(--good)'} height={7} />
                </div>
                <span style={{ width: 120, textAlign: 'right', fontSize: 12.5, flexShrink: 0 }}>
                  {f.errors}/{f.total} máy lỗi ({f.rate}%)
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Maintenance logs table */}
      {data.maintenanceLogs.length > 0 && (
        <Card pad={22}>
          <CardHead title="Nhật ký bảo trì trong kỳ" sub={`${data.maintenanceLogs.length} lần bảo trì`} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Ngày', 'Phòng', 'Kỹ thuật viên', 'Lỗi PM (trước→sau)', 'Lỗi PC (trước→sau)', 'Ghi chú'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.maintenanceLogs.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{fmtDate(m.date)}</td>
                    <td style={{ padding: '8px 12px' }}><Badge tone="soft">{m.room}</Badge></td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{m.technicianName}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span style={{ color: 'var(--err-tx)' }}>{m.softwareErrorsBefore}</span>
                      <span style={{ color: 'var(--text-faint)', margin: '0 4px' }}>→</span>
                      <span style={{ color: m.softwareErrorsAfter === 0 ? 'var(--good-tx)' : 'var(--err-tx)' }}>{m.softwareErrorsAfter}</span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span style={{ color: 'var(--err-tx)' }}>{m.hardwareErrorsBefore}</span>
                      <span style={{ color: 'var(--text-faint)', margin: '0 4px' }}>→</span>
                      <span style={{ color: m.hardwareErrorsAfter === 0 ? 'var(--good-tx)' : 'var(--err-tx)' }}>{m.hardwareErrorsAfter}</span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Tab: Kho vật tư ───────────────────────────────────────────────────────────
function TabSupply({ data }: { data: SupplyReport }) {
  const s = data.summary
  return (
    <div className="stack">
      <div className="grid-4">
        {[
          { l: 'Loại vật tư',        v: s.totalTypes,                              tone: 'info' },
          { l: 'Loại sắp hết (< 30%)',v: s.lowCount,                              tone: 'err' },
          { l: 'Tồn kho tổng',       v: s.totalBalance.toLocaleString('vi-VN'),   tone: 'good' },
          { l: 'Nhập ròng trong kỳ', v: (s.periodNetTotal >= 0 ? '+' : '') + s.periodNetTotal, tone: s.periodNetTotal >= 0 ? 'soft' : 'err' },
        ].map(k => (
          <Card key={k.l} pad={20}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6 }}>{k.l}</div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{k.v}</div>
          </Card>
        ))}
      </div>

      <Card pad={22}>
        <CardHead title="Tồn kho vật tư" sub="Tổng nhập – Tổng xuất = Tồn kho hiện tại" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Loại vật tư', 'Tổng nhập', 'Tổng xuất', 'Tồn kho', '% còn lại', 'Nhập trong kỳ', 'Xuất trong kỳ', 'Ròng trong kỳ'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: h === 'Loại vật tư' ? 'left' : 'right', fontWeight: 600, fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.supplies.map(s => (
                <tr key={s.type} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{s.label}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{s.totalIntake}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{s.totalUsed}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: s.balance < 0 ? 'var(--err-tx)' : s.pct < 30 ? 'var(--soft-tx)' : 'var(--good-tx)' }}>{s.balance}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                      <div style={{ width: 60 }}><Progress value={s.pct} tone={s.pct < 30 ? 'var(--err)' : s.pct < 60 ? 'var(--soft)' : 'var(--good)'} height={6} /></div>
                      <span style={{ minWidth: 36, textAlign: 'right' }}>{s.pct}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: s.periodIntake > 0 ? 'var(--good-tx)' : 'var(--text-faint)' }}>{s.periodIntake}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{s.periodUsed}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: s.periodNet > 0 ? 'var(--good-tx)' : s.periodNet < 0 ? 'var(--err-tx)' : 'var(--text-faint)' }}>
                    {s.periodNet > 0 ? '+' : ''}{s.periodNet}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ── Tab: Linh kiện sử dụng ────────────────────────────────────────────────────
function TabPartsUsage({ data }: { data: PartsUsageReport }) {
  const [expandAll, setExpandAll] = useState(false)
  const s = data.summary
  return (
    <div className="stack">
      <div className="grid-2">
        <Card pad={22}>
          <CardHead title="Tổng hợp linh kiện đã xuất" sub={`${s.totalLogs} phiếu bảo trì trong kỳ`} />
          {s.byType.length === 0 ? (
            <div style={{ color: 'var(--text-faint)', fontSize: 13, textAlign: 'center', padding: 20 }}>Không có linh kiện nào được sử dụng trong kỳ</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {s.byType.map(b => (
                <div key={b.type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{b.label}</span>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{b.total} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-faint)' }}>cái</span></span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>Tổng cộng</span>
                <span>{s.grandTotal} cái</span>
              </div>
            </div>
          )}
        </Card>
        <Card pad={22}>
          <CardHead title="Phân bổ linh kiện" />
          {s.byType.length === 0 ? (
            <div style={{ color: 'var(--text-faint)', fontSize: 13, textAlign: 'center', padding: 20 }}>Không có dữ liệu</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {s.byType.map(b => (
                <div key={b.type} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)', minWidth: 120 }}>{b.label}</span>
                  <div style={{ flex: 2 }}><Progress value={s.grandTotal > 0 ? (b.total / s.grandTotal) * 100 : 0} tone="var(--primary)" height={7} /></div>
                  <span style={{ minWidth: 44, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{s.grandTotal > 0 ? Math.round(b.total / s.grandTotal * 100) : 0}%</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {data.rows.length > 0 && (
        <Card pad={22}>
          <CardHead title="Chi tiết phiếu bảo trì" sub={`${data.rows.length} phiếu có xuất linh kiện`} action={
            <Button variant="ghost" size="sm" onClick={() => setExpandAll(e => !e)}>{expandAll ? 'Thu gọn' : 'Xem tất cả'}</Button>
          } />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Ngày', 'Phòng', 'Kỹ thuật viên', ...SUPPLY_FIELDS.map(f => SUPPLY_LABELS[f] ?? f)].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(expandAll ? data.rows : data.rows.slice(0, 20)).map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{fmtDate(row.date)}</td>
                    <td style={{ padding: '7px 10px' }}><Badge tone="soft">{row.room}</Badge></td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-muted)' }}>{row.technicianName}</td>
                    {SUPPLY_FIELDS.map(f => (
                      <td key={f} style={{ padding: '7px 10px', textAlign: 'center', fontWeight: (row[f] ?? 0) > 0 ? 700 : 400, color: (row[f] ?? 0) > 0 ? 'var(--text)' : 'var(--text-faint)' }}>
                        {(row[f] ?? 0) > 0 ? row[f] : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!expandAll && data.rows.length > 20 && (
              <div style={{ textAlign: 'center', padding: 12 }}>
                <Button variant="ghost" size="sm" onClick={() => setExpandAll(true)}>Xem thêm {data.rows.length - 20} phiếu nữa</Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Tab: KPI Thu hồi ──────────────────────────────────────────────────────────
function TabRecallKpi({ data }: { data: RecallKpiReport }) {
  if (data.data.length === 0) {
    return (
      <Card pad={40} style={{ textAlign: 'center' }}>
        <Icon name="recall" size={44} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
        <div style={{ color: 'var(--text-faint)', fontSize: 14 }}>Không có dữ liệu thu hồi trong kỳ này</div>
      </Card>
    )
  }

  const totalRecalls  = data.data.reduce((s, d) => s + d.totalRecalls, 0)
  const totalCompleted = data.data.reduce((s, d) => s + d.totalRepairsCompleted, 0)
  const totalInProg   = data.data.reduce((s, d) => s + d.repairsInProgress, 0)

  return (
    <div className="stack">
      <div className="grid-3">
        {[
          { l: 'Tổng lần thu hồi', v: totalRecalls,  tone: 'info' },
          { l: 'Đã sửa xong',      v: totalCompleted, tone: 'good' },
          { l: 'Đang sửa',         v: totalInProg,    tone: 'soft' },
        ].map(k => (
          <Card key={k.l} pad={20}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6 }}>{k.l}</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{k.v}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {data.data.map(tech => (
          <Card key={tech.technicianId} pad={20}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{tech.technicianName}</div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3 }}>KTV #{tech.technicianId}</div>
              </div>

              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', flex: 1 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{tech.totalRecalls}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>lần thu hồi</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--good-tx)' }}>{tech.totalRepairsCompleted}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>đã xong</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--soft-tx)' }}>{tech.repairsInProgress}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>đang sửa</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{fmtMinutes(tech.avgRepairMinutes)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>TB thời gian sửa</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{fmtMinutes(tech.avgResponseMinutes)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>TB phản hồi</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {tech.recallsByType.RECALL_FOR_REPAIR > 0 && <Badge tone="err">Cần sửa: {tech.recallsByType.RECALL_FOR_REPAIR}</Badge>}
                {tech.recallsByType.RECALL_STILL_USABLE > 0 && <Badge tone="soft">Còn dùng: {tech.recallsByType.RECALL_STILL_USABLE}</Badge>}
                {tech.recallsByType.RETURN_AFTER_REPAIR > 0 && <Badge tone="good">Trả máy: {tech.recallsByType.RETURN_AFTER_REPAIR}</Badge>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Tab: Hôm nay ─────────────────────────────────────────────────────────────
function TabDaily({ data }: { data: DailyReport }) {
  const s = data.summary
  return (
    <div className="stack">
      {/* KPIs */}
      <div className="grid-4">
        {[
          { l: 'Tổng máy tính',    v: s.totalMachines,     tone: 'info' },
          { l: 'Đang hoạt động',   v: s.goodMachines,      tone: 'good' },
          { l: 'Đang có lỗi',      v: s.errorMachines,     tone: 'err'  },
          { l: 'Bảo trì hôm nay',  v: s.maintenanceToday,  tone: 'soft' },
        ].map(k => (
          <Card key={k.l} pad={20}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6 }}>{k.l}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.tone === 'err' && s.errorMachines > 0 ? 'var(--err-tx)' : k.tone === 'good' ? 'var(--good-tx)' : 'var(--text)' }}>{k.v}</div>
          </Card>
        ))}
      </div>

      {/* Danh sách máy lỗi */}
      {data.errorMachinesList.length > 0 ? (
        <Card pad={22}>
          <CardHead title="Máy đang có lỗi" sub={`${data.errorMachinesList.length} máy`} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Phòng', 'Tầng', 'Số máy', 'Loại lỗi', 'Ghi chú KTV'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.errorMachinesList.map((m, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px' }}><Badge tone="soft">{m.roomCode}</Badge></td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 12 }}>{m.floor}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>Máy {m.machineNo}{m.isTeacher ? ' (GV)' : ''}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {m.errorTypes.map(e => <Badge key={e} tone="err" style={{ fontSize: 11 }}>{e}</Badge>)}
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px', color: m.technicianNote ? 'var(--text-muted)' : 'var(--text-faint)', fontSize: 12.5, maxWidth: 200 }}>
                      {m.technicianNote ?? 'Chưa có ghi chú'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card pad={40} style={{ textAlign: 'center' }}>
          <Icon name="checkCircle" size={40} style={{ color: 'var(--good)', marginBottom: 12 }} />
          <div style={{ color: 'var(--good-tx)', fontSize: 14, fontWeight: 600 }}>Không có máy nào bị lỗi</div>
        </Card>
      )}

      {/* So sánh theo tầng */}
      {data.floorStats.length > 0 && (
        <Card pad={22}>
          <CardHead title="Tình trạng theo tầng" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.floorStats.map(f => (
              <div key={f.floor} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 64, fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{f.floor}</span>
                <div style={{ flex: 1 }}>
                  <Progress value={f.total > 0 ? (f.errors / f.total) * 100 : 0} tone={f.rate > 30 ? 'var(--err)' : f.rate > 10 ? 'var(--soft)' : 'var(--good)'} height={7} />
                </div>
                <span style={{ width: 130, textAlign: 'right', fontSize: 12.5, flexShrink: 0 }}>
                  {f.errors}/{f.total} máy lỗi ({f.rate}%)
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Bảo trì hôm nay */}
      {data.maintenanceLogs.length > 0 && (
        <Card pad={22}>
          <CardHead title="Bảo trì hôm nay" sub={`${data.maintenanceLogs.length} lần bảo trì`} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Ngày', 'Phòng', 'Kỹ thuật viên', 'Ghi chú'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.maintenanceLogs.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{fmtDate(m.date)}</td>
                    <td style={{ padding: '8px 12px' }}><Badge tone="soft">{m.room}</Badge></td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{m.technicianName}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [tab,      setTab]    = useState<TabKey>('machines')
  const [period,   setPeriod] = useState('month')
  const [from,     setFrom]   = useState('')
  const [to,       setTo]     = useState('')
  const [data,     setData]   = useState<ReportData | null>(null)
  const [loading,  setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [rooms,         setRooms]         = useState<Room[]>([])
  const [techs,         setTechs]         = useState<Technician[]>([])
  const [filterRooms,   setFilterRooms]   = useState<number[]>([])
  const [showRoomPicker, setShowRoomPicker] = useState(false)
  const [filterTech,    setFilterTech]    = useState('')
  const [tick,          setTick]          = useState(0)

  useEffect(() => {
    fetch('/api/rooms').then(r => r.ok ? r.json() : []).then(setRooms).catch(() => {})
    fetch('/api/technicians?active=true').then(r => r.ok ? r.json() : null).then(d => { if (d?.data) setTechs(d.data) }).catch(() => {})
  }, [])

  const buildParams = useCallback(() => {
    // "Hôm nay" → dùng type=daily, period=day
    const effectiveType   = period === 'today' ? 'daily' : tab
    const effectivePeriod = period === 'today' ? 'day'   : period
    const p = new URLSearchParams({ type: effectiveType, period: effectivePeriod })
    if (effectivePeriod === 'custom') {
      if (from) p.set('from', from)
      if (to)   p.set('to', to)
    }
    if (filterRooms.length > 0 && (tab === 'machines' || tab === 'parts-usage' || tab === 'daily' || period === 'today')) p.set('roomIds', filterRooms.join(','))
    if (filterTech && tab === 'recall-kpi') p.set('technicianId', filterTech)
    return p
  }, [tab, period, from, to, filterRooms, filterTech])

  // Close room picker on outside click
  useEffect(() => {
    if (!showRoomPicker) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-room-picker]')) setShowRoomPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showRoomPicker])

  // Auto-fetch on tab or period change
  useEffect(() => {
    if (period === 'custom' && (!from || !to)) return
    setData(null); setLoading(true)
    fetch(`/api/report?${buildParams()}`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(setData)
      .catch(() => toast.error('Không tải được dữ liệu báo cáo'))
      .finally(() => setLoading(false))
  }, [tab, period, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = () => setTick(t => t + 1)

  const handleExport = async () => {
    setExporting(true)
    try {
      const p = buildParams()
      const res = await fetch(`/api/report/export?${p}`)
      if (!res.ok) { toast.error('Xuất file thất bại'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const cd   = res.headers.get('Content-Disposition') ?? ''
      const m    = cd.match(/filename\*?=(?:UTF-8'')?([^;]+)/i)
      a.href = url
      a.download = m ? decodeURIComponent(m[1].trim().replace(/^"|"$/g, '')) : 'bao-cao.xlsx'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Đã tải file Excel')
    } finally { setExporting(false) }
  }

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'machines',    label: 'Máy lỗi',         icon: 'warning'  },
    { key: 'supply',      label: 'Kho vật tư',       icon: 'supplies' },
    { key: 'parts-usage', label: 'Linh kiện xuất',   icon: 'box'      },
    { key: 'recall-kpi',  label: 'KPI Thu hồi',      icon: 'recall'   },
    { key: 'daily',       label: 'Hôm nay',          icon: 'calendar' },
  ]

  const sel: React.CSSProperties = { height: 36, border: '1px solid var(--border-strong)', borderRadius: 9, padding: '0 10px', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }

  return (
    <div className="stack">
      {/* Tabs + controls */}
      <Card pad={18}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {TABS.map(t => (
            <button key={t.key}
              onClick={() => {
                setTab(t.key); setFilterRooms([]); setFilterTech(''); setShowRoomPicker(false)
                if (t.key === 'daily') setPeriod('today')
              }}
              className={`filter-chip ${(t.key === 'daily' ? period === 'today' : tab === t.key && period !== 'today') ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <PeriodSelector period={period} setPeriod={v => { setPeriod(v); if (v !== 'custom') setTick(t => t + 1) }} from={from} setFrom={setFrom} to={to} setTo={setTo} />

          {(tab === 'machines' || tab === 'parts-usage' || tab === 'daily' || period === 'today') && (
            <div style={{ position: 'relative' }} data-room-picker>
              <button
                onClick={() => setShowRoomPicker(p => !p)}
                style={{ ...sel, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, paddingRight: 28 }}>
                {filterRooms.length === 0 ? 'Tất cả phòng' : `${filterRooms.length} phòng đã chọn`}
                <span style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 11 }}>▼</span>
              </button>
              {showRoomPicker && (
                <div style={{ position: 'absolute', top: 40, left: 0, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,.15)', minWidth: 180, maxHeight: 280, overflowY: 'auto', padding: '6px 0' }}>
                  <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => setFilterRooms([])} style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      Bỏ chọn tất cả
                    </button>
                  </div>
                  {rooms.map(r => (
                    <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={filterRooms.includes(r.id)}
                        onChange={e => setFilterRooms(prev => e.target.checked ? [...prev, r.id] : prev.filter(id => id !== r.id))}
                        style={{ accentColor: 'var(--primary)', width: 14, height: 14 }}
                      />
                      {r.roomCode}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'recall-kpi' && (
            <select value={filterTech} onChange={e => setFilterTech(e.target.value)} style={sel}>
              <option value="">Tất cả KTV</option>
              {techs.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
            </select>
          )}

          <Button onClick={handleApply} icon="refresh" size="sm" variant="ghost">Áp dụng</Button>

          <div style={{ marginLeft: 'auto' }}>
            <Button onClick={handleExport} disabled={exporting || !data} icon={exporting ? 'refresh' : 'download'} variant="ghost">
              {exporting ? 'Đang xuất...' : 'Xuất Excel'}
            </Button>
          </div>
        </div>

        {data && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-faint)' }}>
            Kỳ báo cáo: {fmtDate(data.period.from)} — {fmtDate(data.period.to)}
            {' · '}Tạo lúc {new Date(data.generatedAt).toLocaleTimeString('vi-VN')}
          </div>
        )}
      </Card>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-faint)', fontSize: 14 }}>
          <Icon name="refresh" size={28} style={{ marginBottom: 12, opacity: 0.5 }} />
          <div>Đang tải dữ liệu báo cáo...</div>
        </div>
      ) : !data ? (
        period === 'custom' && (!from || !to) ? (
          <Card pad={40} style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--text-faint)', fontSize: 14 }}>Chọn khoảng thời gian rồi nhấn "Áp dụng"</div>
          </Card>
        ) : null
      ) : (
        <>
          {data.type === 'machines'    && <TabMachines data={data} />}
          {data.type === 'supply'      && <TabSupply data={data} />}
          {data.type === 'parts-usage' && <TabPartsUsage data={data} />}
          {data.type === 'recall-kpi'  && <TabRecallKpi data={data} />}
          {data.type === 'daily'       && <TabDaily data={data} />}
        </>
      )}
    </div>
  )
}
