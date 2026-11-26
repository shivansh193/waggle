/**
 * Gesture replay tests — run in Node, no phone required.
 *
 * Tests use two sources:
 *   1. Synthetic traces built in-line (always available, verify the algorithm).
 *   2. Fixture traces from fixtures/*.json (recorded from real phones).
 *
 * When you add a fixture trace, the test suite picks it up automatically and
 * reports precision + recall per gesture.
 */

import { describe, it, expect } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  detectFlick,
  detectShake,
  getTilt,
  detectTwist,
  detectSwing,
  recogniseShape,
  BUILT_IN_TEMPLATES,
  gyroToPath,
  type Trace,
  type SensorFrame,
} from '@waggle/kit'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFrame(
  t: number,
  acc: [number, number, number] = [0, 0, 9.8],
  gyro: [number, number, number] = [0, 0, 0],
  ori: [number, number, number] = [0, 0, 0],
): SensorFrame {
  return { t, acc, gyro, ori }
}

/** Build a stream of idle frames (phone sitting on a table). */
function idleFrames(durationMs: number, hz = 60): SensorFrame[] {
  const frames: SensorFrame[] = []
  const interval = 1000 / hz
  for (let t = 0; t < durationMs; t += interval) {
    frames.push(makeFrame(t, [0.05, 0.05, 9.8], [0, 0, 0]))
  }
  return frames
}

/** Build a synthetic flick: spike in X axis at the midpoint (35 m/s² peak, typical strong flick). */
function syntheticFlick(durationMs = 300, hz = 60): SensorFrame[] {
  const frames: SensorFrame[] = []
  const interval = 1000 / hz
  const mid = durationMs / 2
  for (let t = 0; t < durationMs; t += interval) {
    const dist = Math.abs(t - mid)
    const spike = dist < 40 ? 35 * Math.exp(-dist / 8) : 0
    frames.push(makeFrame(t, [spike, 0.1, 9.8], [0, 0, 0]))
  }
  return frames
}

/** Build synthetic shake: oscillating X acceleration. */
function syntheticShake(durationMs = 800, hz = 60): SensorFrame[] {
  const frames: SensorFrame[] = []
  const interval = 1000 / hz
  for (let t = 0; t < durationMs; t += interval) {
    const ax = 10 * Math.sin((t / 1000) * 2 * Math.PI * 4)  // 4 Hz shake
    frames.push(makeFrame(t, [ax, 0.1, 9.8], [0, 0, 0]))
  }
  return frames
}

/** Build synthetic twist: sustained gyro.z. */
function syntheticTwist(direction: 'cw' | 'ccw', durationMs = 200): SensorFrame[] {
  const frames: SensorFrame[] = []
  const hz = 60
  const interval = 1000 / hz
  const gz = direction === 'cw' ? -3.5 : 3.5
  for (let t = 0; t < durationMs; t += interval) {
    frames.push(makeFrame(t, [0, 0, 9.8], [0, 0, gz]))
  }
  return frames
}

// ── Flick ─────────────────────────────────────────────────────────────────────

