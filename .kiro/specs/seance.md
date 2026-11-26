# Spec: Séance

## Concept
Co-op party game (2–8 players). A planchette moves around a spirit board. Everyone tilts their phone at once; the planchette follows the **average** of all tilts. The spirit asks a question and the group spells the answer together — someone always pulls the wrong way.

## Mechanics

### Spirit board layout
- Outer arc: A–Z (26 letters)
- Inner arc: 0–9 (10 digits)
- Special: YES, NO, GOODBYE
- Letters sized for legibility at TV distance (≥ 1rem)

### Planchette movement
- Each player's tilt contributes equally to the average
- Average `beta` (front-back, clamped to ±30°) → Y position
- Average `gamma` (left-right, clamped to ±30°) → X position
- Planchette renders as a glowing disc showing player count

### Letter selection (dwell)
- Hover a letter for 700 ms → select it
- Append the letter to the typed string
- When `typed === answer` → celebrate → 2 s delay → new question

### Ghost interruption
- Random chance each frame to trigger a ghost (~0.05 %/frame, so roughly once per minute)
- While ghost is active: board shakes, planchette is unresponsive, red flash overlay
- Banishing: majority of players shake simultaneously (within a 1-second window)

### Questions
- Minimum 5 questions in rotation
- Answers are 3–8 letters, common Halloween-themed words
- After answering, pick a random new question (not the same one twice in a row)

## Acceptance criteria
- 4 players tilting together steer the planchette noticeably
- A single player can still guide the planchette on their own
- Ghost banishing triggers correctly when ≥ 50 % of players shake within 1 s
- All 7 UI elements (board, planchette, question text, typed string, ghost overlay, player count in planchette, debug overlay) render at 60 fps

## Accessibility
- Seated mode: tilt range is ±30° not ±90°, so the game is fully playable sitting
- Left-handed: mirroring is cosmetic only; the gesture mappings don't change
