/**
 * Séance — co-op spirit board game.
 *
 * All players tilt their phones; the planchette follows the average tilt.
 * The spirit asks a question, and the group steers to spell the answer.
 * Shake together to banish an interrupting ghost.
 *
 * Demonstrates: tilt, multiplayer fusion, shake.
 */

import {
  getTilt,
  averageTilt,
  type Player,
  type SensorFrame,
  type SeanceData,
} from '@waggle/kit'

const BOARD_LETTERS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'0123456789',
  'YES', 'NO', 'GOODBYE',
]

const QUESTIONS: { q: string; a: string }[] = [
  { q: 'What do ghosts say?', a: 'BOO' },
  { q: 'Spooky season month?', a: 'OCTOBER' },
  { q: 'Count\'s favourite drink?', a: 'BLOOD' },
  { q: 'Witch\'s transport?', a: 'BROOM' },
  { q: 'Jack-o-?', a: 'LANTERN' },
]

export class SeanceGame {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private rafId = 0

  // State
  planchette = { x: 0, y: 0 }       // -1..1 normalised
  currentQuestion = QUESTIONS[0]!
  typed = ''
  private hoverLetter = ''
  private hoverStartT = 0
  private readonly DWELL_MS = 700    // hover this long to select a letter
  private ghostActive = false
  private ghostT = 0
  private recentShakes = new Map<string, number>()
  private frameBuffers = new Map<string, SensorFrame[]>()
  private players: Player[] = []

  onStateChange: ((data: SeanceData) => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
    this.pickQuestion()
  }

  setPlayers(players: Player[]): void {
    this.players = players.filter(p => p.role !== 'host')
  }

  pushFrame(playerId: string, frame: SensorFrame): void {
    let buf = this.frameBuffers.get(playerId)
    if (!buf) { buf = []; this.frameBuffers.set(playerId, buf) }
    buf.push(frame)
    // Rolling 500ms window
    const cutoff = frame.t - 500
    while (buf.length > 0 && buf[0]!.t < cutoff) buf.shift()
  }

  onShake(playerId: string): void {
    if (!this.ghostActive) return
    const now = Date.now()
    this.recentShakes.set(playerId, now)
    const shakerCount = [...this.recentShakes.values()].filter(t => now - t <= 1000).length
    if (this.players.length > 0 && shakerCount >= Math.ceil(this.players.length / 2)) {
      this.ghostActive = false
      this.ghostT = 0
      this.recentShakes.clear()
    }
  }

  start(): void {
    const tick = (ts: number) => {
      this.update(ts)
      this.draw(ts)
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stop(): void {
    cancelAnimationFrame(this.rafId)
  }

  private pickQuestion(): void {
    this.currentQuestion = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)]!
    this.typed = ''
    this.hoverLetter = ''
  }

  private update(ts: number): void {
    // Collect tilts from all players
    const tilts = this.players.map(p => {
      const buf = this.frameBuffers.get(p.id) ?? []
      return getTilt(buf)
    })

    const avg = averageTilt(tilts)

    // Map gamma (left-right, -90..90) → x, beta (front-back, -180..180) → y
    // Clamp to ±30° for the active range
    const RANGE = 30
    this.planchette.x = Math.max(-1, Math.min(1, avg.roll / RANGE))
    this.planchette.y = Math.max(-1, Math.min(1, avg.pitch / RANGE))

    // Ghost randomly interrupts
    if (!this.ghostActive && Math.random() < 0.0005) {
      this.ghostActive = true
      this.ghostT = ts
    }
    if (this.ghostActive && ts - this.ghostT > 5000) {
      this.ghostActive = false
    }

    // Letter selection via dwell
    const letter = this.getLetterUnderPlanchette()
    if (letter !== this.hoverLetter) {
      this.hoverLetter = letter
      this.hoverStartT = ts
    } else if (letter && ts - this.hoverStartT > this.DWELL_MS) {
      if (!this.ghostActive) this.selectLetter(letter)
      this.hoverStartT = ts + 999999  // prevent re-select
    }

    this.emitState()
  }

  private selectLetter(letter: string): void {
    if (letter === 'GOODBYE') { this.pickQuestion(); return }
    this.typed += letter === 'YES' || letter === 'NO' ? letter : letter[0]!
    if (this.typed === this.currentQuestion.a) {
      setTimeout(() => this.pickQuestion(), 2000)
    }
  }

  private getLetterUnderPlanchette(): string {
    const { x, y } = this.planchette
    const W = this.canvas.width / devicePixelRatio
    const H = this.canvas.height / devicePixelRatio
    const cx = W / 2 + x * W * 0.4
    const cy = H / 2 + y * H * 0.4

    // Check each letter's position
    for (const { letter, lx, ly } of this.boardLayout(W, H)) {
      if (Math.hypot(cx - lx, cy - ly) < 20) return letter
    }
    return ''
  }

