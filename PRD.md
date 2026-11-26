# PRD: Waggle

*Your phone is the controller. Nothing to install, nothing to pair.*

- **Hackathon:** Kiroween 2026 (Kiro / AWS), kiroween.devpost.com
- **Deadline:** Dec 4, 2:00 PM PST, which is **Dec 5, 3:30 AM IST**. Submit by the evening of Dec 4 IST, not at 3 AM.
- **Category:** Resurrection. The dead tech is the motion controller (the Wii era, roughly 2006 to 2013, when motion controllers were everywhere).
- **Target prizes:** Best Student Project (Resurrection, $1.5k), Resurrection category best ($5k), Best Demo ($1k), overall placings.
- **Working name:** Waggle. Change it freely. **Never use "Wii", "Nintendo" or "Kinect" in the product name, logo or UI.** The history goes in the write-up only.

## 1. Problem

- Motion-controlled party games died with the dedicated hardware. You needed the console, the remotes and the sensor bar.
- Everyone now carries a better motion sensor in their pocket: phones have an accelerometer and a gyroscope.
- Phone-as-controller exists today only as button pads (Jackbox, AirConsole). The motion part was never brought back.
- Building a motion game is hard for developers too:
  - sensor noise, drift and calibration;
  - the iOS permission prompt;
  - networking.
  - Worst of all, **gestures can't be tested**. Every change means standing up and waving a phone.

## 2. Solution

A kit plus two original games, built with Kiro.

1. **Host screen** (laptop or TV browser) shows the game and a QR code.
2. **Phones scan the code** and become motion controllers. This happens in the browser: no app, no account, up to 8 players.
3. **The gesture library** turns raw sensor data into events: swing, flick, shake, tilt steering, twist, pointer (calibrated by "aim at the centre and tap"), and drawn shapes.
4. **Record and replay.** Any motion can be recorded as a sensor trace (JSON) and replayed in tests with no phone attached.
   - A Kiro hook replays every trace on each change, so a broken "flick" gets caught automatically.
   - This is the core technical claim: **motion controls you can unit-test.**
5. **Teach a move.** Perform a new gesture 3 times. Kiro writes a detector from the traces, plus tests that use those traces as fixtures. New controls come from a demonstration, not from hand-written thresholds.

## 3. Original games (no recreations)

Both are original designs with a Halloween theme. They don't copy the mechanics, names or look of any existing game.

### Game 1: Séance (party game, 2 to 8 players, co-op chaos)
- A planchette moves around a spirit board, and **every player tilts their phone at once**. The planchette follows the average of everyone's tilt.
- The spirit asks a question, and the group has to spell an answer by steering together. Someone always pulls the wrong way.
- Shake together to "banish" an interrupting ghost.
- **Shows:** tilt, multiplayer fusion, shake.

### Game 2: Hex Duel (1v1)
- The two players are spellcasters. You cast a spell by **drawing its shape in the air** with your phone (circle = shield, zigzag = bolt, spiral = curse), and flick to throw it.
- Custom spells come from "teach a move": a player records a new shape 3 times and it becomes castable.
- **Shows:** shape recognition from gyro paths, flick, teach-a-move.

**Stretch:** a single-player warm-up (Pumpkin Patch: flick pumpkins into carts) for judges trying it alone.

## 4. Scope

### Must have (P0)
- **P0-1 Rooms and transport.**
  - The host creates a room and shows a QR code with the join URL.
  - Phones join over WebSocket through a small relay (Cloudflare Durable Objects or PartyKit; pick on day 1).
  - HTTPS is mandatory, because browsers only expose motion sensors over HTTPS.
- **P0-2 Controller page.**
  - The iOS motion-permission flow (`DeviceMotionEvent.requestPermission()` on a tap).
  - Sensors sampled at about 60 Hz; a player name and colour.
  - Haptic feedback on Android through `navigator.vibrate`, which iOS Safari doesn't support. Sound on both.
- **P0-3 Gesture library.**
  - Swing, flick, shake, tilt (with smoothing), twist, calibrated pointer, and shape recognition (resample the path, then match it to templates, $1-recognizer style).
  - Pure functions over traces, so the same code runs live and in tests.
- **P0-4 Trace recorder and replay tests.**
  - Record from any phone, label it, and save it under `fixtures/`.
  - Tests run in Node with no phone.
  - Report precision and recall per gesture on a held-out set of traces.
- **P0-5 Kiro use (judged on depth).**
  - **Specs:** one per game and one for the kit.
  - **Steering:** gesture design rules, the latency budget, accessibility (a seated mode, left-handed play), and "no recreating existing games".
  - **Hooks:**
    1. When a detector or fixture changes, replay all traces and fail on any regression.
    2. When a new trace folder appears, offer to generate a detector and its tests (teach-a-move).
    3. When a game spec changes, update the gesture checklist in the README.
  - **MCP:** only if one is genuinely useful (e.g. docs for the sensor APIs). Don't add it for show.
- **P0-6 Both games, playable end to end** on iOS Safari and Android Chrome.
- **P0-7 Latency meter.** Round-trip from phone to host and back, shown in a debug overlay. **Measure it, don't assume it.**

