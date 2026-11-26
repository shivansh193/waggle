/**
 * Gesture detectors — pure functions over SensorFrame arrays.
 * The same code runs live (against the real sensor stream) and in tests
 * (against recorded fixture traces). No side effects, no globals.
 */

import type { GestureResult, SensorFrame, TiltReading } from './types.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function mag([x, y, z]: [number, number, number]): number {
  return Math.sqrt(x * x + y * y + z * z)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// ── Flick ────────────────────────────────────────────────────────────────────

const FLICK_PEAK_MS = 250     // window in which the spike must rise and fall
const FLICK_MIN_G = 15        // m/s² threshold for the peak
const FLICK_TAIL_G = 6        // m/s² — before/after should be below this

/**
 * Detect a brief impulse motion (sharp snap in one direction).
 * Returns the dominant acceleration direction and peak magnitude.
 */
export function detectFlick(frames: SensorFrame[]): GestureResult & {
  direction?: [number, number, number]
  speed?: number
} {
  if (frames.length < 4) return { detected: false, confidence: 0 }

  // Estimate the resting baseline from the first few frames.
  // This handles both linear-acc data (baseline ≈ 0) and
  // accelerationIncludingGravity data (baseline ≈ 9.8 m/s²).
  const baselineSamples = frames.slice(0, Math.min(8, frames.length))
  const baselineMag = baselineSamples.reduce((s, f) => s + mag(f.acc), 0) / baselineSamples.length

  // Find peak frame
  let peakMag = 0
  let peakIdx = -1
  for (let i = 0; i < frames.length; i++) {
    const m = mag(frames[i]!.acc)
    if (m > peakMag) { peakMag = m; peakIdx = i }
  }

  // Peak must exceed baseline by at least FLICK_MIN_G
  if (peakMag - baselineMag < FLICK_MIN_G || peakIdx < 0) {
    return { detected: false, confidence: 0 }
  }

  const peakT = frames[peakIdx]!.t

  // Frames in a ±125ms window around the peak
  const window = frames.filter(
    f => Math.abs(f.t - peakT) <= FLICK_PEAK_MS / 2,
  )

  // Before-peak average (frames before the peak within the window)
  const before = window.filter(f => f.t < peakT)
  const after = window.filter(f => f.t > peakT)

  const beforeAvg =
    before.length > 0
      ? before.reduce((s, f) => s + mag(f.acc), 0) / before.length
      : baselineMag
  const afterAvg =
    after.length > 0
      ? after.reduce((s, f) => s + mag(f.acc), 0) / after.length
      : baselineMag

  // Before/after should return near baseline (impulse, not sustained force)
  if (beforeAvg > baselineMag + FLICK_TAIL_G || afterAvg > baselineMag + FLICK_TAIL_G) {
    return { detected: false, confidence: 0 }
  }

  const [ax, ay, az] = frames[peakIdx]!.acc
  const m = mag([ax, ay, az])
  const direction: [number, number, number] = [ax / m, ay / m, az / m]

  const confidence = clamp(
    (peakMag - baselineMag - FLICK_MIN_G) / (25 - FLICK_MIN_G),
    0,
    1,
  )

  return { detected: true, confidence, direction, speed: peakMag - baselineMag }
}

// ── Shake ────────────────────────────────────────────────────────────────────

const SHAKE_WINDOW_MS = 800
const SHAKE_SIGN_CHANGES = 4   // in dominant axis within the window
const SHAKE_MIN_G = 5

/**
 * Detect rapid back-and-forth motion (like shaking a Magic 8-Ball).
 */
