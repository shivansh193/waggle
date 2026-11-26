import type { Player, SensorFrame } from '@waggle/kit'

type Phase = 'countdown' | 'playing' | 'result' | 'gameover'

export class PhantomFreqGame {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private rafId = 0

  private players: Player[] = []
  private shakeCounts: Record<string, number> = {}
  private roundWins: Record<string, number> = {}
  private currentRound = 0
  private readonly ROUNDS = 3
  private readonly TARGETS = [8, 15, 25]
  private readonly ROUND_MS = 12_000
  private roundStartTs = 0
  private phase: Phase = 'countdown'
  private phaseTs = 0
  private lastDist: Record<string, number> = {}

  onStateChange: ((data: Record<string, unknown>) => void) | null = null
  onGestureAck: ((playerId: string, gesture: string) => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  setPlayers(players: Player[]): void {
    this.players = players.filter(p => p.role !== 'host')
    for (const p of this.players) {
      this.roundWins[p.id] = 0
      this.shakeCounts[p.id] = 0
    }
  }

  pushFrame(_playerId: string, _frame: SensorFrame): void {}

  onGesture(playerId: string, gesture: string): void {
    if (gesture !== 'shake' || this.phase !== 'playing') return
    this.shakeCounts[playerId] = (this.shakeCounts[playerId] ?? 0) + 1
    this.onGestureAck?.(playerId, `${this.shakeCounts[playerId]}`)
    this.emit()
  }

  start(): void {
    this.currentRound = 0
    for (const p of this.players) {
      this.roundWins[p.id] = 0
      this.shakeCounts[p.id] = 0
    }
    this.beginCountdown()
    const tick = (ts: number) => {
      this.update(ts)
      this.draw(ts)
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stop(): void { cancelAnimationFrame(this.rafId) }

  private beginCountdown(): void {
    this.phase = 'countdown'
    this.phaseTs = performance.now()
    for (const p of this.players) this.shakeCounts[p.id] = 0
    this.emit()
  }

  private beginRound(): void {
    this.phase = 'playing'
    this.roundStartTs = performance.now()
    this.phaseTs = this.roundStartTs
    this.emit()
  }

  private endRound(ts: number): void {
    const target = this.TARGETS[this.currentRound]!
    this.lastDist = {}
    let best = Infinity
    for (const p of this.players) {
      const d = Math.abs((this.shakeCounts[p.id] ?? 0) - target)
      this.lastDist[p.id] = d
      if (d < best) best = d
    }
    for (const p of this.players) {
      if (this.lastDist[p.id] === best) this.roundWins[p.id] = (this.roundWins[p.id] ?? 0) + 1
    }
    this.phase = 'result'
    this.phaseTs = ts
    this.emit()
  }

  private update(ts: number): void {
    switch (this.phase) {
      case 'countdown':
        if (ts - this.phaseTs > 2600) this.beginRound()
        break
      case 'playing':
        if (ts - this.roundStartTs >= this.ROUND_MS) this.endRound(ts)
        break
      case 'result':
        if (ts - this.phaseTs > 2500) {
          this.currentRound++
          if (this.currentRound >= this.ROUNDS) { this.phase = 'gameover'; this.emit() }
          else this.beginCountdown()
        }
        break
    }
  }

  private emit(): void {
    this.onStateChange?.({
      game: 'phantom_freq',
      round: this.currentRound,
      target: this.TARGETS[Math.min(this.currentRound, this.ROUNDS - 1)],
      shakeCounts: { ...this.shakeCounts },
      roundWins: { ...this.roundWins },
      phase: this.phase,
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
      ctx.fillText('Need players for Phantom Frequency', W / 2, H / 2)
      return
    }

    const target = this.TARGETS[Math.min(this.currentRound, this.ROUNDS - 1)]!

    // Round pips
    ctx.fillStyle = '#6b6b9a'
    ctx.font = '600 .7rem "Space Grotesk",sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`Round ${Math.min(this.currentRound + 1, this.ROUNDS)} of ${this.ROUNDS}`, W / 2, 10)
    for (let r = 0; r < this.ROUNDS; r++) {
      const dx = W / 2 + (r - 1) * 22
      ctx.fillStyle = r < this.currentRound ? '#7c3aed' : r === this.currentRound ? '#a855f7' : '#1e1e45'
      ctx.beginPath(); ctx.arc(dx, 32, 7, 0, Math.PI * 2); ctx.fill()
    }

    // Ghost
    const ga = 0.38 + 0.28 * Math.sin(ts / 650)
    ctx.font = `${3.6 + Math.sin(ts / 850) * 0.25}rem sans-serif`
    ctx.globalAlpha = ga
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('👻', W / 2, H * 0.24)
    ctx.globalAlpha = 1

    // Center info
    if (this.phase === 'countdown') {
      const cd = Math.ceil(Math.max(0, 2600 - (ts - this.phaseTs)) / 1000)
      ctx.fillStyle = '#7c3aed'
      ctx.font = '900 4rem "Space Grotesk",sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.shadowBlur = 20; ctx.shadowColor = '#7c3aed'
      ctx.fillText(cd > 0 ? String(cd) : 'GO!', W / 2, H * 0.44)
      ctx.shadowBlur = 0
      ctx.fillStyle = '#94a3b8'
      ctx.font = '600 .95rem "Space Grotesk",sans-serif'
      ctx.fillText(`SHAKE EXACTLY ${target} TIMES`, W / 2, H * 0.54)
    } else if (this.phase === 'playing') {
      const rem = Math.max(0, this.ROUND_MS - (ts - this.roundStartTs))
      ctx.fillStyle = rem < 3000 ? '#f97316' : '#94a3b8'
      ctx.font = '700 .95rem "Space Grotesk",sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`${(rem / 1000).toFixed(1)}s`, W / 2, H * 0.38)
      ctx.fillStyle = '#ede9fe'
      ctx.font = '900 1.15rem "Space Grotesk",sans-serif'
      ctx.fillText(`TARGET: ${target}`, W / 2, H * 0.45)
    }

    // Player bars
    const barAreaTop = H * 0.6
    const barAreaH = H * 0.28
    const barW = Math.min(72, (W - 40) / this.players.length - 10)

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]!
      const bx = W / 2 + (i - (this.players.length - 1) / 2) * (barW + 12)
      const count = this.shakeCounts[p.id] ?? 0
      const pct = Math.min(1, count / (target * 1.5))

      ctx.fillStyle = 'rgba(255,255,255,.05)'
      ctx.fillRect(bx - barW / 2, barAreaTop, barW, barAreaH)

      const fillH = barAreaH * pct
      ctx.fillStyle = this.phase === 'result' && (this.lastDist[p.id] ?? 999) === 0 ? '#34d399' : p.color
      ctx.fillRect(bx - barW / 2, barAreaTop + barAreaH - fillH, barW, fillH)

      // Target line
      const targetFrac = target / (target * 1.5)
      const targetY = barAreaTop + barAreaH * (1 - targetFrac)
      ctx.strokeStyle = '#f97316'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(bx - barW / 2 - 4, targetY)
      ctx.lineTo(bx + barW / 2 + 4, targetY)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = '#f1f5f9'
      ctx.font = '900 1.1rem "Space Grotesk",sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText(String(count), bx, barAreaTop - 3)

      ctx.fillStyle = p.color
      ctx.font = '600 .68rem "Space Grotesk",sans-serif'
      ctx.textBaseline = 'top'
      ctx.fillText(p.name, bx, barAreaTop + barAreaH + 5)

      const wins = this.roundWins[p.id] ?? 0
      ctx.font = '.6rem sans-serif'
      ctx.fillText('⭐'.repeat(wins), bx, barAreaTop + barAreaH + 18)
    }

    // Result overlay
    if (this.phase === 'result') {
      ctx.fillStyle = 'rgba(7,7,26,.78)'
      ctx.fillRect(0, 0, W, H)
      const minDist = Math.min(...this.players.map(p => this.lastDist[p.id] ?? 999))
      const roundWinners = this.players.filter(p => (this.lastDist[p.id] ?? 999) === minDist)
      const winColor = roundWinners[0]?.color ?? '#7c3aed'
      ctx.font = '900 1.75rem "Space Grotesk",sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = winColor
      ctx.shadowBlur = 18; ctx.shadowColor = winColor
      ctx.fillText(`${roundWinners.map(p => p.name).join(' & ')} closest!`, W / 2, H / 2 - 14)
      ctx.shadowBlur = 0
      ctx.font = '600 .88rem "Space Grotesk",sans-serif'
      ctx.fillStyle = '#94a3b8'
      ctx.fillText(`off by ${minDist} shake${minDist !== 1 ? 's' : ''}`, W / 2, H / 2 + 20)
    }

    // Game over
    if (this.phase === 'gameover') {
      ctx.fillStyle = 'rgba(7,7,26,.92)'
      ctx.fillRect(0, 0, W, H)
      const topWins = Math.max(...this.players.map(p => this.roundWins[p.id] ?? 0))
      const winners = this.players.filter(p => (this.roundWins[p.id] ?? 0) === topWins)
      const winColor = winners[0]?.color ?? '#7c3aed'
      ctx.font = '900 1.95rem "Space Grotesk",sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = winColor
      ctx.shadowBlur = 28; ctx.shadowColor = winColor
      ctx.fillText(`👻 ${winners.map(p => p.name).join(' & ')} wins!`, W / 2, H / 2 - 18)
      ctx.shadowBlur = 0
      ctx.fillStyle = '#94a3b8'
      ctx.font = '600 .92rem "Space Grotesk",sans-serif'
      ctx.fillText(`${topWins}/${this.ROUNDS} rounds won`, W / 2, H / 2 + 26)
    }
  }
}
