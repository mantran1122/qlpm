'use client'
import { useState } from 'react'
import { useFetch } from '@/lib/use-fetch'
import { Card, CardHead, Badge, Button, Select, Dialog, StatTile } from '@/components/app/primitives'
import { Icon } from '@/components/app/icons'
import { BarChart, DonutChart, Sparkline, Progress } from '@/components/app/charts'

// ─── Existing interfaces ───────────────────────────────────────────────────────
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

// ─── Device issues interfaces ──────────────────────────────────────────────────
interface MachineIssueDetail {
  machineId: number
  machineNo: number
  isTeacher: boolean
  monitorError: string | null
  hdmiError: string | null
  mouseError: string | null
  keyboardError: string | null
  computerError: string | null
  networkError: string | null
  otherError: string | null
  extraNotes: string | null
  updatedAt: string
}

interface RoomIssues {
  roomId: number
  roomName: string
  roomCode: string
  floorName: string
  totalMachines: number
  totalIssues: number
  monitorIssues: number
  hdmiIssues: number
  mouseIssues: number
  keyboardIssues: number
  computerIssues: number
  networkIssues: number
  otherIssues: number
  status: 'normal' | 'warning' | 'serious'
  machines: MachineIssueDetail[]
}

interface DeviceIssuesData {
  summary: {
    totalRoomsWithIssues: number
    totalIssues: number
    monitorIssues: number
    hdmiIssues: number
    mouseIssues: number
    keyboardIssues: number
    computerIssues: number
    networkIssues: number
    otherIssues: number
  }
  rooms: RoomIssues[]
}

// ─── Helper components ─────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: 'normal' | 'warning' | 'serious' }) {
  if (status === 'serious') return <Badge tone="err" dot>Nghiêm trọng</Badge>
  if (status === 'warning') return <Badge tone="soft" dot>Cần kiểm tra</Badge>
  return <Badge tone="good" dot>Bình thường</Badge>
}

