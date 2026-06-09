import React from 'react'

const ICONS: Record<string, string | { e: [string, Record<string, unknown>][] }> = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 18h7v3H3z',
  monitor: { e: [['rect',{x:2,y:3,width:20,height:14,rx:2}],['path',{d:'M8 21h8M12 17v4'}]] },
  rooms: { e: [['rect',{x:3,y:3,width:7,height:7,rx:1}],['rect',{x:14,y:3,width:7,height:7,rx:1}],['rect',{x:14,y:14,width:7,height:7,rx:1}],['rect',{x:3,y:14,width:7,height:7,rx:1}]] },
  wrench: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  software: { e: [['rect',{x:2,y:3,width:20,height:14,rx:2}],['path',{d:'m8 8 3 3-3 3M13 14h3M2 21h20'}]] },
  supplies: { e: [['path',{d:'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z'}],['path',{d:'m3.3 7 8.7 5 8.7-5M12 22V12'}]] },
  stats: 'M3 3v18h18M7 16V11M12 16V7M17 16v-3',
  alert: { e: [['circle',{cx:12,cy:12,r:10}],['path',{d:'M12 8v4M12 16h.01'}]] },
  check: { e: [['path',{d:'M22 11.08V12a10 10 0 1 1-5.93-9.14'}],['path',{d:'m22 4-10 10.01-3-3'}]] },
  checkCircle: { e: [['circle',{cx:12,cy:12,r:10}],['path',{d:'m9 12 2 2 4-4'}]] },
  cpu: { e: [['rect',{x:4,y:4,width:16,height:16,rx:2}],['rect',{x:9,y:9,width:6,height:6}],['path',{d:'M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3'}]] },
  ram: 'M3 19v-3M21 19v-3M3 16h18a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1ZM7 12v.01M11 12v.01M15 12v.01M19 12v.01',
  disk: { e: [['line',{x1:22,y1:12,x2:2,y2:12}],['path',{d:'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'}],['path',{d:'M6 16h.01M10 16h.01'}]] },
  screen: { e: [['rect',{x:2,y:3,width:20,height:14,rx:2}],['path',{d:'M8 21h8M12 17v4'}]] },
  cable: 'M4 9a2 2 0 0 1-2-2V5h6v2a2 2 0 0 1-2 2ZM3 5V3M7 5V3M19 15a2 2 0 0 1 2 2v2h-6v-2a2 2 0 0 1 2-2ZM17 21v-2M21 21v-2M5 9v3a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4',
  power: 'M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04',
  mouse: { e: [['rect',{x:6,y:3,width:12,height:18,rx:6}],['path',{d:'M12 7v4'}]] },
  keyboard: { e: [['rect',{x:2,y:6,width:20,height:12,rx:2}],['path',{d:'M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8'}]] },
  network: { e: [['rect',{x:9,y:2,width:6,height:6,rx:1}],['rect',{x:2,y:16,width:6,height:6,rx:1}],['rect',{x:16,y:16,width:6,height:6,rx:1}],['path',{d:'M12 8v4M5 16v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2'}]] },
  search: { e: [['circle',{cx:11,cy:11,r:8}],['path',{d:'m21 21-4.3-4.3'}]] },
  plus: 'M12 5v14M5 12h14',
  bell: { e: [['path',{d:'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9'}],['path',{d:'M10.3 21a1.94 1.94 0 0 0 3.4 0'}]] },
  settings: { e: [['circle',{cx:12,cy:12,r:3}],['path',{d:'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'}]] },
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  moon: 'M12 3a6.36 6.36 0 0 0 9 9 9 9 0 1 1-9-9z',
  sun: { e: [['circle',{cx:12,cy:12,r:4}],['path',{d:'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'}]] },
  refresh: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M3 21v-5h5',
  chevronR: 'm9 18 6-6-6-6',
  chevronD: 'm6 9 6 6 6-6',
  chevronL: 'm15 18-6-6 6-6',
  arrowR: 'M5 12h14M12 5l7 7-7 7',
  x: 'M18 6 6 18M6 6l12 12',
  menu: 'M4 6h16M4 12h16M4 18h16',
  calendar: { e: [['rect',{x:3,y:4,width:18,height:18,rx:2}],['path',{d:'M16 2v4M8 2v4M3 10h18'}]] },
  user: { e: [['circle',{cx:12,cy:8,r:4}],['path',{d:'M4 21a8 8 0 0 1 16 0'}]] },
  users: { e: [['circle',{cx:9,cy:8,r:3.5}],['path',{d:'M3 21a6 6 0 0 1 12 0M16 5.5a3.5 3.5 0 0 1 0 6.9M21 21a6 6 0 0 0-4-5.6'}]] },
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  trend: 'M22 7 13.5 15.5 8.5 10.5 2 17M16 7h6v6',
  trendDown: 'M22 17 13.5 8.5 8.5 13.5 2 7M16 17h6v-6',
  clock: { e: [['circle',{cx:12,cy:12,r:9}],['path',{d:'M12 7v5l3 2'}]] },
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z',
  save: { e: [['path',{d:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z'}],['path',{d:'M17 21v-8H7v8M7 3v5h8'}]] },
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  box: { e: [['path',{d:'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z'}],['path',{d:'m3.3 7 8.7 5 8.7-5M12 22V12'}]] },
  case: { e: [['rect',{x:6,y:2,width:12,height:20,rx:2}],['path',{d:'M10 6h4M10 9h4M9 13h.01'}]] },
  dot: { e: [['circle',{cx:12,cy:12,r:4}]] },
  warning: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  pkgIn: 'M16 16l-4 4-4-4M12 20V10M20 6.5 12 2 4 6.5M4 6.5v8.4a2 2 0 0 0 1 1.7M20 6.5v8.4a2 2 0 0 1-1 1.7',
  inbox: { e: [['path',{d:'M22 12h-6l-2 3h-4l-2-3H2'}],['path',{d:'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'}]] },
  trash: { e: [['path',{d:'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'}]] },
  folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
}

interface IconProps {
  name: string
  size?: number
  stroke?: number
  className?: string
  style?: React.CSSProperties
}

export function Icon({ name, size = 20, stroke = 2, className = '', style = {} }: IconProps) {
  const def = ICONS[name]
  if (!def) return null
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  let children: React.ReactNode
  if (typeof def === 'string') {
    children = <path d={def} {...common} />
  } else {
    children = def.e.map((el, i) => {
      const [tag, attrs] = el
      return React.createElement(tag, { key: i, ...common, ...attrs })
    })
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}
      style={{ display: 'block', flexShrink: 0, ...style }} aria-hidden="true">
      {children}
    </svg>
  )
}
