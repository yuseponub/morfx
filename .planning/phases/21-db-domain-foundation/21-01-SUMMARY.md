---
phase: 21-db-domain-foundation
plan: 01
subsystem: database
tags: [postgres, dane, divipola, coordinadora, carrier-coverage, sql-migration, seed-data]

# Dependency graph
requires:
  - phase: none
    provides: "First migration in v3.0 Logistica"
provides:
  - "dane_municipalities table with 1,122 Colombian municipalities and DANE DIVIPOLA codes"
  - "carrier_coverage table with 1,489 Coordinadora cities and FK to DANE"
  - "Lookup indexes for city validation queries"
affects: [21-db-domain-foundation, 22-robot-coordinadora, 23-inngest-orchestrator, 24-chat-comandos]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Global reference tables: NO workspace_id, NO RLS, GRANT SELECT to authenticated+service_role"
    - "DANE code as CHAR(5) with leading zeros (e.g., '05001')"
    - "Normalized name columns for accent-insensitive lookups"
    - "Best-effort DANE matching via UPDATE after INSERT"

key-files:
  created:
    - supabase/migrations/20260222000000_dane_municipalities.sql
    - supabase/migrations/20260222000001_coordinadora_coverage.sql
  modified: []

key-decisions:
  - "DANE municipalities stored with both original and normalized (uppercase, no accents) names for flexible matching"
  - "Coordinadora city_coordinadora stored as-is from source file for exact API matching"
  - "dane_municipality_id FK is nullable -- not all Coordinadora cities have DANE matches"
  - "supports_cod defaults to false until COD city list is provided"
  - "Best-effort DANE matching via simple normalized name comparison (UPDATE after INSERT)"

patterns-established:
  - "Global reference pattern: SERIAL PK, no workspace_id, no RLS, SELECT-only grants"
  - "Carrier coverage pattern: carrier column + city format for multi-carrier extensibility"

# Metrics
duration: 8min
completed: 2026-02-20
---

# Phase 21 Plan 01: DANE + Coordinadora Tables Summary

**DANE municipalities (1,122 rows, 33 departments) and Coordinadora coverage (1,489 cities) seeded as global reference tables with FK linkage and lookup indexes**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-20T21:33:47Z
- **Completed:** 2026-02-20T21:41:49Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- dane_municipalities table with all 1,122 official Colombian municipalities across 33 departments (32 + Bogota D.C.)
- carrier_coverage table with all 1,489 Coordinadora cities parsed from source data with city_name and department_abbrev extraction
- FK relationship from carrier_coverage to dane_municipalities with best-effort matching UPDATE
- Lookup indexes for city validation (normalized name search) and COD availability queries

## Task Commits

Each task was committed atomically:

1. **Task 1: Create dane_municipalities table with seed data** - `9155f1e` (feat)
2. **Task 2: Create carrier_coverage table with Coordinadora seed data** - `bf116bf` (feat)

## Files Created/Modified
- `supabase/migrations/20260222000000_dane_municipalities.sql` - DANE municipalities table + 1,122 seeded rows (33 departments)
- `supabase/migrations/20260222000001_coordinadora_coverage.sql` - Carrier coverage table + 1,489 Coordinadora cities + DANE matching UPDATE

## Decisions Made
- DANE data generated from comprehensive DIVIPOLA dataset (1,122 municipalities is the official count)
- Normalized names pre-computed in INSERT statements (no runtime normalization needed for lookups)
- Coordinadora data parsed with regex to handle city names with special characters
- Best-effort DANE matching compares city_name to municipality_name_normalized (simple equality, not fuzzy)
- supports_cod defaults to false with TODO comment -- will be updated when Coordinadora provides COD list

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. These are seed data migrations that will be applied to Supabase.

## Next Phase Readiness
- Both reference tables ready for Phase 22 (Robot Coordinadora Service) city validation
- carrier_coverage.supports_cod needs COD list update before order submission (Phase 23)
- DANE matching can be refined later with fuzzy matching if needed
- Pending: `supabase db push` to apply migrations to database

---
*Phase: 21-db-domain-foundation*
*Completed: 2026-02-20*
