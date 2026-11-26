/**
 * Plain Node.js WebSocket relay — dev-time drop-in for PartyKit.
 * Same message routing as room.ts but runs on Windows without issues.
 *
 * URL scheme: ws://HOST:PORT/room/ROOMID
 * (matches what app/src/env.ts emits)
 */

import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage } from 'http'

const PORT = Number(process.env.PORT ?? 1999)

interface Client {
  ws: WebSocket
  id: string
  name: string
  color: string
  role: 'controller' | 'host' | 'spectator'
  joinedAt: number
}

interface Room {
  clients: Map<string, Client>
  hostId: string | null
}

const rooms = new Map<string, Room>()

function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId)
  if (!room) {
    room = { clients: new Map(), hostId: null }
    rooms.set(roomId, room)
  }
  return room
}

function broadcast(room: Room, data: string, exclude?: string): void {
  for (const client of room.clients.values()) {
    if (client.id !== exclude && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data)
    }
  }
}

function getClient(room: Room, id: string): Client | undefined {
  return room.clients.get(id)
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Waggle relay — connect via WebSocket at /room/:id\n')
})

const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const url = req.url ?? ''
  const match = url.match(/^\/room\/([A-Za-z0-9_-]+)/)
  if (!match) {
    ws.close(1008, 'URL must be /room/:id')
    return
  }
  const roomId = match[1]!
  const room = getOrCreateRoom(roomId)

  // Generate a short stable ID for this connection
  const clientId = Math.random().toString(36).slice(2, 10)

  const client: Client = {
    ws,
    id: clientId,
    name: 'Ghost',
    color: '#888',
    role: 'controller',
    joinedAt: Date.now(),
  }

  // Send current room state before the client announces itself
  ws.send(
    JSON.stringify({
      type: 'room_state',
      players: [...room.clients.values()].map(({ id, name, color, role, joinedAt }) => ({
        id, name, color, role, joinedAt,
      })),
    }),
  )

  room.clients.set(clientId, client)

  ws.on('message', (raw: Buffer) => {
    let msg: Record<string, unknown>
    try { msg = JSON.parse(raw.toString()) as Record<string, unknown> }
    catch { return }

    switch (msg['type']) {
      case 'join': {
        const role = (msg['role'] as string) ?? 'controller'
        client.name = (msg['name'] as string) ?? 'Player'
        client.color = (msg['color'] as string) ?? '#888'
        client.role = role as Client['role']
        if (role === 'host') room.hostId = clientId

        ws.send(JSON.stringify({ type: 'welcome', selfId: clientId, roomId }))
        broadcast(room, JSON.stringify({
          type: 'player_join',
          player: { id: clientId, name: client.name, color: client.color, role: client.role, joinedAt: client.joinedAt },
        }), clientId)
        break
      }

      case 'frame': {
        if (room.hostId && room.hostId !== clientId) {
          getClient(room, room.hostId)?.ws.send(
            JSON.stringify({ type: 'sensor_frame', playerId: clientId, frame: msg['frame'] }),
          )
        }
        break
      }

      case 'ping': {
        ws.send(JSON.stringify({
          type: 'pong',
          pingId: msg['pingId'],
          sentAt: msg['sentAt'],
          serverT: Date.now(),
        }))
        break
      }

      case 'game_state': {
        if (clientId === room.hostId) {
          broadcast(room, raw.toString(), clientId)
        }
        break
      }

      case 'gesture_ack': {
        if (clientId === room.hostId) {
          getClient(room, msg['targetId'] as string)?.ws.send(raw.toString())
        }
        break
      }

      case 'direct': {
        const targetId =
          clientId === room.hostId
            ? (msg['targetId'] as string)
            : (room.hostId ?? '')
        getClient(room, targetId)?.ws.send(raw.toString())
        break
      }
    }
  })

  ws.on('close', () => {
    room.clients.delete(clientId)
    if (room.hostId === clientId) room.hostId = null
    broadcast(room, JSON.stringify({ type: 'player_leave', playerId: clientId, name: client.name }))
    if (room.clients.size === 0) rooms.delete(roomId)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[waggle-relay] listening on http://localhost:${PORT}`)
  console.log(`[waggle-relay] connect via ws://localhost:${PORT}/room/:id`)
})
