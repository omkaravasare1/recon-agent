import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(err) {
    return { error: err }
  }
  componentDidCatch(err, info) {
    console.error('[ReconAgent] Render error:', err, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', gap: 16, padding: 32,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#1e293b' }}>Something went wrong</div>
          <div style={{
            background: '#fee2e2', color: '#991b1b', padding: '12px 20px',
            borderRadius: 8, fontSize: 13, maxWidth: 600, wordBreak: 'break-all',
          }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            style={{
              padding: '8px 20px', borderRadius: 8, background: '#4f46e5',
              color: '#fff', fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
