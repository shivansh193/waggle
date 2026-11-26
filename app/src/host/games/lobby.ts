/**
 * Lobby renderer — draws the waiting screen on the game canvas until
 * a game is started. Shows player avatars with a gentle float animation.
 */

import type { Player } from '@waggle/kit'

export class LobbyRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private players: Player[] = []
  private rafId = 0
  private t = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  setPlayers(players: Player[]): void {
    this.players = players.filter(p => p.role !== 'host')
  }

  start(): void {
    const tick = (ts: number) => {
      this.t = ts
      this.draw()
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stop(): void {
    cancelAnimationFrame(this.rafId)
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    this.canvas.width = rect.width * devicePixelRatio
    this.canvas.height = rect.height * devicePixelRatio
    this.ctx.scale(devicePixelRatio, devicePixelRatio)
  }

  private draw(): void {
    const { ctx } = this
    const W = this.canvas.width / devicePixelRatio
    const H = this.canvas.height / devicePixelRatio

    ctx.clearRect(0, 0, W, H)

    // Subtle radial gradient background
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6)
    grad.addColorStop(0, 'rgba(124,58,237,0.08)')
    grad.addColorStop(1, 'rgba(10,10,26,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    if (this.players.length === 0) {
      ctx.fillStyle = 'rgba(148,163,184,0.3)'
      ctx.font = '700 1rem Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Scan the QR code to join', W / 2, H / 2)
      return
    }

    // Draw floating player bubbles
    const cols = Math.ceil(Math.sqrt(this.players.length))
    const rows = Math.ceil(this.players.length / cols)
    const size = Math.min(W / (cols + 1), H / (rows + 1), 100)

    this.players.forEach((p, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = (W / (cols + 1)) * (col + 1)
      const y = (H / (rows + 1)) * (row + 1)
      const bob = Math.sin((this.t / 1000 + i * 0.7) * 2) * 8

      ctx.save()
      ctx.translate(x, y + bob)

      // Shadow
      ctx.shadowBlur = 20
      ctx.shadowColor = p.color
      ctx.fillStyle = p.color + '33'
      ctx.beginPath()
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2)
      ctx.fill()

      ctx.shadowBlur = 0
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(0, 0, size / 2.5, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#fff'
      ctx.font = `700 ${size / 4}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(p.name.slice(0, 2).toUpperCase(), 0, 0)

      ctx.restore()
    })
  }
}
