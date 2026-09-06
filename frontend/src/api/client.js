/**
 * API client for ReconAgent backend.
 *
 * In development:  Vite's proxy forwards /reconcile → http://localhost:8000
 * In production:   Vercel rewrites /reconcile/* → Railway backend (server-side proxy)
 *                  No VITE_API_BASE needed — browser only talks to Vercel.
 */

// v2 — production build with VITE_API_BASE
const BASE_URL = import.meta.env.VITE_API_BASE || ''
const BASE     = `${BASE_URL}/reconcile`

async function _json(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}

export async function startRun(skipLlm = false) {
  const res = await fetch(`${BASE}/run?skip_llm=${skipLlm}`, { method: 'POST' })
  return _json(res)
}

export async function getStatus(runId) {
  const res = await fetch(`${BASE}/${runId}/status`)
  return _json(res)
}

export async function getResults(runId) {
  const res = await fetch(`${BASE}/${runId}/results`)
  return _json(res)
}

export async function getRecord(runId, recordId) {
  const res = await fetch(`${BASE}/${runId}/record/${recordId}`)
  return _json(res)
}

export function exportUrl(runId) {
  return `${BASE}/${runId}/export`
}