  private emitState(): void {
    this.onStateChange?.({
      question: this.currentQuestion.q,
      answer: this.currentQuestion.a,
      typed: this.typed,
      planchette: { ...this.planchette },
      ghosts: this.ghostActive,
    })
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private draw(ts: number): void {
    const { ctx } = this
    const W = this.canvas.width / devicePixelRatio
    const H = this.canvas.height / devicePixelRatio
    ctx.clearRect(0, 0, W, H)

    this.drawBackground(W, H)
    this.drawBoard(W, H, ts)
    this.drawQuestion(W, H)
    this.drawTyped(W, H)
    this.drawPlanchette(W, H, ts)
    if (this.ghostActive) this.drawGhost(W, H, ts)
  }

  private drawBackground(W: number, H: number): void {
    const { ctx } = this
    ctx.fillStyle = '#0a0a1a'
    ctx.fillRect(0, 0, W, H)

    // Faint grid lines
    ctx.strokeStyle = 'rgba(124,58,237,0.08)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }
    for (let y = 0; y < H; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }
  }

  private boardLayout(W: number, H: number): { letter: string; lx: number; ly: number }[] {
    const layout: { letter: string; lx: number; ly: number }[] = []
    const outerR = Math.min(W, H) * 0.38
    const innerR = outerR * 0.72

    // Letters A-Z on outer arc
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    alpha.forEach((ch, i) => {
      const angle = (Math.PI * i) / (alpha.length - 1) + Math.PI / 2
      layout.push({ letter: ch, lx: W / 2 + outerR * Math.cos(angle), ly: H * 0.42 + outerR * 0.4 * Math.sin(angle) })
    })

    // Digits 0-9 on inner arc
    const digits = '0123456789'.split('')
    digits.forEach((ch, i) => {
      const angle = (Math.PI * i) / (digits.length - 1) + Math.PI / 2
      layout.push({ letter: ch, lx: W / 2 + innerR * Math.cos(angle), ly: H * 0.42 + innerR * 0.4 * Math.sin(angle) })
    })

    // YES / NO / GOODBYE
    layout.push({ letter: 'YES', lx: W * 0.2, ly: H * 0.65 })
    layout.push({ letter: 'NO', lx: W * 0.8, ly: H * 0.65 })
    layout.push({ letter: 'GOODBYE', lx: W / 2, ly: H * 0.78 })

    return layout
  }

  private drawBoard(W: number, H: number, _ts: number): void {
    const { ctx } = this
    for (const { letter, lx, ly } of this.boardLayout(W, H)) {
      const hover = letter === this.hoverLetter
      ctx.save()
      ctx.translate(lx, ly)
      if (hover) {
        ctx.shadowBlur = 15
        ctx.shadowColor = '#7c3aed'
        ctx.fillStyle = '#d4c0ff'
        ctx.font = `800 ${letter.length > 1 ? '0.65rem' : '0.9rem'} Inter, sans-serif`
      } else {
        ctx.fillStyle = 'rgba(241,245,249,0.6)'
        ctx.font = `600 ${letter.length > 1 ? '0.6rem' : '0.8rem'} Inter, sans-serif`
      }
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(letter, 0, 0)
      ctx.restore()
    }
  }

  private drawQuestion(W: number, H: number): void {
    const { ctx } = this
    ctx.fillStyle = '#f97316'
    ctx.font = '700 1.1rem Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(this.currentQuestion.q, W / 2, H * 0.08)
  }

  private drawTyped(W: number, H: number): void {
    const { ctx } = this
    ctx.fillStyle = '#f1f5f9'
    ctx.font = '800 2rem Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(this.typed || '…', W / 2, H * 0.93)
  }

  private drawPlanchette(W: number, H: number, ts: number): void {
    const { ctx } = this
    const px = W / 2 + this.planchette.x * W * 0.4
    const py = H / 2 + this.planchette.y * H * 0.4

    // Glow
    ctx.shadowBlur = 30
    ctx.shadowColor = '#7c3aed'
    ctx.strokeStyle = '#9d4edd'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(px, py, 18, 0, Math.PI * 2)
    ctx.stroke()

    ctx.fillStyle = 'rgba(124,58,237,0.3)'
    ctx.fill()

    // Player count indicator
    ctx.shadowBlur = 0
    ctx.fillStyle = '#fff'
    ctx.font = '700 0.7rem Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const count = this.players.filter(p => this.frameBuffers.has(p.id)).length
    ctx.fillText(String(count), px, py)
  }

  private drawGhost(W: number, H: number, ts: number): void {
    const { ctx } = this
    const alpha = 0.5 + 0.5 * Math.sin(ts / 200)
    ctx.fillStyle = `rgba(239,68,68,${alpha * 0.08})`
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = `rgba(239,68,68,${alpha})`
    ctx.font = '900 1.2rem Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('👻 GHOST! Shake to banish!', W / 2, 20)
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    this.canvas.width = rect.width * devicePixelRatio
    this.canvas.height = rect.height * devicePixelRatio
    this.ctx.scale(devicePixelRatio, devicePixelRatio)
  }
}
