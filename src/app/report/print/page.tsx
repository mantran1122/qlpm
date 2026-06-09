'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ReportData {
  generatedAt: string
  summary: {
    totalMachines: number; totalErrors: number; swMachines: number; hwMachines: number
    goodRate: number; errorRate: number; maintenanceThisMonth: number; totalRooms: number
  }
  rooms: {
    roomCode: string; floor: string; totalMachines: number; goodCount: number
    swCount: number; hwCount: number; bothCount: number; errorCount: number; errorRate: number
    cpuSpec: string | null; ramSpec: string | null; diskSpec: string | null; monitorSpec: string | null
  }[]
  floorStats: { floor: string; total: number; errors: number; sw: number; hw: number; rate: number }[]
  errorByType: { field: string; label: string; count: number }[]
  maintenanceLogs: {
    id: number; date: string; room: string; technicianName: string
    softwareErrorsBefore: number; hardwareErrorsBefore: number
    softwareErrorsAfter: number; hardwareErrorsAfter: number; notes: string
  }[]
  supplies: { type: string; label: string; intake: number; used: number; balance: number; pct: number }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
function nowFmt() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
function monthName() {
  const d = new Date()
  return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`
}
function supplyStatus(pct: number) {
  if (pct > 30) return { label: 'Đủ dùng',    color: '#2F9E44', bg: '#EBFBEE' }
  if (pct >= 10) return { label: 'Sắp hết',   color: '#E67700', bg: '#FFF3BF' }
  return              { label: 'Cần nhập thêm', color: '#E03131', bg: '#FFF5F5' }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function PageHeader({ title }: { title: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingBottom:10, borderBottom:'2px solid #1971C2', marginBottom:24 }}>
      <span style={{ fontSize:11, color:'#868E96', fontWeight:500 }}>TRƯỜNG ĐẠI HỌC NAM CẦN THƠ — TRUNG TÂM ADPS</span>
      <span style={{ fontSize:11, color:'#868E96' }}>{title}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize:42, fontWeight:800, color:'#1971C2', margin:'0 0 20px 0', lineHeight:1.1,
      borderLeft:'7px solid #1971C2', paddingLeft:18, letterSpacing:'-0.02em' }}>
      {children}
    </h2>
  )
}

function KpiBox({ label, value, sub, color, bg }: { label: string; value: string; sub?: string; color: string; bg: string }) {
  return (
    <div style={{ flex:'1 1 0', padding:'16px 18px', borderRadius:12, background:bg, border:`1.5px solid ${color}22` }}>
      <div style={{ fontSize:32, fontWeight:800, color, lineHeight:1, letterSpacing:'-0.03em' }}>{value}</div>
      <div style={{ fontSize:12.5, fontWeight:600, color:'#495057', marginTop:6 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:'#868E96', marginTop:3 }}>{sub}</div>}
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th style={{ padding:'8px 10px', background:'#E7F5FF', color:'#1971C2', fontWeight:700, fontSize:11, textAlign: right ? 'right' : 'left', borderBottom:'2px solid #1971C2', whiteSpace:'nowrap' }}>{children}</th>
}
function Td({ children, right, bold, color }: { children: React.ReactNode; right?: boolean; bold?: boolean; color?: string }) {
  return <td style={{ padding:'7px 10px', fontSize:11, textAlign: right ? 'right' : 'left', fontWeight: bold ? 700 : 400, color: color ?? '#212529', borderBottom:'1px solid #E9ECEF' }}>{children}</td>
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1, height:8, borderRadius:4, background:'#E9ECEF', overflow:'hidden' }}>
        <div style={{ width:`${Math.min(pct,100)}%`, height:'100%', background:color, borderRadius:4 }} />
      </div>
      <span style={{ fontSize:10, fontWeight:600, color, width:38, textAlign:'right' }}>{pct}%</span>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
function ReportContent() {
  const searchParams = useSearchParams()
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/report')
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d: ReportData) => {
        setData(d)
        if (searchParams.get('print') === '1') {
          setTimeout(() => window.print(), 800)
        }
      })
      .catch((e: unknown) => setError(String(e)))
  }, [searchParams])

  if (error) return <div style={{ padding:60, textAlign:'center', color:'#E03131', fontFamily:'sans-serif' }}>Lỗi tải dữ liệu: {error}</div>
  if (!data) return <div style={{ padding:60, textAlign:'center', color:'#868E96', fontFamily:'sans-serif', fontSize:16 }}>Đang tạo báo cáo...</div>

  const { summary, rooms, floorStats, errorByType, maintenanceLogs, supplies } = data
  const totalErrTypes = summary.swMachines + summary.hwMachines
  const maxFloorErr = Math.max(...floorStats.map(f => f.errors), 1)

  return (
    <>
      {/* ── Print/Screen CSS ── */}
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; background: #F0F2F5; }
        table { border-collapse: collapse; width: 100%; }
        .no-print { display: flex; }

        @media print {
          @page { size: A4 portrait; margin: 14mm 16mm; }
          body { background: white; }
          .no-print { display: none !important; }
          .page-break { page-break-after: always; break-after: page; }
          .avoid-break { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      {/* ── Print button (screen only) ── */}
      <div className="no-print" style={{ position:'fixed', top:20, right:20, zIndex:9999, gap:10 }}>
        <button onClick={() => window.print()}
          style={{ padding:'10px 22px', background:'#1971C2', color:'#fff', border:'none', borderRadius:10, fontWeight:700, fontSize:14, cursor:'pointer', boxShadow:'0 2px 8px #1971C240' }}>
          🖨 In / Xuất PDF
        </button>
        <button onClick={() => window.close()}
          style={{ padding:'10px 18px', background:'#F1F3F5', color:'#495057', border:'1px solid #DEE2E6', borderRadius:10, fontWeight:600, fontSize:14, cursor:'pointer' }}>
          Đóng
        </button>
      </div>

      {/* ── Report Wrapper ── */}
      <div style={{ maxWidth:900, margin:'0 auto', background:'white', padding:'0 0 40px' }}>

        {/* ══════════════════════════════════════════════════════════
            TRANG BÌA
        ══════════════════════════════════════════════════════════ */}
        <div className="page-break">
          {/* Blue header */}
          <div style={{ background:'linear-gradient(135deg,#1864AB 0%,#1971C2 60%,#339AF0 100%)', padding:'40px 48px 36px', color:'white' }}>
            <div style={{ fontSize:13, fontWeight:600, opacity:0.85, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:6 }}>
              Trường Đại học Nam Cần Thơ
            </div>
            <div style={{ fontSize:12, opacity:0.7, marginBottom:40 }}>Trung tâm Ứng dụng và Phát triển Phần mềm</div>
            <div style={{ fontSize:14, fontWeight:500, opacity:0.75, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:8 }}>Báo cáo tổng hợp</div>
            <div style={{ fontSize:52, fontWeight:900, lineHeight:1.05, letterSpacing:'-0.025em', marginBottom:6 }}>Phòng Máy Tính</div>
            <div style={{ fontSize:16, opacity:0.75, marginTop:8 }}>Hệ thống Quản lý Phòng Máy — v1.0</div>
          </div>

          {/* Meta info */}
          <div style={{ padding:'22px 48px 28px', background:'#F8F9FA', borderBottom:'1px solid #E9ECEF', display:'flex', gap:40, flexWrap:'wrap' }}>
            {[
              { label: 'Ngày xuất báo cáo', value: nowFmt() },
              { label: 'Kỳ báo cáo',        value: monthName() },
              { label: 'Số phòng máy',       value: `${summary.totalRooms} phòng` },
              { label: 'Tổng số máy tính',   value: `${summary.totalMachines.toLocaleString('vi-VN')} máy` },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize:11, color:'#868E96', fontWeight:500, marginBottom:3 }}>{item.label}</div>
                <div style={{ fontSize:15, fontWeight:700, color:'#212529' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* KPI Grid */}
          <div style={{ padding:'28px 48px' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#495057', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.05em' }}>Chỉ số tổng quan</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
              <KpiBox label="Tổng số máy tính"      value={summary.totalMachines.toLocaleString('vi-VN')} sub={`${summary.totalRooms} phòng`}     color="#1971C2" bg="#E7F5FF" />
              <KpiBox label="Tỉ lệ hoạt động tốt"  value={`${summary.goodRate}%`}                        sub="Tháng này"                           color="#2F9E44" bg="#EBFBEE" />
              <KpiBox label="Máy đang có lỗi"       value={String(summary.totalErrors)}                  sub={`${summary.errorRate}% tỉ lệ lỗi`}  color="#E03131" bg="#FFF5F5" />
              <KpiBox label="Bảo trì tháng này"     value={String(summary.maintenanceThisMonth)}          sub="Lượt xử lý"                          color="#7048E8" bg="#F3F0FF" />
            </div>

            {/* SW vs HW summary */}
            <div style={{ marginTop:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div style={{ padding:'14px 18px', borderRadius:10, background:'#FFF9DB', border:'1px solid #FFC94A44' }}>
                <div style={{ fontSize:11, color:'#E67700', fontWeight:600, marginBottom:6 }}>LỖI PHẦN MỀM</div>
                <div style={{ fontSize:28, fontWeight:800, color:'#E67700', lineHeight:1 }}>{summary.swMachines}</div>
                <div style={{ fontSize:11, color:'#868E96', marginTop:4 }}>
                  máy — {totalErrTypes > 0 ? Math.round(summary.swMachines / totalErrTypes * 100) : 0}% tổng lỗi
                </div>
              </div>
              <div style={{ padding:'14px 18px', borderRadius:10, background:'#FFF5F5', border:'1px solid #FF6B6B44' }}>
                <div style={{ fontSize:11, color:'#E03131', fontWeight:600, marginBottom:6 }}>LỖI PHẦN CỨNG</div>
                <div style={{ fontSize:28, fontWeight:800, color:'#E03131', lineHeight:1 }}>{summary.hwMachines}</div>
                <div style={{ fontSize:11, color:'#868E96', marginTop:4 }}>
                  máy — {totalErrTypes > 0 ? Math.round(summary.hwMachines / totalErrTypes * 100) : 0}% tổng lỗi
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            PHẦN 1 — TỔNG QUAN
        ══════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:'36px 48px' }}>
          <PageHeader title="Phần 1 — Tổng quan" />
          <SectionTitle>Tổng Quan</SectionTitle>

          {/* Floor stats table */}
          <div className="avoid-break" style={{ marginBottom:32 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#495057', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.05em' }}>
              Phân bố lỗi theo tầng / khu
            </div>
            <table>
              <thead>
                <tr>
                  <Th>Tầng / Khu</Th>
                  <Th right>Tổng máy</Th>
                  <Th right>Lỗi PM</Th>
                  <Th right>Lỗi PC</Th>
                  <Th right>Tổng lỗi</Th>
                  <Th right>Tỉ lệ</Th>
                  <Th>Biểu đồ</Th>
                </tr>
              </thead>
              <tbody>
                {floorStats.map((f, i) => (
                  <tr key={f.floor} style={{ background: i % 2 === 0 ? '#fff' : '#F8F9FA' }}>
                    <Td bold><span style={{ display:'inline-block', padding:'2px 10px', borderRadius:6, background:'#E7F5FF', color:'#1971C2', fontWeight:700, fontSize:12 }}>{f.floor}</span></Td>
                    <Td right>{f.total}</Td>
                    <Td right color="#E67700">{f.sw}</Td>
                    <Td right color="#E03131">{f.hw}</Td>
                    <Td right bold color={f.errors > 5 ? '#E03131' : '#212529'}>{f.errors}</Td>
                    <Td right color={f.rate > 10 ? '#E03131' : f.rate > 0 ? '#E67700' : '#2F9E44'}>{f.rate}%</Td>
                    <td style={{ padding:'7px 10px', borderBottom:'1px solid #E9ECEF', minWidth:120 }}>
                      <Bar pct={maxFloorErr > 0 ? Math.round(f.errors / maxFloorErr * 100) : 0} color={f.errors > 5 ? '#E03131' : f.errors > 0 ? '#F59F00' : '#2F9E44'} />
                    </td>
                  </tr>
                ))}
                {/* Total row */}
                <tr style={{ background:'#E7F5FF' }}>
                  <td style={{ padding:'8px 10px', fontWeight:700, fontSize:11, color:'#1971C2', borderTop:'2px solid #1971C2' }}>TỔNG CỘNG</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, fontSize:11, borderTop:'2px solid #1971C2' }}>{summary.totalMachines}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, fontSize:11, color:'#E67700', borderTop:'2px solid #1971C2' }}>{summary.swMachines}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, fontSize:11, color:'#E03131', borderTop:'2px solid #1971C2' }}>{summary.hwMachines}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, fontSize:11, color:'#E03131', borderTop:'2px solid #1971C2' }}>{summary.totalErrors}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, fontSize:11, borderTop:'2px solid #1971C2' }}>{summary.errorRate}%</td>
                  <td style={{ padding:'8px 10px', borderTop:'2px solid #1971C2' }}></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Error by type */}
          <div className="avoid-break">
            <div style={{ fontSize:13, fontWeight:700, color:'#495057', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.05em' }}>
              Lỗi theo từng loại linh kiện / thành phần
            </div>
            {errorByType.length === 0
              ? <div style={{ padding:'20px', textAlign:'center', color:'#868E96', fontSize:13, background:'#F8F9FA', borderRadius:10 }}>Không có lỗi nào được ghi nhận.</div>
              : (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {errorByType.map(e => {
                    const pct = summary.totalMachines > 0 ? Math.round(e.count / summary.totalMachines * 100) : 0
                    const isSw = e.field === 'softwareError'
                    const color = isSw ? '#E67700' : '#E03131'
                    return (
                      <div key={e.field} className="avoid-break" style={{ padding:'12px 14px', borderRadius:10, background:'#F8F9FA', border:'1px solid #E9ECEF', display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{ minWidth:0, flex:1 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                            <span style={{ fontSize:12, fontWeight:600, color:'#212529' }}>{e.label}</span>
                            <span style={{ fontSize:12, fontWeight:700, color }}>{e.count} máy</span>
                          </div>
                          <Bar pct={pct} color={color} />
                        </div>
                        <div style={{ flexShrink:0, padding:'3px 8px', borderRadius:6, background: isSw ? '#FFF9DB' : '#FFF5F5', color, fontSize:10, fontWeight:700 }}>
                          {isSw ? 'PM' : 'PC'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            }
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            PHẦN 2 — DANH SÁCH PHÒNG MÁY
        ══════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:'36px 48px' }}>
          <PageHeader title="Phần 2 — Danh sách phòng máy" />
          <SectionTitle>Phòng Máy</SectionTitle>

          <table>
            <thead>
              <tr>
                <Th>STT</Th>
                <Th>Mã phòng</Th>
                <Th>Tầng/Khu</Th>
                <Th right>Tổng máy</Th>
                <Th right>Máy tốt</Th>
                <Th right>Lỗi PM</Th>
                <Th right>Lỗi PC</Th>
                <Th right>Lỗi cả hai</Th>
                <Th right>Tỉ lệ lỗi</Th>
                <Th>CPU</Th>
                <Th>RAM</Th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r, i) => {
                const rateColor = r.errorRate > 15 ? '#E03131' : r.errorRate > 5 ? '#E67700' : r.errorRate > 0 ? '#F59F00' : '#2F9E44'
                return (
                  <tr key={r.roomCode} style={{ background: i % 2 === 0 ? '#fff' : '#F8F9FA' }}>
                    <Td color="#868E96">{i + 1}</Td>
                    <Td bold><span style={{ color:'#1971C2' }}>{r.roomCode}</span></Td>
                    <Td><span style={{ display:'inline-block', padding:'1px 8px', borderRadius:5, background:'#E7F5FF', color:'#1971C2', fontSize:10, fontWeight:700 }}>{r.floor}</span></Td>
                    <Td right bold>{r.totalMachines}</Td>
                    <Td right color="#2F9E44">{r.goodCount}</Td>
                    <Td right color={r.swCount > 0 ? '#E67700' : '#868E96'}>{r.swCount}</Td>
                    <Td right color={r.hwCount > 0 ? '#E03131' : '#868E96'}>{r.hwCount}</Td>
                    <Td right color={r.bothCount > 0 ? '#C92A2A' : '#868E96'}>{r.bothCount}</Td>
                    <Td right bold color={rateColor}>{r.errorRate}%</Td>
                    <Td color="#495057">{r.cpuSpec ?? '—'}</Td>
                    <Td color="#495057">{r.ramSpec ?? '—'}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Legend */}
          <div style={{ marginTop:18, display:'flex', gap:20, flexWrap:'wrap', padding:'12px 16px', background:'#F8F9FA', borderRadius:10, border:'1px solid #E9ECEF' }}>
            {[
              { label:'Máy tốt',      color:'#2F9E44' },
              { label:'Lỗi phần mềm', color:'#E67700' },
              { label:'Lỗi phần cứng',color:'#E03131' },
              { label:'Lỗi cả hai',   color:'#C92A2A' },
            ].map(l => (
              <span key={l.label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#495057', fontWeight:500 }}>
                <span style={{ width:10, height:10, borderRadius:3, background:l.color, display:'inline-block' }} />{l.label}
              </span>
            ))}
            <span style={{ marginLeft:'auto', fontSize:11, color:'#868E96' }}>PM = Phần mềm · PC = Phần cứng</span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            PHẦN 3 — LỊCH SỬ BẢO TRÌ
        ══════════════════════════════════════════════════════════ */}
        <div className="page-break" style={{ padding:'36px 48px' }}>
          <PageHeader title="Phần 3 — Lịch sử bảo trì" />
          <SectionTitle>Lịch Sử Bảo Trì</SectionTitle>

          {maintenanceLogs.length === 0
            ? <div style={{ padding:'30px', textAlign:'center', color:'#868E96', fontSize:14, background:'#F8F9FA', borderRadius:12 }}>Chưa có bản ghi bảo trì nào.</div>
            : (
              <table>
                <thead>
                  <tr>
                    <Th>Mã</Th>
                    <Th>Ngày</Th>
                    <Th>Phòng</Th>
                    <Th>Kỹ thuật viên</Th>
                    <Th right>Lỗi PM trước</Th>
                    <Th right>Lỗi PC trước</Th>
                    <Th right>Lỗi PM sau</Th>
                    <Th right>Lỗi PC sau</Th>
                    <Th right>Cải thiện</Th>
                    <Th>Ghi chú</Th>
                  </tr>
                </thead>
                <tbody>
                  {maintenanceLogs.map((m, i) => {
                    const before = m.softwareErrorsBefore + m.hardwareErrorsBefore
                    const after  = m.softwareErrorsAfter  + m.hardwareErrorsAfter
                    const diff   = before - after
                    return (
                      <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#F8F9FA' }}>
                        <Td bold color="#1971C2">#{m.id}</Td>
                        <Td color="#495057">{fmtDate(m.date)}</Td>
                        <Td><span style={{ display:'inline-block', padding:'1px 8px', borderRadius:5, background:'#E7F5FF', color:'#1971C2', fontSize:10, fontWeight:700 }}>{m.room}</span></Td>
                        <Td>{m.technicianName}</Td>
                        <Td right color="#E67700">{m.softwareErrorsBefore}</Td>
                        <Td right color="#E03131">{m.hardwareErrorsBefore}</Td>
                        <Td right color={m.softwareErrorsAfter > 0 ? '#E67700' : '#2F9E44'}>{m.softwareErrorsAfter}</Td>
                        <Td right color={m.hardwareErrorsAfter > 0 ? '#E03131' : '#2F9E44'}>{m.hardwareErrorsAfter}</Td>
                        <Td right bold color={diff > 0 ? '#2F9E44' : diff < 0 ? '#E03131' : '#868E96'}>
                          {diff > 0 ? `−${diff}` : diff < 0 ? `+${Math.abs(diff)}` : '—'}
                        </Td>
                        <Td color="#495057">{m.notes.length > 60 ? m.notes.slice(0, 60) + '…' : m.notes}</Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          }
          <div style={{ marginTop:12, fontSize:11, color:'#868E96' }}>
            Hiển thị {maintenanceLogs.length} bản ghi bảo trì gần nhất.
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            PHẦN 4 — TỒN KHO VẬT TƯ
        ══════════════════════════════════════════════════════════ */}
        <div style={{ padding:'36px 48px' }}>
          <PageHeader title="Phần 4 — Tồn kho vật tư" />
          <SectionTitle>Tồn Kho Vật Tư</SectionTitle>

          {supplies.length === 0
            ? <div style={{ padding:'30px', textAlign:'center', color:'#868E96', fontSize:14, background:'#F8F9FA', borderRadius:12 }}>Chưa có dữ liệu vật tư.</div>
            : (
              <>
                <table>
                  <thead>
                    <tr>
                      <Th>STT</Th>
                      <Th>Loại vật tư</Th>
                      <Th right>Đã nhập kho</Th>
                      <Th right>Đã sử dụng</Th>
                      <Th right>Tồn kho</Th>
                      <Th right>Tỉ lệ còn lại</Th>
                      <Th>Mức tồn kho</Th>
                      <Th>Tình trạng</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplies.map((s, i) => {
                      const st = supplyStatus(s.pct)
                      return (
                        <tr key={s.type} style={{ background: i % 2 === 0 ? '#fff' : '#F8F9FA' }}>
                          <Td color="#868E96">{i + 1}</Td>
                          <Td bold>{s.label}</Td>
                          <Td right>{s.intake}</Td>
                          <Td right color="#495057">{s.used}</Td>
                          <Td right bold color={s.balance <= 0 ? '#E03131' : '#212529'}>{s.balance}</Td>
                          <Td right bold color={st.color}>{s.pct}%</Td>
                          <td style={{ padding:'7px 10px', borderBottom:'1px solid #E9ECEF', minWidth:130 }}>
                            <Bar pct={s.pct} color={st.color} />
                          </td>
                          <td style={{ padding:'7px 10px', borderBottom:'1px solid #E9ECEF' }}>
                            <span style={{ display:'inline-block', padding:'2px 10px', borderRadius:6, background:st.bg, color:st.color, fontSize:10, fontWeight:700 }}>{st.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Summary by status */}
                <div style={{ marginTop:20, display:'flex', gap:14 }}>
                  {[
                    { label:'Đủ dùng (>30%)',       color:'#2F9E44', bg:'#EBFBEE', count: supplies.filter(s => s.pct > 30).length },
                    { label:'Sắp hết (10–30%)',      color:'#E67700', bg:'#FFF3BF', count: supplies.filter(s => s.pct >= 10 && s.pct <= 30).length },
                    { label:'Cần nhập thêm (<10%)',  color:'#E03131', bg:'#FFF5F5', count: supplies.filter(s => s.pct < 10).length },
                  ].map(st => (
                    <div key={st.label} className="avoid-break" style={{ flex:'1', padding:'14px 16px', borderRadius:10, background:st.bg, border:`1px solid ${st.color}33` }}>
                      <div style={{ fontSize:24, fontWeight:800, color:st.color, lineHeight:1 }}>{st.count}</div>
                      <div style={{ fontSize:11, color:'#495057', marginTop:4, fontWeight:500 }}>{st.label}</div>
                    </div>
                  ))}
                </div>
              </>
            )
          }

          {/* Footer */}
          <div style={{ marginTop:48, paddingTop:20, borderTop:'2px solid #E9ECEF', display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
            <div>
              <div style={{ fontSize:11, color:'#868E96' }}>Báo cáo được tạo tự động bởi Hệ thống Quản lý Phòng Máy v1.0</div>
              <div style={{ fontSize:11, color:'#868E96', marginTop:3 }}>© 2026 Trường Đại học Nam Cần Thơ — Trung tâm Ứng dụng và Phát triển Phần mềm</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#212529', marginBottom:40 }}>Người lập báo cáo</div>
              <div style={{ fontSize:11, color:'#868E96' }}>Ký tên, đóng dấu</div>
            </div>
          </div>
        </div>

      </div>
    </>
  )
}

export default function PrintReportPage() {
  return (
    <Suspense fallback={<div style={{ padding:60, textAlign:'center', color:'#868E96', fontFamily:'sans-serif', fontSize:16 }}>Đang tạo báo cáo...</div>}>
      <ReportContent />
    </Suspense>
  )
}
