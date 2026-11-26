/**
 * Motion sensor abstraction for the controller (phone browser).
 *
 * Handles:
 *  - iOS DeviceMotionEvent.requestPermission() gate
 *  - devicemotion events at ~60 Hz
 *  - deviceorientation events (for tilt)
 *  - Merging motion + orientation into SensorFrame
 *  - Session-relative timestamps (t = ms since start, not epoch)
 */

import type { SensorFrame } from '@waggle/kit'

export type FrameCallback = (frame: SensorFrame) => void
export type PermissionState = 'unknown' | 'pending' | 'granted' | 'denied'

export class MotionSensor {
  private sessionStart = 0
  private latestOri: [number, number, number] = [0, 0, 0]
  private frameCallback: FrameCallback | null = null
  private motionHandler: ((e: DeviceMotionEvent) => void) | null = null
  private oriHandler: ((e: DeviceOrientationEvent) => void) | null = null
  permissionState: PermissionState = 'unknown'

  /**
   * On iOS 13+ you must call requestPermission() inside a user gesture
   * (e.g. button click). Pass the result of this into start().
   */
  async requestPermission(): Promise<PermissionState> {
    this.permissionState = 'pending'

    // iOS Safari — DeviceMotionEvent.requestPermission is a static method
    type IOSDeviceMotionEvent = typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }
    const ios = DeviceMotionEvent as IOSDeviceMotionEvent
    if (typeof ios.requestPermission === 'function') {
      try {
        const result = await ios.requestPermission()
        this.permissionState = result === 'granted' ? 'granted' : 'denied'
      } catch {
        this.permissionState = 'denied'
      }
    } else {
      // Android / Desktop — permission not needed
      this.permissionState = 'granted'
    }

    return this.permissionState
  }

  /** Start streaming frames. Must call requestPermission() first on iOS. */
  start(onFrame: FrameCallback): void {
    this.frameCallback = onFrame
    this.sessionStart = performance.now()

    // Track orientation separately (fires at different rate)
    this.oriHandler = (e: DeviceOrientationEvent) => {
      this.latestOri = [
        e.alpha ?? 0,
        e.beta ?? 0,
        e.gamma ?? 0,
      ]
    }

    this.motionHandler = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity
      const rot = e.rotationRate
      const t = performance.now() - this.sessionStart

      this.frameCallback?.({
        t,
        acc: [
          acc?.x ?? 0,
          acc?.y ?? 0,
          acc?.z ?? 0,
        ],
        gyro: [
          deg2rad(rot?.alpha ?? 0),
          deg2rad(rot?.beta ?? 0),
          deg2rad(rot?.gamma ?? 0),
        ],
        ori: [...this.latestOri],
      })
    }

    window.addEventListener('deviceorientation', this.oriHandler)
    window.addEventListener('devicemotion', this.motionHandler)
  }

  stop(): void {
    if (this.motionHandler) window.removeEventListener('devicemotion', this.motionHandler)
    if (this.oriHandler) window.removeEventListener('deviceorientation', this.oriHandler)
    this.frameCallback = null
  }

  /** True if the browser has the devicemotion API at all. */
  static isSupported(): boolean {
    return typeof DeviceMotionEvent !== 'undefined'
  }

  /** True on iOS Safari (needs requestPermission). */
  static needsPermission(): boolean {
    type IOSDeviceMotionEvent = typeof DeviceMotionEvent & {
      requestPermission?: unknown
    }
    return typeof (DeviceMotionEvent as IOSDeviceMotionEvent).requestPermission === 'function'
  }
}

function deg2rad(d: number): number {
  return d * (Math.PI / 180)
}

// ── Haptics ───────────────────────────────────────────────────────────────────

/** Short tap (Android only; iOS Safari doesn't support vibrate). */
export function hapticTap(): void {
  navigator.vibrate?.(20)
}

/** Longer buzz for a detected gesture. */
export function hapticGesture(): void {
  navigator.vibrate?.([40, 20, 40])
}

/** Error / denied feedback. */
export function hapticError(): void {
  navigator.vibrate?.([80, 30, 80, 30, 80])
}

// ── Wake Lock ─────────────────────────────────────────────────────────────────

let wakeLock: WakeLockSentinel | null = null

export async function requestWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator)) return
  try {
    wakeLock = await navigator.wakeLock.request('screen')
  } catch {
    // Not supported or denied — just carry on
  }
}

export async function releaseWakeLock(): Promise<void> {
  await wakeLock?.release()
  wakeLock = null
}