export function detectShake(frames: SensorFrame[]): GestureResult {
  if (frames.length < 6) return { detected: false, confidence: 0 }

  const latest = frames[frames.length - 1]!.t
  const window = frames.filter(f => f.t >= latest - SHAKE_WINDOW_MS)

  if (window.length < 6) return { detected: false, confidence: 0 }

  // Find dominant axis
  const axes = [0, 1, 2].map(axis => ({
    axis,
    max: Math.max(...window.map(f => Math.abs(f.acc[axis]!))),
  }))
  const dominant = axes.sort((a, b) => b.max - a.max)[0]!

  if (dominant.max < SHAKE_MIN_G) return { detected: false, confidence: 0 }

  // Count sign changes in dominant axis
  let signChanges = 0
  let prev = window[0]!.acc[dominant.axis]!
  for (let i = 1; i < window.length; i++) {
    const cur = window[i]!.acc[dominant.axis]!
    if (Math.sign(cur) !== Math.sign(prev) && Math.abs(cur) > SHAKE_MIN_G / 2) {
      signChanges++
      prev = cur
    }
  }

  if (signChanges < SHAKE_SIGN_CHANGES) return { detected: false, confidence: 0 }

  const confidence = clamp((signChanges - SHAKE_SIGN_CHANGES) / 4 + 0.5, 0, 1)
  return { detected: true, confidence }
}

// ── Tilt ─────────────────────────────────────────────────────────────────────

const TILT_ALPHA = 0.25  // smoothing factor for EMA

/**
 * Return smoothed pitch/roll from the latest orientation readings.
 * Not a discrete gesture — call on each new frame to track continuous tilt.
 */
export function getTilt(frames: SensorFrame[]): TiltReading {
  if (frames.length === 0) return { pitch: 0, roll: 0 }

  // Exponential moving average over recent frames (last 10 max)
  const recent = frames.slice(-10)
  let pitch = recent[0]!.ori[1]!   // beta
  let roll = recent[0]!.ori[2]!    // gamma

  for (let i = 1; i < recent.length; i++) {
    const beta = recent[i]!.ori[1]!
    const gamma = recent[i]!.ori[2]!
    pitch = TILT_ALPHA * beta + (1 - TILT_ALPHA) * pitch
    roll = TILT_ALPHA * gamma + (1 - TILT_ALPHA) * roll
  }

  return { pitch, roll }
}

/**
 * Average tilt across multiple players (for Séance co-op steering).
 */
export function averageTilt(readings: TiltReading[]): TiltReading {
  if (readings.length === 0) return { pitch: 0, roll: 0 }
  const sum = readings.reduce(
    (acc, r) => ({ pitch: acc.pitch + r.pitch, roll: acc.roll + r.roll }),
    { pitch: 0, roll: 0 },
  )
  return {
    pitch: sum.pitch / readings.length,
    roll: sum.roll / readings.length,
  }
}

// ── Twist ────────────────────────────────────────────────────────────────────

const TWIST_MIN_RAD_S = 2.5   // rad/s threshold
const TWIST_MIN_MS = 80

/**
 * Detect a wrist-rotation gesture (clockwise or counter-clockwise).
 */
export function detectTwist(frames: SensorFrame[]): GestureResult & {
  direction?: 'cw' | 'ccw'
} {
  if (frames.length < 3) return { detected: false, confidence: 0 }

  const latest = frames[frames.length - 1]!.t
  const window = frames.filter(f => f.t >= latest - 500)

  // Look for sustained gyro.z above threshold
  const above = window.filter(f => Math.abs(f.gyro[2]!) > TWIST_MIN_RAD_S)
  if (above.length === 0) return { detected: false, confidence: 0 }

  const sustained = above[above.length - 1]!.t - above[0]!.t
  if (sustained < TWIST_MIN_MS) return { detected: false, confidence: 0 }

  const avgZ = above.reduce((s, f) => s + f.gyro[2]!, 0) / above.length
  const direction = avgZ > 0 ? 'ccw' : 'cw'

  const confidence = clamp(
    (Math.abs(avgZ) - TWIST_MIN_RAD_S) / (6 - TWIST_MIN_RAD_S),
    0,
    1,
  )

  return { detected: true, confidence, direction }
}

