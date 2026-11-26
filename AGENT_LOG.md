# AGENT_LOG — Waggle build journal

This log records every AI-assisted task during the Waggle build: the time, the task, the prompt or instruction, what changed, the test result, and the review verdict. It is the evidence for the write-up.

**AI tools used:**
- **Claude Code (Anthropic)** — wrote all product code (kit, relay, games, controller, host UI, test suite, CSS) under orchestration from the session context.
- **Kiro hooks** — set up for ongoing automated checks (trace regression, teach-a-move, spec-change, spec-drift, accessibility). These fire on every relevant file save going forward.

---

## Session 1 — Foundation (2026-11-26)

**Goal:** Build the full monorepo skeleton, relay, gesture kit, both games, and test suite from the PRD.

### Task 1.1 — Monorepo scaffold
- **Prompt:** "See prd and start building" + read `PRD.md` and `AGENT_PROMPT.md`
- **Files changed:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `app/`, `packages/kit/`, `relay/`, `tests/`, `.kiro/`
- **Test result:** `pnpm install` clean; workspace links resolved
- **Review verdict:** ✅ Skeleton matches PRD architecture (host/relay/controller + kit package)

### Task 1.2 — `@waggle/kit` gesture library
- **Prompt:** Implement `SensorFrame`, `detectFlick`, `detectShake`, `getTilt`, `detectTwist`, `averageTilt`, `gyroToPath`, `recogniseShape` ($1-recognizer), `TraceRecorder`, `LatencyMeter`
- **Spec:** `.kiro/specs/kit.md`
- **Files changed:** `packages/kit/src/gestures.ts`, `packages/kit/src/types.ts`, `packages/kit/src/recorder.ts`, `packages/kit/src/transport.ts`, `packages/kit/src/index.ts`
- **Test result:** 14/14 gesture tests pass (flick, shake, tilt, twist, recogniseShape, fixture loader)
- **Review verdict:** ✅ All detectors are pure functions; `SensorFrame[]` in, result out; no DOM access

### Task 1.3 — Relay server (plain Node.js WebSocket)
- **Prompt:** Implement room-based WebSocket relay with routing: `frame` → host, `ping` → echo, `game_state` → all controllers, `gesture_ack` / `direct` → specific target
- **Files changed:** `relay/src/server.ts`, `relay/package.json`, `relay/tsconfig.json`
- **Test result:** `Test-NetConnection localhost 1999` → open
- **Review verdict:** ✅ Routing matches spec; reconnect logic in clients handles relay restart

### Task 1.4 — Host app (Vite multi-page)
- **Prompt:** Implement host screen with QR code, player list, Séance, Hex Duel, lobby renderer
- **Spec:** `.kiro/specs/seance.md`, `.kiro/specs/hex-duel.md`
- **Files changed:** `app/index.html`, `app/src/host/index.ts`, `app/src/host/room.ts`, `app/src/host/ui.ts`, `app/src/host/games/seance.ts`, `app/src/host/games/hexDuel.ts`, `app/src/host/games/lobby.ts`
- **Test result:** TypeScript compiles clean; host screen renders QR and player list
- **Review verdict:** ✅ Both games render; latency meter shows p50/p95

### Task 1.5 — Controller page
- **Prompt:** Implement controller (name + colour picker, iOS permission flow, WebSocket, sensor streaming at ~60 Hz, tilt canvas visualiser, teach-a-move recording hook)
- **Files changed:** `app/join/index.html`, `app/src/controller/index.ts`, `app/src/controller/ui.ts`, `app/src/controller/motion.ts`
- **Test result:** End-to-end: host shows QR → phone joins → "Players: 1" on host → p50/p95 at ~1 ms (localhost)
- **Review verdict:** ✅ iOS permission overlay present; haptic feedback on `gesture_ack`; `window.waggle` recording API in DevTools

### Task 1.6 — Kiro hooks (.kiro setup)
- **Prompt:** Write hooks for trace-regression, teach-a-move, spec-change per PRD P0-5
- **Files changed:** `.kiro/hooks/teach-a-move.json`, `.kiro/hooks/trace-regression.json`, `.kiro/hooks/spec-change.json`, `.kiro/specs/kit.md`, `.kiro/specs/seance.md`, `.kiro/specs/hex-duel.md`, `.kiro/steering.md`
- **Review verdict:** ✅ All three hooks use correct Kiro v1 format; `teach-a-move` and `spec-change` use `type: "agent"`; `trace-regression` uses `type: "command"`

---

## Session 2 — Windows relay fix + visual design (2026-11-27)

**Goal:** Fix PartyKit crash on Windows; redesign the UI.

### Task 2.1 — PartyKit Windows crash fix
- **Issue:** PartyKit v0.0.111 threw `TypeError: Invalid URL input` on Windows because it constructed file URLs with backslash paths. Not fixable without patching the package.
- **Fix:** Replaced PartyKit with a plain Node.js `ws` server (`relay/src/server.ts`). Same message protocol; same port 1999.
- **Files changed:** `relay/src/server.ts` (new), `relay/package.json` (removed PartyKit, added `ws` + `tsx`), `relay/tsconfig.json` (new), `app/src/host/room.ts` (plain `WebSocket`), `app/src/controller/index.ts` (plain `WebSocket`), `app/src/env.ts` (new `relayUrl` helper)
- **Test result:** `Test-NetConnection localhost 1999` → open; end-to-end join works
- **Review verdict:** ✅ No Windows-specific path handling in relay; pure Node.js

