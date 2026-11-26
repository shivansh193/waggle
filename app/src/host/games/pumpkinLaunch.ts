import type { Player, SensorFrame } from '@waggle/kit'

interface FallingPumpkin {
  id: number
  laneIdx: number
  y: number       // 0..1 normalized height
  speed: number   // per second
  state: 'falling' | 'caught' | 'missed'
  stateTs: number
}

export class PumpkinLaunchGame {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private rafId = 0

  private players: Player[] = []
  private scores: Record<string, number> = {}
  private pumpkins: FallingPumpkin[] = []
  private nextId = 0
  private lastSpawnTs = 0
  private lastSpawnIdx = 0
  private gameStartTs = 0
  private lastTs = 0
  private phase: 'playing' | 'gameover' = 'playing'
  private readonly DURATION = 45_000

  onStateChange: ((data: Record<string, unknown>) => void) | null = null
  onGestureAck: ((playerId: string, gesture: string) => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  setPlayers(players: Player[]): void {
    this.players = players.filter(p => p.role !== 'host')
    for (const p of this.players) this.scores[p.id] = 0
  }

  pushFrame(_playerId: string, _frame: SensorFrame): void {}

  onGesture(playerId: string, gesture: string): void {
    if (gesture !== 'flick' || this.phase !== 'playing') return
    const pumpkin = this.pumpkins.find(
      p => p.laneIdx === this.players.findIndex(pl => pl.id === playerId)
        && p.state === 'falling' && p.y >= 0.70,
    )
    if (pumpkin) {
      pumpkin.state = 'caught'
      pumpkin.stateTs = performance.now()
      this.scores[playerId] = (this.scores[playerId] ?? 0) + 1
      this.onGestureAck?.(playerId, 'catch 🎃')
    }
    this.emit()
  }

  start(): void {
    this.gameStartTs = performance.now()
    this.lastTs = this.gameStartTs
    this.lastSpawnTs = this.gameStartTs
    this.lastSpawnIdx = 0
    this.phase = 'playing'
    this.pumpkins = []
    for (const p of this.players) this.scores[p.id] = 0
    const tick = (ts: number) => {
      this.update(ts)
      this.draw(ts)
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stop(): void { cancelAnimationFrame(this.rafId) }

  private update(ts: number): void {
    if (this.phase !== 'playing') return
    const dt = (ts - this.lastTs) / 1000
    this.lastTs = ts

    if (ts - this.gameStartTs >= this.DURATION) {
      this.phase = 'gameover'
      this.emit()
      return
    }

    if (this.players.length > 0) {
      const spawnInterval = Math.max(1200, 2200 - (ts - this.gameStartTs) / 30)
      if (ts - this.lastSpawnTs > spawnInterval) {
        this.lastSpawnTs = ts
        const laneIdx = this.lastSpawnIdx % this.players.length
        this.lastSpawnIdx++
        this.pumpkins.push({
          id: this.nextId++,
          laneIdx,
          y: 0,
          speed: 0.18 + Math.random() * 0.09,
          state: 'falling',
          stateTs: ts,
        })
      }
    }

    for (const p of this.pumpkins) {
      if (p.state === 'falling') {
        p.y += p.speed * dt
        if (p.y > 1.08) p.state = 'missed'
      }
    }

    this.pumpkins = this.pumpkins.filter(
      p => p.state === 'falling' || ts - p.stateTs < 700,
    )
    this.emit()
  }

  private emit(): void {
    this.onStateChange?.({ game: 'pumpkin_launch', scores: { ...this.scores }, phase: this.phase })
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
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Need players for Pumpkin Launch', W / 2, H / 2)
      return
    }

    const laneW = W / this.players.length

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]!
      const lx = laneW * i

      if (i > 0) {
        ctx.strokeStyle = 'rgba(124,58,237,.2)'
        ctx.lineWidth = 1
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(lx, 0); ctx.lineTo(lx, H)
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.fillStyle = p.color
      ctx.font = '700 .82rem "Space Grotesk",sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(p.name, lx + laneW / 2, 10)

      ctx.fillStyle = '#f1f5f9'
      ctx.font = '900 2.4rem "Space Grotesk",sans-serif'
      ctx.textBaseline = 'top'
      ctx.fillText(String(this.scores[p.id] ?? 0), lx + laneW / 2, 32)

      // Catch zone
      const czTop = H * 0.74
      const czH = H * 0.19
      const pulse = 0.07 + 0.05 * Math.sin(ts / 350)
      const alpha = Math.round(pulse * 255).toString(16).padStart(2, '0')
      ctx.fillStyle = `${p.color}${alpha}`
      ctx.fillRect(lx + 8, czTop, laneW - 16, czH)
      ctx.strokeStyle = `${p.color}44`
      ctx.lineWidth = 1.5
      ctx.strokeRect(lx + 8, czTop, laneW - 16, czH)

      ctx.fillStyle = `${p.color}bb`
      ctx.font = '700 .68rem "Space Grotesk",sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillText('FLICK!', lx + laneW / 2, czTop + czH / 2)
    }

    for (const pumpkin of this.pumpkins) {
      const p = this.players[pumpkin.laneIdx]
      if (!p) continue
      const lx = laneW * pumpkin.laneIdx
      const px = lx + laneW / 2
      const py = pumpkin.y * H

      ctx.save()
      ctx.translate(px, py)

      if (pumpkin.state === 'caught') {
        const age = (ts - pumpkin.stateTs) / 700
        ctx.globalAlpha = Math.max(0, 1 - age)
        ctx.translate(0, -40 * age)
        ctx.font = '2rem sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('🎃', 0, 0)
        ctx.fillStyle = '#34d399'
        ctx.font = '700 .75rem "Space Grotesk",sans-serif'
        ctx.fillText('+1', 0, -26)
      } else if (pumpkin.state === 'falling') {
        if (pumpkin.y >= 0.70) {
          ctx.shadowBlur = 20; ctx.shadowColor = '#f97316'
        }
        ctx.font = '1.9rem sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('🎃', 0, 0)
        ctx.shadowBlur = 0
      }
      ctx.restore()
    }

    // Timer bar
    const remaining = Math.max(0, this.DURATION - (ts - this.gameStartTs))
    const pct = remaining / this.DURATION
    ctx.fillStyle = 'rgba(255,255,255,.07)'
    ctx.fillRect(0, H - 5, W, 5)
    ctx.fillStyle = pct > 0.33 ? '#7c3aed' : '#f97316'
    ctx.fillRect(0, H - 5, W * pct, 5)

    if (this.phase === 'gameover') {
      ctx.fillStyle = 'rgba(7,7,26,.88)'
      ctx.fillRect(0, 0, W, H)
      const winner = [...this.players].sort(
        (a, b) => (this.scores[b.id] ?? 0) - (this.scores[a.id] ?? 0),
      )[0]
      if (winner) {
        ctx.font = '900 2.1rem "Space Grotesk",sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillStyle = winner.color
        ctx.shadowBlur = 28; ctx.shadowColor = winner.color
        ctx.fillText(`🎃 ${winner.name} wins!`, W / 2, H / 2 - 18)
        ctx.shadowBlur = 0
        ctx.fillStyle = '#94a3b8'
        ctx.font = '600 .95rem "Space Grotesk",sans-serif'
        ctx.fillText(`${this.scores[winner.id] ?? 0} pumpkins caught`, W / 2, H / 2 + 26)
      }
    }
  }
}
