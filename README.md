# Waggle

> Your phone is the controller. Nothing to install, nothing to pair.

Waggle resurrects Wii-era motion controls using the accelerometer and gyroscope every phone already has. Scan a QR code, and your browser becomes a motion controller for a party game on the big screen.

**Hackathon:** Kiroween 2026 · Category: Resurrection · Deadline: Dec 4 2026

---

## Games

| Game | Players | Key mechanic |
|------|---------|-------------|
| **Séance** | 2–8 | Everyone tilts their phone; the planchette follows the average tilt |
| **Hex Duel** | 1v1 | Draw a shape in the air → flick to cast a spell |

## Architecture

```
Host (browser, laptop/TV)         Relay (PartyKit DO)              Phone (browser)
  game canvas                       room state, fan-out              controller page
  gesture engine  <── sensor frames (~60 Hz) ──────────────────     DeviceMotion/Orientation
  QR code + join URL                                                 haptics, sound
        │
  packages/kit  (gestures, recorder, replay, transport)
  fixtures/     (labelled traces)
  tests/        (Node replay tests — no phone needed)
  .kiro/        (specs, hooks, steering)
```

## Gesture checklist

| Gesture | Used by | Fixture traces |
|---------|---------|----------------|
| `tilt` | Séance (planchette steering) | — |
| `shake` | Séance (ghost banishing) | — |
| `flick` | Hex Duel (cast spell) | — |
| `shape` (circle) | Hex Duel (Shield) | — |
| `shape` (zigzag) | Hex Duel (Bolt) | — |
| `shape` (spiral) | Hex Duel (Curse) | — |
| `twist` | (future) | — |
| `swing` | (future) | — |

> This table is updated automatically by the `.kiro/hooks/spec-change.json` hook.

## Running locally

```powershell
pnpm install

# Terminal 1 — relay
pnpm --filter relay dev      # PartyKit dev server on :1999

# Terminal 2 — app
pnpm --filter app dev        # Vite on :5173
```

Then open `http://localhost:5173` on the laptop (host view) and `http://localhost:5174/join/?room=XXXX` on a phone on the same Wi-Fi.

> iOS Safari requires HTTPS for DeviceMotion. Use `localhost` on Android, or set up an ngrok tunnel for iOS testing.

## Tests (no phone required)

```powershell
pnpm test
```

Runs the gesture replay tests in Node. Synthetic traces are built inline; recorded fixture traces from `fixtures/` are picked up automatically.

```
✓ detectFlick: detects a synthetic flick
✓ detectFlick: rejects idle frames
✓ detectShake: detects a synthetic shake
...
```

## Recording fixture traces

Open the controller in a browser, play around to get the motion going, then in DevTools:

```js
window.waggle.startRecording()
// … perform the gesture …
const trace = window.waggle.stopRecording('flick')
// Copy the printed JSON and save to fixtures/flick_1.json
```

Record each gesture at least 5 times from different devices. The test suite reports precision + recall per gesture automatically.

## Deploying

1. **Relay:** `pnpm --filter relay deploy` (needs `partykit login`)
2. **App:** push to Vercel/Netlify; set `VITE_PARTYKIT_HOST` to the deployed relay host.

## Latency

> `[NEEDS INPUT]` — numbers from real measurements on demo Wi-Fi, to be added after the Day-1 pilot.

Target: p95 < 80 ms round-trip on home Wi-Fi.

## Credits

Built for Kiroween 2026 with Kiro + Claude Code.