// ── Swing ────────────────────────────────────────────────────────────────────

const SWING_ARC_RAD = 1.2   // total rotation needed (≈70°)
const SWING_MAX_MS = 800

/**
 * Detect a large sweeping arc (the "waggle" motion).
 */
export function detectSwing(frames: SensorFrame[]): GestureResult & {
  axis?: 'x' | 'y'
} {
  if (frames.length < 5) return { detected: false, confidence: 0 }

  const latest = frames[frames.length - 1]!.t
  const window = frames.filter(f => f.t >= latest - SWING_MAX_MS)

  // Integrate gyro over the window
  let totalX = 0
  let totalY = 0
  for (let i = 1; i < window.length; i++) {
    const dt = (window[i]!.t - window[i - 1]!.t) / 1000
    totalX += window[i]!.gyro[0]! * dt
    totalY += window[i]!.gyro[1]! * dt
  }

  const arcX = Math.abs(totalX)
  const arcY = Math.abs(totalY)
  const maxArc = Math.max(arcX, arcY)

  if (maxArc < SWING_ARC_RAD) return { detected: false, confidence: 0 }

  const axis = arcX >= arcY ? 'x' : 'y'
  const confidence = clamp((maxArc - SWING_ARC_RAD) / (Math.PI / 2), 0, 1)

  return { detected: true, confidence, axis }
}

// ── $1 Unistroke Shape Recogniser ────────────────────────────────────────────

export interface Point2D { x: number; y: number }
export interface ShapeTemplate { name: string; points: Point2D[] }

const N_POINTS = 64
const SQUARE_SIZE = 250
const ORIGIN: Point2D = { x: 0, y: 0 }

function resample(pts: Point2D[], n: number): Point2D[] {
  const totalLen = pts.reduce((s, p, i) =>
    i === 0 ? s : s + Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y), 0)
  const interval = totalLen / (n - 1)
  let d = 0
  const result: Point2D[] = [pts[0]!]
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
    if (d + seg >= interval) {
      const t = (interval - d) / seg
      result.push({
        x: pts[i - 1]!.x + t * (pts[i]!.x - pts[i - 1]!.x),
        y: pts[i - 1]!.y + t * (pts[i]!.y - pts[i - 1]!.y),
      })
      pts = [result[result.length - 1]!, ...pts.slice(i)]
      i = 1
      d = 0
    } else {
      d += seg
    }
  }
  while (result.length < n) result.push(pts[pts.length - 1]!)
  return result.slice(0, n)
}

function indicativeAngle(pts: Point2D[]): number {
  const c = centroid(pts)
  return Math.atan2(c.y - pts[0]!.y, c.x - pts[0]!.x)
}

function centroid(pts: Point2D[]): Point2D {
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length
  return { x, y }
}

function rotateBy(pts: Point2D[], r: number): Point2D[] {
  const c = centroid(pts)
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return pts.map(p => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }))
}

function scaleTo(pts: Point2D[], size: number): Point2D[] {
  const xs = pts.map(p => p.x)
  const ys = pts.map(p => p.y)
  const w = Math.max(...xs) - Math.min(...xs)
  const h = Math.max(...ys) - Math.min(...ys)
  const scale = size / Math.max(w, h)
  return pts.map(p => ({ x: p.x * scale, y: p.y * scale }))
}

function translateTo(pts: Point2D[], to: Point2D): Point2D[] {
  const c = centroid(pts)
  return pts.map(p => ({ x: p.x + to.x - c.x, y: p.y + to.y - c.y }))
}

function pathDist(a: Point2D[], b: Point2D[]): number {
  return a.reduce((s, p, i) => s + Math.hypot(p.x - b[i]!.x, p.y - b[i]!.y), 0) / a.length
}

