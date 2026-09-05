import React, { useState, useCallback, useRef } from 'react'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import ExceptionsPage from './pages/ExceptionsPage'
import AuditModal from './components/AuditModal'
import { startRun, getStatus, getResults } from './api/client'

const POLL_INTERVAL = 1000  // ms

export default function App() {
  const [tab, setTab]           = useState('dashboard')
  const [runState, setRunState] = useState({
    status:   'idle',   // idle | running | completed | failed
    progress: 0,
    runId:    null,
    results:  null,
    error:    null,
  })
  const [auditRecord, setAuditRecord] = useState(null)
  const [skipLlm, setSkipLlm]         = useState(true)
  const pollRef = useRef(null)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const handleRun = useCallback(async () => {
    stopPolling()
    setRunState({ status: 'running', progress: 5, runId: null, results: null, error: null })

    try {
      const { run_id } = await startRun(skipLlm)
      setRunState(s => ({ ...s, runId: run_id }))

      // Also poll immediately once (run may be done in <1s)
      const pollOnce = async () => {
        try {
          const st = await getStatus(run_id)
          // Keep status as 'running' until we have full results in hand
          setRunState(s => ({ ...s, progress: st.progress }))

          if (st.status === 'completed') {
            stopPolling()
            // Fetch full results BEFORE flipping status to 'completed'
            const full = await getResults(run_id)
            setRunState({
              status:   'completed',
              progress: 100,
              runId:    run_id,
              results:  full,
              error:    null,
            })
          } else if (st.status === 'failed') {
            stopPolling()
            setRunState(s => ({ ...s, status: 'failed', error: st.message || 'Run failed' }))
          }
        } catch (e) {
          stopPolling()
          setRunState(s => ({ ...s, status: 'failed', error: String(e?.message || e) }))
        }
      }

      // Start polling
      pollRef.current = setInterval(pollOnce, POLL_INTERVAL)
      // Fire once immediately after a short delay so fast runs are caught quickly
      setTimeout(pollOnce, 300)

    } catch (e) {
      setRunState({ status: 'failed', progress: 0, runId: null, results: null, error: String(e?.message || e) })
    }
  }, [skipLlm])

  const exceptions = runState.results?.results?.filter(r => r.status === 'exception') ?? []

  return (
    <div style={{ minHeight: '100vh', background: 'var(--slate-50)' }}>
      <Header
        tab={tab} setTab={setTab}
        runState={runState}
        onRun={handleRun}
        skipLlm={skipLlm} setSkipLlm={setSkipLlm}
        exceptionsCount={exceptions.length}
      />

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px 48px' }}>
        {tab === 'dashboard' && (
          <Dashboard
            runState={runState}
            onOpenAudit={setAuditRecord}
            onRun={handleRun}
          />
        )}
        {tab === 'exceptions' && (
          <ExceptionsPage
            exceptions={exceptions}
            runId={runState.runId}
            onOpenAudit={setAuditRecord}
          />
        )}
      </main>

      {auditRecord && (
        <AuditModal record={auditRecord} onClose={() => setAuditRecord(null)} />
      )}
    </div>
  )
}
