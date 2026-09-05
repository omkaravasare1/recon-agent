import React from 'react'

export default function Header({ tab, setTab, runState, onRun, skipLlm, setSkipLlm, exceptionsCount }) {
  const running = runState.status === 'running'

  return (
    <header style={{
      background: 'var(--slate-900)',
      borderBottom: '1px solid rgba(255,255,255,.08)',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1320, margin: '0 auto', padding: '0 28px',
        display: 'flex', alignItems: 'center', height: 58, gap: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 36, flexShrink: 0 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(135deg, #2D6BE4 0%, #00BAC7 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 14, color: '#fff', letterSpacing: '-1px',
          }}>R</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#fff', letterSpacing: '-0.3px', lineHeight: 1 }}>ReconAgent</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>Settlement Reconciliation</div>
          </div>
        </div>

        {/* Nav tabs */}
        <nav style={{ display: 'flex', gap: 2, flex: 1 }}>
          {[
            { key: 'dashboard',  label: 'Dashboard' },
            { key: 'exceptions', label: 'Exceptions', badge: exceptionsCount },
          ].map(({ key, label, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none',
                background: tab === key ? 'rgba(45,107,228,.35)' : 'transparent',
                color: tab === key ? '#fff' : 'rgba(255,255,255,.5)',
                fontWeight: tab === key ? 600 : 400,
                fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all .15s',
              }}
            >
              {label}
              {badge > 0 && (
                <span style={{
                  background: '#EF4444', color: '#fff',
                  fontSize: 10, fontWeight: 700, minWidth: 17, height: 17,
                  borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                }}>{badge}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 'auto' }}>
          {/* Skip LLM toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', userSelect: 'none' }}>
            <Toggle value={skipLlm} onChange={() => setSkipLlm(v => !v)} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>Skip LLM</span>
          </label>

          {/* Status pill */}
          {runState.status === 'completed' && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(22,163,74,.25)', color: '#4ade80' }}>
              ✓ Completed
            </span>
          )}
          {runState.status === 'failed' && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(220,38,38,.25)', color: '#f87171' }}>
              ✗ Failed
            </span>
          )}

          {/* Run button */}
          <button
            onClick={onRun}
            disabled={running}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: running
                ? 'rgba(255,255,255,.1)'
                : 'linear-gradient(135deg, #2D6BE4 0%, #1A56C4 100%)',
              color: running ? 'rgba(255,255,255,.4)' : '#fff',
              fontWeight: 600, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: running ? 'none' : '0 2px 10px rgba(45,107,228,.4)',
              transition: 'all .15s', flexShrink: 0,
            }}
          >
            {running ? (
              <>
                <span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: 'rgba(255,255,255,.7)', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />
                Running…
              </>
            ) : '▶ Run Reconciliation'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {running && (
        <div style={{ height: 2, background: 'rgba(255,255,255,.1)' }}>
          <div style={{
            height: '100%',
            width: `${runState.progress || 10}%`,
            background: 'linear-gradient(90deg, #2D6BE4, #00BAC7)',
            transition: 'width .4s ease',
          }} />
        </div>
      )}
    </header>
  )
}

function Toggle({ value, onChange }) {
  return (
    <div
      onClick={onChange}
      role="checkbox" aria-checked={value} tabIndex={0}
      onKeyDown={e => e.key === ' ' && onChange()}
      style={{
        width: 32, height: 18, borderRadius: 9, position: 'relative', cursor: 'pointer',
        background: value ? '#2D6BE4' : 'rgba(255,255,255,.2)',
        transition: 'background .2s', flexShrink: 0, outline: 'none',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: value ? 14 : 2,
        width: 14, height: 14, borderRadius: '50%',
        background: '#fff', transition: 'left .18s',
        boxShadow: '0 1px 3px rgba(0,0,0,.3)',
      }} />
    </div>
  )
}
