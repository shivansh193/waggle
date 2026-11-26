#!/usr/bin/env bash
# Hook: replay all fixture traces on each change to a detector or fixture.
# Kiro runs this automatically when files matching the globs below change.
#
# KIRO_HOOK_GLOBS:
#   packages/kit/src/gestures.ts
#   fixtures/**/*.json
#
# Fail = red in the Kiro panel; fix the detector, it goes green.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)" 2>/dev/null || cd "$(dirname "$0")/../.."

echo "▶ Running gesture replay tests..."
pnpm --filter tests test 2>&1

echo "✓ All fixture traces passed."
