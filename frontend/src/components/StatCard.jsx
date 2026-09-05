import React from 'react'

export default function StatCard({ label, value, sub, accent, icon, children, style }) {
  return (
    <div style={{
      background: 'var(--white)',
      borderRadius: 'var(--r-lg)',
      padding: '20px 22px',
      boxShadow: 'var(--sh-sm)',
      border: '1px solid var(--slate-200)',
      display: 'flex', flexDirection: 'column', gap: 6,
      borderTop: accent ? `3px solid ${accent}` : undefined,
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
          {label}
        </div>
        {icon && (
          <div style={{ fontSize: 18, opacity: .7 }}>{icon}</div>
        )}
      </div>
      {value !== undefined && (
        <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--slate-900)', lineHeight: 1.1, letterSpacing: '-1px' }}>
          {value}
        </div>
      )}
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--slate-500)', lineHeight: 1.5 }}>{sub}</div>
      )}
      {children}
    </div>
  )
}
