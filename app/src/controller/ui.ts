/**
 * Controller UI helpers — DOM updates for the phone screen.
 */

import { PLAYER_COLORS, type PlayerColor, type SensorFrame } from '@waggle/kit'

let selectedColor: PlayerColor = PLAYER_COLORS[0]!

export function initSetupScreen(onJoin: (name: string, color: PlayerColor) => void): void {
  const colorPicker = document.getElementById('color-picker')!

  // Build color swatches
  for (const c of PLAYER_COLORS) {
    const swatch = document.createElement('button')
    swatch.className = 'color-swatch' + (c === selectedColor ? ' selected' : '')
    swatch.style.background = c
    swatch.setAttribute('aria-label', c)
    swatch.addEventListener('click', () => {
      selectedColor = c
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'))
      swatch.classList.add('selected')
    })
    colorPicker.appendChild(swatch)
  }

  const joinBtn = document.getElementById('join-btn') as HTMLButtonElement
  joinBtn.addEventListener('click', () => {
    const nameInput = document.getElementById('name-input') as HTMLInputElement
    const name = nameInput.value.trim() || 'Ghost'
    onJoin(name, selectedColor)
  })
}

export function showActiveScreen(name: string, color: PlayerColor, roomId: string): void {
  document.getElementById('setup-screen')!.classList.add('hidden')
  document.getElementById('active-screen')!.classList.remove('hidden')

  ;(document.getElementById('banner-dot') as HTMLElement).style.background = color
  ;(document.getElementById('banner-name') as HTMLElement).textContent = name
  ;(document.getElementById('banner-room') as HTMLElement).textContent = roomId
}

export function showPermissionOverlay(visible: boolean): void {
  const overlay = document.getElementById('permission-overlay')!
  if (visible) {
    overlay.classList.remove('hidden')
  } else {
    overlay.classList.add('hidden')
  }
}

export function setConnStatus(state: 'connected' | 'disconnected' | 'connecting'): void {
  const el = document.getElementById('conn-status')!
  el.className = `conn-status ${state}`
  el.textContent =
    state === 'connected' ? 'Connected' :
    state === 'disconnected' ? 'Disconnected' :
    'Connecting…'
}

let flashTimeout: ReturnType<typeof setTimeout> | null = null

export function flashGesture(label: string, color = '#7c3aed'): void {
  const el = document.getElementById('gesture-flash')!
  el.textContent = label
  el.style.color = color
  el.classList.add('visible')
  if (flashTimeout) clearTimeout(flashTimeout)
  flashTimeout = setTimeout(() => el.classList.remove('visible'), 600)
}

