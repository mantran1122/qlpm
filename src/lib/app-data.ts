// ===== Domain types =====
export interface Machine {
  id: number
  status: 'good' | 'hw' | 'sw' | 'both' | 'teacher'
  errors: string[]
  isTeacher?: boolean
}
export interface RoomSpec { cpu: string; ram: string; disk: string; screen: string }
export interface RoomStats { total: number; good: number; sw: number; hw: number; both: number; teacher: number; err: number }
export interface Room {
  name: string; floor: string; cols: number; count: number
  spec: RoomSpec; spread: { sw: number; hw: number; both: number }; seed: number
  machines: Machine[]; stats: RoomStats
}
export interface MaintenanceRecord {
  id: string; date: string; room: string; tech: string; type: 'bt' | 'nk'
  items: Record<string, number>; before: number | null; after: number | null; note: string
}
export interface SupplyItem { key: string; received: number; used: number; label: string; icon: string; remain: number; pct: number }
export interface ErrorType { key: string; label: string; short: string; icon: string; cat: 'sw' | 'hw' }

// ===== Error / supply types =====
export const ERROR_TYPES: ErrorType[] = [
  { key: 'software',     label: 'Phần mềm',    short: 'PM',   icon: 'software', cat: 'sw' },
  { key: 'case',         label: 'Case',        short: 'Case', icon: 'case',     cat: 'hw' },
  { key: 'cpu',          label: 'CPU',         short: 'CPU',  icon: 'cpu',      cat: 'hw' },
  { key: 'ram',          label: 'RAM',         short: 'RAM',  icon: 'ram',      cat: 'hw' },
  { key: 'disk',         label: 'Ổ cứng',      short: 'HDD',  icon: 'disk',     cat: 'hw' },
  { key: 'power',        label: 'Nguồn',       short: 'PSU',  icon: 'power',    cat: 'hw' },
  { key: 'monitor',      label: 'Màn hình',    short: 'LCD',  icon: 'screen',   cat: 'hw' },
  { key: 'monitorCable', label: 'Dây màn hình',short: 'D.MH', icon: 'cable',    cat: 'hw' },
  { key: 'powerCable',   label: 'Dây nguồn',   short: 'D.Ng', icon: 'cable',    cat: 'hw' },
  { key: 'mouse',        label: 'Chuột',       short: 'Mouse',icon: 'mouse',    cat: 'hw' },
  { key: 'network',      label: 'Mạng',        short: 'Net',  icon: 'network',  cat: 'hw' },
  { key: 'keyboard',     label: 'Bàn phím',    short: 'KB',   icon: 'keyboard', cat: 'hw' },
]
export const HW_KEYS = ERROR_TYPES.filter(e => e.cat === 'hw').map(e => e.key)
export const SUPPLY_TYPES = ERROR_TYPES.filter(e => e.cat === 'hw')

export const STATUS = {
  good:    { key: 'good',    label: 'Tốt',            color: 'var(--good)',    bg: 'var(--good-bg)',    tx: 'var(--good-tx)' },
  hw:      { key: 'hw',      label: 'Lỗi phần cứng',  color: 'var(--err)',     bg: 'var(--err-bg)',     tx: 'var(--err-tx)' },
  sw:      { key: 'sw',      label: 'Lỗi phần mềm',   color: 'var(--soft)',    bg: 'var(--soft-bg)',    tx: 'var(--soft-tx)' },
  both:    { key: 'both',    label: 'Lỗi cả hai',     color: 'var(--both)',    bg: 'var(--both-bg)',    tx: 'var(--both-tx)' },
  teacher: { key: 'teacher', label: 'Máy giảng viên', color: 'var(--teacher)', bg: 'var(--teacher-bg)', tx: 'var(--teacher-tx)' },
} as const
export type StatusKey = keyof typeof STATUS

export const STATUS_COLOR: Record<string, string> = {
  good: 'var(--good)', hw: 'var(--err)', sw: 'var(--soft)', both: 'var(--both)', teacher: 'var(--teacher)',
}

export const TECHS = ['Nguyễn Văn Hùng', 'Trần Minh Đức', 'Lê Thị Hoa', 'Phạm Quốc Bảo', 'Võ Thành Long']

// ===== Seeded RNG =====
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function pick<T>(rng: () => number, arr: T[]): T { return arr[Math.floor(rng() * arr.length)] }

