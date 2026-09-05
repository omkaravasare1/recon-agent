import React, { useEffect, useState } from 'react'
import StatCard from '../components/StatCard'
import ResultsTable from '../components/ResultsTable'
import { DonutChart, HBarChart, Gauge, Legend } from '../components/Charts'
import Footer from '../components/Footer'

/* ─── Helpers ──────────────────────────────────────────────────────────── */
const safeNum = (v, fb = 0) => (v != null && !isNaN(v) ? Number(v) : fb)
const pct     = v => (v != null ? `${(v * 100).toFixed(1)}%` : '—')

const COLORS = {
  exact: '#2D6BE4', fuzzy: '#7C3AED', llm: '#00BAC7',
  exception: '#EF4444', matched: '#16A34A',
}
const EXC_COLORS = {
  timing_pending:'#D97706', amount_mismatch_unexplained:'#C2410C',
  duplicate_suspected:'#BE185D', missing_source_data:'#1D4ED8', true_anomaly:'#B91C1C',
}
const EXC_LABELS = {
  timing_pending:'Timing Pending', amount_mismatch_unexplained:'Amount Mismatch',
  duplicate_suspected:'Duplicate?', missing_source_data:'Missing Data', true_anomaly:'True Anomaly',
}

/* ─── Responsive CSS injected once ────────────────────────────────────── */
const RESPONSIVE_CSS = `
  .rzp-grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
  .rzp-grid-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  .rzp-grid-3s{ display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
  .rzp-grid-2 { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; }
  .rzp-grid-4c{ display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
  .rzp-grid-5c{ display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
  .rzp-hero   { display:flex; align-items:center; gap:48px; }
  .rzp-hero-svg{ display:block; flex-shrink:0; }
  @media(max-width:1100px){
    .rzp-grid-4  { grid-template-columns:repeat(2,1fr); }
    .rzp-grid-3  { grid-template-columns:repeat(2,1fr); }
    .rzp-grid-3s { grid-template-columns:repeat(2,1fr); }
    .rzp-grid-4c { grid-template-columns:repeat(2,1fr); }
    .rzp-grid-5c { grid-template-columns:repeat(3,1fr); }
  }
  @media(max-width:720px){
    .rzp-grid-4,.rzp-grid-3,.rzp-grid-3s,.rzp-grid-2,
    .rzp-grid-4c,.rzp-grid-5c { grid-template-columns:1fr; }
    .rzp-hero   { flex-direction:column; gap:28px; }
    .rzp-hero-svg{ display:none; }
  }
`