/** Draw a tilt visualiser on the motion canvas. */
export function renderTiltCanvas(pitch: number, roll: number): void {
  const canvas = document.getElementById('motion-canvas') as HTMLCanvasElement
  if (!canvas) return

  const dpr = devicePixelRatio || 1
  if (canvas.width !== canvas.clientWidth * dpr) {
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
  }

  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  const cx = cw / 2
  const cy = ch / 2

  // ── Background ──
  ctx.fillStyle = '#07071a'
  ctx.fillRect(0, 0, cw, ch)

  // ── Radial vignette from center ──
  const vignette = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(cw, ch) * 0.7)
  vignette.addColorStop(0, 'rgba(124,58,237,0.07)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, cw, ch)

  // ── Grid lines ──
  ctx.strokeStyle = 'rgba(124,58,237,0.12)'
  ctx.lineWidth = 1
  const gridStep = 60
  for (let x = cx % gridStep; x < cw; x += gridStep) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke()
  }
  for (let y = cy % gridStep; y < ch; y += gridStep) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke()
  }

  // ── Crosshair ──
  ctx.strokeStyle = 'rgba(124,58,237,0.3)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 8])
  ctx.beginPath()
  ctx.moveTo(cx, 0); ctx.lineTo(cx, ch)
  ctx.moveTo(0, cy); ctx.lineTo(cw, cy)
  ctx.stroke()
  ctx.setLineDash([])

  // ── Target ring at center ──
  ctx.strokeStyle = 'rgba(249,115,22,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, 48, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(249,115,22,0.07)'
  ctx.beginPath()
  ctx.arc(cx, cy, 96, 0, Math.PI * 2)
  ctx.stroke()

  // ── Ball position: map pitch/roll (-90..90) → canvas ──
  const RANGE = 45
  const bx = cx + (roll / RANGE) * (cx - 40)
  const by = cy + (pitch / RANGE) * (cy - 40)

  // Trail line from center to ball
  const trail = ctx.createLinearGradient(cx, cy, bx, by)
  trail.addColorStop(0, 'rgba(124,58,237,0)')
  trail.addColorStop(1, 'rgba(168,85,247,0.35)')
  ctx.strokeStyle = trail
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(bx, by)
  ctx.stroke()

  // Outer glow
  const glow = ctx.createRadialGradient(bx, by, 0, bx, by, 48)
  glow.addColorStop(0, 'rgba(168,85,247,0.35)')
  glow.addColorStop(0.5, 'rgba(124,58,237,0.12)')
  glow.addColorStop(1, 'rgba(124,58,237,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(bx, by, 48, 0, Math.PI * 2)
  ctx.fill()

  // Core orb gradient
  const orb = ctx.createRadialGradient(bx - 5, by - 5, 2, bx, by, 22)
  orb.addColorStop(0, '#e9d5ff')
  orb.addColorStop(0.3, '#a855f7')
  orb.addColorStop(0.7, '#7c3aed')
  orb.addColorStop(1, '#4c1d95')
  ctx.fillStyle = orb
  ctx.beginPath()
  ctx.arc(bx, by, 22, 0, Math.PI * 2)
  ctx.fill()

  // Specular highlight
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.beginPath()
  ctx.arc(bx - 6, by - 6, 6, 0, Math.PI * 2)
  ctx.fill()
}

/** Draw integrated gyro path during Hex Duel drawing phase. */
export function renderGyroPathCanvas(frames: SensorFrame[]): void {
  const canvas = document.getElementById('motion-canvas') as HTMLCanvasElement
  if (!canvas) return

  const dpr = devicePixelRatio || 1
  if (canvas.width !== canvas.clientWidth * dpr) {
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
  }

  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  const cx = cw / 2
  const cy = ch / 2

  ctx.fillStyle = '#07071a'
  ctx.fillRect(0, 0, cw, ch)

  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(cw, ch) * 0.6)
  bg.addColorStop(0, 'rgba(249,115,22,0.08)')
  bg.addColorStop(1, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, cw, ch)

  ctx.fillStyle = 'rgba(249,115,22,0.6)'
  ctx.font = '500 11px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('DRAW A SHAPE · FLICK TO CAST', cx, 20)

  if (frames.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.font = '600 14px Inter, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('Move your phone to draw', cx, cy)
    return
  }

  // Integrate gyro into a 2D path
  const scale = Math.min(cw, ch) * 0.35
  let gx = 0, gy = 0
  const points: [number, number][] = [[0, 0]]
  for (let i = 1; i < frames.length; i++) {
    const dt = (frames[i]!.t - frames[i - 1]!.t) / 1000
    gx += frames[i]!.gyro[0]! * dt
    gy += frames[i]!.gyro[1]! * dt
    points.push([gx, gy])
  }

  const maxR = Math.max(...points.map(([x, y]) => Math.hypot(x, y)), 0.001)
  const factor = scale / maxR

  for (let i = 1; i < points.length; i++) {
    const t = i / points.length
    ctx.strokeStyle = `rgba(168,85,247,${0.3 + t * 0.7})`
    ctx.lineWidth = 2 + t * 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx + points[i - 1]![0]! * factor, cy + points[i - 1]![1]! * factor)
    ctx.lineTo(cx + points[i]![0]! * factor, cy + points[i]![1]! * factor)
    ctx.stroke()
  }

  // Current point marker
  const last = points[points.length - 1]!
  const lx = cx + last[0]! * factor
  const ly = cy + last[1]! * factor
  ctx.shadowBlur = 20
  ctx.shadowColor = '#f97316'
  ctx.fillStyle = '#fb923c'
  ctx.beginPath()
  ctx.arc(lx, ly, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
}