function distanceAtAngle(pts: Point2D[], tmpl: ShapeTemplate, angle: number): number {
  const r = rotateBy(pts, angle)
  return pathDist(r, tmpl.points)
}

function distanceAtBestAngle(pts: Point2D[], tmpl: ShapeTemplate): number {
  const PHI = 0.5 * (-1 + Math.sqrt(5))
  let lo = -Math.PI / 4
  let hi = Math.PI / 4
  let x1 = PHI * lo + (1 - PHI) * hi
  let f1 = distanceAtAngle(pts, tmpl, x1)
  let x2 = (1 - PHI) * lo + PHI * hi
  let f2 = distanceAtAngle(pts, tmpl, x2)
  while (Math.abs(hi - lo) > (Math.PI / 180) * 2) {
    if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = PHI * lo + (1 - PHI) * hi; f1 = distanceAtAngle(pts, tmpl, x1) }
    else { lo = x1; x1 = x2; f1 = f2; x2 = (1 - PHI) * lo + PHI * hi; f2 = distanceAtAngle(pts, tmpl, x2) }
  }
  return Math.min(f1, f2)
}

function normalise(pts: Point2D[]): Point2D[] {
  let p = resample(pts, N_POINTS)
  p = rotateBy(p, -indicativeAngle(p))
  p = scaleTo(p, SQUARE_SIZE)
  p = translateTo(p, ORIGIN)
  return p
}

export interface RecogniseResult {
  name: string
  score: number   // 0..1 (higher = more confident)
  distance: number
}

/**
 * $1 Unistroke Recogniser.
 * Pass normalised templates (pre-built via buildTemplate) and raw points from the gyro path.
 */
export function recogniseShape(
  rawPoints: Point2D[],
  templates: ShapeTemplate[],
): RecogniseResult {
  if (rawPoints.length < 4 || templates.length === 0) {
    return { name: 'unknown', score: 0, distance: Infinity }
  }

  const pts = normalise(rawPoints)
  let best: RecogniseResult = { name: 'unknown', score: 0, distance: Infinity }

  for (const t of templates) {
    const d = distanceAtBestAngle(pts, t)
    if (d < best.distance) {
      const score = 1 - d / (0.5 * Math.sqrt(2 * SQUARE_SIZE * SQUARE_SIZE))
      best = { name: t.name, score: Math.max(0, score), distance: d }
    }
  }

  return best
}

/**
 * Build a normalised template from raw training points.
 */
export function buildTemplate(name: string, rawPoints: Point2D[]): ShapeTemplate {
  return { name, points: normalise(rawPoints) }
}

/** Convert gyroscope frames to a 2-D path for shape recognition. */
export function gyroToPath(frames: SensorFrame[]): Point2D[] {
  const pts: Point2D[] = []
  let x = 0
  let y = 0
  for (let i = 1; i < frames.length; i++) {
    const dt = (frames[i]!.t - frames[i - 1]!.t) / 1000
    x += frames[i]!.gyro[0]! * dt
    y += frames[i]!.gyro[1]! * dt
    pts.push({ x, y })
  }
  return pts
}

// ── Built-in spell templates ──────────────────────────────────────────────────

function circlePoints(n = 64): Point2D[] {
  return Array.from({ length: n }, (_, i) => ({
    x: Math.cos((2 * Math.PI * i) / n),
    y: Math.sin((2 * Math.PI * i) / n),
  }))
}

function zigzagPoints(n = 64): Point2D[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    return { x: t * 4 - 2, y: ((i % 2) * 2 - 1) * 0.8 }
  })
}

function spiralPoints(n = 64): Point2D[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (3 * Math.PI * i) / n
    const r = 0.3 + (1 - i / n) * 0.7
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
  })
}

export const BUILT_IN_TEMPLATES: ShapeTemplate[] = [
  buildTemplate('circle', circlePoints()),
  buildTemplate('zigzag', zigzagPoints()),
  buildTemplate('spiral', spiralPoints()),
]