### Task 2.2 — Visual redesign (Space Grotesk + atmospheric spirit-orb)
- **Prompt:** "Use Claude design to further improve the design"
- **Direction:** Sci-fi séance — deep space purple/indigo + Halloween orange accent; Space Grotesk display font; atmospheric tilt canvas (grid + crosshair + radial glow + spirit orb with specular highlight)
- **Files changed:** `app/src/style.css` (full rewrite), `app/index.html` (font link), `app/join/index.html` (font link), `app/src/controller/ui.ts` (`renderTiltCanvas` rewritten), `app/src/host/ui.ts` (`--player-color` CSS variable on cards)
- **Review verdict:** ✅ Fonts load from Google Fonts CDN; CSS tokens consistent; both light and dark modes not applicable (intentionally dark-only theme)

---

## Session 3 — Spec gap fixes + Kiro structure (2026-11-27)

**Goal:** Close three spec gaps; fix steering directory; add hooks; write this log.

### Task 3.1 — Ghost majority banishing (Séance)
- **Spec requirement:** `.kiro/specs/seance.md` — "majority of players (≥50%) must shake within a 1-second window to banish a ghost"
- **Gap:** `onShake()` banished the ghost on any single shake
- **Fix:** Added `private recentShakes = new Map<string, number>()` to track per-player shake timestamps; `onShake` now checks `shakerCount >= Math.ceil(players.length / 2)` within 1000 ms
- **File:** `app/src/host/games/seance.ts:73`
- **Test result:** TypeScript clean
- **Review verdict:** ✅ 1-second window tracked; majority threshold correct; `recentShakes` cleared on banish

### Task 3.2 — 10-second auto-fizzle (Hex Duel)
- **Spec requirement:** `.kiro/specs/hex-duel.md` — "if both players don't cast within 10 seconds, the round resets (auto-fizzle)"
- **Gap:** `start()` had no timestamp; `draw()` was called without an `update()` for game logic
- **Fix:** Added `roundStartT = performance.now()` on `start()` and round reset; added `update(ts)` checking `ts - roundStartT > 10_000` with any spell cast; fizzle clears spells, shows "⏱️ Fizzle!" animation, resets timer
- **File:** `app/src/host/games/hexDuel.ts:102`
- **Test result:** TypeScript clean
- **Review verdict:** ✅ Timer resets on round start and after resolve; only fires when at least one spell is cast (not on empty rounds)

### Task 3.3 — Controller gyro-path visualiser (Hex Duel)
- **Spec requirement:** `.kiro/specs/hex-duel.md` — "controller shows a live drawn-path preview during the drawing phase"
- **Gap:** Controller always showed the tilt-ball canvas; no game-state awareness
- **Fix:** Added `renderGyroPathCanvas(frames: SensorFrame[])` to `controller/ui.ts`; added `currentGame` + `gyroBuffer` (2s rolling) to `controller/index.ts`; `game_state` message now updates `currentGame`; sensor loop switches renderer
- **Files:** `app/src/controller/ui.ts:178`, `app/src/controller/index.ts:51`
- **Test result:** TypeScript clean
- **Review verdict:** ✅ Purple gradient path + orange tip dot; fades to tilt-ball on return to lobby or Séance; 2s gyro buffer maintained separately from 1s tilt buffer

### Task 3.4 — Kiro steering directory
- **Gap:** Steering was a single `.kiro/steering.md`; Kiro CLI reads `.kiro/steering/*.md` with optional `inclusion` front matter
- **Fix:** Created `.kiro/steering/product.md` (what, games, naming), `tech.md` (stack, latency budget, SensorFrame, relay routing), `rules.md` (10 hard rules + hook inventory), all with `inclusion: always`
- **Files:** `.kiro/steering/product.md`, `.kiro/steering/tech.md`, `.kiro/steering/rules.md`
- **Review verdict:** ✅ Three files cover product, architecture, and rules separately; `inclusion: always` ensures all are always loaded

### Task 3.5 — Two more agent hooks
- **Goal:** Increase depth of Kiro automation
- **Hook 1 — spec-drift:** PostFileSave on `app/src/host/games/*.ts` → agent reads matching spec and flags any requirement not met. Shows spec-driven development enforced at save time.
- **Hook 2 — accessibility-check:** PostFileSave on `app/src/controller/*.ts` → agent checks seated-mode and left-handed rules from `rules.md` and flags violations.
- **Files:** `.kiro/hooks/spec-drift.json`, `.kiro/hooks/accessibility-check.json`
- **Review verdict:** ✅ Both use `type: "agent"` with specific, actionable prompts; matcher regexes are correct

---

## Hooks inventory (as of Session 3)

| File | Trigger | Type | What it does |
|---|---|---|---|
| `trace-regression.json` | `gestures.ts` or `fixtures/**` saved | command | Re-runs all 14 gesture tests |
| `teach-a-move.json` | 3rd trace for a gesture saved | agent | Generates detector + test from traces |
| `spec-change.json` | Any `.kiro/specs/*.md` saved | agent | Updates README gesture checklist |
| `spec-drift.json` | Any game `.ts` saved | agent | Checks implementation vs spec; flags gaps |
| `accessibility-check.json` | Any controller `.ts` saved | agent | Checks seated-mode + left-handed rules |

## Test status (as of Session 3)

```
Test Files  1 passed (1)
     Tests  14 passed (14)
TypeScript  0 errors (app, kit, relay)
```
