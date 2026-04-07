# Morfx — LEARNINGS

Lessons learned across phases. Append-only log of bugs, patterns, and discipline reminders.

---

## Phase 42 — Session Lifecycle (completed 2026-04-07)

### Headline lesson — Postgres timestamp/timestamptz cast trap (CRITICAL)

When mixing `timestamp` (naive) with `timestamptz` (UTC-anchored) in a comparison, Postgres implicitly casts the naive timestamp using the SESSION timezone, NOT the timezone you used to create it. In Supabase, session TZ defaults to UTC, so any expression like `date_trunc('day', timezone('America/Bogota', NOW()))` produces a naive `2026-04-07 00:00:00` that gets compared as if it were UTC midnight, giving you a Bogota cutoff that is 5 hours wrong.

**Always wrap naive midnight expressions with an explicit `AT TIME ZONE 'America/Bogota'` outer cast** to convert back to timestamptz before comparing against timestamptz columns. The canonical pattern:

```sql
-- WRONG (silently 5h off in Supabase)
WHERE last_activity_at < date_trunc('day', timezone('America/Bogota', NOW()))

-- RIGHT (TZ-safe regardless of session timezone)
WHERE last_activity_at < (
  date_trunc('day', timezone('America/Bogota', NOW()))
  AT TIME ZONE 'America/Bogota'
)
```

This fix went undetected through BOTH the 01-PLAN Q3 diagnostic AND the original RPC migration. It was only caught because the user explicitly asked "como nos aseguramos cuales son los timezones y que coordinen". Discipline reminder: Regla 2 of CLAUDE.md is not just about using `America/Bogota` — it's about making sure the TZ actually propagates through every cast and comparison.

Empirical delta verification: `stale_currentRPC=1906` vs `stale_tz_safe=1932` — 26 sessions wrongly evaluated per run. Fix applied via migration `20260410000002_fix_close_stale_sessions_tz.sql` (commit `f292264`), idempotent CREATE OR REPLACE on the RPC.

### Bug root cause — sessions never closed in runtime

The only runtime writes to `agent_sessions.status` were `handed_off` (handoff path) and the static `'active'` default in `createSession`. `closeSession()` had ZERO callers — a dead API. This went unnoticed for weeks because the symptom (fossilized state + 23505 on recurring clients) only surfaced intermittently.

### Phase derivada vs status confusion

`derivePhase()` returning `'closed'` from `accionesEjecutadas` is an in-memory derivation per turn — never persisted to `agent_sessions.status`. A client who said "no" once would have `accionesEjecutadas` containing `rechazar` forever; every reused session would derive `phase='closed'` → silence action → bot permanently mute. Phase 42 fixes this INDIRECTLY: new sessions nacen with `accionesEjecutadas=[]` so phase derivation starts fresh.

### Partial unique index pattern

`CREATE UNIQUE INDEX ... WHERE status='active'` is the canonical Postgres way to enforce "at most one of X per group" while allowing N historical archives. Use this pattern whenever you need both uniqueness AND audit history. It's atomic under concurrent inserts (verified against Postgres docs).

### Inngest cron TZ syntax (v3.51.0)

`{ cron: 'TZ=America/Bogota 0 2 * * *' }` — inline TZ prefix, no separate timezone option. This syntax is easy to miss.

### Defensive check > cancel-by-reference

Inngest lacks trivial cancel-by-reference, so the simplest correct pattern for "abort if underlying resource is gone" is a 2-line read-only status check at the START of each handler. This pattern makes session closure resilient to ANY future close path automatically — no need to track all the places that could close a session.

### Race window on partial unique index

Concurrent inserts ARE serialized by Postgres, but the loser still sees 23505. Always wrap INSERT with retry-via-fetch when using a unique index that competing writers might hit. Pattern applied in `SessionManager.createSession`: catch `error.code === '23505'`, then call `getSessionByConversation` to return the winner's row.

### Tech debt documented (not fixed in this phase)

- `SessionManager` bypasses `src/lib/domain/` (Regla 3 exception ratified here — refactor in dedicated phase)
- `agent-production.ts:154` filtering by non-existent `is_active` column (pre-existing, out of Phase 42 scope)
- `closeSession()` wrapper kept as dead API for future use
- `paused` status never written but still in CHECK constraint
- Somnio V1 (`somnio-sales-v1`, `somnio-recompra-v1`) confirmed dead code — type-only imports remain

### First cron run consideration (sizing the blast radius)

Phases that fix systemic bugs with accumulated state for months should ALWAYS include a "size the blast radius" diagnostic step before automating cleanup. Phase 42 nearly shipped with 1906 sessions closing in one cron run — the Q3 diagnostic + 7-day pre-sweep prevented that. Final pre-sweep closed ~1309 sessions; first automated cron (overnight 02:00 Bogota Apr 7) closed 774 more, all within boundary.

### Q3 diagnostic approach

Always capture user-executable diagnostic queries BEFORE applying destructive migrations. The runbook (`42-DIAGNOSTICS.md`) let the user safely verify state in prod without the executor needing DB access.

### Spontaneous Criterion 4 validation

The test user (+573137549286) happened to have a pre-existing `handed_off` session from 4 days prior. Under the old schema, their FIRST test message would have hit 23505 and failed. Under Phase 42, it succeeded. The UAT unintentionally validated the real-world Caso B unblock using a real historical case. Lesson: when possible, UAT from inside the real production data distribution, not from synthetic test fixtures — you catch more.

---
