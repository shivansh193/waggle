/**
 * Host-side room state and relay connection.
 * Owns the PartySocket, manages the player list, runs the latency meter,
 * and fires gesture events into the active game.
 */

import {
  LatencyMeter,
  detectFlick,
  detectShake,
  getTilt,
  PLAYER_COLORS,
  type Player,
  type RelayMsg,
  type SensorFrame,
  type GameState,
} from '@waggle/kit'
import { relayUrl, BASE_URL } from '../env.js'

export interface HostRoomEvents {
  onPlayersChange(players: Player[]): void
  onLatencyUpdate(p50: number, p95: number): void
  onConnected(roomId: string): void
  onDisconnected(): void
  onGestureEvent(playerId: string, gesture: string, data: Record<string, unknown>): void
  /** Raw sensor frame, forwarded to whichever game is active. */
  onRawFrame?(playerId: string, frame: SensorFrame): void
}

export class HostRoom {
  readonly roomId: string
  private socket: WebSocket
  private players = new Map<string, Player>()
  private latency = new LatencyMeter()
  private frameBuffers = new Map<string, SensorFrame[]>()
  private pingInterval: ReturnType<typeof setInterval> | null = null

  constructor(
    roomId: string,
    private readonly events: HostRoomEvents,
  ) {
    this.roomId = roomId
    this.socket = this.connect()
  }

  private connect(): WebSocket {
    const ws = new WebSocket(relayUrl(this.roomId))

    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          type: 'join',
          name: 'host',
          color: PLAYER_COLORS[0]!,
          role: 'host',
        }),
      )
      this.events.onConnected(this.roomId)
      this.startPingLoop()
    })

    ws.addEventListener('message', (ev: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(ev.data) as RelayMsg
        this.handleMsg(msg)
      } catch {
        // malformed — ignore
      }
    })

    ws.addEventListener('close', () => {
      this.events.onDisconnected()
      // Simple reconnect after 2 s
      setTimeout(() => { this.socket = this.connect() }, 2000)
    })

    return ws
  }

  get joinUrl(): string {
    return `${BASE_URL}/join/?room=${this.roomId}`
  }

  get playerList(): Player[] {
    return [...this.players.values()]
  }

  broadcastGameState(state: GameState): void {
    this.send(JSON.stringify({ type: 'game_state', state }))
  }

  ackGesture(targetId: string, gesture: string): void {
    this.send(JSON.stringify({ type: 'gesture_ack', targetId, gesture }))
  }

  private send(data: string): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(data)
  }

  private handleMsg(msg: RelayMsg): void {
    switch (msg.type) {
      case 'room_state':
        for (const p of msg.players) this.players.set(p.id, p)
        this.events.onPlayersChange(this.playerList)
        break

      case 'player_join':
        this.players.set(msg.player.id, msg.player)
        this.events.onPlayersChange(this.playerList)
        break

      case 'player_leave':
        this.players.delete(msg.playerId)
        this.frameBuffers.delete(msg.playerId)
        this.events.onPlayersChange(this.playerList)
        break

      case 'pong': {
        const rtt = this.latency.onMessage(msg)
        if (rtt !== null) {
          this.events.onLatencyUpdate(this.latency.p50, this.latency.p95)
        }
        break
      }

      case 'sensor_frame':
        this.ingestFrame(msg.playerId, msg.frame)
        this.events.onRawFrame?.(msg.playerId, msg.frame)
        break
    }
  }

  private ingestFrame(playerId: string, frame: SensorFrame): void {
    let buf = this.frameBuffers.get(playerId)
    if (!buf) { buf = []; this.frameBuffers.set(playerId, buf) }

    buf.push(frame)
    // Keep a 1-second rolling window
    const cutoff = frame.t - 1000
    while (buf.length > 0 && buf[0]!.t < cutoff) buf.shift()

    // Run gesture detectors on the latest window
    const flick = detectFlick(buf)
    if (flick.detected && flick.confidence > 0.5) {
      this.events.onGestureEvent(playerId, 'flick', {
        direction: flick.direction,
        speed: flick.speed,
        confidence: flick.confidence,
      })
      // Clear buffer to prevent double-fire
      buf.length = 0
    }

    const shake = detectShake(buf)
    if (shake.detected && shake.confidence > 0.5) {
      this.events.onGestureEvent(playerId, 'shake', { confidence: shake.confidence })
      buf.length = 0
    }
  }

  getTiltForPlayer(playerId: string): { pitch: number; roll: number } {
    const buf = this.frameBuffers.get(playerId) ?? []
    return getTilt(buf)
  }

  close(): void {
    if (this.pingInterval) clearInterval(this.pingInterval)
    this.socket.close()
  }

  private startPingLoop(): void {
    if (this.pingInterval) clearInterval(this.pingInterval)
    this.pingInterval = setInterval(() => {
      const ping = this.latency.buildPing()
      this.send(JSON.stringify(ping))
    }, 1000)
  }
}

/** Generate a random 4-letter room code. */
export function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