/** Big prompt display for Cauldron Chaos (null = show waiting state). */
export function renderPromptCanvas(prompt: string | null): void {
  const canvas = document.getElementById('motion-canvas') as HTMLCanvasElement
  if (!canvas) return

  const dpr = devicePixelRatio || 1
  if (canvas.width !== canvas.clientWidth * dpr) {
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
  }

  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const W = canvas.clientWidth
  const H = canvas.clientHeight
  const cx = W / 2
  const cy = H / 2

  ctx.fillStyle = '#07071a'
  ctx.fillRect(0, 0, W, H)

  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.65)
  if (prompt) {
    const color = prompt === 'shake' ? '#f97316' : prompt === 'flick' ? '#7c3aed' : '#06b6d4'
    bg.addColorStop(0, `${color}22`)
    bg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    ctx.fillStyle = color
    ctx.shadowBlur = 40
    ctx.shadowColor = color
    ctx.font = '900 3.2rem "Space Grotesk", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const label = prompt === 'shake' ? '📳 SHAKE!' : prompt === 'flick' ? '👋 FLICK!' : '🌀 TWIST!'
    ctx.fillText(label, cx, cy - 10)
    ctx.shadowBlur = 0
    ctx.fillStyle = `${color}88`
    ctx.font = '500 .85rem Inter, sans-serif'
    ctx.fillText('Do it now!', cx, cy + 42)
  } else {
    bg.addColorStop(0, 'rgba(124,58,237,0.06)')
    bg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.font = '600 1rem Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🧪 Waiting for prompt…', cx, cy)
  }
}

/** Shake count display for Phantom Frequency. */
export function renderShakeCanvas(target: number, myCount: number, phase: string): void {
  const canvas = document.getElementById('motion-canvas') as HTMLCanvasElement
  if (!canvas) return

  const dpr = devicePixelRatio || 1
  if (canvas.width !== canvas.clientWidth * dpr) {
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
  }

  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const W = canvas.clientWidth
  const H = canvas.clientHeight
  const cx = W / 2
  const cy = H / 2

  ctx.fillStyle = '#07071a'
  ctx.fillRect(0, 0, W, H)

  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.6)
  bg.addColorStop(0, 'rgba(168,85,247,0.1)')
  bg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  if (phase === 'countdown') {
    ctx.fillStyle = '#a855f7'
    ctx.font = '900 1.1rem "Space Grotesk", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`TARGET: ${target} shakes`, cx, cy - 20)
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '500 .82rem Inter, sans-serif'
    ctx.fillText('Get ready…', cx, cy + 20)
  } else if (phase === 'playing') {
    ctx.fillStyle = '#ede9fe'
    ctx.font = '900 5rem "Space Grotesk", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowBlur = myCount >= target ? 20 : 0
    ctx.shadowColor = myCount >= target ? '#f97316' : '#7c3aed'
    ctx.fillText(String(myCount), cx, cy - 10)
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '600 .85rem Inter, sans-serif'
    ctx.fillText(`/ ${target}`, cx, cy + 46)
  } else {
    ctx.fillStyle = '#a855f7'
    ctx.font = '700 1.1rem "Space Grotesk", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`You shook ${myCount}×`, cx, cy - 12)
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.font = '500 .8rem Inter, sans-serif'
    ctx.fillText(`target was ${target}`, cx, cy + 20)
  }
}