function makeMachines(seed: number, count: number, spread: { sw: number; hw: number; both: number }): Machine[] {
  const rng = mulberry32(seed)
  const machines: Machine[] = Array.from({ length: count }, (_, i) => ({ id: i + 1, status: 'good' as const, errors: [] }))
  machines[count - 1].status = 'teacher'; machines[count - 1].isTeacher = true
  const pool = Array.from({ length: count - 1 }, (_, i) => i)
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]] }
  let idx = 0
  const assign = (n: number, kind: string) => {
    for (let k = 0; k < n && idx < pool.length; k++, idx++) {
      const m = machines[pool[idx]]
      if (kind === 'sw') { m.status = 'sw'; m.errors = ['software'] }
      else if (kind === 'hw') { m.status = 'hw'; const a = pick(rng, HW_KEYS), b = pick(rng, HW_KEYS); m.errors = rng() > 0.55 && b !== a ? [a, b] : [a] }
      else if (kind === 'both') { m.status = 'both'; m.errors = ['software', pick(rng, HW_KEYS)] }
    }
  }
  assign(spread.sw, 'sw'); assign(spread.hw, 'hw'); assign(spread.both, 'both')
  return machines
}
function summarize(machines: Machine[]): RoomStats {
  const s: RoomStats = { total: machines.length, good: 0, sw: 0, hw: 0, both: 0, teacher: 0, err: 0 }
  machines.forEach(m => { (s as unknown as Record<string, number>)[m.status]++ })
  s.err = s.sw + s.hw + s.both
  return s
}

// ===== Rooms =====
export const ROOMS: Room[] = [
  { name:'I2-01', floor:'2',  cols:8, count:50, spec:{cpu:'i5-11400', ram:'8GB',  disk:'SSD 256GB', screen:'DELL 22"'}, spread:{sw:1,hw:1,both:0}, seed:201 },
  { name:'I2-03', floor:'2',  cols:8, count:48, spec:{cpu:'i5-11400', ram:'8GB',  disk:'SSD 256GB', screen:'DELL 22"'}, spread:{sw:3,hw:2,both:1}, seed:203 },
  { name:'I3-02', floor:'3',  cols:8, count:55, spec:{cpu:'i5-12400', ram:'16GB', disk:'SSD 512GB', screen:'DELL 24"'}, spread:{sw:2,hw:1,both:0}, seed:302 },
  { name:'I3-04', floor:'3',  cols:8, count:61, spec:{cpu:'i7-12700', ram:'16GB', disk:'NVMe 512GB',screen:'DELL 24"'}, spread:{sw:8,hw:5,both:2}, seed:304 },
  { name:'I4-01', floor:'4',  cols:8, count:54, spec:{cpu:'i5-12400', ram:'16GB', disk:'SSD 512GB', screen:'HP 23.8"'}, spread:{sw:0,hw:0,both:0}, seed:401 },
  { name:'I4-03', floor:'4',  cols:8, count:52, spec:{cpu:'i5-12400', ram:'16GB', disk:'SSD 512GB', screen:'HP 23.8"'}, spread:{sw:2,hw:3,both:0}, seed:403 },
  { name:'I5-01', floor:'5',  cols:8, count:43, spec:{cpu:'i3-10100', ram:'8GB',  disk:'HDD 1TB',   screen:'DELL 22"'}, spread:{sw:4,hw:4,both:1}, seed:501 },
  { name:'I6-02', floor:'6',  cols:8, count:50, spec:{cpu:'i5-11400', ram:'8GB',  disk:'SSD 256GB', screen:'DELL 22"'}, spread:{sw:1,hw:2,both:0}, seed:602 },
  { name:'T3-01', floor:'T3', cols:8, count:45, spec:{cpu:'i5-12400', ram:'16GB', disk:'SSD 512GB', screen:'LG 24"'},   spread:{sw:3,hw:1,both:1}, seed:931 },
].map(d => { const machines = makeMachines(d.seed, d.count, d.spread); return { ...d, machines, stats: summarize(machines) } })

export const FLOORS = ['2', '3', '4', '5', '6', 'T3']

// ===== Dashboard aggregates =====
export const TOTAL_MACHINES = 1306
export const TOTAL_ERR = 47
export const GOOD_RATE = 96.4
export const MAINTENANCE_MONTH = 12
export const FLOOR_ERROR = [
  { floor: 'Tầng 2', sw: 4,  hw: 5 },
  { floor: 'Tầng 3', sw: 9,  hw: 7 },
  { floor: 'Tầng 4', sw: 3,  hw: 4 },
  { floor: 'Tầng 5', sw: 5,  hw: 6 },
  { floor: 'Tầng 6', sw: 2,  hw: 3 },
  { floor: 'T3',     sw: 4,  hw: 2 },
]
export const ERROR_SPLIT = [
  { label: 'Lỗi phần mềm', value: 27, color: 'var(--soft)' },
  { label: 'Lỗi phần cứng', value: 20, color: 'var(--err)' },
]
export const UPTIME_TREND = [94.8, 95.2, 95.0, 95.9, 96.1, 95.7, 96.2, 96.4]

