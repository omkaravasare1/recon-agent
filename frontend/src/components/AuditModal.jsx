import React, { useEffect } from 'react'
import StatusBadge from './StatusBadge'

const fmt = v =>
  v != null
    ? `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'

const LAYER_COLORS = { exact: '#2D6BE4', fuzzy: '#7C3AED', llm: '#00BAC7' }

export default function AuditModal({ record: r, onClose }) {
  useEffect(() => {
    const h = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,.6)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 24,
        animation: 'fadeIn .2s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--white)', borderRadius: 16,
          boxShadow: 'var(--sh-xl)',
          width: '100%', maxWidth: 700,
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── Modal header ── */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--slate-200)',
          background: r.status === 'exception' ? '#FFF8F8' : '#F8FAFD',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--slate-900)' }}>Audit Trail</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--slate-400)', marginTop: 2 }}>{r.record_id}</div>
          </div>
          <StatusBadge type={r.status} size="md" />
          {r.layer && <StatusBadge type={r.layer} size="md" />}
          {r.confidence && <StatusBadge type={r.confidence} size="md" />}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'var(--slate-100)', border: 'none',
              fontSize: 18, color: 'var(--slate-500)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', marginLeft: 6,
            }}
          >×</button>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Source refs */}
          <Section title="Source References">
            <Grid cols={3}>
              <Field label="PG Transaction IDs" value={r.pg_txn_ids?.join(', ')}       mono />
              <Field label="Bank UTRs"           value={r.bank_utrs?.join(', ')}        mono />
              <Field label="Ledger Order IDs"    value={r.ledger_order_ids?.join(', ')} mono />
            </Grid>
          </Section>

          {/* Amounts */}
          <Section title="Amounts">
            <Grid cols={4}>
              <Field label="PG Gross"      value={fmt(r.pg_gross)}      mono />
              <Field label="PG Net"        value={fmt(r.pg_net)}        mono />
              <Field label="Bank Credit"   value={fmt(r.bank_credit)}   mono />
              <Field label="Ledger Amount" value={fmt(r.ledger_amount)} mono />
            </Grid>
            {r.pg_net != null && r.bank_credit != null && (
              <DeltaBar pg={r.pg_net} bank={r.bank_credit} />
            )}
          </Section>

          {/* Dates */}
          <Section title="Dates">
            <Grid cols={3}>
              <Field label="PG Settlement" value={r.pg_date}     mono />
              <Field label="Bank Credit"   value={r.bank_date}   mono />
              <Field label="Ledger Order"  value={r.ledger_date} mono />
            </Grid>
          </Section>

          {/* Exception callout */}
          {r.status === 'exception' && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
                Exception
              </div>
              <div style={{ marginBottom: 8 }}>
                <StatusBadge type={r.exception_category} size="md" />
              </div>
              <div style={{ fontSize: 13, color: 'var(--slate-700)', lineHeight: 1.65 }}>{r.exception_reason}</div>
            </div>
          )}

          {/* LLM reasoning */}
          {r.llm_reasoning && (
            <div style={{ background: 'var(--rzp-blue-light)', border: '1px solid #C7D9F9', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--rzp-blue)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
                🤖 Gemini Reasoning
              </div>
              <div style={{ fontSize: 13, color: 'var(--slate-700)', lineHeight: 1.7, fontStyle: 'italic' }}>
                "{r.llm_reasoning}"
              </div>
            </div>
          )}

          {/* Audit trail timeline */}
          <Section title="Layer Decision Log">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(r.audit_trail || []).map((step, i) => {
                const col = LAYER_COLORS[step.layer] || 'var(--slate-400)'
                return (
                  <div key={i} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                  }}>
                    {/* Timeline dot */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 2 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: step.success ? col : 'var(--slate-200)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: step.success ? '#fff' : 'var(--slate-400)',
                      }}>
                        {step.success ? '✓' : i + 1}
                      </div>
                      {i < (r.audit_trail?.length || 0) - 1 && (
                        <div style={{ width: 1, flex: 1, minHeight: 16, background: 'var(--slate-200)', margin: '3px 0' }} />
                      )}
                    </div>
                    {/* Step card */}
                    <div style={{
                      flex: 1, borderRadius: 8, padding: '10px 14px', marginBottom: 2,
                      background: step.success ? `${col}10` : 'var(--slate-50)',
                      border: `1px solid ${step.success ? `${col}30` : 'var(--slate-200)'}`,
                    }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: step.reasoning ? 6 : 0 }}>
                        <StatusBadge type={step.layer} />
                        {step.confidence && <StatusBadge type={step.confidence} />}
                        {step.delta_amount != null && (
                          <span className="mono" style={{ fontSize: 11, color: 'var(--slate-500)', background: 'var(--slate-100)', padding: '2px 6px', borderRadius: 4 }}>
                            Δamt {step.delta_amount >= 0 ? '+' : ''}{step.delta_amount}
                          </span>
                        )}
                        {step.delta_days != null && (
                          <span className="mono" style={{ fontSize: 11, color: 'var(--slate-500)', background: 'var(--slate-100)', padding: '2px 6px', borderRadius: 4 }}>
                            Δdays {step.delta_days}
                          </span>
                        )}
                      </div>
                      {step.reasoning && (
                        <div style={{ fontSize: 12, color: 'var(--slate-600)', lineHeight: 1.6 }}>
                          {step.reasoning}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>

        </div>
      </div>
    </div>
  )
}

/* ── Helpers ── */
function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Grid({ cols, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '10px 16px' }}>
      {children}
    </div>
  )
}

function Field({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>{label}</div>
      <div className={mono ? 'mono' : ''} style={{ fontSize: 13, color: value ? 'var(--slate-900)' : 'var(--slate-300)' }}>
        {value || '—'}
      </div>
    </div>
  )
}

function DeltaBar({ pg, bank }) {
  const delta = bank - pg
  const pct   = Math.abs(delta / pg) * 100
  if (pct < 0.01) return null
  const color = pct < 2 ? '#D97706' : '#DC2626'
  return (
    <div style={{ marginTop: 10, padding: '8px 12px', background: `${color}0D`, borderRadius: 6, border: `1px solid ${color}25`, fontSize: 12, color }}>
      <strong>Amount delta:</strong> {delta >= 0 ? '+' : ''}{delta.toFixed(2)} ({pct.toFixed(2)}%)
      {pct < 2 ? ' — within fuzzy tolerance' : ' — exceeds 2% tolerance'}
    </div>
  )
}
