---
inclusion: always
---

# Waggle — Hard rules

These rules are non-negotiable. Flag any proposed change that breaks one before writing a line of code.

## Safety
1. **Never say "Wii", "Nintendo", or "Kinect"** in product name, UI text, code comments, or variable names visible to users.
2. **No recreating existing games.** Original mechanics, original names.
3. **Sensor-only tracking.** No webcam, no native apps, no installs, no accounts.
4. **HTTPS everywhere in deployment.** Browsers block DeviceMotion over HTTP.

## Measurement
5. **Measure latency, never assume it.** The debug overlay must show real p50/p95 RTT from `LatencyMeter`.
6. **Precision and recall on gesture fixtures must be reported** in the README, using real held-out traces.

## Code design
7. **Gesture detectors are pure functions** — `(frames: SensorFrame[], opts?) → result`. No side effects, no globals, no DOM access inside `packages/kit`.
8. **Tests use fixture traces.** Record a real trace with `TraceRecorder`, save it in `fixtures/`, replay it in `tests/`. Never mock the sensor. Never edit a fixture to make a test pass.

## Accessibility
9. **Seated mode must work** — games must be playable using gyro tilt only, without standing or making large physical movements. Don't use accelerometer thresholds that assume an upright posture.
10. **Left-handed support** — axis mappings must not assume right-hand orientation. Where a game uses directional tilt, mirror the axis for left-handed players.

## Kiro hooks (do not remove or weaken)
- Trace regression replays all fixture tests on every detector change.
- Teach-a-move generates a new detector and tests from 3 fixture traces.
- Spec-change updates the README gesture checklist.
- Spec-drift checks game implementations against their specs.
- Accessibility-check verifies controller code against rules 9 and 10 above.
