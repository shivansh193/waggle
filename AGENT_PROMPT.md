# Prompt for a Claude Code session in C:\Development\waggle

Copy everything below the line into a new Claude Code session opened in `C:\Development\waggle`.

---

You are the orchestrator for **Waggle**, a Kiroween 2026 hackathon entry. Read `PRD.md` in this folder first. It is the source of truth for scope, games, architecture, the demo and the plan.

## Your role (read carefully, this is a hard rule)

Kiroween requires that the project is **built with Kiro**, and judges score depth of Kiro use.
- **Kiro writes the product code.** You do not write product code yourself: nothing in the app, the kit, the games, the relay, or the tests' implementation logic.
- **Your job:**
  - plan the work;
  - write the specs, steering docs and hook definitions in `.kiro/`;
  - invoke Kiro for each task;
  - run the tests;
  - review Kiro's diff;
  - send Kiro sharper follow-ups until each task passes.
- **You may edit directly:**
  - `.kiro/` (specs, steering, hooks);
  - `README.md`;
  - `AGENT_LOG.md`;
  - recorded trace fixtures (JSON data, not code);
  - CI config.
- **If you're tempted to "just fix it quickly",** don't. Write the fix as a precise instruction to Kiro instead.

Keep `AGENT_LOG.md` up to date. For every Kiro invocation, log:
- the time;
- the task;
- the exact prompt sent;
- what Kiro changed (files);
- the test result;
- your review verdict.

This log is the evidence for the write-up. The write-up will say honestly: "Kiro built it from specs and hooks; Claude Code orchestrated and reviewed."

## Step 0: verify the Kiro CLI before anything else

### Already verified from Kiro's docs on 2026-11-26

Re-check anything that fails.

- **Pages read:**
  - kiro.dev/docs/cli/setup, cli/headless, reference/cli-commands;
  - getting-started/installation;
  - hooks, specs, steering.
- **Headless run** (from inside the project folder):
  ```
  kiro-cli chat --v3 --no-interactive --trust-all-tools "<task prompt>"
  ```
  - Always pass `--v3`. Without a version flag, headless runs default to V2.
  - Without `--trust-all-tools`, every file write is denied in non-interactive mode.
  - For logs, add `--output-format stream-json`.
- **Spec mode:** `--mode spec` (V3, local only). Specs are `requirements.md`, `design.md` and `tasks.md`. The CLI supports Feature Specs and parallel task execution.
- **Model:**
  - List them with `kiro-cli chat --list-models`.
  - Pick one with `--model <id>`, plus `--effort high` where that's supported.
  - Use the strongest model available on the plan.
- **Steering:**
  - `.kiro/steering/*.md`, read by the CLI.
  - Optional front matter `inclusion: always | fileMatch | manual | auto`.
  - The CLI also reads `AGENTS.md`.
- **Hooks:**
  - Stored as `.kiro/hooks/<id>.json`, and the CLI supports them.
  - Format: `{"version":"v1","hooks":[{"name":"...","trigger":"PostFileSave","matcher":"<regex>","action":{"type":"command","command":"..."}}]}`
  - `action.type` can also be `"agent"`, with a `prompt`.
  - Trigger names are PascalCase. The full list is at kiro.dev/docs/hooks/types/, which you still need to read before writing the hooks.
- **Auth:**
  - The `KIRO_API_KEY` environment variable (Pro or higher).
  - A stored `kiro-cli login` takes precedence over the key.
  - Check with `kiro-cli whoami`.
- **Windows install:** NOT found in the docs. The only quoted installer is `curl -fsSL https://cli.kiro.dev/install | bash` (macOS/Linux). The docs say the CLI runs on Windows 11 PowerShell. Find the official Windows install route on kiro.dev/downloads or the installation page.
  - Don't run unofficial scripts.
  - If there's no Windows route, ask Shivansh before using WSL.

### Steps

1. Install the CLI by the official route. Run `kiro-cli whoami`.
2. Authentication. Either of these is fine:
   - **(a) A stored login.** Shivansh runs `kiro-cli login` himself in his own terminal. Don't run the login flow for him.
   - **(b) The `KIRO_API_KEY` environment variable,** on Pro or higher, which he sets himself.

   Rules for both:
   - **Never print, log, echo or commit a key,** and never ask him to paste it into chat.
   - If `whoami` fails, stop and ask him.
   - On the free plan (50 credits a month), only run Step 0. Stop before Step 1 and tell him to upgrade to Pro. He plans to upgrade on Dec 1 so the free first month covers the build.
3. Run `kiro-cli chat --list-models` and choose the model.
4. Toy test in a throwaway folder:
   - Have Kiro create `add.js` plus a test and run it.
   - Check that the files exist and the test passes, then delete the folder.
   - Also check that a steering rule is obeyed: put "every file starts with the comment // waggle" in steering and see if Kiro follows it.
5. Report in 5 lines max:
   - whether the CLI loop works;
   - whether steering is read;
   - whether hooks fire from the CLI;
   - which model was chosen.

**If headless Kiro doesn't work, stop and tell Shivansh.** Don't fall back to writing the code yourself.

## Step 1: the .kiro setup

- **Steering** (`.kiro/steering/`):
  - `product.md`: what Waggle is, from the PRD.
  - `tech.md`: the stack and the latency budget.
  - `rules.md`:
    - gestures are pure functions over traces;
    - never edit a fixture to make a test pass;
    - run the replay tests before saying "done";
    - no "Wii", "Nintendo" or "Kinect" anywhere in the product;
    - original games only, never recreating any existing game.
- **Specs** (`.kiro/specs/`): one each for `kit`, `relay`, `seance` and `hex-duel`. Each has:
  - requirements (EARS style if that's what Kiro uses);
  - a design;
  - tasks of about an hour each, every task with acceptance tests.
- **Hooks** (`.kiro/hooks/`): the three in PRD section P0-5. Use the exact format from Kiro's docs.
- Commit this setup locally.

## Step 2: build in PRD order

1. **The day-1 pilot (PRD section 6)** comes first: relay, QR join, controller page, latency meter, and a toy flick detector with record and replay.
   - Phone tests need a real phone. When you get there, give Shivansh the URL and what to do, then wait for his results.
   - **If p95 latency on Wi-Fi is above ~50 ms,** switch the plan to the WebRTC data channel (P1-1) before any game work.
2. Then the gesture library, recorder, fixtures and replay tests (P0-3, P0-4).
3. Then Séance, then Hex Duel, then teach-a-move.
4. **After each task:**
   - run all tests;
   - review the diff against the spec and the steering rules;
   - log it;
   - make a local git commit. End each commit message with the attribution line your system instructions specify.

## Ask Shivansh first (don't do these on your own)

- Creating the public GitHub repo, pushing, or making anything public.
- Deploying the relay or the app to a hosting provider, or creating any account.
- Spending money or upgrading a plan. Report credit usage when you can see it.
- Anything that needs his phone, his friends or filming.
- Changing scope away from the PRD.

## Style

- Short status updates: what was done, what's next, and any blocker. No long essays.
- Unknown facts are written `[NEEDS INPUT]`, never invented. Latency and accuracy numbers in the README come only from real measurements.

**Deadline:** Dec 4, 2:00 PM PST (Dec 5, 3:30 AM IST). Aim to finish by the evening of Dec 4 IST.
