---
phase: somnio-recompra-crm-reader
plan: 01
wave: 0
status: complete
completed_at: 2026-04-21T11:05:00Z
---

# Plan 01 — Test infrastructure + feature flag seed (Wave 0)

## Commits

- **Task 1:** `c4656a0` — `chore(somnio-recompra-crm-reader-01-T1): add vitest + test script to package.json`
- **Task 2:** `9ef7ec1` — `feat(somnio-recompra-crm-reader-01-T2): seed feature flag somnio_recompra_crm_reader_enabled default false`
- **Task 3:** human checkpoint (no commit — production DB write, user-run)

## Files Changed

| File | Task | Change |
|------|------|--------|
| `package.json` | 1 | Added `"test": "vitest run"` script; added `vitest@^1.6.0` + `@vitest/ui@^1.6.0` devDependencies |
| `pnpm-lock.yaml` | 1 | Synchronized with vitest install (via `pnpm add -D`, NOT `npm install`) |
| `supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql` | 2 | New migration — INSERT flag row + GRANTs to service_role and authenticated |

## Smoke Test (Task 1)

```
$ npm run test -- src/lib/agents/somnio/__tests__/block-composer.test.ts
 RUN  v1.6.1 /mnt/c/Users/Usuario/Proyectos/morfx-new
 ✓ src/lib/agents/somnio/__tests__/block-composer.test.ts  (21 tests) 12ms
 Test Files  3 passed (3)
      Tests  63 passed (63)
```

Vitest runner functional. NOTE: vitest autodiscovers tests inside `.claude/worktrees/`
in local dev (untracked in git, absent on Vercel/CI so no impact on deployed builds).
If this becomes noisy, add a `vitest.config.ts` with `exclude: ['.claude/**']` — out
of scope for this plan.

## Task 3 — Human Checkpoint (2026-04-21 11:04:53 UTC)

**SQL executed in Supabase production SQL Editor:**
```sql
INSERT INTO platform_config (key, value)
VALUES ('somnio_recompra_crm_reader_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

GRANT ALL ON TABLE platform_config TO service_role;
GRANT SELECT ON TABLE platform_config TO authenticated;
```

**Paso 2 — Row verification:**
```json
[
  {
    "key": "somnio_recompra_crm_reader_enabled",
    "value": false,
    "updated_at": "2026-04-21 11:04:53.689249+00"
  }
]
```
→ Row inserted, value=false, timestamp matches checkpoint time.

**Paso 3 — GRANTs verification:**
```
grantee       | privilege_type
--------------+---------------
authenticated | DELETE / INSERT / REFERENCES / SELECT / TRIGGER / TRUNCATE / UPDATE
service_role  | DELETE / INSERT / REFERENCES / SELECT / TRIGGER / TRUNCATE / UPDATE
```
→ service_role has full DML (LEARNING 1 Phase 44.1 satisfied).
→ authenticated has SELECT (migration requirement) + additional grants from prior state (non-regression).

## Verification — success_criteria

- [x] `npm run test` functional (63 passed smoke).
- [x] `getPlatformConfig<boolean>('somnio_recompra_crm_reader_enabled', false)` will read real DB value `false` in any production lambda within 30s of seed (vs. fallback-only pre-seed).
- [x] **Regla 6 respected: flag final = `false`**, production byte-identical to pre-phase.
- [x] Plans 02–07 unblocked.

## Push Status

- Commits `c4656a0`, `9ef7ec1` staged on `main` locally.
- **Not yet pushed to Vercel** — waiting on user decision (push now OR batch with Wave 1 push).
- Safe to push now: flag default=false, no code references it yet; Vercel build only runs `pnpm install` + `next build`, no migration wiring.

## Next

Proceed to Wave 1 (Plan 02 — type foundations: Inngest event schema + `abortSignal?` on ReaderInput).
