'use client'
import { useRef, useState, useEffect, useId } from 'react'

function useMeasure(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}
function useMounted(delay = 60) {
  const [on, setOn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setOn(true), delay); return () => clearTimeout(t) }, [delay])
  return on
}
function niceMax(v: number) {
  if (v <= 5) return 5
  const step = v <= 20 ? 4 : v <= 50 ? 10 : 20
  return Math.ceil(v / step) * step
}

interface BarKey { k: string; color: string; label: string }
export function BarChart({ data, keys, height = 270 }: { data: Record<string, number | string>[]; keys: BarKey[]; height?: number }) {
  const [ref, w] = useMeasure()
  const on = useMounted(120)
  const W = w || 560, L = 34, R = 10, T = 16, B = 30
  const innerW = W - L - R, innerH = height - T - B
  const maxVal = niceMax(Math.max(1, ...data.flatMap(d => keys.map(k => Number(d[k.k]) || 0))))
  const groupW = innerW / data.length
  const barW = Math.min(16, (groupW * 0.62) / keys.length), gap = 5, ticks = 4
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width="100%" height={height} style={{ overflow: 'visible' }}>
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const val = (maxVal / ticks) * i, y = T + innerH - (val / maxVal) * innerH
          return (
            <g key={i}>
              <line x1={L} y1={y} x2={W - R} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '3 4'} />
              <text x={L - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--text-faint)" fontFamily="var(--font)">{val}</text>
            </g>
          )
        })}
        {data.map((d, gi) => {
          const gx = L + groupW * gi + groupW / 2, totW = keys.length * barW + (keys.length - 1) * gap
          return (
            <g key={gi}>
              {keys.map((k, ki) => {
                const val = Number(d[k.k]) || 0, h = (val / maxVal) * innerH
                const x = gx - totW / 2 + ki * (barW + gap), y = T + innerH - h
                return (
                  <rect key={ki} x={x} y={on ? y : T + innerH} width={barW} height={on ? h : 0} rx={barW / 2.4} fill={k.color}
                    style={{ transition: `y .7s cubic-bezier(.2,.8,.2,1) ${gi * 60}ms, height .7s cubic-bezier(.2,.8,.2,1) ${gi * 60}ms` }} />
                )
              })}
              <text x={gx} y={height - 9} textAnchor="middle" fontSize="11.5" fill="var(--text-muted)" fontFamily="var(--font)" fontWeight="500">{d.floor as string}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function DonutChart({ data, size = 168, thickness = 22, center }: {
  data: { value: number; color: string }[]; size?: number; thickness?: number; center?: React.ReactNode
}) {
  const on = useMounted(150)
  const r = (size - thickness) / 2, c = 2 * Math.PI * r
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  let acc = 0
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const frac = d.value / total, len = on ? frac * c : 0, off = -acc * c; acc += frac
          return (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={off} strokeLinecap="round"
              style={{ transition: `stroke-dasharray .9s cubic-bezier(.3,.8,.3,1) ${i * 160}ms` }} />
          )
        })}
      </svg>
      {center && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{center}</div>}
    </div>
  )
}

function smoothPath(pts: number[][]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], cx = (x0 + x1) / 2
    d += ` C ${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`
  }
  return d
}

export function Sparkline({ values, height = 80, color = 'var(--primary)', fill = true, strokeWidth = 2.5 }: {
  values: number[]; height?: number; color?: string; fill?: boolean; strokeWidth?: number
}) {
  const [ref, w] = useMeasure()
  const on = useMounted(200)
  const id = useId()
  const W = w || 320, pad = 6
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (W - pad * 2), height - pad - ((v - min) / span) * (height - pad * 2)])
  const d = smoothPath(pts)
  const area = `${d} L ${pts[pts.length - 1][0]} ${height} L ${pts[0][0]} ${height} Z`
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width="100%" height={height}>
        <defs>
          <linearGradient id={`spk${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.20" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {fill && <path d={area} fill={`url(#spk${id})`} opacity={on ? 1 : 0} style={{ transition: 'opacity .8s ease .3s' }} />}
        <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
          style={{ strokeDasharray: 1000, strokeDashoffset: on ? 0 : 1000, transition: 'stroke-dashoffset 1.1s ease' }} />
        {pts.map((p, i) => i === pts.length - 1 ? <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={color} opacity={on ? 1 : 0} style={{ transition: 'opacity .4s ease 1s' }} /> : null)}
      </svg>
    </div>
  )
}

export function MiniBars({ values, color = 'var(--good)', height = 56 }: { values: number[]; color?: string; height?: number }) {
  const on = useMounted(150)
  const max = Math.max(...values)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height }}>
      {values.map((v, i) => (
        <div key={i} style={{ width: 9, borderRadius: 6, background: color, height: on ? `${(v / max) * 100}%` : 0, opacity: 0.35 + (v / max) * 0.65, transition: `height .6s cubic-bezier(.2,.8,.2,1) ${i * 70}ms` }} />
      ))}
    </div>
  )
}

export function Progress({ value, tone = 'var(--good)', track = 'var(--surface-3)', height = 8, segments }: {
  value?: number; tone?: string; track?: string; height?: number
  segments?: { value: number; color: string }[]
}) {
  const on = useMounted(120)
  if (segments) {
    return (
      <div style={{ display: 'flex', width: '100%', height, borderRadius: 99, overflow: 'hidden', background: track }}>
        {segments.map((s, i) => (
          <div key={i} style={{ width: on ? `${s.value}%` : 0, background: s.color, transition: `width .8s cubic-bezier(.2,.8,.2,1) ${i * 120}ms` }} />
        ))}
      </div>
    )
  }
  return (
    <div style={{ width: '100%', height, borderRadius: 99, background: track, overflow: 'hidden' }}>
      <div style={{ width: on ? `${value}%` : 0, height: '100%', borderRadius: 99, background: tone, transition: 'width .8s cubic-bezier(.2,.8,.2,1)' }} />
    </div>
  )
}