### Should have (P1)
- **P1-1 WebRTC data channel** directly between phone and host, with the WebSocket only for setup, if the relay's latency is too high.
- **P1-2 Drift correction** for the pointer: re-centre when the player taps.
- **P1-3 Spectator mode** for remote viewers (for the video).

### Out of scope
- Native apps, accounts and payments.
- Any game that copies an existing title's mechanics, characters, names or look.
- Camera-based tracking (that's last year's Grand Prize territory; this project stays sensor-only on purpose).

## 5. Architecture

```
Host (browser, laptop/TV)        Relay (Durable Object / PartyKit)        Phone (browser)
  game canvas                       room state, fan-out                     controller page
  gesture engine  <----- events / raw sensor frames (~60 Hz) ------------   DeviceMotion/Orientation
  QR code + join URL                                                        haptics, sound
        |
  shared package: /kit (gestures, recorder, replay, transport client)
  /fixtures (labelled traces)   /tests (Node replay tests)   /.kiro (specs, hooks, steering)
```

- **Open choice:** whether gestures run on the phone (only events are sent) or on the host (raw frames are sent).
  - Start with raw frames to the host, so the trace format and the tests are the same everywhere.
  - Move detection to the phone if bandwidth or latency suffers.

**Trace format (sketch):**
```json
{"gesture": "flick", "device": "iPhone 13 / Safari", "hz": 60,
 "frames": [{"t": 0, "acc": [0.1, 9.7, 0.3], "gyro": [0.0, 0.2, 1.4], "ori": [12, -3, 88]}]}
```

## 6. Day-1 pilot (30 min, before building anything else)

1. Phone joins the host through the relay. Measure round-trip latency over home Wi-Fi and over mobile data.
   - **Pass:** p95 under ~50 ms on Wi-Fi.
2. iOS Safari permission prompt works from a tap, over HTTPS.
3. Record a flick twice and replay both through a toy detector. **Pass:** the same result both times, run after run.

If step 1 fails, switch to WebRTC (P1-1) before writing any game code.

## 7. Demo (under 3 min)

| Time | What's on screen |
|---|---|
| 0:00–0:15 | Hook: an old motion controller in a drawer, "the sensor bar died, but you carry a better one". |
| 0:15–0:35 | The QR code on screen; 4 friends scan it and are in within 10 seconds. |
| 0:35–1:20 | **Séance:** 4 phones steering one planchette; chaos, laughter, the answer gets spelled. |
| 1:20–1:55 | **Hex Duel:** drawing spells in the air; then teach a new spell live, 3 times, and cast it. |
| 1:55–2:30 | **How it works:** a Kiro hook replays the recorded traces; break the flick detector, the hook goes red, fix it, green. The precision/recall table. |
| 2:30–2:50 | Measured latency numbers `[NEEDS INPUT]`, and the iOS/Android support matrix. |
| 2:50–3:00 | Close: "dead hardware, living controls". |

**Real friends playing makes the video.** Film before everyone leaves for December.

## 8. Success criteria

- A judge can join from their own phone in under 15 seconds, with no install.
- Both games are playable with 2 or more players on iOS Safari and Android Chrome.
- Latency is measured and reported (p50 and p95), never assumed.
- Each gesture's precision and recall is measured on held-out traces and published, including the misses.
- `.kiro/` (specs, hooks, steering) is committed at the repo root. The repo is public on GitHub. The app URL works. The video is under 3 minutes. The write-up explains how Kiro was used.

## 9. Plan

| Day | Work |
|---|---|
| Nov 26–30 | Rehearse comes first (due Dec 1, 3:30 AM IST). Optional: the 30-min pilot if there's a gap. |
| Dec 1 | Kiro Pro set up. Pilot (section 6). Rooms, the QR join, the controller page, the latency meter. |
| Dec 2 | Gesture library, recorder, trace fixtures, replay tests, Kiro hooks. |
| Dec 3 | Séance and Hex Duel playable. Teach-a-move. |
| Dec 4 | Polish, film with friends, write-up, README, submit by the evening (IST). |

## 10. Risks

- **Network latency on judges' Wi-Fi.** Measure it, keep WebRTC as the fallback, and pick games that tolerate ~100 ms (Séance is forgiving by design).
- **iOS quirks:** the permission prompt, no vibration, sleeping screens. Use the Wake Lock API where it's supported, and show "keep your screen on" otherwise.
- **Gyro drift** affects the pointer. Re-centre on tap, and lean on relative gestures over absolute pointing.
- **Comparison with last year's winner.** Differences: phone sensors rather than a webcam, multiplayer, testable gestures, nothing to install. Say this explicitly in the write-up.
- **Kiro credits.** 50 free credits isn't enough. Pro at $20 (first month mostly free plus 500 trial credits; he enters the card himself).

## 11. To check on the rules page before day 1 (Devpost blocks automated reads, so these are unconfirmed)

1. Licence requirement (likely an OSI open-source licence).
2. Whether a submission counts for one category only.
3. Whether the student prize needs proof of enrolment.
4. Whether friends appearing in the video need to be listed or give consent (get their OK anyway).

## 12. Open questions

1. What's the final name?
2. Which friends will play in the video, and when (before exams end)?
3. Is there a TV or projector to use as the host screen in the video, or just a laptop?
