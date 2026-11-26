/**
 * Thin WebSocket transport wrapper for phone ↔ relay ↔ host communication.
 * Works in both browser and Node (for tests that replay over a mock socket).
 */

import type {
  ControllerMsg,
  HostMsg,
  RelayMsg,
} from './types.js'

export type AnyOutMsg = ControllerMsg | HostMsg

/** Minimal WebSocket-like interface so tests can inject a mock. */
export interface WaggleSocket {
  send(data: string): void
  close(): void
  onmessage: ((event: { data: string }) => void) | null
  onopen: (() => void) | null
  onclose: (() => void) | null
  onerror: ((event: unknown) => void) | null
  readonly readyState: number
}

export type MsgHandler = (msg: RelayMsg) => void

export class WaggleTransport {
  private socket: WaggleSocket | null = null
  private handlers = new Set<MsgHandler>()
  private queue: AnyOutMsg[] = []

  constructor(
    private readonly buildSocket: (roomId: string) => WaggleSocket,
  ) {}

  connect(roomId: string): void {
    const ws = this.buildSocket(roomId)
    this.socket = ws

    ws.onopen = () => {
      for (const msg of this.queue) this.sendRaw(msg)
      this.queue = []
    }

    ws.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data) as RelayMsg
        for (const h of this.handlers) h(msg)
      } catch {
        // malformed message — ignore
      }
    }

    ws.onerror = () => {
      // reconnection logic can go here
    }

    ws.onclose = () => {
      this.socket = null
    }
  }

  send(msg: AnyOutMsg): void {
    if (this.socket?.readyState === 1 /* OPEN */) {
      this.sendRaw(msg)
    } else {
      this.queue.push(msg)
    }
  }

  on(handler: MsgHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  disconnect(): void {
    this.socket?.close()
    this.socket = null
    this.queue = []
  }

  get connected(): boolean {
    return this.socket?.readyState === 1
  }

  private sendRaw(msg: AnyOutMsg): void {
    this.socket?.send(JSON.stringify(msg))
  }
}

// ── Latency meter ─────────────────────────────────────────────────────────────

export class LatencyMeter {
  private pending = new Map<number, number>()  // pingId → performance.now()
  private samples: number[] = []
  private counter = 0

  /** Call on every received RelayMsg; returns latency ms if this was a pong. */
  onMessage(msg: RelayMsg): number | null {
    if (msg.type !== 'pong') return null
    const sentAt = this.pending.get(msg.pingId)
    if (sentAt == null) return null
    this.pending.delete(msg.pingId)
    const rtt = performance.now() - sentAt
    this.samples.push(rtt)
    if (this.samples.length > 120) this.samples.shift()
    return rtt
  }

  /** Returns the HostMsg ping to send, and records the sent time. */
  buildPing(): HostMsg & { type: 'ping' } {
    const pingId = ++this.counter
    this.pending.set(pingId, performance.now())
    return { type: 'ping', pingId, sentAt: performance.now() }
  }

  get p50(): number { return this.percentile(0.5) }
  get p95(): number { return this.percentile(0.95) }
  get sampleCount(): number { return this.samples.length }

  private percentile(p: number): number {
    if (this.samples.length === 0) return 0
    const sorted = [...this.samples].sort((a, b) => a - b)
    return sorted[Math.floor((sorted.length - 1) * p)]!
  }
}
