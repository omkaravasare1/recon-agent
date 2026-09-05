import React, { useState, useMemo } from 'react'
import StatusBadge from './StatusBadge'

const fmt = v =>
  v != null
    ? `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'

/* ── Fixed bug: always pass sortState; non-sortable columns just skip the indicator ── */
function Th({ children, sortKey, currentSort, onSort, align = 'left', style }) {
  // BUG FIX: currentSort may be undefined for columns that don't pass it — guard here
  const active = currentSort != null && sortKey != null && currentSort.key === sortKey
  const dir    = active ? currentSort.dir : null

  return (
    <th
      onClick={() => sortKey && onSort && onSort(sortKey)}
      style={{
        padding: '10px 14px',
        textAlign: align,
        fontSize: 11,
        fontWeight: 600,
        color: active ? 'var(--rzp-blue)' : 'var(--slate-500)',
        textTransform: 'uppercase',
        letterSpacing: '.5px',
        background: '#F8FAFD',
        borderBottom: '1px solid var(--slate-200)',
        cursor: sortKey ? 'pointer' : 'default',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
      {active && <span style={{ marginLeft: 3, opacity: .7 }}>{dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )
}

function Td({ children, mono, align = 'left', style }) {
  return (
    <td style={{
      padding: '10px 14px',
      borderBottom: '1px solid var(--slate-100)',
      fontSize: 13,
      verticalAlign: 'middle',
      textAlign: align,
      ...style,
    }}>
      {mono ? <span className="mono">{children}</span> : children}
    </td>
  )
}

function FilterPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 14px', borderRadius: 20,
        border: active ? '1.5px solid var(--rzp-blue)' : '1.5px solid var(--slate-200)',
        background: active ? 'var(--rzp-blue-light)' : 'var(--white)',
        color: active ? 'var(--rzp-blue)' : 'var(--slate-600)',
        fontSize: 12, fontWeight: active ? 600 : 400,
        cursor: 'pointer', transition: 'all .15s',
      }}
    >
      {label}
    </button>
  )
}

const PAGE_SIZE = 20

export default function ResultsTable({ results, onOpenAudit }) {
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState('all')
  const [layerF,  setLayerF]  = useState('all')
  const [sort,    setSort]    = useState({ key: null, dir: 'asc' })
  const [page,    setPage]    = useState(1)

  const handleSort = key => {
    setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
    setPage(1)
  }

  const filtered = useMemo(() => {
    let rows = results || []

    if (filter === 'matched')   rows = rows.filter(r => r.status === 'matched')
    if (filter === 'exception') rows = rows.filter(r => r.status === 'exception')
    if (filter === 'exact')     rows = rows.filter(r => r.layer === 'exact')
    if (filter === 'fuzzy')     rows = rows.filter(r => r.layer === 'fuzzy')
    if (filter === 'llm')       rows = rows.filter(r => r.layer === 'llm')

    if (layerF !== 'all') {
      rows = rows.filter(r => r.layer === layerF || (layerF === 'exception' && r.status === 'exception'))
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.pg_txn_ids?.some(x => x.toLowerCase().includes(q)) ||
        r.bank_utrs?.some(x => x.toLowerCase().includes(q)) ||
        r.ledger_order_ids?.some(x => x.toLowerCase().includes(q)) ||
        r.exception_category?.includes(q) ||
        r.exception_reason?.toLowerCase().includes(q)
      )
    }

    if (sort.key) {
      rows = [...rows].sort((a, b) => {
        let va = a[sort.key]
        let vb = b[sort.key]
        if (va == null) va = sort.dir === 'asc' ? Infinity : -Infinity
        if (vb == null) vb = sort.dir === 'asc' ? Infinity : -Infinity
        const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb))
        return sort.dir === 'asc' ? cmp : -cmp
      })
    }

    return rows
  }, [results, search, filter, layerF, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const rowStyle = r => {
    if (r.status === 'exception') return { background: '#FFF8F8' }
    if (r.confidence === 'low')   return { background: '#FFFBF0' }
    return { background: 'var(--white)' }
  }

  return (
    <div style={{
      background: 'var(--white)',
      borderRadius: 'var(--r-lg)',
      border: '1px solid var(--slate-200)',
      boxShadow: 'var(--sh-sm)',
      overflow: 'hidden',
    }}>
      {/* ── Toolbar ── */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--slate-200)',
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
        background: '#FAFBFD',
      }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="🔍  Search by txn ID, UTR, order ID, reason…"
          style={{
            flex: '1 1 240px', minWidth: 200,
            padding: '7px 12px', borderRadius: 8,
            border: '1px solid var(--slate-200)',
            fontSize: 13, outline: 'none',
            background: 'var(--white)',
            color: 'var(--slate-800)',
          }}
        />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { v: 'all',       l: 'All' },
            { v: 'matched',   l: 'Matched' },
            { v: 'exception', l: 'Exceptions' },
            { v: 'exact',     l: 'Exact' },
            { v: 'fuzzy',     l: 'Fuzzy' },
            { v: 'llm',       l: 'LLM' },
          ].map(({ v, l }) => (
            <FilterPill key={v} label={l} active={filter === v} onClick={() => { setFilter(v); setPage(1) }} />
          ))}
        </div>

        <span style={{ fontSize: 12, color: 'var(--slate-400)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          {filtered.length} of {results?.length || 0} rows
        </span>
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th sortKey="status"             currentSort={sort} onSort={handleSort}>Status</Th>
              <Th sortKey="layer"              currentSort={sort} onSort={handleSort}>Layer</Th>
              <Th sortKey="confidence"         currentSort={sort} onSort={handleSort}>Conf.</Th>
              <Th>PG Transaction ID</Th>
              <Th>Bank UTR</Th>
              <Th>Order ID</Th>
              <Th sortKey="pg_net"             currentSort={sort} onSort={handleSort} align="right">PG Net</Th>
              <Th sortKey="bank_credit"        currentSort={sort} onSort={handleSort} align="right">Bank Cr.</Th>
              <Th sortKey="pg_date"            currentSort={sort} onSort={handleSort}>PG Date</Th>
              <Th sortKey="exception_category" currentSort={sort} onSort={handleSort}>Exception</Th>
              <Th>Audit</Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: 40, textAlign: 'center', color: 'var(--slate-400)', fontSize: 13 }}>
                  {results?.length
                    ? 'No records match your filters.'
                    : 'Run reconciliation to populate this table.'}
                </td>
              </tr>
            ) : pageRows.map(r => (
              <tr
                key={r.record_id}
                style={{ ...rowStyle(r), transition: 'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F5F7FF'}
                onMouseLeave={e => e.currentTarget.style.background = rowStyle(r).background}
              >
                <Td><StatusBadge type={r.status} /></Td>
                <Td>{r.layer ? <StatusBadge type={r.layer} /> : <span style={{ color: 'var(--slate-300)' }}>—</span>}</Td>
                <Td>{r.confidence ? <StatusBadge type={r.confidence} /> : <span style={{ color: 'var(--slate-300)' }}>—</span>}</Td>
                <Td mono>{r.pg_txn_ids?.[0] || '—'}{r.pg_txn_ids?.length > 1 ? ` +${r.pg_txn_ids.length - 1}` : ''}</Td>
                <Td mono>{r.bank_utrs?.[0] || '—'}</Td>
                <Td mono>{r.ledger_order_ids?.[0] || '—'}</Td>
                <Td align="right" mono>{fmt(r.pg_net)}</Td>
                <Td align="right" mono>
                  <AmountDelta pg={r.pg_net} bank={r.bank_credit} />
                </Td>
                <Td mono>{r.pg_date || '—'}</Td>
                <Td>
                  {r.exception_category
                    ? <StatusBadge type={r.exception_category} />
                    : <span style={{ color: 'var(--slate-200)' }}>—</span>}
                </Td>
                <Td>
                  <button
                    onClick={() => onOpenAudit(r)}
                    style={{
                      padding: '4px 12px', borderRadius: 6,
                      fontSize: 11, fontWeight: 600,
                      background: 'var(--rzp-blue-light)',
                      color: 'var(--rzp-blue)',
                      border: '1px solid #C7D9F9',
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    View →
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{
          padding: '12px 18px', borderTop: '1px solid var(--slate-200)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: 'var(--slate-500)',
          background: '#FAFBFD',
        }}>
          <PgBtn onClick={() => setPage(1)} disabled={safePage === 1}>«</PgBtn>
          <PgBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>‹</PgBtn>
          <span style={{ flex: 1, textAlign: 'center' }}>
            Page <strong>{safePage}</strong> of {totalPages}
            <span style={{ color: 'var(--slate-400)', marginLeft: 8 }}>
              ({(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length})
            </span>
          </span>
          <PgBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>›</PgBtn>
          <PgBtn onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>»</PgBtn>
        </div>
      )}
    </div>
  )
}

function PgBtn({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '4px 10px', borderRadius: 6,
        background: 'var(--white)', border: '1px solid var(--slate-200)',
        fontSize: 13, color: 'var(--slate-600)', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function AmountDelta({ pg, bank }) {
  if (pg == null || bank == null) return <span style={{ color: 'var(--slate-400)' }}>{fmt(bank)}</span>
  const delta = bank - pg
  const absPct = Math.abs(delta / pg) * 100
  if (absPct < 0.01) return <span style={{ color: 'var(--green-600)' }}>{fmt(bank)}</span>
  const color = absPct < 2 ? 'var(--amber-700)' : 'var(--red-700)'
  return (
    <span title={`Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} (${absPct.toFixed(2)}%)`}>
      <span style={{ color }}>{fmt(bank)}</span>
      <span style={{ fontSize: 10, color, marginLeft: 3, opacity: .7 }}>
        {delta >= 0 ? '▲' : '▼'}{absPct.toFixed(1)}%
      </span>
    </span>
  )
}
