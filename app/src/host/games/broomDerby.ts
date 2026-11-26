import { getTilt } from '@waggle/kit'
import type { Player, SensorFrame } from '@waggle/kit'

interface DerbyObject {
  id: number
  laneIdx: number
  x: number       // 0..1 normalized width (1 = right edge)
  y: number       // 0..1 within lane (0 = top, 1 = bottom)
  type: 'star' | 'mushroom' | 'bat'
  hit: boolean
  hitTs: number
}

export class BroomDerbyGame {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private rafId = 0

  private players: Player[] = []
  private scores: Record<string, number> = {}
  private broomY: Record<string, number> = {}   // 0..1 vertical per player
  private frameBuffers = new Map<string, SensorFrame[]>()
  private objects: DerbyObject[] = []
  private nextId = 0
  private lastSpawnTs = 0
  private gameStartTs = 0
  private lastTs = 0
  private phase: 'playing' | 'gameover' = 'playing'
  private readonly DURATION = 30_000

  onStateChange: ((data: Record<string, unknown>) => void) | null = null
  onGestureAck: ((playerId: string, gesture: string) => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  setPlayers(players: Player[]): void {
    this.players = players.filter(p => p.role !== 'host')
    for (const p of this.players) {
      this.scores[p.id] = 0
      this.broomY[p.id] = 0.5
    }
  }

  pushFrame(playerId: string, frame: SensorFrame): void {
    let buf = this.frameBuffers.get(playerId)
    if (!buf) { buf = []; this.frameBuffers.set(playerId, buf) }
    buf.push(frame)
    const cutoff = frame.t - 400
    while (buf.length > 0 && buf[0]!.t < cutoff) buf.shift()
    const tilt = getTilt(buf)
    // roll (gamma) → vertical: tilt left = up, tilt right = down
    this.broomY[playerId] = Math.max(0.05, Math.min(0.95, 0.5 + tilt.roll / 90))
  }

  onGesture(_playerId: string, _gesture: string): void {}

  start(): void {
    this.gameStartTs = performance.now()
    this.lastTs = this.gameStartTs
    this.lastSpawnTs = this.gameStartTs
    this.phase = 'playing'
    this.objects = []
    for (const p of this.players) {
      this.scores[p.id] = 0
      this.broomY[p.id] = 0.5
    }
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

    if (ts - this.lastSpawnTs > 750 && this.players.length > 0) {
      this.lastSpawnTs = ts
      const types: DerbyObject['type'][] = ['star', 'star', 'mushroom', 'bat', 'bat']
      const type = types[Math.floor(Math.random() * types.length)]!
      const laneIdx = Math.floor(Math.random() * this.players.length)
      this.objects.push({
        id: this.nextId++,
        laneIdx,
        x: 1.06,
        y: 0.15 + Math.random() * 0.70,
        type,
        hit: false,
        hitTs: 0,
      })
    }

    const speed = 0.38 + (ts - this.gameStartTs) / 80000
    for (const obj of this.objects) {
      if (!obj.hit) obj.x -= speed * dt
    }

    // Collision
    for (const obj of this.objects) {
      if (obj.hit) continue
      const player = this.players[obj.laneIdx]
      if (!player) continue
      const broomY = this.broomY[player.id] ?? 0.5
      if (obj.x < 0.14 && obj.x > 0.03 && Math.abs(obj.y - broomY) < 0.13) {
        obj.hit = true
        obj.hitTs = ts
        const pts = obj.type === 'star' ? 2 : obj.type === 'mushroom' ? 1 : -1
        this.scores[player.id] = Math.max(0, (this.scores[player.id] ?? 0) + pts)
        if (pts > 0) this.onGestureAck?.(player.id, `+${pts}`)
      }
    }

    this.objects = this.objects.filter(o => o.x > -0.1 && (!o.hit || ts - o.hitTs < 550))
    this.emit()
  }

  private emit(): void {
    this.onStateChange?.({ game: 'broom_derby', scores: { ...this.scores }, phase: this.phase })
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

    // Stars
    for (let i = 0; i < 50; i++) {
      const sx = ((i * 139 + ts * 0.015) % (W + 20)) - 10
      const sy = (i * 71 + 7) % H
      ctx.fillStyle = `rgba(255,255,255,${0.02 + (i % 5) * 0.012})`
      ctx.beginPath()
      ctx.arc(sx, sy, 1, 0, Math.PI * 2)
      ctx.fill()
    }

    if (!this.players.length) {
      ctx.fillStyle = 'rgba(148,163,184,.5)'
      ctx.font = '700 1rem Inter,sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('Need players for Broomstick Derby', W / 2, H / 2)
      return
    }

    const laneH = H / this.players.length

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]!
      const ly = laneH * i

      if (i > 0) {
        ctx.strokeStyle = 'rgba(124,58,237,.25)'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke()
      }

      const laneGrad = ctx.createLinearGradient(0, ly, 0, ly + laneH)
      laneGrad.addColorStop(0, 'rgba(124,58,237,.03)')
      laneGrad.addColorStop(0.5, 'rgba(124,58,237,.07)')
      laneGrad.addColorStop(1, 'rgba(124,58,237,.03)')
      ctx.fillStyle = laneGrad
      ctx.fillRect(0, ly, W, laneH)

      // Score
      ctx.fillStyle = p.color
      ctx.font = '700 .78rem "Space Grotesk",sans-serif'
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(`${p.name}  ${this.scores[p.id] ?? 0}`, W * 0.18, ly + laneH / 2)

      // Broomstick
      const bx = W * 0.09
      const by = ly + (this.broomY[p.id] ?? 0.5) * laneH
      ctx.save()
      ctx.translate(bx, by)
      ctx.font = '1.6rem sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.shadowBlur = 10; ctx.shadowColor = p.color
      ctx.fillText('🧹', 0, 0)
      ctx.shadowBlur = 0
      ctx.restore()
    }

    // Objects
    for (const obj of this.objects) {
      const ly = laneH * obj.laneIdx
      const ox = obj.x * W
      const oy = ly + obj.y * laneH
      ctx.save()
      ctx.translate(ox, oy)
      if (obj.hit) {
        const age = (ts - obj.hitTs) / 550
        ctx.globalAlpha = Math.max(0, 1 - age)
        ctx.translate(0, -25 * age)
      }
      ctx.font = '1.3rem sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(obj.type === 'star' ? '⭐' : obj.type === 'mushroom' ? '🍄' : '🦇', 0, 0)
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
        ctx.fillText(`🧹 ${winner.name} wins!`, W / 2, H / 2 - 18)
        ctx.shadowBlur = 0
        ctx.fillStyle = '#94a3b8'
        ctx.font = '600 .95rem "Space Grotesk",sans-serif'
        ctx.fillText(`${this.scores[winner.id] ?? 0} points`, W / 2, H / 2 + 26)
      }
    }
  }
}