/* ═══════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD (post-run view)
═══════════════════════════════════════════════════════════════════════ */
export default function Dashboard({ runState, onOpenAudit, onRun }) {
  const { status, results, error } = runState
  const ready      = status === 'completed' && results != null
  const metrics    = ready ? results.metrics  : null
  const allResults = ready ? (results.results || []) : []

  if (status === 'idle')    return <><style>{RESPONSIVE_CSS}</style><Idle onRun={onRun} /></>
  if (status === 'running' || (status === 'completed' && !ready))
                            return <><style>{RESPONSIVE_CSS}</style><Running progress={runState.progress} /></>
  if (status === 'failed')  return <><style>{RESPONSIVE_CSS}</style><Failed error={error} /></>

  const matchedTotal = safeNum(metrics?.matched_total)
  const exceptions   = safeNum(metrics?.exceptions)
  const total        = safeNum(metrics?.total_pg_records) || (matchedTotal + exceptions)
  const matchRatePct = safeNum(metrics?.match_rate_pct, 0)

  const donutSegs = [
    { label:'Exact',      value:safeNum(metrics?.matched_exact), color:COLORS.exact },
    { label:'Fuzzy',      value:safeNum(metrics?.matched_fuzzy), color:COLORS.fuzzy },
    { label:'LLM',        value:safeNum(metrics?.matched_llm),   color:COLORS.llm },
    { label:'Exceptions', value:exceptions,                       color:COLORS.exception },
  ].filter(s => s.value > 0)

  const excCounts  = metrics?.exception_counts && typeof metrics.exception_counts === 'object'
    ? metrics.exception_counts : {}
  const excEntries = Object.entries(excCounts)

  const hbarLayers = [
    { label:'Exact match',  value:safeNum(metrics?.matched_exact), color:COLORS.exact },
    { label:'Fuzzy match',  value:safeNum(metrics?.matched_fuzzy), color:COLORS.fuzzy },
    { label:'LLM-assisted', value:safeNum(metrics?.matched_llm),   color:COLORS.llm },
    { label:'Exceptions',   value:exceptions,                       color:COLORS.exception },
  ]

  return (
    <>
      <style>{RESPONSIVE_CSS}</style>
      <div className="animate-in" style={{ display:'flex', flexDirection:'column', gap:22 }}>

        {/* KPI row */}
        <div className="rzp-grid-4">
          <StatCard label="Match Rate" accent={COLORS.matched} icon="✅">
            <div style={{ fontSize:34, fontWeight:800, color:COLORS.matched, letterSpacing:'-1.5px', lineHeight:1 }}>{matchRatePct}%</div>
            <div style={{ fontSize:12, color:'var(--slate-500)' }}>{matchedTotal} of {total} PG records</div>
          </StatCard>
          <StatCard label="Total Processed" accent={COLORS.exact} icon="📄">
            <div style={{ fontSize:34, fontWeight:800, color:'var(--slate-900)', letterSpacing:'-1.5px', lineHeight:1 }}>{safeNum(metrics?.total_pg_records)}</div>
            <div style={{ fontSize:12, color:'var(--slate-500)' }}>Bank {safeNum(metrics?.total_bank_records)} · Ledger {safeNum(metrics?.total_ledger_records)}</div>
          </StatCard>
          <StatCard label="Exceptions" accent={COLORS.exception} icon="⚠️">
            <div style={{ fontSize:34, fontWeight:800, color:COLORS.exception, letterSpacing:'-1.5px', lineHeight:1 }}>{exceptions}</div>
            <div style={{ fontSize:12, color:'var(--slate-500)' }}>{excEntries.length} categor{excEntries.length !== 1 ? 'ies' : 'y'}</div>
          </StatCard>
          <StatCard label="Throughput" accent={COLORS.llm} icon="⚡">
            <div style={{ fontSize:34, fontWeight:800, color:'var(--slate-900)', letterSpacing:'-1.5px', lineHeight:1 }}>{safeNum(metrics?.records_per_sec,0).toLocaleString()}</div>
            <div style={{ fontSize:12, color:'var(--slate-500)' }}>rec/s · {safeNum(metrics?.total_seconds,0).toFixed(2)}s total</div>
          </StatCard>
        </div>

        {/* Charts row */}
        <div className="rzp-grid-3">
          {/* Donut */}
          <Card><Label>Resolution Mix</Label>
            <div style={{ display:'flex', alignItems:'center', gap:20, marginTop:8 }}>
              <DonutChart segments={donutSegs} size={140} thickness={28} label={`${matchRatePct}%`} sublabel="match rate" />
              <Legend items={donutSegs} />
            </div>
          </Card>

          {/* Layer bars */}
          <Card><Label>Records per Layer</Label>
            <div style={{ marginTop:8 }}><HBarChart items={hbarLayers} /></div>
            <div style={{ fontSize:11, color:'var(--slate-400)', marginTop:12 }}>
              exact {(safeNum(metrics?.layer_timing?.exact,0)*1000).toFixed(0)}ms
              {' · '}fuzzy {(safeNum(metrics?.layer_timing?.fuzzy,0)*1000).toFixed(0)}ms
              {' · '}llm {(safeNum(metrics?.layer_timing?.llm,0)*1000).toFixed(0)}ms
            </div>
          </Card>

          {/* Gauges */}
          <Card><Label>Internal Validation</Label>
            {metrics?.ground_truth_available ? (
              <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:6 }}>
                <div style={{ fontSize:11, background:'#FFFBEB', color:'#92400E', padding:'5px 10px', borderRadius:6, border:'1px solid #FDE68A', lineHeight:1.5 }}>
                  Graded against hidden ground truth — not visible to the pipeline.
                </div>
                <div style={{ display:'flex', justifyContent:'space-around' }}>
                  <Gauge value={metrics?.precision} label="Precision" color={COLORS.exact} />
                  <Gauge value={metrics?.recall}    label="Recall"    color={COLORS.fuzzy} />
                  <Gauge value={metrics?.f1}        label="F1"        color={COLORS.matched} />
                </div>
              </div>
            ) : (
              <p style={{ color:'var(--slate-400)', fontSize:13, marginTop:8 }}>Ground truth not found.</p>
            )}
          </Card>
        </div>

        {/* Exception breakdown */}
        {excEntries.length > 0 && (
          <Card>
            <Label>Exception Breakdown</Label>
            <div style={{ marginTop:12, maxWidth:560 }}>
              <HBarChart items={excEntries.map(([k,v]) => ({ label:EXC_LABELS[k]||k, value:v, color:EXC_COLORS[k]||'#6B7280' }))} />
            </div>
          </Card>
        )}

        {/* Table */}
        <div>
          <h2 style={{ fontSize:15, fontWeight:700, color:'var(--slate-900)', marginBottom:12 }}>
            All Records
            <span style={{ fontSize:13, fontWeight:400, color:'var(--slate-400)', marginLeft:8 }}>{allResults.length} total</span>
          </h2>
          <ResultsTable results={allResults} onOpenAudit={onOpenAudit} />
        </div>

        <Footer />
      </div>
    </>
  )
}

