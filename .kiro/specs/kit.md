# Spec: @waggle/kit

## Purpose
A pure-TypeScript library that:
1. Defines the shared wire types (SensorFrame, Trace, Player, messages).
2. Provides gesture detectors as pure functions over `SensorFrame[]` arrays.
3. Provides a TraceRecorder for capturing live sensor data into fixture files.
4. Provides a WaggleTransport wrapper and LatencyMeter.

## Contracts

### Gesture detectors
- Input: `SensorFrame[]` — a window of recent frames
- Output: `GestureResult & { ... }` — `detected: boolean`, `confidence: 0–1`, gesture-specific fields
- **No side effects.** No DOM, no I/O, no randomness.
- **Same function runs live and in tests.** The replay harness feeds pre-recorded frames.

### Flick
- Triggered by: brief (< 300 ms) spike in linear acceleration magnitude ≥ 15 m/s²
- Before and after the spike must be below 6 m/s² (impulse, not sustained force)
- Returns: `direction [x,y,z]` (unit vector in the direction of the peak), `speed` (m/s²)

### Shake
- Triggered by: ≥ 4 sign changes in the dominant acceleration axis within 800 ms, each peak ≥ 5 m/s²
- Used in Séance to banish a ghost (need majority of players shaking)

### Tilt
- Not a discrete event — continuous reading
- Returns: `pitch` (beta, degrees), `roll` (gamma, degrees)
- Applies exponential moving average (α = 0.25) over the last 10 frames

### Twist
- Triggered by: gyro.z sustained above 2.5 rad/s for ≥ 80 ms
- Returns: `direction: 'cw' | 'ccw'`

### Swing
- Triggered by: total arc (integral of gyro) > 1.2 radians in one axis within 800 ms
- Returns: `axis: 'x' | 'y'`

### Shape recogniser ($1 Unistroke)
- Input: `Point2D[]` — the gyro path (use `gyroToPath(frames)` to build it)
- Templates: `circle`, `zigzag`, `spiral` built in; custom templates via `buildTemplate(name, points)`
- Returns: `name`, `score` (0–1), `distance`
- Minimum score for a confident match: 0.4

## Acceptance criteria
- All synthetic tests pass (see tests/gestures.test.ts)
- When fixture traces are added, recall ≥ 70% per gesture at confidence threshold 0.3
- Zero dependencies outside the TypeScript standard library
