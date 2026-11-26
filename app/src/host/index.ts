import '../style.css'
import { HostRoom, generateRoomId } from './room.js'
import {
  renderQR, setRoomCode, setJoinHint, renderPlayers, updateDebug,
  showLobby, showGamePicker, showReturnBtn, renderGameCards,
} from './ui.js'
import { LobbyRenderer } from './games/lobby.js'
import { SeanceGame } from './games/seance.js'
import { HexDuelGame } from './games/hexDuel.js'
import { PumpkinLaunchGame } from './games/pumpkinLaunch.js'
import { BroomDerbyGame } from './games/broomDerby.js'
import { CauldronChaosGame } from './games/cauldronChaos.js'
import { PhantomFreqGame } from './games/phantomFreq.js'
import type { Player } from '@waggle/kit'

type GameKey = 'lobby' | 'seance' | 'hex_duel' | 'pumpkin_launch' | 'broom_derby' | 'cauldron_chaos' | 'phantom_freq'

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const startBtn = document.getElementById('start-btn') as HTMLButtonElement

const roomId = generateRoomId()

// ── Game instances ────────────────────────────────────────────────────────────

const lobby = new LobbyRenderer(canvas)
const seance = new SeanceGame(canvas)
const hexDuel = new HexDuelGame(canvas)
const pumpkinLaunch = new PumpkinLaunchGame(canvas)
const broomDerby = new BroomDerbyGame(canvas)
const cauldronChaos = new CauldronChaosGame(canvas)
const phantomFreq = new PhantomFreqGame(canvas)

let activeGame: GameKey = 'lobby'
lobby.start()

// ── Game catalog ──────────────────────────────────────────────────────────────

const GAME_CATALOG = [
  { key: 'seance',         name: 'Séance',              emoji: '👻', players: '2–8', tag: 'Co-op',        tagClass: 'co-op', desc: 'Steer the planchette together and answer the spirits' },
  { key: 'hex_duel',       name: 'Hex Duel',            emoji: '⚡', players: '1v1',  tag: 'Competitive',  tagClass: 'comp',  desc: 'Draw magical shapes and flick to cast your spell' },
  { key: 'pumpkin_launch', name: 'Pumpkin Launch',       emoji: '🎃', players: '1–4', tag: 'Competitive',  tagClass: 'comp',  desc: 'Flick when a pumpkin enters your catch zone to score' },
  { key: 'broom_derby',    name: 'Broomstick Derby',    emoji: '🧹', players: '2–4', tag: 'Competitive',  tagClass: 'comp',  desc: 'Tilt to steer — dodge bats, grab stars and mushrooms' },
  { key: 'cauldron_chaos', name: 'Cauldron Chaos',      emoji: '🧪', players: '2–6', tag: 'Co-op',        tagClass: 'co-op', desc: 'React to gesture prompts together to brew the potion' },
  { key: 'phantom_freq',   name: 'Phantom Frequency',   emoji: '👁',  players: '2–8', tag: 'Competitive',  tagClass: 'comp',  desc: 'Shake exactly the target number of times to win rounds' },
] as const

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
    pumpkinLaunch.setPlayers(players)
    broomDerby.setPlayers(players)
    cauldronChaos.setPlayers(players)
    phantomFreq.setPlayers(players)
  },

  onLatencyUpdate(p50, p95) {
    updateDebug({ p50, p95 })
  },

  onGestureEvent(playerId, gesture) {
    switch (activeGame) {
      case 'seance':
        if (gesture === 'shake') seance.onShake(playerId)
        break
      case 'hex_duel':
        if (gesture === 'flick') hexDuel.onFlick(playerId)
        break
      case 'pumpkin_launch':
        pumpkinLaunch.onGesture(playerId, gesture)
        break
      case 'broom_derby':
        broomDerby.onGesture(playerId, gesture)
        break
      case 'cauldron_chaos':
        cauldronChaos.onGesture(playerId, gesture)
        break
      case 'phantom_freq':
        phantomFreq.onGesture(playerId, gesture)
        break
    }
  },

  onRawFrame(playerId, frame) {
    if (activeGame === 'seance') seance.pushFrame(playerId, frame)
    if (activeGame === 'hex_duel') hexDuel.pushFrame(playerId, frame)
    if (activeGame === 'broom_derby') broomDerby.pushFrame(playerId, frame)
  },
})

updateDebug({ relay: 'connecting' })

// ── Game picker ───────────────────────────────────────────────────────────────

renderGameCards([...GAME_CATALOG], (key) => {
  showGamePicker(false)
  startGame(key as GameKey)
})

document.getElementById('picker-back-btn')!.addEventListener('click', () => {
  showGamePicker(false)
  showLobby(true)
})

document.getElementById('return-btn')!.addEventListener('click', () => {
  stopActiveGame()
  returnToLobby()
})

function returnToLobby(): void {
  activeGame = 'lobby'
  showReturnBtn(false)
  showLobby(true)
  lobby.setPlayers(room.playerList)
  lobby.start()
}

function stopActiveGame(): void {
  seance.stop()
  hexDuel.stop()
  pumpkinLaunch.stop()
  broomDerby.stop()
  cauldronChaos.stop()
  phantomFreq.stop()
}

// ── Start game ────────────────────────────────────────────────────────────────

function startGame(game: GameKey): void {
  stopActiveGame()
  lobby.stop()
  showLobby(false)
  showReturnBtn(true)
  activeGame = game

  const broadcast = (data: Record<string, unknown>) =>
    room.broadcastGameState({ game, players: room.playerList, data })

  switch (game) {
    case 'seance':
      seance.setPlayers(room.playerList)
      seance.start()
      seance.onStateChange = (data) => broadcast(data as unknown as Record<string, unknown>)
      break

    case 'hex_duel':
      hexDuel.setPlayers(room.playerList)
      hexDuel.start()
      hexDuel.onStateChange = (data) => broadcast(data as unknown as Record<string, unknown>)
      hexDuel.onGestureAck = (pid, g) => room.ackGesture(pid, g)
      break

    case 'pumpkin_launch':
      pumpkinLaunch.setPlayers(room.playerList)
      pumpkinLaunch.start()
      pumpkinLaunch.onStateChange = broadcast
      pumpkinLaunch.onGestureAck = (pid, g) => room.ackGesture(pid, g)
      break

    case 'broom_derby':
      broomDerby.setPlayers(room.playerList)
      broomDerby.start()
      broomDerby.onStateChange = broadcast
      broomDerby.onGestureAck = (pid, g) => room.ackGesture(pid, g)
      break

    case 'cauldron_chaos':
      cauldronChaos.setPlayers(room.playerList)
      cauldronChaos.start()
      cauldronChaos.onStateChange = broadcast
      cauldronChaos.onGestureAck = (pid, g) => room.ackGesture(pid, g)
      break

    case 'phantom_freq':
      phantomFreq.setPlayers(room.playerList)
      phantomFreq.start()
      phantomFreq.onStateChange = broadcast
      phantomFreq.onGestureAck = (pid, g) => room.ackGesture(pid, g)
      break
  }
}

// ── Start button opens picker ─────────────────────────────────────────────────

startBtn.addEventListener('click', () => {
  showLobby(false)
  showGamePicker(true)
})
