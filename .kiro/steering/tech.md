---
inclusion: always
---

# Waggle — Tech steering

## Stack
- **Monorepo:** pnpm workspaces — `packages/kit`, `relay`, `app`, `tests`
- **Kit:** pure TypeScript, no DOM, no globals — `SensorFrame[]` in, gesture result out
- **Relay:** plain Node.js `ws` server, rooms at `/room/:id`, port 1999
- **App:** Vite multi-page — host at `/`, controller at `/join/`
- **Tests:** Vitest, fixture-based traces, no mocks

## SensorFrame format
```ts
{ t: number          // ms since page load
  acc: [x, y, z]    // m/s² — DeviceMotion
  gyro: [x, y, z]   // rad/s — DeviceMotion
  ori: [alpha, beta, gamma]  // degrees — DeviceOrientation }
```

## Architecture
```
Host (browser)  ←── ws ───  Relay :1999  ───── ws ──→  Phone (browser)
  game canvas                room fan-out              DeviceMotion/Orientation
  gesture engine                                        haptics, QR scan
  QR + join URL
        ↓
  @waggle/kit (gestures, recorder, transport)
  fixtures/   tests/   .kiro/
```

## Latency budget
| Hop | Target |
|---|---|
| Phone → Relay | p95 < 30 ms |
| Relay → Host | p95 < 30 ms |
| Total round-trip | p95 < 80 ms on home Wi-Fi |
| Gesture detection lag | < 50 ms after peak frame |

If p95 exceeds 100 ms on demo Wi-Fi, switch to WebRTC data channel and fall back to WebSocket for setup only.

## Relay message routing
- `frame` → host only (raw sensor data)
- `ping` / `pong` → echo back to sender (RTT measurement)
- `game_state` → all controllers in the room
- `gesture_ack` / `direct` → specific target by player ID
- `join` / `leave` → broadcast to all in room

## Environment variables
- `VITE_RELAY_HOST` — relay host:port (default `localhost:1999`)
- `VITE_RELAY_PROTOCOL` — `ws` or `wss` (default `ws`)
- `VITE_BASE_URL` — base URL for QR join link
- `PORT` — relay listen port (default `1999`)
