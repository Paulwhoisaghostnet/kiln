---
name: "video_local_pipeline_and_mintable_export"
description: "Use for local-first media pipelines and self-contained mintable package exports with ffmpeg/wasm deployment safety and offline validation."
---

# video_local_pipeline_and_mintable_export

## Quick Start
1. Validate local toolchain (`ffmpeg`, `ffprobe`, runtime deps).
2. Ingest source media and generate segment/preview artifacts.
3. Build final self-contained package (no external runtime refs).
4. Verify offline playback and zero-console-error baseline.
5. Publish package manifest and mintability checklist.

## When To Use
- Local-first video review, clip generation, and export workflows.
- Interactive HTML package creation for minting/distribution.
- Pipelines requiring ffmpeg and optional WASM runtime safety.

## Inputs Required
- Source media paths and expected outputs.
- Packaging constraints (single-folder, asset budget, local-only behavior).
- Runtime context (desktop browser, hosted static, WASM-enabled path).
- QA acceptance criteria.

## Workflow
1. Inspect media metadata and codec compatibility.
2. Run segmentation/preview/contact-sheet steps as required.
3. Generate final package assets and embed local references.
4. Validate runtime controls and playback states offline.
5. If hosted, apply WASM headers/MIME/deploy checks.
6. Produce manifest + artifact inventory + QA report.

## Evidence-Backed Guardrails
- Keep outputs self-contained with relative/local references only.
- Treat toolchain checks (`ffmpeg` availability) as hard preconditions.
- Preserve source immutability in local review workflows.
- Validate compiled package behavior, not only editor/authoring preview.
- Capture screenshot/state artifacts and console health in final QA.

## Reference Map
- `references/mintable-package-checklist.md` -> package integrity and mint readiness.
- `references/wasm-runtime-checks.md` -> hosted WASM safety checks.
- `references/quality-checklist.md` -> release gate.
- `references/sandbox-evidence.md` -> source evidence from Sandbox media projects.

## Output Contract
Return:
- processing summary,
- produced artifacts and package path,
- offline playback verification,
- runtime/error validation summary,
- known limitations and next fixes.

## Validation Checklist
- Package runs without network dependency.
- All referenced assets are present in package folder.
- Core controls (play/pause/seek/switch) are verified.
- Console/runtime errors are zero or explicitly documented.
- Package size and structure meet distribution constraints.

## Failure Modes + Recovery
- Missing toolchain: install/verify ffmpeg stack and rerun.
- Broken local refs: rebuild bundle with strict relative-path validation.
- WASM load failures: fix MIME/headers and re-test hosted runtime.
- Editor/export mismatch: treat exported package as source of truth and patch build path.