function IssueChip({ label, desc, color }: { label: string; desc: string; color: string }) {
  return (
    <div style={{
      fontSize: 13, padding: '5px 11px', borderRadius: 8, maxWidth: '100%',
      background: 'var(--surface)', border: '1px solid var(--border)',
      display: 'flex', gap: 6, alignItems: 'flex-start',
    }}>
      <span style={{ fontWeight: 700, color, fontSize: 12, flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{ color: 'var(--text-muted)', wordBreak: 'break-word' }}>{desc}</span>
    </div>
  )
}

const DEVICE_BAR_KEYS = [
  { k: 'monitor',  color: 'var(--err)',     label: 'Màn hình' },
  { k: 'computer', color: 'var(--primary)', label: 'Máy tính' },
  { k: 'mouse',    color: 'var(--both)',    label: 'Chuột' },
  { k: 'keyboard', color: 'var(--teacher)', label: 'Bàn phím' },
]

const TYPE_KEY_MAP: Record<string, keyof RoomIssues> = {
  monitor:  'monitorIssues',
  hdmi:     'hdmiIssues',
  mouse:    'mouseIssues',
  keyboard: 'keyboardIssues',
  computer: 'computerIssues',
  network:  'networkIssues',
  other:    'otherIssues',
}

const ROOM_OPTIONS_BASE = [{ value: 'all', label: 'Tất cả phòng' }]
const TYPE_OPTIONS = [
  { value: 'all',      label: 'Tất cả thiết bị' },
  { value: 'monitor',  label: 'Màn hình' },
  { value: 'hdmi',     label: 'Dây HDMI' },
  { value: 'mouse',    label: 'Chuột' },
  { value: 'keyboard', label: 'Bàn phím' },
  { value: 'computer', label: 'Máy tính/CPU' },
  { value: 'network',  label: 'Thiết bị mạng' },
  { value: 'other',    label: 'Lỗi khác' },
]
const SEVERITY_OPTIONS = [
  { value: 'all',     label: 'Tất cả mức độ' },
  { value: 'serious', label: 'Nghiêm trọng' },
  { value: 'warning', label: 'Cần kiểm tra' },
  { value: 'normal',  label: 'Bình thường' },
]

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function StatsPage() {
  const { data: summary, loading, error, refetch } = useFetch<SummaryData>('/api/statistics/summary')
  const { data: di, loading: diLoading, refetch: diRefetch } = useFetch<DeviceIssuesData>('/api/stats/device-issues')

  const [filterRoom, setFilterRoom]       = useState('all')
  const [filterType, setFilterType]       = useState('all')
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [selectedRoom, setSelectedRoom]   = useState<RoomIssues | null>(null)
  const [sortDir, setSortDir]             = useState<'desc' | 'asc'>('desc')

  // ── Loading / error states for main summary ────────────────────────────────
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

  // ── Existing chart data ────────────────────────────────────────────────────
  const barKeys = [
    { k: 'sw', color: 'var(--soft)', label: 'Phần mềm' },
    { k: 'hw', color: 'var(--err)',  label: 'Phần cứng' },
  ]
  const errorSplit = [
    { label: 'Lỗi phần mềm',  value: summary.swMachines, color: 'var(--soft)' },
    { label: 'Lỗi phần cứng', value: summary.hwMachines, color: 'var(--err)' },
  ]
  const totalErr = summary.swMachines + summary.hwMachines
  const uptimeTrend = summary.weeklyErrors.map(w =>
    summary.totalMachines > 0
      ? Math.round((1 - (w.softwareErrors + w.hardwareErrors) / summary.totalMachines) * 1000) / 10
      : summary.goodRate
  )
  const uptimeDisplay = uptimeTrend.every(v => v === 100) ? Array(7).fill(summary.goodRate) : uptimeTrend
  const byRoom  = summary.errorsByFloor.slice().sort((a, b) => b.errorCount - a.errorCount)
  const maxErr  = Math.max(...byRoom.map(r => r.errorCount), 1)

  // ── Device issues: filters & derived data ──────────────────────────────────
  const roomOptions = [
    ...ROOM_OPTIONS_BASE,
    ...(di?.rooms ?? []).map(r => ({ value: r.roomCode, label: r.roomName })),
  ]

  let filteredRooms: RoomIssues[] = di?.rooms ?? []
  if (filterRoom !== 'all')     filteredRooms = filteredRooms.filter(r => r.roomCode === filterRoom)
  if (filterSeverity !== 'all') filteredRooms = filteredRooms.filter(r => r.status === filterSeverity)
  if (filterType !== 'all') {
    const k = TYPE_KEY_MAP[filterType]
    if (k) filteredRooms = filteredRooms.filter(r => (r[k] as number) > 0)
  }
  filteredRooms = [...filteredRooms].sort((a, b) =>
    sortDir === 'desc' ? b.totalIssues - a.totalIssues : a.totalIssues - b.totalIssues
  )

  const barData = filteredRooms
    .filter(r => r.totalIssues > 0)
    .slice(0, 8)
    .map(r => ({
      floor:    r.roomCode,
      monitor:  r.monitorIssues,
      computer: r.computerIssues,
      mouse:    r.mouseIssues,
      keyboard: r.keyboardIssues,
    }))

  const totalAllIssues = di?.summary.totalIssues ?? 0
  const donutData = di ? [
    { label: 'Màn hình',     value: di.summary.monitorIssues,                           color: 'var(--err)' },
    { label: 'Dây HDMI',    value: di.summary.hdmiIssues,                               color: 'var(--soft)' },
    { label: 'Chuột',       value: di.summary.mouseIssues,                              color: 'var(--both)' },
    { label: 'Bàn phím',    value: di.summary.keyboardIssues,                           color: 'var(--teacher)' },
    { label: 'Máy tính',    value: di.summary.computerIssues,                           color: 'var(--primary)' },
    { label: 'Mạng & khác', value: di.summary.networkIssues + di.summary.otherIssues,   color: 'var(--text-faint)' },
  ].filter(d => d.value > 0) : []

  const hasActiveFilter = filterRoom !== 'all' || filterType !== 'all' || filterSeverity !== 'all'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="stack">

      {/* ══════════════ Existing sections ══════════════ */}
      <div className="grid-chart">
        <Card pad={22}>
          <CardHead title="Xu hướng tỉ lệ hoạt động" sub="7 ngày gần nhất (%)" action={<Badge tone="good" icon="trend">{summary.goodRate}%</Badge>} />
          <Sparkline values={uptimeDisplay} height={180} color="var(--primary)" />
        </Card>
        <Card pad={22}>
          <CardHead title="Phân loại lỗi" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <DonutChart
              data={errorSplit}
              center={
                <div>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{totalErr}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>lỗi</div>
                </div>
              }
            />
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {errorSplit.map(d => (
                <div key={d.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 4, background: d.color }} />{d.label}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    {d.value}{' '}
                    <span style={{ color: 'var(--text-faint)', fontWeight: 500, fontSize: 12 }}>
                      ({totalErr > 0 ? Math.round(d.value / totalErr * 100) : 0}%)
                    </span>
                  </span>
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
              {barKeys.map(k => (
                <span key={k.k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: k.color }} />{k.label}
                </span>
              ))}
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
                  <Progress
                    value={maxErr > 0 ? (r.errorCount / maxErr) * 100 : 0}
                    tone={r.errorCount > 5 ? 'var(--err)' : r.errorCount > 0 ? 'var(--both)' : 'var(--good)'}
                    height={8}
                  />
                </div>
                <span style={{ fontWeight: 700, fontSize: 13.5, width: 64, textAlign: 'right', color: r.errorCount > 5 ? 'var(--err-tx)' : 'var(--text)', flexShrink: 0 }}>
                  {r.errorCount} lỗi
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ══════════════ Device Issues Section ══════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 8, borderTop: '1.5px solid var(--border)' }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--err-bg)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="wrench" size={19} style={{ color: 'var(--err)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Thống kê lỗi thiết bị theo phòng</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-faint)' }}>
            Phân tích chi tiết tình trạng hỏng hóc phần cứng theo từng phòng máy
          </p>
        </div>
        {diLoading && (
          <Icon name="refresh" size={17} style={{ flexShrink: 0, opacity: 0.45, animation: 'spin 1s linear infinite' }} />
        )}
      </div>

      {/* Error state for device issues */}
      {!di && !diLoading && (
        <Card pad={32}>
          <div style={{ textAlign: 'center' }}>
            <Icon name="alert" size={28} style={{ color: 'var(--err)', display: 'block', margin: '0 auto 10px' }} />
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 14 }}>
              Không tải được dữ liệu lỗi thiết bị.
            </div>
            <Button variant="outline" size="sm" icon="refresh" onClick={() => diRefetch()}>Thử lại</Button>
          </div>
        </Card>
      )}

      {/* Device issues content */}
      {di && (
        <>
          {/* ── Summary stat tiles ── */}
          <div className="grid-kpi">
            <Card pad={18} accent="var(--err)">
              <StatTile icon="rooms"   label="Phòng có thiết bị lỗi"  value={di.summary.totalRoomsWithIssues} tone="err" />
            </Card>
            <Card pad={18} accent="var(--err)">
              <StatTile icon="alert"   label="Tổng lỗi phần cứng"     value={di.summary.totalIssues}         tone="err" />
            </Card>
            <Card pad={18} accent="var(--err)">
              <StatTile icon="monitor" label="Màn hình hư"             value={di.summary.monitorIssues}       tone="err" />
            </Card>
            <Card pad={18} accent="var(--soft)">
              <StatTile icon="cable"   label="Dây HDMI hư"             value={di.summary.hdmiIssues}          tone="soft" />
            </Card>
            <Card pad={18} accent="var(--soft)">
              <StatTile icon="mouse"   label="Chuột hư"                value={di.summary.mouseIssues}         tone="soft" />
            </Card>
            <Card pad={18} accent="var(--soft)">
              <StatTile icon="keyboard" label="Bàn phím hư"            value={di.summary.keyboardIssues}      tone="soft" />
            </Card>
            <Card pad={18} accent="var(--err)">
              <StatTile icon="cpu"     label="Máy tính/CPU lỗi"        value={di.summary.computerIssues}      tone="err" />
            </Card>
            <Card pad={18} accent="var(--both)">
              <StatTile icon="network" label="Lỗi khác"                value={di.summary.networkIssues + di.summary.otherIssues} tone="both" />
            </Card>
          </div>

          {/* Empty state when no issues */}
          {totalAllIssues === 0 ? (
            <Card pad={44}>
              <div style={{ textAlign: 'center' }}>
                <Icon name="checkCircle" size={46} style={{ color: 'var(--good)', display: 'block', margin: '0 auto 14px' }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--good-tx)', marginBottom: 6 }}>
                  Không có lỗi thiết bị
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--text-faint)' }}>
                  Chưa có lỗi thiết bị nào được ghi nhận trong hệ thống.
                </div>
              </div>
            </Card>
          ) : (
            <>
              {/* ── Charts ── */}
              <div className="grid-2">
                <Card pad={22}>
                  <CardHead
                    title="Lỗi thiết bị theo phòng"
                    sub="Top 8 phòng nhiều lỗi nhất"
                    action={
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {DEVICE_BAR_KEYS.map(k => (
                          <span key={k.k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
                            <span style={{ width: 9, height: 9, borderRadius: 3, background: k.color }} />{k.label}
                          </span>
                        ))}
                      </div>
                    }
                  />
                  {barData.length > 0
                    ? <BarChart data={barData} keys={DEVICE_BAR_KEYS} height={240} />
                    : (
                      <div style={{ height: 240, display: 'grid', placeItems: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                        Không có phòng nào phù hợp với bộ lọc
                      </div>
                    )
                  }
                </Card>

                <Card pad={22}>
                  <CardHead title="Tỷ lệ loại thiết bị hư" sub="Phân bố theo loại thiết bị" />
                  {donutData.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                      <DonutChart
                        data={donutData}
                        center={
                          <div>
                            <div style={{ fontSize: 26, fontWeight: 800 }}>{totalAllIssues}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>lỗi HW</div>
                          </div>
                        }
                      />
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {donutData.map(d => (
                          <div key={d.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                              <span style={{ width: 10, height: 10, borderRadius: 4, background: d.color }} />{d.label}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>
                              {d.value}{' '}
                              <span style={{ color: 'var(--text-faint)', fontWeight: 500, fontSize: 12 }}>
                                ({totalAllIssues > 0 ? Math.round(d.value / totalAllIssues * 100) : 0}%)
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ height: 200, display: 'grid', placeItems: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                      Không có dữ liệu
                    </div>
                  )}
                </Card>
              </div>

              {/* ── Filter + Table ── */}
              <Card pad={22}>
                <CardHead
                  title="Chi tiết lỗi theo phòng"
                  sub={`${filteredRooms.length} phòng`}
                />

                {/* Filters */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
                  <Select value={filterRoom}     onChange={setFilterRoom}     options={roomOptions}     style={{ minWidth: 170 }} />
                  <Select value={filterType}     onChange={setFilterType}     options={TYPE_OPTIONS}    style={{ minWidth: 160 }} />
                  <Select value={filterSeverity} onChange={setFilterSeverity} options={SEVERITY_OPTIONS} style={{ minWidth: 160 }} />
                  {hasActiveFilter && (
                    <Button
                      variant="ghost" size="sm" icon="x"
                      onClick={() => { setFilterRoom('all'); setFilterType('all'); setFilterSeverity('all') }}
                    >
                      Xóa bộ lọc
                    </Button>
                  )}
                </div>

                {filteredRooms.length === 0 ? (
                  <div style={{ padding: '40px 0', textAlign: 'center' }}>
                    <Icon name="search" size={30} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 12px' }} />
                    <div style={{ fontSize: 13.5, color: 'var(--text-faint)' }}>
                      Không tìm thấy phòng nào phù hợp với bộ lọc.
                    </div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Phòng</th>
                          <th>Tầng</th>
                          <th>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <Icon name="monitor" size={13} style={{ color: 'var(--err)' }} />Màn hình
                            </span>
                          </th>
                          <th>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <Icon name="cable" size={13} style={{ color: 'var(--soft)' }} />HDMI
                            </span>
                          </th>
                          <th>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <Icon name="mouse" size={13} style={{ color: 'var(--both)' }} />Chuột
                            </span>
                          </th>
                          <th>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <Icon name="keyboard" size={13} style={{ color: 'var(--teacher)' }} />Bàn phím
                            </span>
                          </th>
                          <th>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <Icon name="cpu" size={13} style={{ color: 'var(--primary)' }} />Máy tính
                            </span>
                          </th>
                          <th>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <Icon name="network" size={13} style={{ color: 'var(--both)' }} />Lỗi khác
                            </span>
                          </th>
                          <th
                            style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                          >
                            Tổng lỗi {sortDir === 'desc' ? '↓' : '↑'}
                          </th>
                          <th>Trạng thái</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRooms.map(r => (
                          <tr key={r.roomId} className="trow">
                            <td><strong>{r.roomName}</strong></td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>{r.floorName}</td>
                            <td>{r.monitorIssues  > 0 ? <Badge tone="err">{r.monitorIssues}</Badge>  : <span style={{ color: 'var(--border-strong)' }}>—</span>}</td>
                            <td>{r.hdmiIssues     > 0 ? <Badge tone="soft">{r.hdmiIssues}</Badge>    : <span style={{ color: 'var(--border-strong)' }}>—</span>}</td>
                            <td>{r.mouseIssues    > 0 ? <Badge tone="soft">{r.mouseIssues}</Badge>   : <span style={{ color: 'var(--border-strong)' }}>—</span>}</td>
                            <td>{r.keyboardIssues > 0 ? <Badge tone="soft">{r.keyboardIssues}</Badge>: <span style={{ color: 'var(--border-strong)' }}>—</span>}</td>
                            <td>{r.computerIssues > 0 ? <Badge tone="err">{r.computerIssues}</Badge> : <span style={{ color: 'var(--border-strong)' }}>—</span>}</td>
                            <td>
                              {(r.networkIssues + r.otherIssues) > 0
                                ? <Badge tone="both">{r.networkIssues + r.otherIssues}</Badge>
                                : <span style={{ color: 'var(--border-strong)' }}>—</span>
                              }
                            </td>
                            <td>
                              <strong style={{
                                fontSize: 15,
                                color: r.totalIssues > 3 ? 'var(--err-tx)' : r.totalIssues > 0 ? 'var(--soft-tx)' : 'var(--text-faint)',
                              }}>
                                {r.totalIssues}
                              </strong>
                            </td>
                            <td><StatusBadge status={r.status} /></td>
                            <td>
                              {r.machines.length > 0 && (
                                <Button variant="soft" size="sm" icon="arrowR" onClick={() => setSelectedRoom(r)}>
                                  Chi tiết
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}

      {/* ══════════════ Room detail modal ══════════════ */}
      <Dialog open={selectedRoom !== null} onClose={() => setSelectedRoom(null)} width={720}>
        {selectedRoom && (
          <div style={{ padding: 28 }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>{selectedRoom.roomName}</h3>
                <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--text-faint)' }}>
                  {selectedRoom.floorName} · {selectedRoom.totalMachines} máy · {selectedRoom.totalIssues} lỗi thiết bị
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <StatusBadge status={selectedRoom.status} />
                <button
                  onClick={() => setSelectedRoom(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4, display: 'grid', placeItems: 'center', borderRadius: 8 }}
                >
                  <Icon name="x" size={20} />
                </button>
              </div>
            </div>

            {/* Issue type mini-summary */}
            {(() => {
              const chips = [
                { label: 'Màn hình', count: selectedRoom.monitorIssues,   icon: 'monitor',  color: 'var(--err)' },
                { label: 'HDMI',     count: selectedRoom.hdmiIssues,      icon: 'cable',    color: 'var(--soft)' },
                { label: 'Chuột',    count: selectedRoom.mouseIssues,     icon: 'mouse',    color: 'var(--both)' },
                { label: 'Bàn phím', count: selectedRoom.keyboardIssues,  icon: 'keyboard', color: 'var(--teacher)' },
                { label: 'Máy tính', count: selectedRoom.computerIssues,  icon: 'cpu',      color: 'var(--primary)' },
                { label: 'Mạng',     count: selectedRoom.networkIssues,   icon: 'network',  color: 'var(--text-muted)' },
              ].filter(c => c.count > 0)

              if (chips.length === 0) return null
              return (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20,
                  padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 12,
                }}>
                  {chips.map(c => (
                    <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 110 }}>
                      <Icon name={c.icon} size={14} style={{ color: c.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{c.label}</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 14, color: c.color }}>{c.count}</span>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Machine list */}
            {selectedRoom.machines.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                Không có lỗi nào được ghi nhận
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '52vh', overflowY: 'auto' }}>
                {selectedRoom.machines.map(m => (
                  <div key={m.machineId} style={{
                    padding: 16, borderRadius: 12,
                    border: '1px solid var(--border)', background: 'var(--surface)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <Badge tone={m.isTeacher ? 'teacher' : 'info'}>
                        {m.isTeacher ? 'Giáo viên' : `Máy ${m.machineNo}`}
                      </Badge>
                      <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 'auto' }}>
                        Cập nhật:{' '}
                        {new Date(m.updatedAt).toLocaleDateString('vi-VN', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                        })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {m.monitorError  && <IssueChip label="Màn hình"  desc={m.monitorError}  color="var(--err)" />}
                      {m.hdmiError     && <IssueChip label="Dây HDMI"  desc={m.hdmiError}     color="var(--soft)" />}
                      {m.mouseError    && <IssueChip label="Chuột"     desc={m.mouseError}    color="var(--both)" />}
                      {m.keyboardError && <IssueChip label="Bàn phím"  desc={m.keyboardError} color="var(--teacher)" />}
                      {m.computerError && <IssueChip label="Máy tính"  desc={m.computerError} color="var(--primary)" />}
                      {m.networkError  && <IssueChip label="Mạng"      desc={m.networkError}  color="var(--text-muted)" />}
                      {m.otherError    && <IssueChip label="Lỗi khác"  desc={m.otherError}    color="var(--text-faint)" />}
                    </div>
                    {m.extraNotes && (
                      <div style={{
                        marginTop: 10, fontSize: 12.5, color: 'var(--text-muted)',
                        paddingTop: 10, borderTop: '1px solid var(--border)',
                      }}>
                        <strong>Ghi chú:</strong> {m.extraNotes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  )
}
