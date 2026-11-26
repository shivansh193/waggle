/**
 * Hex Duel — 1-vs-1 spellcasting game.
 *
 * Each player draws a shape in the air with their phone
 * (circle = shield, zigzag = bolt, spiral = curse),
 * then flicks to throw the spell.
 *
 * Demonstrates: shape recognition via gyro path, flick, teach-a-move.
 */

import {
  BUILT_IN_TEMPLATES,
  gyroToPath,
  recogniseShape,
  type Player,
  type SensorFrame,
  type HexDuelData,
  type SpellShape,
} from '@waggle/kit'

const SPELL_EMOJI: Record<SpellShape, string> = {
  circle:  '🛡️',
  zigzag:  '⚡',
  spiral:  '🌀',
  custom:  '✨',
}

// Rock-paper-scissors style: beats[a] = b means a beats b
const BEATS: Partial<Record<SpellShape, SpellShape>> = {
  zigzag:  'spiral',
  spiral:  'circle',
  circle:  'zigzag',
}

export class HexDuelGame {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private rafId = 0

  // State
  private players: [Player, Player] | null = null
  private hp: Record<string, number> = {}
  private phase: HexDuelData['phase'] = 'drawing'
  private spells: Record<string, { shape: SpellShape; ts: number } | null> = {}
  private frameBuffers = new Map<string, SensorFrame[]>()
  private animations: Array<{ x: number; y: number; text: string; ts: number; color: string }> = []
  private roundStartT = 0