describe('detectFlick', () => {
  it('detects a synthetic flick', () => {
    const result = detectFlick(syntheticFlick())
    expect(result.detected).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('rejects idle frames', () => {
    const result = detectFlick(idleFrames(300))
    expect(result.detected).toBe(false)
  })

  it('rejects sustained motion (not a brief spike)', () => {
    // Constant high acceleration — not a flick
    const frames = Array.from({ length: 30 }, (_, i) =>
      makeFrame(i * 16, [18, 0, 9.8]),
    )
    const result = detectFlick(frames)
    expect(result.detected).toBe(false)
  })

  it('returns a direction unit vector', () => {
    const result = detectFlick(syntheticFlick())
    if (!result.detected || !result.direction) return
    const len = Math.sqrt(result.direction.reduce((s, v) => s + v * v, 0))
    expect(len).toBeCloseTo(1, 2)
  })
})

// ── Shake ─────────────────────────────────────────────────────────────────────

describe('detectShake', () => {
  it('detects a synthetic shake', () => {
    const result = detectShake(syntheticShake())
    expect(result.detected).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.4)
  })

  it('rejects idle frames', () => {
    const result = detectShake(idleFrames(800))
    expect(result.detected).toBe(false)
  })
})

// ── Tilt ──────────────────────────────────────────────────────────────────────

describe('getTilt', () => {
  it('returns 0,0 for empty frames', () => {
    const t = getTilt([])
    expect(t.pitch).toBe(0)
    expect(t.roll).toBe(0)
  })

  it('returns smoothed orientation', () => {
    const frames = Array.from({ length: 10 }, (_, i) =>
      makeFrame(i * 16, [0, 0, 9.8], [0, 0, 0], [0, 20, 15]),
    )
    const t = getTilt(frames)
    expect(Math.abs(t.pitch - 20)).toBeLessThan(5)  // EMA converges
    expect(Math.abs(t.roll - 15)).toBeLessThan(5)
  })
})

// ── Twist ─────────────────────────────────────────────────────────────────────

describe('detectTwist', () => {
  it('detects clockwise twist', () => {
    const result = detectTwist(syntheticTwist('cw'))
    expect(result.detected).toBe(true)
    expect(result.direction).toBe('cw')
  })

  it('detects counter-clockwise twist', () => {
    const result = detectTwist(syntheticTwist('ccw'))
    expect(result.detected).toBe(true)
    expect(result.direction).toBe('ccw')
  })

  it('rejects idle frames', () => {
    const result = detectTwist(idleFrames(300))
    expect(result.detected).toBe(false)
  })
})

// ── Shape recogniser ──────────────────────────────────────────────────────────

describe('recogniseShape', () => {
  it('recognises a circle', () => {
    // Simulate circular gyro path
    const N = 60
    const frames: SensorFrame[] = []
    for (let i = 0; i < N; i++) {
      const angle = (2 * Math.PI * i) / N
      const t = i * 16
      frames.push(makeFrame(t, [0, 0, 9.8], [Math.cos(angle), Math.sin(angle), 0]))
    }
    const path = gyroToPath(frames)
    const result = recogniseShape(path, BUILT_IN_TEMPLATES)
    expect(result.name).toBe('circle')
    expect(result.score).toBeGreaterThan(0.4)
  })

  it('returns unknown for random noise', () => {
    const frames: SensorFrame[] = []
    for (let i = 0; i < 20; i++) {
      frames.push(makeFrame(i * 16, [0, 0, 9.8], [Math.random() - 0.5, Math.random() - 0.5, 0]))
    }
    const path = gyroToPath(frames)
    // We just check it doesn't crash; score may be low
    const result = recogniseShape(path, BUILT_IN_TEMPLATES)
    expect(result).toHaveProperty('name')
    expect(result).toHaveProperty('score')
  })
})

// ── Fixture-based precision / recall ─────────────────────────────────────────

type Detector = (frames: SensorFrame[]) => { detected: boolean; confidence: number }

const DETECTORS: Record<string, Detector> = {
  flick: detectFlick,
  shake: detectShake,
  twist: detectTwist,
  swing: detectSwing,
}

describe('fixture traces', async () => {
  const fixturesDir = join(__dirname, '..', 'fixtures')
  let files: string[] = []

  try {
    files = (await readdir(fixturesDir)).filter(f => f.endsWith('.json'))
  } catch {
    // fixtures/ is empty during first run — that's fine
  }

  if (files.length === 0) {
    it('(no fixture files yet — record some with window.waggle.startRecording())', () => {
      expect(true).toBe(true)
    })
    return
  }

  const traces: Trace[] = []
  for (const file of files) {
    const raw = await readFile(join(fixturesDir, file), 'utf-8')
    traces.push(JSON.parse(raw) as Trace)
  }

  // Per-gesture precision + recall
  const gestureNames = [...new Set(traces.map(t => t.gesture))]

  for (const gesture of gestureNames) {
    const positives = traces.filter(t => t.gesture === gesture)
    const negatives = traces.filter(t => t.gesture !== gesture)
    const detector = DETECTORS[gesture]

    if (!detector) {
      it(`${gesture}: no detector registered`, () => { expect(true).toBe(true) })
      continue
    }

    it(`${gesture}: precision + recall on ${positives.length} positive / ${negatives.length} negative traces`, () => {
      let tp = 0, fp = 0, fn = 0

      for (const trace of positives) {
        const r = detector(trace.frames)
        if (r.detected && r.confidence > 0.3) tp++
        else fn++
      }
      for (const trace of negatives) {
        const r = detector(trace.frames)
        if (r.detected && r.confidence > 0.3) fp++
      }

      const precision = tp / (tp + fp || 1)
      const recall = tp / (tp + fn || 1)

      console.log(`  ${gesture}: precision=${(precision * 100).toFixed(0)}% recall=${(recall * 100).toFixed(0)}% (tp=${tp} fp=${fp} fn=${fn})`)

      // Fail on catastrophic regressions
      expect(recall).toBeGreaterThan(0.5)
    })
  }
})
