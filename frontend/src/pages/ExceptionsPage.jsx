import React, { useState } from 'react'
import StatusBadge from '../components/StatusBadge'
import Footer from '../components/Footer'
import { exportUrl } from '../api/client'

const CATEGORIES = {
  timing_pending:              { label: 'Timing Pending',    desc: 'Bank credit not yet posted — likely to resolve',     icon: '⏳', color: '#D97706', bg: '#FFFBEB' },
  amount_mismatch_unexplained: { label: 'Amount Mismatch',   desc: 'Differs beyond fee/TDS pattern',                    icon: '⚠️', color: '#C2410C', bg: '#FFF7ED' },
  duplicate_suspected:         { label: 'Duplicate?',        desc: 'Same transaction seen more than once',               icon: '⎘',  color: '#BE185D', bg: '#FDF2F8' },
  missing_source_data:         { label: 'Missing Data',      desc: 'Required field is null or empty',                   icon: '○',  color: '#1D4ED8', bg: '#EFF6FF' },
  true_anomaly:                { label: 'True Anomaly',      desc: 'No match after all 3 layers — manual review needed', icon: '🔴', color: '#B91C1C', bg: '#FEF2F2' },
}

const fmt = v =>
  v != null
    ? `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'

export default function ExceptionsPage({ exceptions, runId, onOpenAudit }) {
  const [activeCat, setActiveCat] = useState(null)

  if (!exceptions || exceptions.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '100px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 56 }}>✅</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--slate-900)' }}>No exceptions</div>
        <div style={{ fontSize: 14, color: 'var(--slate-500)', maxWidth: 380 }}>
          {runId ? 'All records were successfully reconciled across all 3 layers.' : 'Run a reconciliation first.'}
        </div>
      </div>
    )
  }

  // Group by category
  const grouped = {}
  for (const ex of exceptions) {
    const cat = ex.exception_category || 'true_anomaly'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(ex)
  }

  const activeCats = Object.keys(CATEGORIES).filter(c => grouped[c])
  const displayCats = activeCat ? [activeCat] : activeCats

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--slate-900)', letterSpacing: '-0.5px' }}>
            Exception List
            <span style={{ marginLeft: 10, fontSize: 14, fontWeight: 600, padding: '2px 12px', borderRadius: 20, background: '#FEE2E2', color: '#B91C1C' }}>
              {exceptions.length} records
            </span>
          </h1>
          <p style={{ fontSize: 13, color: 'var(--slate-500)', marginTop: 6, maxWidth: 560, lineHeight: 1.6 }}>
            Every record has an explicit exception category — these are <strong>honest</strong> failures, not generic "unmatched" rows. The pipeline attempted all 3 layers before categorizing each one.
          </p>
        </div>
        {runId && (
          <a
            href={exportUrl(runId)}
            download
            style={{
              padding: '9px 20px', borderRadius: 8,
              background: 'var(--rzp-blue)',
              color: '#fff', fontWeight: 600, fontSize: 13,
              display: 'inline-flex', alignItems: 'center', gap: 7,
              boxShadow: '0 2px 10px rgba(45,107,228,.35)',
              flexShrink: 0,
            }}
          >
            ↓ Export CSV
          </a>
        )}
      </div>

      {/* ── Category summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {activeCats.map(cat => {
          const cfg    = CATEGORIES[cat]
          const count  = grouped[cat].length
          const active = activeCat === cat
          return (
            <button
              key={cat}
              onClick={() => setActiveCat(active ? null : cat)}
              style={{
                padding: '16px 18px', borderRadius: 12,
                border: active ? `2px solid ${cfg.color}` : '1.5px solid var(--slate-200)',
                background: active ? cfg.bg : 'var(--white)',
                boxShadow: active ? `0 4px 12px ${cfg.color}25` : 'var(--sh-xs)',
                textAlign: 'left', cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 8 }}>{cfg.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.label}</div>
              <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 3, lineHeight: 1.4 }}>{cfg.desc}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: cfg.color, marginTop: 10, letterSpacing: '-1px' }}>
                {count}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Exception tables by category ── */}
      {displayCats.map(cat => {
        const cfg  = CATEGORIES[cat]
        const rows = grouped[cat]
        return (
          <div
            key={cat}
            style={{
              background: 'var(--white)',
              borderRadius: 'var(--r-lg)',
              border: `1px solid ${cfg.color}30`,
              boxShadow: 'var(--sh-sm)',
              overflow: 'hidden',
            }}
          >
            {/* Section header */}
            <div style={{
              padding: '16px 22px',
              borderBottom: `1px solid ${cfg.color}20`,
              background: cfg.bg,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 22 }}>{cfg.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: cfg.color }}>{cfg.label}</div>
                <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>{cfg.desc}</div>
              </div>
              <span style={{
                marginLeft: 'auto', padding: '4px 14px', borderRadius: 20,
                background: `${cfg.color}18`, color: cfg.color,
                fontSize: 12, fontWeight: 700,
              }}>
                {rows.length} record{rows.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Records table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#FAFBFD' }}>
                    {['PG Transaction ID', 'Bank UTR', 'Order ID', 'PG Net', 'Bank Credit', 'Δ Amount', 'PG Date', 'Reason', ''].map((h, i) => (
                      <th key={i} style={{
                        padding: '9px 14px', textAlign: i >= 3 && i <= 5 ? 'right' : 'left',
                        fontSize: 11, fontWeight: 600, color: 'var(--slate-500)',
                        textTransform: 'uppercase', letterSpacing: '.4px',
                        borderBottom: '1px solid var(--slate-200)',
                        whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const delta = r.pg_net != null && r.bank_credit != null
                      ? r.bank_credit - r.pg_net : null
                    return (
                      <tr
                        key={r.record_id}
                        style={{ borderBottom: '1px solid var(--slate-100)', transition: 'background .1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = cfg.bg}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <td style={td}><span className="mono">{r.pg_txn_ids?.[0] || '—'}</span></td>
                        <td style={td}><span className="mono">{r.bank_utrs?.[0]    || '—'}</span></td>
                        <td style={td}><span className="mono">{r.ledger_order_ids?.[0] || '—'}</span></td>
                        <td style={{ ...td, textAlign: 'right' }}><span className="mono">{fmt(r.pg_net)}</span></td>
                        <td style={{ ...td, textAlign: 'right' }}><span className="mono">{fmt(r.bank_credit)}</span></td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          {delta != null
                            ? <span className="mono" style={{ color: Math.abs(delta) > 1 ? cfg.color : 'var(--slate-500)' }}>
                                {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
                              </span>
                            : <span style={{ color: 'var(--slate-300)' }}>—</span>
                          }
                        </td>
                        <td style={td}><span className="mono">{r.pg_date || '—'}</span></td>
                        <td style={{ ...td, maxWidth: 280, fontSize: 12, color: 'var(--slate-600)', lineHeight: 1.5 }}>
                          {r.exception_reason}
                        </td>
                        <td style={td}>
                          <button
                            onClick={() => onOpenAudit(r)}
                            style={{
                              padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                              background: 'var(--rzp-blue-light)', color: 'var(--rzp-blue)',
                              border: '1px solid #C7D9F9', cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            View →
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      <Footer />
    </div>
  )
}

const td = { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' }
