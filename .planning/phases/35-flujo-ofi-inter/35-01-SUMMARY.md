# Phase 35 Plan 01: Ofi Inter Foundation Summary

---
phase: 35
plan: 01
subsystem: somnio-agent
tags: [ofi-inter, state-machine, constants, detection, data-extractor]
dependency-graph:
  requires: [14, 30, 31, 34]
  provides: [ofi-inter-constants, collecting-data-inter-state, detection-functions, completion-checks]
  affects: [35-02, 35-03]
tech-stack:
  added: []
  patterns: [mode-based-field-switching, pure-function-additions]
key-files:
  created: []
  modified:
    - src/lib/agents/somnio/constants.ts
    - src/lib/agents/somnio/config.ts
    - src/lib/agents/somnio/data-extractor.ts
    - src/lib/agents/somnio/normalizers.ts
    - src/lib/agents/somnio/transition-validator.ts
decisions:
  - "OFI_INTER_CRITICAL_FIELDS uses 'ciudad' not 'municipio' -- reuses existing field, zero schema changes"
  - "REMOTE_MUNICIPALITIES stored as accent-stripped Set for O(1) lookup"
  - "hasCriticalDataInter requires 4 critical + 2 additional = 6 minimum (cedula optional)"
  - "New mode-aware methods added alongside existing ones for backward compatibility"
  - "CONFIRMATORY_MODES includes collecting_data_inter so acknowledgments are RESPONDIBLE"
metrics:
  duration: ~9min
  completed: 2026-02-25
---

**One-liner:** Ofi inter state machine, field constants, detection patterns, completion checks, and mode-aware transition validation as dead code foundation for Plans 02-03.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Constants + Config + Detection Functions | f59f3d5 | OFI_INTER_CRITICAL_FIELDS, detectOfiInterMention, isCollectingDataMode, collecting_data_inter state, isRemoteMunicipality |
| 2 | Data Extractor + Transition Validator | 7464ea7 | hasCriticalDataInter, isDataComplete, checkAutoTriggersForMode, shouldTriggerTimerPromoForMode, cedula_recoge field |

## What Was Built

### constants.ts
- `OFI_INTER_CRITICAL_FIELDS`: 4 fields (nombre, telefono, ciudad, departamento) -- no direccion
- `OFI_INTER_ADDITIONAL_FIELDS`: 3 fields (apellido, cedula_recoge, correo)
- `MIN_FIELDS_FOR_AUTO_PROMO_INTER = 6`: threshold for ofi inter auto-promo
- `OFI_INTER_PATTERNS`: 11 regex patterns for Route 1 detection
- `detectOfiInterMention()`: tests message against all patterns
- `isCollectingDataMode()`: helper for both collecting modes
- `CONFIRMATORY_MODES` now includes `collecting_data_inter`

### config.ts
- `collecting_data_inter` added to `SOMNIO_STATES` (auto-updates SomnioState type)
- Bidirectional transitions: `collecting_data <-> collecting_data_inter`
- `bienvenida` and `conversacion` can transition to `collecting_data_inter`

### normalizers.ts
- `REMOTE_MUNICIPALITIES`: curated Set of 11 remote department capitals
- `isRemoteMunicipality()`: accent-stripped lowercase matching against the Set

### data-extractor.ts
- `cedula_recoge` added to `ExtractedData` interface
- `hasCriticalDataInter()`: 4 critical fields + 2 additional minimum
- `isDataComplete()`: mode-aware dispatcher to correct completion function

### transition-validator.ts
- `checkAutoTriggersForMode()`: mode-aware auto-trigger (6 fields for inter, 8 for normal)
- `shouldTriggerTimerPromoForMode()`: mode-aware timer promo (OFI_INTER_CRITICAL_FIELDS for inter)

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **ciudad not municipio:** OFI_INTER_CRITICAL_FIELDS uses 'ciudad' (existing field) rather than creating a new 'municipio' field. Colombian municipalities map to cities internally, avoiding schema changes.
2. **Accent-stripped Set:** REMOTE_MUNICIPALITIES normalizes all entries to accent-stripped lowercase. The isRemoteMunicipality function strips accents from input before lookup, matching "Mitu" and "Mitú" identically.
3. **Backward compatibility:** All new functions (hasCriticalDataInter, isDataComplete, checkAutoTriggersForMode, shouldTriggerTimerPromoForMode) are additions alongside existing functions. No existing signatures changed.
4. **CONFIRMATORY_MODES:** collecting_data_inter added so that "ok"/"si" in ofi inter mode are classified as RESPONDIBLE (not SILENCIOSO).

## Verification Results

- [x] `npx tsc --noEmit` passes (no new type errors)
- [x] All new exports importable from their modules
- [x] Existing exports and function signatures unchanged
- [x] SomnioState type includes 'collecting_data_inter'
- [x] SOMNIO_TRANSITIONS['collecting_data_inter'] includes both 'collecting_data' and 'ofrecer_promos'
- [x] CONFIRMATORY_MODES.has('collecting_data_inter') returns true

## Next Phase Readiness

Plan 02 (Agent Pipeline Integration) can proceed immediately. All building blocks from this plan are in place:
- State machine ready for mode transitions
- Detection functions ready for Route 1 wiring
- Completion checks ready for mode-aware dispatch
- No blockers.
