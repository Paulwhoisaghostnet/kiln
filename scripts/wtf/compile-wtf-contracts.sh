#!/usr/bin/env bash
# Compile every WTF contract template with SmartPy and sync the Michelson +
# storage + JSON artifacts next to their .py sources. This mirrors the
# pattern in scripts/compile-token-contracts.sh (which handles the FA2 test
# tokens) so CI and local dev runs are symmetric.
#
# Kiln itself can compile SmartPy source on-demand through its workflow API,
# so these artifacts are not required to originate contracts. They exist for
# two reasons:
#   1. Offline ghostnet smoke tests in scripts/wtf/test_*.py
#   2. Reviewable diffs when a template changes, so a human can see the
#      Michelson delta alongside the SmartPy delta.
#
# Usage (from the kiln project root):
#     ./scripts/wtf/compile-wtf-contracts.sh
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
COLLECTIONS_DIR="$ROOT_DIR/contracts/wtf-collections"
BUYBACK_DIR="$ROOT_DIR/contracts/wtf-buyback"

if ! command -v smartpy >/dev/null 2>&1; then
  echo "smartpy CLI not found on PATH. Install with: pip install smartpy-tezos" >&2
  exit 1
fi

compile_file() {
  local source_file="$1"
  local scenario_name="$2"
  local target_base="$3"
  local build_dir
  build_dir="$(mktemp -d)"
  trap 'rm -rf "$build_dir"' RETURN

  smartpy compile "$source_file" "$build_dir" --purge
  local scenario_dir="$build_dir/$scenario_name"
  if [[ ! -d "$scenario_dir" ]]; then
    echo "Expected scenario dir $scenario_dir not found after compile." >&2
    exit 1
  fi

  cp "$scenario_dir/step_001_cont_0_contract.tz"     "$target_base.tz"
  cp "$scenario_dir/step_001_cont_0_storage.tz"      "$target_base.storage.tz"
  cp "$scenario_dir/step_001_cont_0_storage.json"    "$target_base.storage.json"
  cp "$scenario_dir/step_001_cont_0_contract.json"   "$target_base.contract.json"
  echo "Synced $(basename "$target_base") artifacts."
}

# wtf-collections — children of the factory-style collection.
compile_file \
  "$COLLECTIONS_DIR/WtfOpenEditionFA2.py"   "WtfOpenEdition" \
  "$COLLECTIONS_DIR/WtfOpenEditionFA2"
compile_file \
  "$COLLECTIONS_DIR/WtfAllowlistFA2.py"     "WtfAllowlist"   \
  "$COLLECTIONS_DIR/WtfAllowlistFA2"
compile_file \
  "$COLLECTIONS_DIR/WtfBondingCurveFA2.py"  "WtfBondingCurveFA2" \
  "$COLLECTIONS_DIR/WtfBondingCurveFA2"
compile_file \
  "$COLLECTIONS_DIR/WtfBlindMintFA2.py"     "WtfBlindMint"   \
  "$COLLECTIONS_DIR/WtfBlindMintFA2"

# wtf-buyback — closed WTF-for-XTZ buyback contract (fifth template).
compile_file \
  "$BUYBACK_DIR/WtfBuybackV1.py"            "WtfBuybackV1"   \
  "$BUYBACK_DIR/WtfBuybackV1"

echo "All WTF contract artifacts regenerated."
echo "Note: storage files use placeholder parameters; Kiln substitutes real"
echo "origination parameters via the workflow API at deploy time."