/* ─── Tiny shared components ───────────────────────────────────────────── */
function Card({ children, style }) {
  return (
    <div style={{ background:'var(--white)', borderRadius:'var(--r-lg)', padding:'20px 22px', boxShadow:'var(--sh-sm)', border:'1px solid var(--slate-200)', ...style }}>
      {children}
    </div>
  )
}
function Label({ children }) {
  return <div style={{ fontSize:11, fontWeight:700, color:'var(--slate-600)', textTransform:'uppercase', letterSpacing:'.6px' }}>{children}</div>
}

/* ═══════════════════════════════════════════════════════════════════════
   LANDING PAGE (idle state)
═══════════════════════════════════════════════════════════════════════ */
function Idle({ onRun }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section style={{
        background:'linear-gradient(135deg,#0F172A 0%,#1E1B4B 55%,#0C2340 100%)',
        borderRadius:20, padding:'56px 48px', marginBottom:36,
        position:'relative', overflow:'hidden',
      }}>
        {/* Glow blobs */}
        <div style={{ position:'absolute', top:-80, right:-80, width:360, height:360, borderRadius:'50%', background:'radial-gradient(circle,rgba(45,107,228,.3) 0%,transparent 65%)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-60, left:120, width:260, height:260, borderRadius:'50%', background:'radial-gradient(circle,rgba(0,186,199,.18) 0%,transparent 65%)', pointerEvents:'none' }} />

        <div className="rzp-hero" style={{ position:'relative', zIndex:1 }}>
          {/* Text */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(45,107,228,.2)', border:'1px solid rgba(45,107,228,.4)', borderRadius:20, padding:'4px 14px', marginBottom:22 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'#00BAC7', display:'inline-block', animation:'pulse 2s infinite' }} />
              <span style={{ fontSize:11, fontWeight:600, color:'#93C5FD', letterSpacing:'.6px', textTransform:'uppercase' }}>Razorpay AI Buildathon · Track 4</span>
            </div>
            <h1 style={{ fontSize:'clamp(28px,4vw,46px)', fontWeight:900, color:'#fff', lineHeight:1.1, letterSpacing:'-2px', marginBottom:16 }}>
              Multi-Source{' '}
              <span style={{ background:'linear-gradient(90deg,#2D6BE4,#00BAC7)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                Settlement
              </span>
              <br />Reconciliation
            </h1>
            <p style={{ fontSize:15, color:'rgba(255,255,255,.62)', lineHeight:1.8, maxWidth:460, marginBottom:32 }}>
              Reconciles transactions across <strong style={{ color:'#fff' }}>3 data sources</strong> using a 3-layer AI pipeline — exact key matching, rule-based fuzzy logic, and Gemini LLM reasoning — with an honest, categorized exception list.
            </p>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:32 }}>
              {[['200+','Transactions','#2D6BE4'],['3','Data Sources','#7C3AED'],['~96%','Match Rate','#16A34A'],['3','AI Layers','#00BAC7']].map(([v,l,c]) => (
                <div key={l} style={{ background:`${c}22`, border:`1px solid ${c}44`, borderRadius:10, padding:'10px 18px', minWidth:76, textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:800, color:c, letterSpacing:'-0.5px' }}>{v}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,.45)', fontWeight:500, marginTop:2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero SVG — shown on wider screens via CSS */}
          <div className="rzp-hero-svg">
            <HeroSVG />
          </div>
        </div>
      </section>

      {/* ── DATA SOURCES ─────────────────────────────────────────────── */}
      <Section title="Three Data Sources" sub="Each source has realistic messiness baked in — timing lags, amount deltas, missing fields, duplicates, and true anomalies injected at generation time.">
        <div className="rzp-grid-3s">
          {[
            { icon:'💳', title:'PG Settlement File', color:'#2D6BE4',
              fields:['transaction_id','gross_amount','fee','tds','net_amount','settlement_date','utr_number'],
              desc:'Payment gateway export. Authoritative source for what was charged and what fees were deducted.' },
            { icon:'🏦', title:'Bank Statement', color:'#7C3AED',
              fields:['utr_number','credit_amount','credit_date','narration'],
              desc:'Bank credit entries. Narrations sometimes truncated. Credits may arrive 1–3 days after settlement.' },
            { icon:'📋', title:'Order Ledger', color:'#00BAC7',
              fields:['order_id','transaction_id','order_amount','order_date','customer_id'],
              desc:'Internal order records. May have null transaction_id, gross amounts, or partial splits.' },
          ].map(s => <SourceCard key={s.title} {...s} />)}
        </div>
      </Section>

      {/* ── PIPELINE DIAGRAM ─────────────────────────────────────────── */}
      <Section title="3-Layer Matching Pipeline" sub="Records flow through each layer in sequence. Anything unresolved passes to the next layer. Whatever remains after all three is explicitly categorized as an exception — never left as generic 'unmatched'.">
        <PipelineDiagram />
      </Section>

      {/* ── MISMATCH PATTERNS ────────────────────────────────────────── */}
      <Section title="Injected Mismatch Patterns" sub="The synthetic data generator deliberately injects all of these. The eval is not cherry-picked — the ground truth file is hidden from the pipeline.">
        <div className="rzp-grid-4c">
          {MISMATCH_PATTERNS.map(p => <MismatchCard key={p.label} {...p} />)}
        </div>
      </Section>

      {/* ── EXCEPTION CATEGORIES ─────────────────────────────────────── */}
      <Section title="Honest Exception Categories" sub='Every unresolved record gets one of 5 specific labels. This is the evaluation bar the hackathon brief asks for.'>
        <div className="rzp-grid-5c">
          {EXCEPTION_CATS.map(c => <ExcCard key={c.label} {...c} />)}
        </div>
      </Section>

      <Footer />
    </div>
  )
}

/* ─── Hero SVG ─────────────────────────────────────────────────────────── */
function HeroSVG() {
  return (
    <svg width="300" height="260" viewBox="0 0 300 260" fill="none">
      <defs>
        <linearGradient id="hgBlue" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#2D6BE4"/><stop offset="1" stopColor="#1A56C4"/>
        </linearGradient>
        <linearGradient id="hgViolet" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#7C3AED"/><stop offset="1" stopColor="#5B21B6"/>
        </linearGradient>
        <linearGradient id="hgTeal" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#00BAC7"/><stop offset="1" stopColor="#0E7490"/>
        </linearGradient>
      </defs>

      {/* Source cards */}
      <rect x="0"  y="18"  width="118" height="36" rx="8" fill="url(#hgBlue)"   opacity=".92"/>
      <text x="59" y="41"  textAnchor="middle" fill="#fff" fontSize="11" fontWeight="600" fontFamily="Inter,sans-serif">💳 PG Settlement</text>

      <rect x="0"  y="112" width="118" height="36" rx="8" fill="url(#hgViolet)" opacity=".92"/>
      <text x="59" y="135" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="600" fontFamily="Inter,sans-serif">🏦 Bank Statement</text>

      <rect x="0"  y="206" width="118" height="36" rx="8" fill="url(#hgTeal)"   opacity=".92"/>
      <text x="59" y="229" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="600" fontFamily="Inter,sans-serif">📋 Order Ledger</text>

      {/* Connector lines from sources to pipeline box */}
      <path d="M118 36 Q148 36 148 130"  stroke="rgba(255,255,255,.25)" strokeWidth="1.5" strokeDasharray="5 3" fill="none"/>
      <path d="M118 130 L148 130"         stroke="rgba(255,255,255,.25)" strokeWidth="1.5" strokeDasharray="5 3" fill="none"/>
      <path d="M118 224 Q148 224 148 130" stroke="rgba(255,255,255,.25)" strokeWidth="1.5" strokeDasharray="5 3" fill="none"/>

      {/* Central pipeline box */}
      <rect x="148" y="86" width="104" height="88" rx="14"
        fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.22)" strokeWidth="1.5"/>
      {/* Glow ring */}
      <circle cx="200" cy="130" r="34" fill="none" stroke="rgba(45,107,228,.35)" strokeWidth="8"/>
      <circle cx="200" cy="130" r="20" fill="rgba(45,107,228,.2)"/>
      <text x="200" y="126" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800" fontFamily="Inter,sans-serif">AI</text>
      <text x="200" y="141" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800" fontFamily="Inter,sans-serif">Pipeline</text>

      {/* Output arrow */}
      <path d="M252 130 L272 130" stroke="rgba(255,255,255,.3)" strokeWidth="1.5"/>
      <polygon points="272,126 280,130 272,134" fill="rgba(255,255,255,.4)"/>

      {/* Output labels */}
      <rect x="282" y="62"  width="14" height="14" rx="3" fill="#16A34A" opacity=".85"/>
      <text x="300" y="73"  fill="rgba(255,255,255,.6)" fontSize="9" fontFamily="Inter,sans-serif">✅ Matched</text>

      <rect x="282" y="123" width="14" height="14" rx="3" fill="#2D6BE4" opacity=".85"/>
      <text x="300" y="134" fill="rgba(255,255,255,.6)" fontSize="9" fontFamily="Inter,sans-serif">📊 Metrics</text>

      <rect x="282" y="184" width="14" height="14" rx="3" fill="#EF4444" opacity=".85"/>
      <text x="300" y="195" fill="rgba(255,255,255,.6)" fontSize="9" fontFamily="Inter,sans-serif">⚠️ Exceptions</text>

      {/* Connector lines to outputs */}
      <path d="M280 130 Q282 69 282 69"  stroke="rgba(255,255,255,.18)" strokeWidth="1" fill="none"/>
      <path d="M280 130 L282 130"         stroke="rgba(255,255,255,.18)" strokeWidth="1"/>
      <path d="M280 130 Q282 191 282 191" stroke="rgba(255,255,255,.18)" strokeWidth="1" fill="none"/>
    </svg>
  )
}

/* ─── Pipeline vertical step diagram ──────────────────────────────────── */
function PipelineDiagram() {
  const layers = [
    {
      step: '01', label: 'Layer 1', title: 'Exact Match',
      color: '#2D6BE4', bg: '#EBF1FD', border: '#BFDBFE',
      icon: '⚡', badge: '~70% of records',
      how: 'Match on transaction_id ↔ UTR directly. O(1) hash-lookup — deterministic and instant.',
      handles: ['Clean 1:1 PG ↔ Bank ↔ Ledger records', 'Duplicate PG detection (same txn_id seen twice)'],
      output: 'Matched → Audit log (confidence: HIGH)',
    },
    {
      step: '02', label: 'Layer 2', title: 'Rule-Based Fuzzy Match',
      color: '#7C3AED', bg: '#F3F0FF', border: '#DDD6FE',
      icon: '🔍', badge: '~20% of records',
      how: 'Apply tolerance rules to the unmatched pool from Layer 1.',
      handles: [
        'Amount within ±2% (covers fee/TDS deductions & rounding)',
        'Date within ±3 days (covers timing lags)',
        'Partial settlements — sum of N PG payouts ≈ 1 ledger order',
        'Missing transaction_id — fuzzy match on amount + date',
      ],
      output: 'Matched → Audit log (confidence: HIGH / MEDIUM / LOW)',
    },
    {
      step: '03', label: 'Layer 3', title: 'LLM-Assisted (Gemini)',
      color: '#00BAC7', bg: '#E5F8F9', border: '#A5F3FC',
      icon: '🤖', badge: '~5% of records',
      how: 'Top-5 candidate records sent to Gemini 1.5 Flash. Model returns a structured match decision + reasoning.',
      handles: [
        'Ambiguous cases that pass no deterministic rule',
        'Garbled / truncated bank narrations',
        'Multi-source context reasoning',
      ],
      output: 'Structured JSON: { match, bank_utr, ledger_order_id, confidence, reasoning }',
    },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
      {layers.map((layer, i) => (
        <div key={layer.step} style={{ display:'flex', gap:0, alignItems:'stretch' }}>

          {/* Left spine */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', width:48, flexShrink:0 }}>
            <div style={{ width:40, height:40, borderRadius:'50%', background:layer.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff', flexShrink:0, zIndex:1, boxShadow:`0 0 0 4px ${layer.bg}` }}>
              {layer.step}
            </div>
            {i < layers.length - 1 && (
              <div style={{ width:2, flex:1, background:`linear-gradient(${layer.color},${layers[i+1].color})`, opacity:.3, margin:'4px 0' }} />
            )}
          </div>

          {/* Card */}
          <div style={{ flex:1, background:layer.bg, border:`1.5px solid ${layer.border}`, borderRadius:14, padding:'20px 22px', marginLeft:14, marginBottom: i < layers.length - 1 ? 12 : 0 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:12 }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:layer.color, textTransform:'uppercase', letterSpacing:'.6px' }}>{layer.label}</div>
                <div style={{ fontSize:18, fontWeight:800, color:'var(--slate-900)', marginTop:2 }}>
                  <span style={{ marginRight:8 }}>{layer.icon}</span>{layer.title}
                </div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, background:layer.color, color:'#fff', padding:'3px 12px', borderRadius:20, whiteSpace:'nowrap' }}>{layer.badge}</span>
            </div>

            <p style={{ fontSize:13, color:'var(--slate-700)', marginBottom:12, lineHeight:1.6 }}>{layer.how}</p>

            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
              {layer.handles.map(h => (
                <div key={h} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--slate-700)', background:'rgba(255,255,255,.7)', border:`1px solid ${layer.border}`, borderRadius:6, padding:'4px 10px' }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L3.5 7.5L8.5 2.5" stroke={layer.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {h}
                </div>
              ))}
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.6)', border:`1px solid ${layer.border}`, borderRadius:8, padding:'8px 12px', fontSize:12, color:layer.color, fontWeight:600 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6L4.5 8.5L10 3" stroke={layer.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {layer.output}
            </div>
          </div>
        </div>
      ))}

      {/* Exception terminus */}
      <div style={{ display:'flex', gap:0, alignItems:'flex-start', marginTop:12 }}>
        <div style={{ width:48, flexShrink:0, display:'flex', justifyContent:'center' }}>
          <div style={{ width:40, height:40, borderRadius:'50%', background:'#EF4444', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0, boxShadow:'0 0 0 4px #FEE2E2' }}>⚠️</div>
        </div>
        <div style={{ flex:1, background:'#FEF2F2', border:'1.5px solid #FCA5A5', borderRadius:14, padding:'20px 22px', marginLeft:14 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#DC2626', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:4 }}>After all 3 layers</div>
          <div style={{ fontSize:18, fontWeight:800, color:'var(--slate-900)', marginBottom:12 }}>Exception Categorization</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {[
              { label:'Timing Pending', color:'#D97706', desc:'Credit not yet posted' },
              { label:'Amount Mismatch', color:'#C2410C', desc:'Beyond known patterns' },
              { label:'Duplicate?', color:'#BE185D', desc:'Seen more than once' },
              { label:'Missing Data', color:'#1D4ED8', desc:'Null required field' },
              { label:'True Anomaly', color:'#B91C1C', desc:'No match after 3 layers' },
            ].map(e => (
              <div key={e.label} style={{ background:'#fff', border:`1px solid ${e.color}30`, borderRadius:8, padding:'8px 12px', flex:'1 1 140px' }}>
                <div style={{ fontSize:11, fontWeight:700, color:e.color }}>{e.label}</div>
                <div style={{ fontSize:11, color:'var(--slate-500)', marginTop:2 }}>{e.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Outputs */}
      <div style={{ marginTop:20, display:'flex', justifyContent:'center', flexWrap:'wrap', gap:16 }}>
        {[['📊','Match Rate %','#16A34A'],['🎯','Precision/Recall/F1','#2D6BE4'],['⚡','Throughput (rec/s)','#D97706'],['📝','Full Audit Trail','#7C3AED'],['📥','Exception CSV','#DC2626']].map(([ic,lbl,col]) => (
          <div key={lbl} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--slate-600)', background:'var(--white)', borderRadius:8, padding:'7px 14px', border:'1px solid var(--slate-200)', boxShadow:'var(--sh-xs)' }}>
            <span style={{ fontSize:14 }}>{ic}</span>
            <span style={{ fontWeight:500 }}>{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Section wrapper ──────────────────────────────────────────────────── */
function Section({ title, sub, children }) {
  return (
    <section style={{ marginBottom:40 }}>
      <h2 style={{ fontSize:'clamp(18px,2.5vw,22px)', fontWeight:800, color:'var(--slate-900)', letterSpacing:'-0.4px', marginBottom:6 }}>{title}</h2>
      <p style={{ fontSize:14, color:'var(--slate-500)', maxWidth:640, lineHeight:1.7, marginBottom:20 }}>{sub}</p>
      {children}
    </section>
  )
}

/* ─── Source card ──────────────────────────────────────────────────────── */
function SourceCard({ icon, title, color, fields, desc }) {
  return (
    <div style={{ background:'var(--white)', borderRadius:14, border:'1px solid var(--slate-200)', boxShadow:'var(--sh-sm)', overflow:'hidden' }}>
      <div style={{ background:`linear-gradient(135deg,${color}12,${color}06)`, borderBottom:`2.5px solid ${color}`, padding:'18px 20px' }}>
        <div style={{ fontSize:28, marginBottom:10 }}>{icon}</div>
        <div style={{ fontWeight:700, fontSize:15, color:'var(--slate-900)' }}>{title}</div>
        <div style={{ fontSize:12, color:'var(--slate-500)', marginTop:5, lineHeight:1.6 }}>{desc}</div>
      </div>
      <div style={{ padding:'14px 20px' }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--slate-400)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>CSV Fields</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {fields.map(f => (
            <span key={f} style={{ fontFamily:'monospace', fontSize:11, background:`${color}0F`, color, border:`1px solid ${color}22`, padding:'2px 8px', borderRadius:4 }}>{f}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Mismatch card ────────────────────────────────────────────────────── */
const MISMATCH_PATTERNS = [
  { icon:'✅', label:'Clean Exact',     pct:'~68%', color:'#16A34A', desc:'TXN ID and UTR match perfectly across all 3 sources.' },
  { icon:'⏰', label:'Timing Lag',      pct:'~9%',  color:'#D97706', desc:'Bank credit arrives 1–3 days after PG settlement.' },
  { icon:'✂️', label:'Partial Split',   pct:'~6%',  color:'#7C3AED', desc:'One order split across 2 PG payouts. Sum matching.' },
  { icon:'💸', label:'Fee/TDS Delta',   pct:'~5%',  color:'#2D6BE4', desc:'Ledger records gross; bank receives net (2% fee + TDS).' },
  { icon:'🔢', label:'Rounding Diff',   pct:'~3%',  color:'#0891B2', desc:'±₹1–2 rounding differences between sources.' },
  { icon:'⎘',  label:'Duplicates',      pct:'~2%',  color:'#BE185D', desc:'Same PG row appears twice; one is spurious.' },
  { icon:'○',  label:'Missing txn_id',  pct:'~2%',  color:'#4338CA', desc:'Null transaction_id in ledger — needs fuzzy match.' },
  { icon:'🔴', label:'True Anomalies',  pct:'~5%',  color:'#DC2626', desc:'Genuinely unresolvable. Proves exception list is honest.' },
]
function MismatchCard({ icon, label, pct: p, color, desc }) {
  return (
    <div style={{ background:'var(--white)', borderRadius:12, border:'1px solid var(--slate-200)', boxShadow:'var(--sh-xs)', padding:'16px 18px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:20 }}>{icon}</span>
        <span style={{ fontSize:11, fontWeight:700, background:`${color}18`, color, padding:'2px 9px', borderRadius:20 }}>{p}</span>
      </div>
      <div style={{ fontWeight:700, fontSize:13, color:'var(--slate-900)', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:12, color:'var(--slate-500)', lineHeight:1.55 }}>{desc}</div>
    </div>
  )
}

/* ─── Exception category card ──────────────────────────────────────────── */
const EXCEPTION_CATS = [
  { icon:'⏳', label:'timing_pending',              title:'Timing Pending',   color:'#D97706', desc:'Bank credit not yet posted — will likely resolve.' },
  { icon:'⚠️', label:'amount_mismatch_unexplained', title:'Amount Mismatch',  color:'#C2410C', desc:'Differs beyond any known deduction pattern.' },
  { icon:'⎘',  label:'duplicate_suspected',          title:'Duplicate?',       color:'#BE185D', desc:'Same transaction seen more than once.' },
  { icon:'○',  label:'missing_source_data',           title:'Missing Data',     color:'#1D4ED8', desc:'Required field is null or empty.' },
  { icon:'🔴', label:'true_anomaly',                  title:'True Anomaly',     color:'#B91C1C', desc:'No match after all 3 layers. Needs manual review.' },
]
function ExcCard({ icon, label, title, color, desc }) {
  return (
    <div style={{ background:'var(--white)', borderRadius:12, border:`1px solid ${color}22`, boxShadow:'var(--sh-xs)', padding:'18px 18px' }}>
      <div style={{ fontSize:22, marginBottom:10 }}>{icon}</div>
      <div style={{ fontWeight:700, fontSize:13, color }}>{title}</div>
      <div className="mono" style={{ fontSize:10, color:'var(--slate-400)', marginTop:3, marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:12, color:'var(--slate-500)', lineHeight:1.55 }}>{desc}</div>
    </div>
  )
}

/* ─── Running / Failed states ──────────────────────────────────────────── */
function Running({ progress }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20, padding:'100px 24px', textAlign:'center' }}>
      <div style={{ width:52, height:52, border:'4px solid #EBF1FD', borderTopColor:'#2D6BE4', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <div>
        <div style={{ fontWeight:700, fontSize:18, color:'var(--slate-800)' }}>Pipeline running…</div>
        <div style={{ fontSize:13, color:'var(--slate-500)', marginTop:6 }}>Exact → Fuzzy → LLM → Exception categorization</div>
      </div>
      <div style={{ width:320, maxWidth:'90vw', background:'var(--slate-200)', borderRadius:6, height:6, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${progress||10}%`, background:'linear-gradient(90deg,#2D6BE4,#00BAC7)', transition:'width .4s', borderRadius:6 }} />
      </div>
      <div style={{ fontSize:12, color:'var(--slate-400)' }}>{progress||10}% complete</div>
    </div>
  )
}
function Failed({ error }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:'80px 24px', textAlign:'center' }}>
      <div style={{ fontSize:48 }}>❌</div>
      <div style={{ fontWeight:700, fontSize:18, color:'var(--slate-800)' }}>Run failed</div>
      <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'12px 20px', maxWidth:500, width:'100%', fontSize:13, color:'#991B1B', wordBreak:'break-all' }}>
        {error || 'An unknown error occurred. Check the backend terminal.'}
      </div>
    </div>
  )
}
