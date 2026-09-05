import React from 'react'

export default function Footer() {
  return (
    <footer style={{
      background: 'var(--slate-900)',
      borderTop: '1px solid rgba(255,255,255,.07)',
      marginTop: 48,
    }}>
      <div style={{
        maxWidth: 1320, margin: '0 auto',
        padding: '40px 28px 32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        textAlign: 'center',
      }}>
        {/* Logo row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'linear-gradient(135deg, #2D6BE4 0%, #00BAC7 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 13, color: '#fff',
          }}>R</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#fff', letterSpacing: '-0.3px' }}>ReconAgent</span>
        </div>

        {/* Hackathon line */}
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', lineHeight: 1.7 }}>
          Made with{' '}
          <span style={{ color: '#F87171', fontSize: 15 }}>❤️</span>
          {' '}for the{' '}
          <span style={{
            color: '#fff', fontWeight: 600,
            background: 'linear-gradient(90deg, #2D6BE4, #00BAC7)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Razorpay AI Buildathon
          </span>
          {' '}· Track 4: AI Finance Controller
        </div>

        {/* Divider */}
        <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,.1)' }} />

        {/* Author */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,.6)' }}>
            by{' '}
            <span style={{ color: '#fff', fontWeight: 700 }}>Omkar Avasare</span>
          </div>

          {/* LinkedIn */}
          <a
            href="https://www.linkedin.com/in/omkar-avasare"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '6px 16px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,.15)',
              color: 'rgba(255,255,255,.7)',
              fontSize: 12, fontWeight: 500,
              transition: 'all .2s',
              textDecoration: 'none',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#0A66C2'
              e.currentTarget.style.borderColor = '#0A66C2'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,.15)'
              e.currentTarget.style.color = 'rgba(255,255,255,.7)'
            }}
          >
            {/* LinkedIn icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            linkedin.com/in/omkar-avasare
          </a>
        </div>

        {/* Bottom line */}
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.2)', marginTop: 4 }}>
          Built with FastAPI · React · Google Gemini · Python 3.14
        </div>
      </div>
    </footer>
  )
}
