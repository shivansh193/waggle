/**
 * Host entry point — wires together the room, UI, and games.
 */

import '../style.css'
import { HostRoom, generateRoomId } from './room.js'
import { renderQR, setRoomCode, setJoinHint, renderPlayers, updateDebug, showLobby } from './ui.js'
import { LobbyRenderer } from './games/lobby.js'
import { SeanceGame } from './games/seance.js'
import { HexDuelGame } from './games/hexDuel.js'
import type { Player } from '@waggle/kit'

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const startBtn = document.getElementById('start-btn') as HTMLButtonElement

const roomId = generateRoomId()

// ── Renderers ─────────────────────────────────────────────────────────────────

const lobby = new LobbyRenderer(canvas)
const seance = new SeanceGame(canvas)
const hexDuel = new HexDuelGame(canvas)

let activeGame: 'lobby' | 'seance' | 'hex_duel' = 'lobby'
lobby.start()

// ── Room ──────────────────────────────────────────────────────────────────────

const room = new HostRoom(roomId, {
  onConnected(id) {
    setRoomCode(id)
    setJoinHint(room.joinUrl)
    renderQR(room.joinUrl)
    updateDebug({ relay: 'ok' })
  },

  onDisconnected() {
    updateDebug({ relay: 'error' })
  },

  onPlayersChange(players: Player[]) {
    renderPlayers(players)
    lobby.setPlayers(players)
    seance.setPlayers(players)
    hexDuel.setPlayers(players)
  },

  onLatencyUpdate(p50, p95) {
    updateDebug({ p50, p95 })
  },

  onGestureEvent(playerId, gesture, data) {
    if (activeGame === 'seance' && gesture === 'shake') {
      seance.onShake(playerId)
    }
    if (activeGame === 'hex_duel' && gesture === 'flick') {
      hexDuel.onFlick(playerId)
    }
  },

  onRawFrame(playerId, frame) {
    if (activeGame === 'seance') seance.pushFrame(playerId, frame)
    if (activeGame === 'hex_duel') hexDuel.pushFrame(playerId, frame)
  },
})

updateDebug({ relay: 'connecting' })

// ── Game start ────────────────────────────────────────────────────────────────

function switchToGame(game: 'seance' | 'hex_duel'): void {
  lobby.stop()
  showLobby(false)

  activeGame = game
  if (game === 'seance') {
    seance.setPlayers(room.playerList)
    seance.start()
    // Forward raw frames to seance
    seance.onStateChange = (state) => room.broadcastGameState({ game, players: room.playerList, data: state })
  } else {
    hexDuel.setPlayers(room.playerList)
    hexDuel.start()
    hexDuel.onStateChange = (state) => room.broadcastGameState({ game, players: room.playerList, data: state })
    hexDuel.onGestureAck = (pid, g) => room.ackGesture(pid, g)
  }
}

startBtn.addEventListener('click', () => {
  const count = room.playerList.filter(p => p.role !== 'host').length
  if (count >= 2) {
    switchToGame('hex_duel')
  } else {
    switchToGame('seance')
  }
})

// Forward sensor frames to active games
// (we hook into the room's private ingest by patching the events)
// Better approach: extend HostRoomEvents with onRawFrame
// For now, intercept via periodic poll of room.getTiltForPlayer
// Raw frames are routed to the active game via onRawFrame in HostRoomEvents.
