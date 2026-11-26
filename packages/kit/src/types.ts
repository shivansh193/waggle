// Core sensor and gesture types shared between host, controller, and tests.

export interface SensorFrame {
  t: number                        // ms since session start
  acc: [number, number, number]    // accelerometer x,y,z in m/s²
  gyro: [number, number, number]   // gyroscope x,y,z in rad/s
  ori: [number, number, number]    // DeviceOrientation alpha, beta, gamma (degrees)
}

export interface Trace {
  gesture: string
  device: string
  hz: number
  frames: SensorFrame[]
  recordedAt?: number
}

export type GestureType =
  | 'flick'
  | 'swing'
  | 'shake'
  | 'tilt'
  | 'twist'
  | 'shape'

export interface GestureResult {
  detected: boolean
  confidence: number  // 0–1
  data?: Record<string, unknown>
}

export interface TiltReading {
  pitch: number  // beta  -180..180 (forward/back)
  roll: number   // gamma  -90..90  (left/right)
}

export const PLAYER_COLORS = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
  '#e91e63',
] as const

export type PlayerColor = (typeof PLAYER_COLORS)[number]

export interface Player {
  id: string
  name: string
  color: PlayerColor
  role: 'controller' | 'host' | 'spectator'
  joinedAt: number
}

// ── Wire messages ────────────────────────────────────────────────────────────

/** Messages a controller sends to the relay (and on to the host). */
export type ControllerMsg =
  | { type: 'join'; name: string; color: PlayerColor; role: 'controller' }
  | { type: 'frame'; frame: SensorFrame }
  | { type: 'pong'; pingId: number; clientT: number }

/** Messages the host sends to the relay. */
export type HostMsg =
  | { type: 'join'; name: string; color: PlayerColor; role: 'host' }
  | { type: 'ping'; pingId: number; sentAt: number }
  | { type: 'game_state'; state: GameState }
  | { type: 'gesture_ack'; targetId: string; gesture: GestureType }
  | { type: 'direct'; targetId: string; payload: unknown }

/** Messages the relay sends back to any client. */
export type RelayMsg =
  | { type: 'welcome'; selfId: string; roomId: string }
  | { type: 'player_join'; player: Player }
  | { type: 'player_leave'; playerId: string; name: string }
  | { type: 'room_state'; players: Player[] }
  | { type: 'ping'; pingId: number; sentAt: number }
  | { type: 'pong'; pingId: number; sentAt: number; serverT: number }
  | { type: 'sensor_frame'; playerId: string; frame: SensorFrame }
  | { type: 'game_state'; state: GameState }
  | { type: 'gesture_ack'; gesture: GestureType }
  | { type: 'direct'; payload: unknown }

// ── Game state ────────────────────────────────────────────────────────────────

export interface GameState {
  game: 'lobby' | 'seance' | 'hex_duel'
  players: Player[]
  data: LobbyData | SeanceData | HexDuelData
}

export interface LobbyData {
  ready: string[]  // player IDs who clicked "ready"
}

export interface SeanceData {
  question: string
  answer: string
  typed: string        // letters spelled so far
  planchette: { x: number; y: number }  // -1..1 normalized
  ghosts: boolean      // ghost currently interrupting?
}

export interface HexDuelData {
  hp: Record<string, number>  // playerId → hp (starts at 3)
  phase: 'drawing' | 'casting' | 'resolving' | 'done'
  spells: Record<string, SpellCast | null>
  winner: string | null
}

export type SpellShape = 'circle' | 'zigzag' | 'spiral' | 'custom'

export interface SpellCast {
  playerId: string
  shape: SpellShape
  castAt: number
}