// ===== Maintenance =====
export const MAINTENANCE: MaintenanceRecord[] = [
  { id:'BT-0142', date:'2026-06-04', room:'I3-04', tech:'Trần Minh Đức',   type:'bt', items:{ram:2,disk:1,software:3},              before:18, after:15, note:'Thay RAM 2 máy, cài lại Win + phần mềm 3 máy' },
  { id:'NK-0061', date:'2026-06-03', room:'—',     tech:'Phạm Quốc Bảo',   type:'nk', items:{ram:20,disk:15,mouse:30,keyboard:25,monitor:5}, before:null, after:null, note:'Nhập kho vật tư quý II/2026' },
  { id:'BT-0141', date:'2026-06-02', room:'I5-01', tech:'Nguyễn Văn Hùng', type:'bt', items:{power:1,mouse:2,network:1},            before:11, after:9,  note:'Thay nguồn 1 máy, chuột 2 máy' },
  { id:'BT-0140', date:'2026-05-30', room:'I2-03', tech:'Lê Thị Hoa',      type:'bt', items:{software:3,monitorCable:1},            before:8,  after:6,  note:'Xử lý lỗi phần mềm, thay dây màn hình' },
  { id:'BT-0139', date:'2026-05-28', room:'I4-03', tech:'Võ Thành Long',   type:'bt', items:{disk:2,ram:1},                         before:7,  after:5,  note:'Nâng cấp SSD, bổ sung RAM' },
  { id:'BT-0138', date:'2026-05-27', room:'I3-02', tech:'Trần Minh Đức',   type:'bt', items:{keyboard:2,mouse:1},                   before:5,  after:3,  note:'Thay bàn phím, chuột hỏng' },
  { id:'NK-0060', date:'2026-05-26', room:'—',     tech:'Phạm Quốc Bảo',   type:'nk', items:{case:8,cpu:4,monitorCable:40,powerCable:40}, before:null, after:null, note:'Nhập case, CPU, dây cáp' },
  { id:'BT-0137', date:'2026-05-24', room:'I6-02', tech:'Nguyễn Văn Hùng', type:'bt', items:{network:3,software:1},                before:6,  after:3,  note:'Khắc phục sự cố mạng LAN' },
  { id:'BT-0136', date:'2026-05-22', room:'T3-01', tech:'Lê Thị Hoa',      type:'bt', items:{software:4,power:1},                  before:9,  after:5,  note:'Cài lại ghost phòng thực hành' },
  { id:'BT-0135', date:'2026-05-20', room:'I5-01', tech:'Võ Thành Long',   type:'bt', items:{monitor:2,disk:1},                    before:13, after:11, note:'Thay 2 màn hình lỗi sọc' },
  { id:'BT-0134', date:'2026-05-18', room:'I2-01', tech:'Trần Minh Đức',   type:'bt', items:{ram:1,mouse:2},                       before:4,  after:2,  note:'Bảo trì định kỳ' },
  { id:'BT-0133', date:'2026-05-15', room:'I4-01', tech:'Nguyễn Văn Hùng', type:'bt', items:{software:2},                         before:2,  after:0,  note:'Cập nhật phần mềm phòng máy mới' },
]

// ===== Supplies =====
export const SUPPLIES: SupplyItem[] = [
  { key:'case',         received:40,  used:32  },
  { key:'cpu',          received:25,  used:21  },
  { key:'ram',          received:120, used:96  },
  { key:'disk',         received:80,  used:74  },
  { key:'power',        received:35,  used:28  },
  { key:'monitor',      received:30,  used:22  },
  { key:'monitorCable', received:150, used:138 },
  { key:'powerCable',   received:150, used:120 },
  { key:'mouse',        received:200, used:184 },
  { key:'network',      received:60,  used:57  },
  { key:'keyboard',     received:180, used:150 },
].map(s => {
  const meta = ERROR_TYPES.find(e => e.key === s.key)!
  const remain = s.received - s.used
  const pct = Math.round((remain / s.received) * 100)
  return { ...s, label: meta.label, icon: meta.icon, remain, pct }
})

export function supplyLevel(s: SupplyItem): { tone: string; label: string } {
  if (s.pct > 30) return { tone: 'good', label: 'Đủ dùng' }
  if (s.pct >= 10) return { tone: 'both', label: 'Sắp hết' }
  return { tone: 'err', label: 'Cần nhập thêm' }
}
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`
}
