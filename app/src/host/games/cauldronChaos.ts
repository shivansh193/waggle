import type { Player, SensorFrame } from '@waggle/kit'

type Prompt = 'shake' | 'flick' | 'twist'
type Phase = 'waiting' | 'prompt' | 'result' | 'win' | 'lose'

interface Bubble { x: number; y: number; r: number; vy: number }

export class CauldronChaosGame {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private rafId = 0

  private players: Player[] = []
  private level = 0
  private fails = 0
  private currentPrompt: Prompt | null = null
  private promptTs = 0
  private responders = new Set<string>()
  private readonly PROMPT_TIME = 3000
  private phase: Phase = 'waiting'
  private phaseTs = 0
  private lastResult: 'success' | 'fail' | null = null
  private bubbles: Bubble[] = []

  onStateChange: ((data: Record<string, unknown>) => void) | null = null
  onGestureAck: ((playerId: string, gesture: string) => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    for (let i = 0; i < 14; i++) {
      this.bubbles.push({ x: Math.random(), y: 0.6 + Math.random() * 0.4, r: 3 + Math.random() * 7, vy: 0.025 + Math.random() * 0.04 })
    }
  }

  setPlayers(players: Player[]): void {
    this.players = players.filter(p => p.role !== 'host')
  }

  pushFrame(_playerId: string, _frame: SensorFrame): void {}

  onGesture(playerId: string, gesture: string): void {
    if (this.phase !== 'prompt' || !this.currentPrompt) return
    if (gesture === this.currentPrompt) {
      this.responders.add(playerId)
      this.onGestureAck?.(playerId, promptEmoji(this.currentPrompt))
    }
    this.emit()
  }

