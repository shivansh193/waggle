# Waggle — Kiro Steering

## What this project is
Waggle is a browser-based motion controller kit and two party games for a hackathon (Kiroween 2026). It resurrects Wii-era motion controls using phone sensors — no app, no pairing, just scan a QR code.

## Hard rules (never break these)

1. **Never use "Wii", "Nintendo", or "Kinect"** in the product name, logo, UI text, or any user-visible string. Those names belong in the write-up and historical notes only.
2. **No recreating existing games.** Séance and Hex Duel are original designs. If a new game is proposed, it must be an original concept with an original name.
3. **Sensor-only tracking.** No webcam, no native apps, no installs, no accounts.
4. **HTTPS everywhere.** The browser will not expose DeviceMotion over HTTP. Every deployed URL must use HTTPS.
5. **Measure latency, never assume it.** The debug overlay must always show p50/p95 RTT from real measurements.
6. **Gesture detectors are pure functions.** They accept `SensorFrame[]` and return a result. No side effects, no globals, no DOM access inside the kit package.
7. **Tests use fixture traces.** Never mock the sensor — record a real trace and replay it. A test that passes without touching sensor data is not a gesture test.
8. **Accessibility minimum:** seated mode (gyro only, no need to stand) and left-handed support (mirror axis mappings). Flag if a proposed design breaks either.

## Latency budget
| Hop | Target |
|---|---|
| Phone → Relay | p95 < 30 ms |
| Relay → Host | p95 < 30 ms |
| Total round-trip | p95 < 80 ms on home Wi-Fi |
| Gesture detection lag | < 50 ms after the peak frame arrives |

If p95 exceeds 100 ms on demo Wi-Fi, switch controllers to WebRTC data channel (P1-1) and fall back to WebSocket for setup only.

## Demo prep checklist
- [ ] At least 3 friends available to film (film before Dec 4 evening IST)
- [ ] Latency numbers measured on the actual demo Wi-Fi, not home Wi-Fi
- [ ] iOS Safari tested (permission prompt works)
- [ ] Android Chrome tested (no permission needed)
- [ ] "Teach a move" recorded 3 times and new spell castable live
- [ ] The Kiro hook goes red on a broken flick detector (filmed)
