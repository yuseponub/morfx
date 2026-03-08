---
phase: quick-011
plan: 01
subsystem: sandbox-debug
tags: [debug-panel, two-track, ui-cleanup]
tech-stack:
  patterns: [two-track-architecture, graceful-fallback]
key-files:
  modified:
    - src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
decisions:
  - id: d1
    summary: "Fallback for old sessions: show classification.category when no salesTrack/responseTrack"
metrics:
  duration: "3 min"
  completed: "2026-03-08"
---

# Quick 011: Debug Panel Cleanup for Two-Track Architecture

**One-liner:** Removed obsolete orchestration/decision UI from debug panel, updated Pipeline badge to show salesTrack result, added salesTrack/responseTrack to raw context.

## Changes Made

### 1. Pipeline Section Header Badge
- **Before:** Showed `classification.category` (RESPONDIBLE/SILENCIOSO/HANDOFF)
- **After:** Shows salesTrack accion (green), "info" if responseTrack has messages (blue), or "silencio" (yellow)
- **Fallback:** Old sessions without two-track data still show classification.category

### 2. Intent Section Cleaned
- Removed `orchestration` variable and entire "Decision / Orchestration" JSX block
- Renamed section title from "Intent & Decision" to "Intent"
- Kept intent block and classification block unchanged

### 3. Ingest Section Cleaned
- Removed `ingest.action` badge (silent/respond) -- redundant with two-track results
- Kept captura badge and systemEvent badge

### 4. Pipeline OUT Block Removed
- Removed the `{turn.orchestration && ...}` "Result" block showing templates/mode/CREAR ORDEN
- This data is now visible via ST/RT rows in pipeline

### 5. Contexto Raw _lastTurn Updated
- Added `salesTrack: turn.salesTrack` and `responseTrack: turn.responseTrack`
- Removed `orchestration: turn.orchestration`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed PipelineSection OUT block**
- **Found during:** Task 1
- **Issue:** The PipelineSection still had a `{turn.orchestration && ...}` "Result" block that would be dead code after orchestration removal
- **Fix:** Removed the entire OUT/Result block
- **Files modified:** debug-v3.tsx

## Commits

| Hash | Message |
|------|---------|
| f7039b8 | feat(quick-011): clean debug panel for two-track architecture |
