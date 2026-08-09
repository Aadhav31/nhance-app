/**
 * ActiveCallScreen.jsx
 * Full-screen phone-like call overlay used by both OperatorPortal (incoming calls)
 * and OperatorChatPanel (outgoing calls via React Portal).
 *
 * Features:
 *  - Caller avatar with pulse rings
 *  - Live duration counter
 *  - Mute / Hold / Speaker / Record / Add Call / Screen Share controls
 *  - End Call button
 *  - Minimize → floating chip so operator can still use the app
 */
import { useState } from 'react'
import toast from 'react-hot-toast'

// ─────────────────────────────────────────────────────────────────────────────
// Helper: format seconds → MM:SS
const fmt = s =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

// Helper: extract up to 2 initials
const initials = n =>
  (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: individual control button
function CallBtn({ icon, label, active = false, onPress, disabled = false }) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
        padding: '14px 4px',
        background: active ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.07)',
        border: `1px solid ${active ? 'rgba(220,38,38,0.4)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 16,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.15s, border 0.15s',
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
      <span style={{ color: active ? '#fca5a5' : '#64748b', fontSize: 10, fontWeight: 600 }}>
        {label}
      </span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimized floating chip
function CallChip({ peerName, duration, onExpand }) {
  return (
    <>
      <style>{`@keyframes chipBlink{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      <div
        onClick={onExpand}
        style={{
          position: 'fixed', bottom: 90, right: 12, zIndex: 300,
          background: 'linear-gradient(135deg,#15803d,#14532d)',
          borderRadius: 30, padding: '10px 18px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 6px 28px rgba(0,0,0,0.6)', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: '#86efac',
          animation: 'chipBlink 1.4s ease-in-out infinite',
        }} />
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{peerName}</span>
        <span style={{ color: '#bbf7d0', fontSize: 12, fontFamily: 'monospace', letterSpacing: 1 }}>
          {fmt(duration)}
        </span>
        <span style={{ color: '#86efac', fontSize: 14 }}>▲</span>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
export default function ActiveCallScreen({
  peerName   = 'Unknown',
  duration   = 0,     // seconds, updated externally
  muted      = false,
  recording  = false,
  onToggleMute,       // () => void
  onToggleHold,       // (newHeld: boolean) => void
  onRecord,           // () => void
  onEnd,              // () => void | async
}) {
  const [minimized, setMinimized] = useState(false)
  const [held,      setHeld]      = useState(false)
  const [speaker,   setSpeaker]   = useState(false)

  const handleHold = () => {
    const n = !held
    setHeld(n)
    onToggleHold?.(n)
  }

  if (minimized) {
    return <CallChip peerName={peerName} duration={duration} onExpand={() => setMinimized(false)} />
  }

  return (
    <>
      {/* Keyframe for avatar pulse rings */}
      <style>{`
        @keyframes callRingPulse {
          0%   { opacity: .45; transform: scale(1);    }
          50%  { opacity: .15; transform: scale(1.12); }
          100% { opacity: 0;   transform: scale(1.28); }
        }
      `}</style>

      <div style={{
        position: 'fixed', inset: 0,
        background: '#0b1224',    /* slightly lighter than portal bg for depth */
        zIndex: 300,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        overflow: 'hidden',
        /* Safe-area padding for phones with notches */
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 18px 0',
        }}>
          <span style={{ color: '#22c55e', fontSize: 10, fontWeight: 800, letterSpacing: 2 }}>
            ● LIVE CALL
          </span>
          <button
            onClick={() => setMinimized(true)}
            style={{
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20, padding: '6px 16px', color: '#94a3b8', fontSize: 11,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            ▾ Minimize
          </button>
        </div>

        {/* ── Avatar with pulse rings ─────────────────────────────────────── */}
        <div style={{ position: 'relative', marginTop: 52, width: 140, height: 140 }}>
          {/* Outer ring */}
          <div style={{
            position: 'absolute', inset: -22, borderRadius: '50%',
            background: 'rgba(37,99,235,0.1)',
            animation: 'callRingPulse 2.4s ease-out 0.5s infinite',
          }} />
          {/* Inner ring */}
          <div style={{
            position: 'absolute', inset: -10, borderRadius: '50%',
            background: 'rgba(37,99,235,0.15)',
            animation: 'callRingPulse 2.4s ease-out 0s infinite',
          }} />
          {/* Avatar circle */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'linear-gradient(135deg,#2563eb,#7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, fontWeight: 800, color: '#fff',
            boxShadow: '0 0 40px rgba(37,99,235,0.45)',
          }}>
            {initials(peerName)}
          </div>
        </div>

        {/* ── Name + status ───────────────────────────────────────────────── */}
        <p style={{ color: '#f1f5f9', fontSize: 22, fontWeight: 700, marginTop: 22, letterSpacing: -0.4 }}>
          {peerName}
        </p>
        <p style={{
          color: held ? '#f59e0b' : '#22c55e',
          fontSize: 13, marginTop: 6, fontFamily: 'monospace', letterSpacing: 2,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {held ? '⏸  On Hold' : fmt(duration)}
        </p>

        {/* ── Controls (2 rows × 3) ───────────────────────────────────────── */}
        <div style={{ width: '100%', padding: '0 20px', marginTop: 44 }}>
          {/* Row 1 */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <CallBtn
              icon={muted ? '🔇' : '🎙️'}
              label={muted ? 'Unmute' : 'Mute'}
              active={muted}
              onPress={onToggleMute}
            />
            <CallBtn
              icon={held ? '▶️' : '⏸'}
              label={held ? 'Resume' : 'Hold'}
              active={held}
              onPress={handleHold}
            />
            <CallBtn
              icon={speaker ? '🔊' : '🔈'}
              label="Speaker"
              active={speaker}
              onPress={() => {
                setSpeaker(s => !s)
                toast('Use your device volume buttons to control speaker')
              }}
            />
          </div>
          {/* Row 2 */}
          <div style={{ display: 'flex', gap: 10 }}>
            <CallBtn
              icon={recording ? '⏹' : '⏺'}
              label={recording ? 'Stop Rec' : 'Record'}
              active={recording}
              onPress={onRecord}
            />
            <CallBtn
              icon="➕"
              label="Add Call"
              onPress={() => toast('Conference calling coming soon')}
            />
            <CallBtn
              icon="📺"
              label="Screen"
              onPress={() => toast('Screen share not available on mobile WebView')}
            />
          </div>
        </div>

        {/* ── End Call button ──────────────────────────────────────────────── */}
        <button
          onClick={onEnd}
          style={{
            marginTop: 40,
            background: 'linear-gradient(135deg,#dc2626,#b91c1c)',
            border: 'none', borderRadius: 40,
            padding: '18px 72px',
            color: '#fff', fontWeight: 700, fontSize: 18,
            cursor: 'pointer',
            boxShadow: '0 8px 32px rgba(220,38,38,0.4)',
            display: 'flex', alignItems: 'center', gap: 12,
            transition: 'transform 0.1s',
          }}
          onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
          onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <span style={{ fontSize: 20 }}>📵</span> End Call
        </button>

      </div>
    </>
  )
}