  onStateChange: ((data: HexDuelData) => void) | null = null
  onGestureAck: ((playerId: string, gesture: string) => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  setPlayers(players: Player[]): void {
    const controllers = players.filter(p => p.role !== 'host')
    if (controllers.length >= 2) {
      this.players = [controllers[0]!, controllers[1]!]
      for (const p of this.players) {
        this.hp[p.id] = 3
        this.spells[p.id] = null
      }
    }
  }

  pushFrame(playerId: string, frame: SensorFrame): void {
    let buf = this.frameBuffers.get(playerId)
    if (!buf) { buf = []; this.frameBuffers.set(playerId, buf) }
    buf.push(frame)
    // Rolling 2-second window for shape drawing
    const cutoff = frame.t - 2000
    while (buf.length > 0 && buf[0]!.t < cutoff) buf.shift()
  }

  onFlick(playerId: string): void {
    if (this.phase !== 'drawing') return
    if (this.spells[playerId]) return   // already cast

    // Recognise what the player drew
    const buf = this.frameBuffers.get(playerId) ?? []
    const path = gyroToPath(buf)
    if (path.length < 5) return

    const result = recogniseShape(path, BUILT_IN_TEMPLATES)
    if (result.score < 0.4) return  // too low confidence

    this.spells[playerId] = { shape: result.name as SpellShape, ts: Date.now() }
    this.onGestureAck?.(playerId, result.name)

    // Both players cast → resolve
    const p = this.players
    if (p && this.spells[p[0]!.id] && this.spells[p[1]!.id]) {
      this.resolve()
    }

    this.emitState()
  }

  start(): void {
    this.roundStartT = performance.now()
    const tick = (ts: number) => { this.update(ts); this.draw(); this.rafId = requestAnimationFrame(tick) }
    this.rafId = requestAnimationFrame(tick)
  }

  private update(ts: number): void {
    if (this.phase !== 'drawing' || !this.players || this.roundStartT === 0) return
    const p0 = this.players[0]!, p1 = this.players[1]!
    const anySpell = this.spells[p0.id] || this.spells[p1.id]
    if (anySpell && ts - this.roundStartT > 10_000) {
      this.spells[p0.id] = null
      this.spells[p1.id] = null
      this.roundStartT = ts
      this.addAnim('⏱️ Fizzle!', '#94a3b8')
      this.emitState()
    }
  }

  stop(): void { cancelAnimationFrame(this.rafId) }

  private resolve(): void {
    const p = this.players!
    const a = this.spells[p[0]!.id]!.shape
    const b = this.spells[p[1]!.id]!.shape

    if (a === b) {
      this.addAnim('DRAW!', '#94a3b8')
    } else if (BEATS[a] === b) {
      this.hp[p[1]!.id] = (this.hp[p[1]!.id] ?? 3) - 1
      this.addAnim(`${SPELL_EMOJI[a]} beats ${SPELL_EMOJI[b]}!`, p[0]!.color)
    } else {
      this.hp[p[0]!.id] = (this.hp[p[0]!.id] ?? 3) - 1
      this.addAnim(`${SPELL_EMOJI[b]} beats ${SPELL_EMOJI[a]}!`, p[1]!.color)
    }

    // Reset for next round after 2s
    setTimeout(() => {
      this.spells[p[0]!.id] = null
      this.spells[p[1]!.id] = null
      this.phase = 'drawing'
      this.roundStartT = performance.now()
      this.emitState()
    }, 2000)

    this.emitState()
  }

  private addAnim(text: string, color: string): void {
    const W = this.canvas.width / devicePixelRatio
    const H = this.canvas.height / devicePixelRatio
    this.animations.push({ x: W / 2, y: H / 2, text, ts: Date.now(), color })
  }

  private emitState(): void {
    this.onStateChange?.({
      hp: { ...this.hp },
      phase: this.phase,
      spells: Object.fromEntries(
        Object.entries(this.spells).map(([id, s]) => [
          id,
          s ? { playerId: id, shape: s.shape, castAt: s.ts } : null,
        ]),
      ),
      winner: this.getWinner(),
    })
  }

  private getWinner(): string | null {
    if (!this.players) return null
    for (const p of this.players) {
      if ((this.hp[p.id] ?? 3) <= 0) {
        return this.players.find(x => x.id !== p.id)?.id ?? null
      }
    }
    return null
  }

  private draw(): void {
    const { ctx } = this
    const W = this.canvas.width / devicePixelRatio
    const H = this.canvas.height / devicePixelRatio
    ctx.clearRect(0, 0, W, H)

    this.drawBackground(W, H)

    if (!this.players) {
      this.drawWaiting(W, H)
      return
    }

    this.drawPlayers(W, H)
    this.drawAnimations(W, H)
  }

  private drawBackground(W: number, H: number): void {
    const { ctx } = this
    ctx.fillStyle = '#0a0a1a'
    ctx.fillRect(0, 0, W, H)

    // Divider
    ctx.strokeStyle = 'rgba(124,58,237,0.3)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 4])
    ctx.beginPath()
    ctx.moveTo(W / 2, 0)
    ctx.lineTo(W / 2, H)
    ctx.stroke()
    ctx.setLineDash([])
  }

  private drawPlayers(W: number, H: number): void {
    const sides = [
      { x: W / 4, p: this.players![0]! },
      { x: W * 3 / 4, p: this.players![1]! },
    ]

    for (const { x, p } of sides) {
      const hp = this.hp[p.id] ?? 3
      const spell = this.spells[p.id]

      // Name
      this.ctx.fillStyle = p.color
      this.ctx.font = '700 1.2rem Inter, sans-serif'
      this.ctx.textAlign = 'center'
      this.ctx.textBaseline = 'top'
      this.ctx.fillText(p.name, x, 20)

      // HP hearts
      this.ctx.font = '1.5rem sans-serif'
      this.ctx.textBaseline = 'top'
      this.ctx.fillText(
        '♥'.repeat(hp) + '♡'.repeat(3 - hp),
        x, 55,
      )

      // Spell or drawing path
      if (spell) {
        this.ctx.font = '4rem sans-serif'
        this.ctx.textBaseline = 'middle'
        this.ctx.fillText(SPELL_EMOJI[spell.shape], x, H / 2)
      } else {
        // Show gyro path preview
        const buf = this.frameBuffers.get(p.id) ?? []
        this.drawGyroPath(buf, x - 80, H / 2 - 80, 160, 160, p.color)
      }
    }
  }

  private drawGyroPath(
    frames: SensorFrame[],
    ox: number, oy: number,
    w: number, h: number,
    color: string,
  ): void {
    if (frames.length < 2) return
    const { ctx } = this
    ctx.save()
    ctx.beginPath()
    ctx.rect(ox, oy, w, h)
    ctx.clip()

    let gx = 0, gy = 0
    ctx.strokeStyle = color + '88'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ox + w / 2, oy + h / 2)

    for (let i = 1; i < frames.length; i++) {
      const dt = (frames[i]!.t - frames[i - 1]!.t) / 1000
      gx += frames[i]!.gyro[0]! * dt * 50
      gy += frames[i]!.gyro[1]! * dt * 50
      ctx.lineTo(ox + w / 2 + gx, oy + h / 2 + gy)
    }
    ctx.stroke()
    ctx.restore()
  }

  private drawWaiting(W: number, H: number): void {
    this.ctx.fillStyle = 'rgba(148,163,184,0.4)'
    this.ctx.font = '700 1rem Inter, sans-serif'
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.fillText('Need 2 players for Hex Duel', W / 2, H / 2)
  }

  private drawAnimations(W: number, H: number): void {
    const now = Date.now()
    this.animations = this.animations.filter(a => now - a.ts < 2000)
    for (const a of this.animations) {
      const age = (now - a.ts) / 2000
      this.ctx.globalAlpha = 1 - age
      this.ctx.fillStyle = a.color
      this.ctx.font = '900 2rem Inter, sans-serif'
      this.ctx.textAlign = 'center'
      this.ctx.textBaseline = 'middle'
      this.ctx.fillText(a.text, a.x, a.y - age * 60)
    }
    this.ctx.globalAlpha = 1
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    this.canvas.width = rect.width * devicePixelRatio
    this.canvas.height = rect.height * devicePixelRatio
    this.ctx.scale(devicePixelRatio, devicePixelRatio)
  }
}
