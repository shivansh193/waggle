/**
 * PartyKit Durable Object — one instance per room.
 *
 * Roles:
 *   host        — the laptop/TV; runs the game, one per room
 *   controller  — a phone; sends sensor frames to the host
 *
 * Routing:
 *   frame     controller → relay → host only
 *   game_state  host → relay → all controllers
 *   gesture_ack host → relay → specific controller
 *   direct      host → relay → specific controller (or controller → host)
 *   ping/pong   any → relay  → back to sender (RTT measure)
 *   join/leave  relay broadcasts to everyone
 */

import type * as Party from 'partykit/server'

interface PlayerMeta {
  id: string
  name: string
  color: string
  role: 'controller' | 'host' | 'spectator'
  joinedAt: number
}

export default class Room implements Party.Server {
  private players = new Map<string, PlayerMeta>()
  private hostId: string | null = null

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection): void {
    // Send the current room state to the new connection so it can render
    // the player list immediately without waiting for a join event.
    conn.send(
      JSON.stringify({
        type: 'room_state',
        players: [...this.players.values()],
      }),
    )
  }

  onMessage(raw: string | ArrayBuffer, sender: Party.Connection): void {
    if (typeof raw !== 'string') return
    let msg: Record<string, unknown>
    try { msg = JSON.parse(raw) as Record<string, unknown> }
    catch { return }

    switch (msg['type']) {
      case 'join': {
        const role = (msg['role'] as string) ?? 'controller'
        const player: PlayerMeta = {
          id: sender.id,
          name: (msg['name'] as string) ?? 'Player',
          color: (msg['color'] as string) ?? '#888',
          role: role as PlayerMeta['role'],
          joinedAt: Date.now(),
        }
        this.players.set(sender.id, player)
        if (role === 'host') this.hostId = sender.id

        sender.send(JSON.stringify({ type: 'welcome', selfId: sender.id, roomId: this.room.id }))
        this.room.broadcast(JSON.stringify({ type: 'player_join', player }), [sender.id])
        break
      }

      case 'frame': {
        // Controller → host only
        if (this.hostId && this.hostId !== sender.id) {
          const hostConn = this.getConn(this.hostId)
          hostConn?.send(JSON.stringify({ type: 'sensor_frame', playerId: sender.id, frame: msg['frame'] }))
        }
        break
      }

      case 'ping': {
        // Measure relay RTT — echo straight back to sender
        sender.send(
          JSON.stringify({
            type: 'pong',
            pingId: msg['pingId'],
            sentAt: msg['sentAt'],
            serverT: Date.now(),
          }),
        )
        break
      }

      case 'game_state': {
        // Host → all controllers
        if (sender.id === this.hostId) {
          this.room.broadcast(raw, [sender.id])
        }
        break
      }

      case 'gesture_ack': {
        // Host → specific controller
        if (sender.id === this.hostId) {
          const target = this.getConn(msg['targetId'] as string)
          target?.send(raw)
        }
        break
      }

      case 'direct': {
        // Host → specific controller, or controller → host
        const targetId =
          sender.id === this.hostId
            ? (msg['targetId'] as string)
            : (this.hostId ?? '')
        this.getConn(targetId)?.send(raw)
        break
      }
    }
  }

  onClose(conn: Party.Connection): void {
    const player = this.players.get(conn.id)
    if (!player) return
    this.players.delete(conn.id)
    if (this.hostId === conn.id) this.hostId = null
    this.room.broadcast(
      JSON.stringify({ type: 'player_leave', playerId: conn.id, name: player.name }),
    )
  }

  private getConn(id: string): Party.Connection | undefined {
    for (const c of this.room.getConnections()) {
      if (c.id === id) return c
    }
    return undefined
  }
}
