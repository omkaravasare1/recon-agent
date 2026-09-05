import React from 'react'

const CONFIGS = {
  matched:   { bg: '#dcfce7', color: '#15803d', label: 'Matched' },
  exception: { bg: '#fee2e2', color: '#b91c1c', label: 'Exception' },
  exact:     { bg: '#dbeafe', color: '#1d4ed8', label: 'Exact' },
  fuzzy:     { bg: '#ede9fe', color: '#6d28d9', label: 'Fuzzy' },
  llm:       { bg: '#fce7f3', color: '#be185d', label: 'LLM' },
  high:      { bg: '#dcfce7', color: '#15803d', label: 'High' },
  medium:    { bg: '#fef3c7', color: '#b45309', label: 'Medium' },
  low:       { bg: '#fee2e2', color: '#b91c1c', label: 'Low' },
  timing_pending:              { bg: '#fef3c7', color: '#b45309',  label: 'Timing Pending' },
  amount_mismatch_unexplained: { bg: '#ffedd5', color: '#c2410c',  label: 'Amount Mismatch' },
  duplicate_suspected:         { bg: '#fce7f3', color: '#be185d',  label: 'Duplicate?' },
  missing_source_data:         { bg: '#dbeafe', color: '#1d4ed8',  label: 'Missing Data' },
  true_anomaly:                { bg: '#fee2e2', color: '#991b1b',  label: 'True Anomaly' },
}

export default function StatusBadge({ type, size = 'sm' }) {
  const cfg = CONFIGS[type] || { bg: 'var(--slate-100)', color: 'var(--slate-500)', label: type || '—' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: size === 'md' ? '4px 12px' : '2px 8px',
      borderRadius: 20,
      fontSize: size === 'md' ? 12 : 11,
      fontWeight: 600,
      background: cfg.bg,
      color: cfg.color,
      whiteSpace: 'nowrap',
      letterSpacing: '.1px',
    }}>
      {cfg.label}
    </span>
  )
}
