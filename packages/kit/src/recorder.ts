/**
 * Trace recorder and serialiser.
 * Records live sensor frames from DeviceMotion/Orientation events into a Trace
 * that can be saved as a fixture JSON and replayed in tests with no phone.
 */

import type { SensorFrame, Trace } from './types.js'

export class TraceRecorder {
  private frames: SensorFrame[] = []
  private sessionStart = 0
  private _recording = false

  get recording(): boolean { return this._recording }

  start(): void {
    this.frames = []
    this.sessionStart = performance.now()
    this._recording = true
  }

  stop(): void {
    this._recording = false
  }

  push(frame: SensorFrame): void {
    if (!this._recording) return
    this.frames.push(frame)
  }

  /** Serialise to a Trace (ready to save as fixtures/NAME.json). */
  toTrace(gesture: string, device: string): Trace {
    return {
      gesture,
      device,
      hz: estimateHz(this.frames),
      frames: this.frames,
      recordedAt: Date.now(),
    }
  }

  frameCount(): number { return this.frames.length }
  durationMs(): number {
    if (this.frames.length < 2) return 0
    return this.frames[this.frames.length - 1]!.t - this.frames[0]!.t
  }
}

/** Estimate sampling rate from frame timestamps. */
export function estimateHz(frames: SensorFrame[]): number {
  if (frames.length < 2) return 0
  const duration = (frames[frames.length - 1]!.t - frames[0]!.t) / 1000
  return duration > 0 ? (frames.length - 1) / duration : 0
}

/** Resample a trace to a target Hz (useful for normalising cross-device traces). */
export function resampleTrace(trace: Trace, targetHz: number): Trace {
  const intervalMs = 1000 / targetHz
  const result: SensorFrame[] = []
  let nextT = trace.frames[0]?.t ?? 0

  for (let i = 1; i < trace.frames.length; i++) {
    const prev = trace.frames[i - 1]!
    const cur = trace.frames[i]!
    while (nextT <= cur.t) {
      const alpha = (nextT - prev.t) / (cur.t - prev.t)
      result.push(lerpFrame(prev, cur, alpha, nextT))
      nextT += intervalMs
    }
  }

  return { ...trace, frames: result, hz: targetHz }
}

function lerpFrame(a: SensorFrame, b: SensorFrame, alpha: number, t: number): SensorFrame {
  return {
    t,
    acc: lerp3(a.acc, b.acc, alpha),
    gyro: lerp3(a.gyro, b.gyro, alpha),
    ori: lerp3(a.ori, b.ori, alpha),
  }
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0]! + (b[0]! - a[0]!) * t,
    a[1]! + (b[1]! - a[1]!) * t,
    a[2]! + (b[2]! - a[2]!) * t,
  ]
}

/** Pretty-print a trace summary for logging / README tables. */
export function summariseTrace(trace: Trace): string {
  return `gesture=${trace.gesture} device="${trace.device}" hz=${trace.hz.toFixed(1)} frames=${trace.frames.length} duration=${(trace.frames[trace.frames.length - 1]!.t - trace.frames[0]!.t).toFixed(0)}ms`
}
