# Spec: Hex Duel

## Concept
1-vs-1 spellcasting duel. Each player draws a shape in the air with their phone, then flicks to throw the spell. Spells clash in a rock-paper-scissors system. First player to 0 HP loses.

## Mechanics

### Spells (default)
| Shape drawn | Spell | Beats |
|---|---|---|
| Circle | Shield 🛡️ | Bolt |
| Zigzag | Bolt ⚡ | Curse |
| Spiral | Curse 🌀 | Shield |

Custom spells: drawn 3 times via "teach a move" → Kiro generates a detector.

### Shape drawing
- Phone gyro path is tracked continuously during the "drawing" phase
- Path = integral of `gyro.x` and `gyro.y` over time (see `gyroToPath`)
- When the player flicks, the drawn path is classified by the $1 recogniser
- Minimum score 0.4 for a confident match; below that, show "unrecognised"

### Flick to cast
- Flick gesture (`detectFlick`) triggers spell cast
- If no recognisable shape in the buffer, the spell fizzles (no damage, haptic buzz)

### Combat resolution
- Both players must cast (or 10-second time limit → auto-fizzle)
- Spells resolve simultaneously
- Beat: target loses 1 HP
- Tie: no damage

### HP
- 3 HP per player (shown as ♥♥♥)
- 0 HP → lose → show winner, then lobby

### Gyro path visualiser (phone screen)
- Real-time preview of the path drawn so far (last 2 seconds of gyro data)
- When spell is cast, show the matched shape emoji full-screen for 500 ms

## Teach-a-move flow
1. Player opens DevTools (or we add a UI button) and calls `window.waggle.startRecording()`
2. Player draws the new shape 3 times, calling `window.waggle.stopRecording('fireball')` after each
3. 3 traces saved to `fixtures/fireball_1.json`, `fireball_2.json`, `fireball_3.json`
4. Kiro's "new fixture folder" hook fires → Kiro generates `kit/src/gestures/fireball.ts` and a test
5. `buildTemplate('fireball', rawPoints)` added to the template list
6. The new spell is immediately castable

## Acceptance criteria
- Drawing an approximate circle reliably classifies as `circle` (score ≥ 0.4)
- Flick detection doesn't fire while drawing (only when the motion is a sharp impulse)
- Both players see the resolution outcome within 200 ms of the second flick
- HP display is correct after each round
- Teach-a-move adds a castable spell without restarting the app

## Accessibility
- Seated: drawing shapes while seated is fully supported
- Left-handed: gyro path is handed; left-handed players draw mirrored shapes.
  The recogniser normalises rotation, so mirrored shapes should still match.
  Verify with a left-handed trace before the demo.
