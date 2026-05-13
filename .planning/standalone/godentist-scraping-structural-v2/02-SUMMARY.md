---
phase: godentist-scraping-structural-v2
plan: 02
status: complete
completed: 2026-05-13
---

# Plan 02 — Summary

## Deliverable
- `supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql`

## Data inserted in prod (REGLA 5)
- `INSERT INTO platform_config (key, value) VALUES ('use_new_godentist_scraping', 'true'::jsonb)`
- ON CONFLICT idempotent
- `COMMENT ON COLUMN platform_config.value` documenta kill-switch semantics (Issue 3 fix Option A)

## User confirmation (verbatim SELECT output)
```json
[
  {
    "key": "use_new_godentist_scraping",
    "value": true,
    "updated_at": "2026-05-13 12:33:03.303079+00"
  }
]
```

## Key links
- `platform_config.use_new_godentist_scraping = true` → consumido por Plan 06 vía `getPlatformConfig<boolean>('use_new_godentist_scraping', true)`
- Cache TTL 30s — rollback SOFT vía `UPDATE platform_config SET value='false'::jsonb` propaga en ≤30s

## Verification gates
- `grep -c "INSERT INTO platform_config"` = 1 ✓
- `grep -c "'true'::jsonb"` = 1 ✓
- `grep -c "ON CONFLICT (key) DO UPDATE"` = 1 ✓
- `grep -c "Setting to false aborts new scrapes"` = 1 ✓
- `grep -c "git revert"` = 3 ✓
- Prod SELECT returned 1 row con value=true ✓

## Kill-switch semantics (Issue 3 fix Option A)
- `value=true` → paradigm F activo (Plan 06 fetch al endpoint nuevo del robot)
- `value=false` → aborta nuevos scrapes con error explícito. NO fallback a paradigm A (borrado en Plan 05). Rollback REAL = `git revert + git push`

## Downstream unblocked
- Plan 06 puede pushear código que lee `getPlatformConfig<boolean>('use_new_godentist_scraping', true)` con semántica kill-switch.

## Self-Check: PASSED