  start(): void {
    this.level = 0
    this.fails = 0
    this.phase = 'waiting'
    this.phaseTs = performance.now()
    this.lastResult = null
    const tick = (ts: number) => {
      this.update(ts)
      this.draw(ts)
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stop(): void { cancelAnimationFrame(this.rafId) }

  private nextPrompt(): void {
    const prompts: Prompt[] = ['shake', 'flick', 'twist', 'shake', 'shake', 'flick', 'twist']
    this.currentPrompt = prompts[Math.floor(Math.random() * prompts.length)]!
    this.responders.clear()
    this.phase = 'prompt'
    this.promptTs = performance.now()
    this.phaseTs = this.promptTs
    this.emit()
  }

  private update(ts: number): void {
    for (const b of this.bubbles) {
      b.y -= b.vy * 0.016
      if (b.y < 0.3) { b.y = 0.6 + Math.random() * 0.4; b.x = Math.random() }
    }

    switch (this.phase) {
      case 'waiting':
        if (ts - this.phaseTs > 1600) this.nextPrompt()
        break
      case 'prompt':
        if (ts - this.promptTs > this.PROMPT_TIME) {
          const needed = Math.ceil(this.players.length / 2)
          if (this.responders.size >= needed) {
            this.level++
            this.lastResult = 'success'
            this.phase = this.level >= 10 ? 'win' : 'result'
          } else {
            this.fails++
            this.lastResult = 'fail'
            this.phase = this.fails >= 3 ? 'lose' : 'result'
          }
          this.phaseTs = ts
          this.emit()
        }
        break
      case 'result':
        if (ts - this.phaseTs > 1600) {
          this.phase = 'waiting'
          this.phaseTs = ts
        }
        break
    }
  }

  private emit(): void {
    this.onStateChange?.({
      game: 'cauldron_chaos',
      level: this.level,
      fails: this.fails,
      prompt: this.currentPrompt,
      phase: this.phase,
      responders: [...this.responders],
    })
  }

  private draw(ts: number): void {
    const { ctx } = this
    const dpr = devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    if (this.canvas.width !== Math.round(rect.width * dpr)) {
      this.canvas.width = Math.round(rect.width * dpr)
      this.canvas.height = Math.round(rect.height * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const W = rect.width
    const H = rect.height

    ctx.fillStyle = '#0a0a1a'
    ctx.fillRect(0, 0, W, H)

    if (!this.players.length) {
      ctx.fillStyle = 'rgba(148,163,184,.5)'
      ctx.font = '700 1rem Inter,sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('Need players for Cauldron Chaos', W / 2, H / 2)
      return
    }

    // Level bar (top)
    const lvlPct = this.level / 10
    ctx.fillStyle = 'rgba(255,255,255,.06)'
    ctx.fillRect(0, 0, W, 7)
    ctx.fillStyle = this.phase === 'win' ? '#34d399' : '#a855f7'
    ctx.fillRect(0, 0, W * lvlPct, 7)

    ctx.fillStyle = '#a855f7'
    ctx.font = '600 .72rem "Space Grotesk",sans-serif'
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(`Level ${this.level}/10`, 10, 12)

    ctx.textAlign = 'right'
    ctx.fillText('💀'.repeat(this.fails) + '🕯️'.repeat(Math.max(0, 3 - this.fails)), W - 10, 12)

    // Cauldron
    const cx = W / 2
    const cy = H * 0.52
    const cr = Math.min(W, H) * 0.21

    ctx.fillStyle = '#1a1a40'
    ctx.strokeStyle = '#7c3aed'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(cx, cy, cr, 0.08 * Math.PI, 0.92 * Math.PI)
    ctx.lineTo(cx - cr * 1.1, cy + cr * 0.55)
    ctx.ellipse(cx, cy + cr * 0.55, cr * 1.1, cr * 0.38, 0, Math.PI, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Liquid
    const liqColor = this.phase === 'win' ? '#34d399' : this.lastResult === 'fail' ? '#f87171' : '#a855f7'
    ctx.fillStyle = liqColor + '77'
    ctx.beginPath()
    ctx.ellipse(cx, cy + cr * 0.42, cr * 0.95, cr * 0.30, 0, 0, Math.PI * 2)
    ctx.fill()

    // Bubbles
    for (const b of this.bubbles) {
      const bx = cx - cr * 0.8 + b.x * cr * 1.6
      const by = cy + cr * 0.42 - b.y * cr * 0.25
      ctx.fillStyle = liqColor + '44'
      ctx.beginPath()
      ctx.arc(bx, by + cr * 0.1, b.r * 0.75, 0, Math.PI * 2)
      ctx.fill()
    }

    // Legs
    ctx.strokeStyle = '#6d28d9'
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(cx - cr * 0.65, cy + cr * 0.95); ctx.lineTo(cx - cr * 0.85, cy + cr * 1.35); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx + cr * 0.65, cy + cr * 0.95); ctx.lineTo(cx + cr * 0.85, cy + cr * 1.35); ctx.stroke()

    // ── Prompt ──
    if (this.phase === 'prompt' && this.currentPrompt) {
      const timeLeft = Math.max(0, this.PROMPT_TIME - (ts - this.promptTs))
      const urgent = timeLeft < 1000
      const alpha = urgent ? 0.65 + 0.35 * Math.sin(ts / 90) : 1
      ctx.globalAlpha = alpha
      ctx.font = `900 ${urgent ? '3.3rem' : '2.7rem'} "Space Grotesk",sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const pColor = promptColor(this.currentPrompt)
      ctx.fillStyle = pColor
      ctx.shadowBlur = 36; ctx.shadowColor = pColor
      ctx.fillText(promptLabel(this.currentPrompt), cx, H * 0.14)
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1

      // Timer ring
      const angle = (timeLeft / this.PROMPT_TIME) * Math.PI * 2 - Math.PI / 2
      ctx.strokeStyle = pColor + '44'
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.arc(cx, H * 0.14, 52, -Math.PI / 2, angle)
      ctx.stroke()

      // Responder dots
      for (let i = 0; i < this.players.length; i++) {
        const player = this.players[i]!
        const a = (i / this.players.length) * Math.PI * 2
        const rx = cx + Math.cos(a) * cr * 0.65
        const ry = cy + Math.sin(a) * cr * 0.55 + cr * 0.2
        ctx.fillStyle = this.responders.has(player.id) ? player.color : 'rgba(255,255,255,.12)'
        ctx.shadowBlur = this.responders.has(player.id) ? 10 : 0
        ctx.shadowColor = player.color
        ctx.beginPath(); ctx.arc(rx, ry, 10, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    // Result flash
    if (this.phase === 'result') {
      ctx.font = '900 2.8rem "Space Grotesk",sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      if (this.lastResult === 'success') {
        ctx.fillStyle = '#34d399'
        ctx.shadowBlur = 28; ctx.shadowColor = '#34d399'
        ctx.fillText('✦ BREWED! ✦', cx, H * 0.14)
      } else {
        ctx.fillStyle = '#f87171'
        ctx.shadowBlur = 28; ctx.shadowColor = '#f87171'
        ctx.fillText('💀 FIZZLE!', cx, H * 0.14)
      }
      ctx.shadowBlur = 0
    }

    // Win / Lose
    if (this.phase === 'win' || this.phase === 'lose') {
      ctx.fillStyle = 'rgba(7,7,26,.92)'
      ctx.fillRect(0, 0, W, H)
      ctx.font = '900 2.4rem "Space Grotesk",sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      if (this.phase === 'win') {
        ctx.fillStyle = '#34d399'
        ctx.shadowBlur = 36; ctx.shadowColor = '#34d399'
        ctx.fillText('🧪 POTION BREWED!', W / 2, H / 2 - 18)
        ctx.shadowBlur = 0
        ctx.fillStyle = '#94a3b8'
        ctx.font = '600 .95rem "Space Grotesk",sans-serif'
        ctx.fillText('You survived the chaos!', W / 2, H / 2 + 28)
      } else {
        ctx.fillStyle = '#f87171'
        ctx.shadowBlur = 36; ctx.shadowColor = '#f87171'
        ctx.fillText('💀 CAULDRON RUINED!', W / 2, H / 2 - 18)
        ctx.shadowBlur = 0
        ctx.fillStyle = '#94a3b8'
        ctx.font = '600 .95rem "Space Grotesk",sans-serif'
        ctx.fillText('Too many fizzles…', W / 2, H / 2 + 28)
      }
    }
  }
}

function promptLabel(p: Prompt): string {
  return p === 'shake' ? '📳 SHAKE!' : p === 'flick' ? '👋 FLICK!' : '🌀 TWIST!'
}

function promptColor(p: Prompt): string {
  return p === 'shake' ? '#f97316' : p === 'flick' ? '#7c3aed' : '#06b6d4'
}

function promptEmoji(p: Prompt): string {
  return p === 'shake' ? '📳' : p === 'flick' ? '👋' : '🌀'
}
