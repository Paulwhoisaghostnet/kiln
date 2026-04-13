#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/contracts/tokens/fa2_test_tokens.py"
TOKENS=(bronze silver gold platinum diamond)
ARTIFACT_SUFFIXES=(tz storage.tz storage.json contract.json types.py)

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "Token source file missing: $SOURCE_FILE" >&2
  exit 1
fi

needs_compile=0

for token in "${TOKENS[@]}"; do
  for suffix in "${ARTIFACT_SUFFIXES[@]}"; do
    artifact="$ROOT_DIR/contracts/tokens/test-$token.$suffix"
    if [[ ! -f "$artifact" ]]; then
      needs_compile=1
      break 2
    fi
    if [[ "$SOURCE_FILE" -nt "$artifact" ]]; then
      needs_compile=1
      break 2
    fi
  done
done

if [[ "$needs_compile" -eq 0 ]]; then
  echo "Token artifacts are present and up-to-date."
  exit 0
fi

if ! command -v smartpy >/dev/null 2>&1; then
  echo "Token artifacts are missing or stale, but smartpy CLI is not installed." >&2
  echo "Install smartpy-tezos, then run: npm run compile:tokens" >&2
  exit 1
fi

echo "Token artifacts are stale; recompiling from contracts/tokens/fa2_test_tokens.py..."
bash "$ROOT_DIR/scripts/compile-token-contracts.sh"
