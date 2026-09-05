import React, { useState } from 'react'

/* ─── Donut Chart ─────────────────────────────────────────────────────────── */
export function DonutChart({ segments, size = 140, thickness = 28, label, sublabel }) {
  const [hovered, setHovered] = useState(null)
  const r   = (size - thickness) / 2
  const cx  = size / 2
  const cy  = size / 2
  const circ = 2 * Math.PI * r

  const total = segments.reduce((s, g) => s + (g.value || 0), 0) || 1
  let offset = 0

  const arcs = segments.map((seg, i) => {
    const pct  = seg.value / total
    const dash = pct * circ
    const gap  = circ - dash
    const arc  = { ...seg, dash, gap, offset: circ * (1 - offset) - dash, i }
    offset += pct
    return arc
  })

  const active = hovered != null ? segments[hovered] : null

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--slate-100)" strokeWidth={thickness} />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth={hovered === i ? thickness + 3 : thickness}
            strokeDasharray={`${arc.dash} ${arc.gap}`}
            strokeDashoffset={arc.offset}
            strokeLinecap="butt"
            style={{ transition: 'stroke-width .15s', cursor: 'pointer' }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>
      {/* Center label */}
      <div style={{
        position: 'absolute', textAlign: 'center',
        pointerEvents: 'none',
      }}>
        {active ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: active.color }}>{active.value}</div>
            <div style={{ fontSize: 10, color: 'var(--slate-500)', marginTop: 1 }}>{active.label}</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--slate-900)' }}>{label}</div>
            {sublabel && <div style={{ fontSize: 10, color: 'var(--slate-500)', marginTop: 1 }}>{sublabel}</div>}
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Horizontal Bar Chart ────────────────────────────────────────────────── */
export function HBarChart({ items }) {
  // items: [{ label, value, color, total }]
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--slate-700)', fontWeight: 500 }}>{item.label}</span>
            <span style={{ color: 'var(--slate-500)', fontFamily: 'monospace' }}>{item.value}</span>
          </div>
          <div style={{ height: 7, background: 'var(--slate-100)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(item.value / max) * 100}%`,
              background: item.color,
              borderRadius: 4,
              transition: 'width .5s cubic-bezier(.4,0,.2,1)',
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Mini Gauge (precision/recall/F1) ───────────────────────────────────── */
export function Gauge({ value, label, color = '#2D6BE4' }) {
  // value: 0-1 float
  const pct = value != null ? Math.max(0, Math.min(1, value)) : null
  const size = 80
  const r    = 30
  const circ = Math.PI * r   // semicircle
  const dash = pct != null ? pct * circ : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`}>
        {/* Track */}
        <path
          d={`M ${size / 2 - r} ${size / 2} A ${r} ${r} 0 0 1 ${size / 2 + r} ${size / 2}`}
          fill="none" stroke="var(--slate-100)" strokeWidth={8} strokeLinecap="round"
        />
        {/* Value */}
        {pct != null && (
          <path
            d={`M ${size / 2 - r} ${size / 2} A ${r} ${r} 0 0 1 ${size / 2 + r} ${size / 2}`}
            fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: 'stroke-dasharray .6s ease' }}
          />
        )}
        {/* Center text */}
        <text
          x={size / 2} y={size / 2}
          textAnchor="middle" dominantBaseline="auto"
          style={{ fontSize: 13, fontWeight: 700, fill: 'var(--slate-900)', fontFamily: 'Inter, sans-serif' }}
        >
          {pct != null ? `${(pct * 100).toFixed(1)}%` : '—'}
        </text>
      </svg>
      <div style={{ fontSize: 11, color: 'var(--slate-500)', fontWeight: 500, textAlign: 'center' }}>{label}</div>
    </div>
  )
}

/* ─── Sparkline ───────────────────────────────────────────────────────────── */
export function Sparkline({ data, color = '#2D6BE4', height = 40, width = 120 }) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  })
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/* ─── Legend pill row ─────────────────────────────────────────────────────── */
export function Legend({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--slate-600)' }}>{item.label}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate-800)' }}>{item.value}</span>
        </div>
      ))}
    </div>
  )
}
