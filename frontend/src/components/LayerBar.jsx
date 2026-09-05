import React from 'react'

/** Stacked bar: exact / fuzzy / llm / exception */
export default function LayerBar({ metrics }) {
  if (!metrics) return null
  const { matched_exact, matched_fuzzy, matched_llm, exceptions, matched_total } = metrics
  const total = matched_total + exceptions || 1

  const segments = [
    { label: 'Exact',      value: matched_exact, color: '#16a34a' },
    { label: 'Fuzzy',      value: matched_fuzzy, color: '#4f46e5' },
    { label: 'LLM',        value: matched_llm,   color: '#7c3aed' },
    { label: 'Exceptions', value: exceptions,     color: '#dc2626' },
  ].filter(s => s.value > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Bar */}
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--slate-200)' }}>
        {segments.map(seg => (
          <div
            key={seg.label}
            title={`${seg.label}: ${seg.value}`}
            style={{ width: `${(seg.value / total) * 100}%`, background: seg.color, transition: 'width .4s' }}
          />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {segments.map(seg => (
          <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--slate-600, #475569)' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
            {seg.label}: <strong>{seg.value}</strong>
            <span style={{ color: 'var(--slate-400)' }}>({((seg.value / total) * 100).toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}
