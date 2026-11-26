/**
 * Controller entry point — phone browser.
 *
 * Flow:
 * 1. User enters name and picks a colour.
 * 2. On "Join" (user gesture): request iOS motion permission → connect.
 * 3. Stream sensor frames to relay at ~60 Hz.
 * 4. Listen for pings from host → respond with pong (latency measurement).
 * 5. Listen for gesture_ack → flash gesture label + haptic.
 * 6. Render tilt visualiser.
 */

import '../style.css'
import { TraceRecorder, getTilt, type SensorFrame, type RelayMsg } from '@waggle/kit'
import {
  MotionSensor,
  hapticGesture,
  hapticError,
  requestWakeLock,
} from './motion.js'
import {
  initSetupScreen,
  showActiveScreen,
  showPermissionOverlay,
  setConnStatus,
  flashGesture,
  renderTiltCanvas,
  renderGyroPathCanvas,
} from './ui.js'
import { relayUrl } from '../env.js'
import type { PlayerColor } from '@waggle/kit'

// Get room ID from URL query string (?room=XXXX)
const params = new URLSearchParams(window.location.search)
const roomId = params.get('room') ?? ''

if (!roomId) {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#94a3b8;font:1rem Inter,sans-serif;text-align:center;padding:2rem">
      No room code found.<br/>Scan the QR code from the host screen.
    </div>`
}

const sensor = new MotionSensor()
const recorder = new TraceRecorder()

let socket: WebSocket | null = null
let playerName = 'Ghost'
let playerColor: PlayerColor = '#9b59b6'
let frameBuffer: SensorFrame[] = []
let gyroBuffer: SensorFrame[] = []
let currentGame = 'lobby'

// ── Setup screen ──────────────────────────────────────────────────────────────

initSetupScreen(async (name, color) => {
  playerName = name
  playerColor = color

  // On iOS, DeviceMotionEvent.requestPermission() MUST be called inside a
  // user-gesture handler. The join button click is exactly that.
  if (MotionSensor.needsPermission()) {
    showPermissionOverlay(true)
    // The overlay has a "Enable Motion Controls" button — clicking it
    // triggers the actual iOS prompt.
    document.getElementById('grant-btn')?.addEventListener('click', async () => {
      const state = await sensor.requestPermission()
      if (state === 'granted') {
        showPermissionOverlay(false)
        connect()
      } else {
        hapticError()
        showPermissionOverlay(false)
        document.body.insertAdjacentHTML(
          'beforeend',
          `<div style="position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);background:rgba(239,68,68,.9);color:#fff;padding:.5rem 1rem;border-radius:8px;font-size:.85rem">
            Motion access denied. Some features won't work.
           </div>`,
        )
        connect()  // connect anyway, just without motion
      }
    }, { once: true })
    showActiveScreen(name, color, roomId)
  } else {
    // Android / Desktop — just go
    await sensor.requestPermission()
    showActiveScreen(name, color, roomId)
    connect()
  }
})

// ── Connection ────────────────────────────────────────────────────────────────

function connect(): void {
  if (!roomId) return
  setConnStatus('connecting')

  socket = new WebSocket(relayUrl(roomId))

  socket.addEventListener('open', () => {
    socket!.send(JSON.stringify({
      type: 'join',
      name: playerName,
      color: playerColor,
      role: 'controller',
    }))
    setConnStatus('connected')
    startSensors()
    requestWakeLock().catch(() => {/* ok */})
  })

  socket.addEventListener('message', (ev: MessageEvent<string>) => {
    try {
      const msg = JSON.parse(ev.data) as RelayMsg
      handleMsg(msg)
    } catch { /* ignore */ }
  })

  socket.addEventListener('close', () => {
    setConnStatus('disconnected')
    sensor.stop()
  })
}

function handleMsg(msg: RelayMsg): void {
  switch (msg.type) {
    case 'ping':
      // Respond immediately — host measures RTT
      socket?.send(JSON.stringify({ type: 'pong', pingId: msg.pingId, clientT: msg.sentAt }))
      break

    case 'gesture_ack':
      hapticGesture()
      flashGesture(msg.gesture, playerColor)
      break

    case 'game_state':
      currentGame = (msg as unknown as { state: { game: string } }).state.game ?? 'lobby'
      if (currentGame !== 'hex_duel') gyroBuffer = []
      break
  }
}

// ── Sensor streaming ──────────────────────────────────────────────────────────

function startSensors(): void {
  sensor.start((frame) => {
    frameBuffer.push(frame)
    gyroBuffer.push(frame)

    // Keep rolling 1s buffer for tilt, 2s for gyro path
    const cutoff1s = frame.t - 1000
    while (frameBuffer.length > 0 && frameBuffer[0]!.t < cutoff1s) frameBuffer.shift()
    const cutoff2s = frame.t - 2000
    while (gyroBuffer.length > 0 && gyroBuffer[0]!.t < cutoff2s) gyroBuffer.shift()

    // Send every frame to relay (host runs the gesture detectors)
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'frame', frame }))
    }

    // Record if recording is active (teach-a-move)
    recorder.push(frame)

    // Switch canvas mode based on current game
    if (currentGame === 'hex_duel') {
      renderGyroPathCanvas(gyroBuffer)
    } else {
      const tilt = getTilt(frameBuffer)
      renderTiltCanvas(tilt.pitch, tilt.roll)
    }
  })
}

// ── Teach-a-move hook (exposed on window for DevTools / debugging) ─────────────

declare global {
  interface Window {
    waggle: {
      startRecording(): void
      stopRecording(gestureName: string): object
    }
  }
}

window.waggle = {
  startRecording() {
    recorder.start()
    console.log('[waggle] Recording started')
  },
  stopRecording(gestureName: string) {
    recorder.stop()
    const trace = recorder.toTrace(gestureName, navigator.userAgent)
    console.log('[waggle] Trace ready:', trace)
    console.log('[waggle] Copy the JSON above and save to fixtures/')
    return trace
  },
}
