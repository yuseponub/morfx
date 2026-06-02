# Research — sms-time-window-by-type

**Researched:** 2026-04-17
**Domain:** SMS dispatch guard refactor (transactional vs marketing time-window)
**Confidence:** HIGH (codebase is small, single domain path, zero test coverage to break)
**Mode:** Implementation (validate & close unknowns — all architectural decisions locked in CONTEXT.md D-01..D-05)

---

## Summary

Audit confirms the chosen architecture (D-01..D-05) is **safe to implement with the smallest possible footprint**. The full SMS dispatch graph in `src/` funnels through exactly ONE helper (`sendSMS` in `src/lib/domain/sms.ts`) called from exactly ONE caller (`executeSendSms` in `src/lib/automations/action-executor.ts:1099`). The existing `source` field already flows end-to-end (param → RPC arg → DB column) and is ALREADY set to `'automation'` explicitly by the only production caller. The `isWithinSMSWindow` rename has zero external consumers (domain-internal import only; zero tests; zero UI dependency on the error string). No hand-rolling is needed — every building block (source column, default, helper location, RPC signature) already exists.

**Primary recommendation:**

1. Add constants `TRANSACTIONAL_SOURCES` and `MARKETING_SOURCES` to `src/lib/sms/constants.ts` (file exists, zero-import convention already established).
2. Add helper `isTransactionalSource(source?: string | null): boolean` in `src/lib/sms/utils.ts` next to `isWithinMarketingSMSWindow`.
3. Rename `isWithinSMSWindow` → `isWithinMarketingSMSWindow` in utils.ts AND the single import at `src/lib/domain/sms.ts:22`.
4. Replace guard at `src/lib/domain/sms.ts:87-93` with conditional: skip guard when `isTransactionalSource(params.source)` is true.
5. Write migration `20260418040000_sms_source_not_null.sql` (strictly > last migration `20260418030000_sms_provider_state_raw.sql`) with **conditional** backfill + `SET NOT NULL`.
6. Create `scripts/check-sms-source-distribution.mjs` (or SQL snippet in plan) so planner/executor can run the prod distribution query BEFORE the migration ships (Regla 5).

Risk posture: LOW. Single caller. Single-file rename. No test suite to break. Migration is additive (NOT NULL on a column that already defaults; backfill only if NULL rows exist).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Time-window gating logic | Domain (`src/lib/domain/sms.ts`) | Utils (`src/lib/sms/utils.ts`) for pure boolean helpers | Regla 3 — all mutation guards live in domain layer. Utils is stateless helper-only. |
| Source→type mapping (constants) | `src/lib/sms/constants.ts` | — | File already zero-imports (prevents circular deps). Constants exported are consumed by utils and tests. |
| `source` field validation (contract) | DB (`sms_messages.source NOT NULL`) | RPC (`insert_and_deduct_sms_message` already receives `p_source TEXT`) | Defense by contract per D-02 — schema NOT NULL + explicit callers. |
| Caller identity injection | Caller site (`executeSendSms` hardcodes `'automation'`) | — | Each caller knows its own nature. Domain does not infer. |
| Regulatory classification (transactional vs marketing) | `isTransactionalSource()` in utils | — | Pure function, no I/O, trivially testable. |

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** Source-derived type. Mapping: `automation|domain-call|script` → transactional bypass; `campaign|marketing` → marketing-windowed.
- **D-02** NULL/unknown source → permissive (treat as transactional), defended by NOT NULL constraint.
- **D-03** No checkbox in automation builder (YAGNI until campaign module exists).
- **D-04** Rename `isWithinSMSWindow` → `isWithinMarketingSMSWindow`, logic unchanged (keep `hour >= 8 && hour < 21`).
- **D-05** Conditional backfill if NULL rows exist, then SET NOT NULL.

### Claude's Discretion (resolved in this research)

| Item | Decision |
|---|---|
| Helper name | `isTransactionalSource` (matches D-01 language, semantically neutral about the action — reads as a predicate not a command). |
| Helper location | `src/lib/sms/utils.ts` alongside `isWithinMarketingSMSWindow`. `constants.ts` holds data (arrays); `utils.ts` holds pure functions — existing split. |
| Error message | Keep current string `'SMS no enviado: fuera de horario permitido (8 AM - 9 PM Colombia)'` unchanged (only triggers for marketing sources now). No UI parses it. |
| Constants naming | `TRANSACTIONAL_SOURCES`, `MARKETING_SOURCES` (readonly string arrays; use `as const` for literal-type narrowing). |
| Tests | Not introduced in this phase (no test runner in repo — see **Open Questions**). |

### Deferred Ideas (OUT OF SCOPE)

- Adjusting `isWithinMarketingSMSWindow` to real CRC norm (L-V 7-9PM, Sáb 8-8, Dom/festivos prohibited).
- Checkbox "es marketing" in automation builder.
- Retry queue for marketing blocked outside window.
- Campaigns module.
- ML content classification.

---

## Current State Audit

### Schema state of `sms_messages.source`

| Property | Current | After this phase |
|---|---|---|
| Added by migration | `20260316100000_sms_onurix_foundation.sql:94` — `ALTER TABLE sms_messages ADD COLUMN source TEXT DEFAULT 'automation'` | unchanged |
| NOT NULL? | **NO** (column defaults but allows NULL on explicit insert) | **YES** after new migration |
| Default value | `'automation'` | `'automation'` (preserved) |
| Used by RPC? | Yes — `insert_and_deduct_sms_message` accepts `p_source TEXT` (non-default parameter) at migration `20260418011321_sms_atomic_rpc.sql:27,91`. The domain passes `params.source || 'domain-call'` at `sms.ts:148`. | unchanged |
| Expected NULL count in prod | Likely 0 — `ADD COLUMN ... DEFAULT 'automation'` backfills existing rows at column-add time. The only way to get NULL rows is explicit `INSERT ... (source) VALUES (NULL)`, which no caller does. **Must be verified by prod query per D-05 before NOT NULL migration ships (Regla 5).** | n/a |

### Last migration (timestamp ordering)

- Last applied: `20260418030000_sms_provider_state_raw.sql`
- New migration timestamp MUST be strictly greater: suggested `20260418040000_sms_source_not_null.sql` (or any timestamp > `20260418030000`).

### Production distribution query (unresolved — planner MUST provide before migration task)

```sql
-- Query 1: Distribution of source values
SELECT source, COUNT(*) AS n
FROM sms_messages
GROUP BY source
ORDER BY n DESC;

-- Query 2: NULL count specifically (D-05 gate)
SELECT COUNT(*) AS null_count FROM sms_messages WHERE source IS NULL;

-- Query 3: Unknown/unexpected source strings (non-canonical set)
SELECT DISTINCT source
FROM sms_messages
WHERE source IS NOT NULL
  AND source NOT IN ('automation', 'domain-call', 'script', 'campaign', 'marketing');
```

**Interpretation rules for planner:**

| Query 1 result | Action |
|---|---|
| Only `automation` appears | Expected. Confirms "100% transactional today" assumption in CONTEXT §D-02. |
| Also `domain-call` or `script` | Also fine — both map to transactional. |
| Any `campaign` or `marketing` | ALERT — investigate caller. Should not exist today (no campaign module). |

| Query 2 result | Action |
|---|---|
| `null_count = 0` | Skip backfill. Migration only does `ALTER COLUMN ... SET NOT NULL`. |
| `null_count > 0` | Backfill task FIRST: `UPDATE sms_messages SET source = 'automation' WHERE source IS NULL;` THEN `ALTER COLUMN ... SET NOT NULL`. |

| Query 3 result | Action |
|---|---|
| Empty | Lists are exhaustive. Ship constants as-is. |
| Any unexpected string | Either add it to the appropriate list OR treat as permissive (transactional) per D-02 and document in LEARNINGS. |

---

## Call Site Inventory

### `sendSMS` / `domainSendSMS` callers in `src/`

**Exactly one production caller.**

| File:line | Caller | Sets `source`? | Value | Notes |
|---|---|---|---|---|
| `src/lib/automations/action-executor.ts:1099` | `executeSendSms` (action handler for `send_sms` action type) | **YES — explicit** | `'automation'` (literal at line 1102; also `DomainContext.source = 'automation'` at line 1098) | Only caller. Already compliant. Zero changes needed here. |

There are **no other callers** in `src/`. Verified by:
- `Grep sendSMS|domainSendSMS` → 3 hits, all inside `src/lib/domain/sms.ts` (definition) + the one import/call in `action-executor.ts:16,1099`.
- `Grep from '@/lib/domain/sms'` → 1 hit: `action-executor.ts:16`.

### Direct Onurix API callers (bypass check — Regla 3)

**Verdict: zero bypass paths in `src/`. Regla 3 holds.**

| File:line | Imports | Sends SMS? | Notes |
|---|---|---|---|
| `src/lib/domain/sms.ts:20` | `sendOnurixSMS` | YES (domain entry point) | The ONE legitimate caller. |
| `src/inngest/functions/sms-delivery-check.ts:16` | `checkOnurixStatus` | NO — read-only status check | Not a dispatch; polls Onurix for state. Safe. |

`Grep sendOnurixSMS` → 2 hits total. Both above. **No webhook, no other inngest function, no server action, no API route sends SMS without going through `domain/sms.ts`.**

### One-off scripts (NOT production code)

| File | Sends SMS? | Sets `source`? | Risk |
|---|---|---|---|
| `scripts/test-onurix-sms.mjs` | Direct Onurix API call (no DB insert) | N/A — doesn't write `sms_messages` | None — doesn't persist, doesn't touch guard. |
| `scripts/test-onurix-domain.mjs` | Direct Onurix + direct INSERT into `sms_messages` + direct `deduct_sms_balance` RPC (bypasses `sendSMS`) | YES — hardcodes `'domain-call'` (line 97) | Once NOT NULL ships, this script keeps working (sets `source` explicitly). If someone deletes that line, the insert would fail post-migration — FAIL-LOUD, not silent. Acceptable. |
| `scripts/diagnose-onurix-sms.mjs` | No send (status check only) | N/A | None. |
| `scripts/migrate-twilio-automations-to-onurix.mjs` | Repo migration script | N/A (not a runtime dispatcher) | None. |

**Recommendation:** Do not include these scripts in the guard refactor. They are developer tools that call Onurix directly by design for debugging. Document in LEARNINGS that scripts bypass Regla 3 intentionally for diagnostic purposes.

### String literals for known sources (outside constants)

`Grep source\s*[:=]\s*['"](automation|domain-call|script|campaign|marketing)['"]` in `src/`:

| File | Literal | Status after phase |
|---|---|---|
| `src/lib/automations/action-executor.ts` — 18 hits | `source: 'automation'` (DomainContext, not SMS-specific) | **Keep as-is**. These are `DomainContext.source` per `domain/types.ts:18` — describes who initiated the domain call ("server-action"|"tool-handler"|"automation"|"webhook"|"adapter"), NOT the SMS source. Different concept sharing the same field name. Do NOT unify. |
| `src/lib/automations/action-executor.ts:1102` | `source: 'automation'` inside `domainSendSMS({...})` call | **This is the SMS source.** Replace with `SOURCE_AUTOMATION` constant (or keep literal — see "Don't Hand-Roll" below). The planner may choose to introduce per-source constant exports for type safety; acceptable either way because we have exactly one caller today. |
| `src/lib/domain/sms.ts:148` | `params.source \|\| 'domain-call'` (RPC call default) | **Replace** with constant `SOURCE_DOMAIN_CALL` or literal — see Pitfalls below. |

**Key clarification (avoid planner confusion):** `DomainContext.source` (`src/lib/domain/types.ts:15-21`) and `SendSMSParams.source` (`src/lib/domain/sms.ts:37`) are SEPARATE fields with different vocabularies. DomainContext.source uses strings like `'server-action'|'tool-handler'|'automation'|'webhook'|'adapter'`. SendSMSParams.source uses `'automation'|'domain-call'|'script'` (per JSDoc comment at sms.ts:36). They happen to overlap on `'automation'` but are NOT the same taxonomy. **Do not unify them in this phase.** The SMS source stays an SMS-domain concept.

### Tests touching `isWithinSMSWindow` or related code

**None.** Verified:
- `Glob **/*.test.ts` → only `node_modules/` hits. No project test files.
- `Glob **/*.spec.ts` → only `node_modules/` and `apps/mobile/node_modules/`.
- `Grep isWithinSMSWindow` in `src/` → 1 hit (the domain import at `sms.ts:22`).

**There is no test suite to break.** The rename is a safe find-replace.

### UI references to the error message or "8 AM - 9 PM" string

**None found in rendered UI.** Verified with `Grep "fuera de horario|8 AM|9 PM"` in `src/`:
- Only hits: the domain error string at `sms.ts:91` and its comment at `sms.ts:65`, plus a comment at `utils.ts:54`. Zero UI inspection of the string. Safe to keep verbatim per D-04 + CONTEXT §specifics.

### Automation builder config / UI for SMS

- `src/lib/automations/types.ts:97` — `'send_sms'` action type literal.
- `src/lib/automations/constants.ts:339` — action definition (params schema).
- `src/app/(dashboard)/automatizaciones/components/actions-step.tsx:102` — UI for the builder SMS step.
- `src/lib/builder/validation.ts:31` — validation rule.
- `src/lib/automations/action-executor.ts:205,210,1083-1107` — dispatch + handler.

**None of these need changes.** Per D-03, no checkbox is added. The builder stays as-is; every automation-generated SMS continues to flow with `source='automation'` and bypasses the guard 24/7.

---

## Standard Stack

### Core (no new dependencies)

| Item | Location | Purpose | Why Standard |
|---|---|---|---|
| `src/lib/sms/constants.ts` | Already exists, zero imports | Hold `TRANSACTIONAL_SOURCES` + `MARKETING_SOURCES` as readonly `as const` arrays | Existing convention — zero-import constants file prevents circular deps (see file header comment). |
| `src/lib/sms/utils.ts` | Already exists | Hold `isTransactionalSource()` + renamed `isWithinMarketingSMSWindow()` | Existing convention — stateless pure helpers live here (`formatColombianPhone`, `calculateSMSSegments`, `isWithinSMSWindow`). |
| `src/lib/domain/sms.ts` | Already exists | Orchestrates guard + Onurix + RPC | Domain is the single mutation entry per Regla 3. |
| Supabase migration | `supabase/migrations/20260418040000_sms_source_not_null.sql` (new) | Enforce `NOT NULL` on `source` | Regla 5 — migration applied in prod BEFORE code deploy. |

### Supporting

None required. No new package installs. No new runtime deps. Zero npm changes.

### Alternatives Considered (and rejected)

| Instead of | Could Use | Why Rejected |
|---|---|---|
| `TRANSACTIONAL_SOURCES` as `readonly string[]` | TypeScript enum `SMSSource` | Enums don't serialize cleanly to DB `TEXT`. Existing column is TEXT + existing payload is plain string. String-literal unions + `as const` arrays give equivalent type safety without the marshaling cost. |
| `isTransactionalSource` pure function | Class-based `SMSClassifier` | Overkill. One-line predicate, no state, no lifecycle. |
| Per-source constant exports (`SOURCE_AUTOMATION = 'automation'`) | Inline string literals at call sites | Planner's call. Today there is exactly ONE caller setting `'automation'` and one fallback in the domain setting `'domain-call'`. Constants give slight review-time safety (PR blocks on new literal outside the set) but add symbol friction. Recommended: export the CONSTANTS (`TRANSACTIONAL_SOURCES`, `MARKETING_SOURCES`) and let the predicate do the check; keep literals at call sites. If planner wants per-source consts for review-time safety, add `SOURCE_AUTOMATION`, `SOURCE_DOMAIN_CALL`, `SOURCE_SCRIPT`, `SOURCE_CAMPAIGN`, `SOURCE_MARKETING` in constants.ts — equally acceptable. |

### Installation

```bash
# No npm installs required.
```

**Version verification:** N/A — no new packages. Existing stack (Next.js 15, Supabase client, TypeScript) unchanged.

---

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────┐
                          │ Automation runner (Inngest)         │
                          │ fires send_sms action               │
                          └──────────────┬──────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────────┐
                  │ action-executor.ts :: executeSendSms             │
                  │  - builds DomainContext { workspaceId, source:   │
                  │    'automation' }                                │
                  │  - calls domainSendSMS with source: 'automation' │
                  └──────────────────────┬───────────────────────────┘
                                         │ (the ONLY prod caller)
                                         ▼
                  ┌──────────────────────────────────────────────────┐
                  │ domain/sms.ts :: sendSMS(ctx, params)            │
                  │                                                  │
                  │ 1. formatColombianPhone(phone)                   │
                  │                                                  │
                  │ 2. TIME-WINDOW GUARD — REFACTOR ZONE             │
                  │    BEFORE: if (!isWithinSMSWindow()) reject      │
                  │    AFTER:  if (!isTransactionalSource(source)    │
                  │              && !isWithinMarketingSMSWindow())   │
                  │              reject                              │
                  │                                                  │
                  │ 3. Load sms_workspace_config (balance, active)   │
                  │ 4. sendOnurixSMS(phone, message)                 │
                  │ 5. insert_and_deduct_sms_message RPC             │
                  │    (persists sms_messages row with source)       │
                  │ 6. Emit sms/delivery.check inngest event         │
                  │ 7. Return DomainResult<SendSMSResult>            │
                  └──────────────────────┬───────────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────────┐
                  │ Supabase: sms_messages.source NOT NULL           │
                  │   (contract defense — D-02)                      │
                  │   default 'automation' preserved                 │
                  └──────────────────────────────────────────────────┘

Helpers (pure, no I/O):
  utils.ts :: isTransactionalSource(source)          — NEW
  utils.ts :: isWithinMarketingSMSWindow()           — RENAME of isWithinSMSWindow
  constants.ts :: TRANSACTIONAL_SOURCES              — NEW
  constants.ts :: MARKETING_SOURCES                  — NEW
```

### Component Responsibilities

| File | Responsibility | Changes in this phase |
|---|---|---|
| `src/lib/sms/constants.ts` | Data constants, zero imports | ADD `TRANSACTIONAL_SOURCES`, `MARKETING_SOURCES` as `as const` readonly arrays |
| `src/lib/sms/utils.ts` | Pure helper functions | ADD `isTransactionalSource`; RENAME `isWithinSMSWindow` → `isWithinMarketingSMSWindow` (logic unchanged) |
| `src/lib/domain/sms.ts` | Dispatch entry point, RPC orchestration, guard enforcement | UPDATE import (line 22); REPLACE guard block (lines 87-93) with source-aware conditional |
| `src/lib/automations/action-executor.ts` | Automation action handler | NO CHANGES — already passes `source: 'automation'` correctly |
| `supabase/migrations/20260418040000_sms_source_not_null.sql` | Contract enforcement (new) | CREATE: conditional backfill + ALTER COLUMN SET NOT NULL |

### Pattern 1: Source-aware guard (THE core refactor)

**What:** Replace unconditional time-window guard with conditional bypass based on source.
**When to use:** Per D-01 + D-02 — every SMS dispatch.

**Before** (`src/lib/domain/sms.ts:87-93`):

```typescript
// 2. Check time window
if (!isWithinSMSWindow()) {
  return {
    success: false,
    error: 'SMS no enviado: fuera de horario permitido (8 AM - 9 PM Colombia)',
  }
}
```

**After** (same location, same error message per D-04 + CONTEXT §specifics):

```typescript
// 2. Time window check — only applies to marketing SMS.
//    Transactional SMS (automation, domain-call, script) are exempt per Colombian
//    regulation (CRC Res. 5111/2017). See .planning/standalone/sms-time-window-by-type/CONTEXT.md.
if (!isTransactionalSource(params.source) && !isWithinMarketingSMSWindow()) {
  return {
    success: false,
    error: 'SMS no enviado: fuera de horario permitido (8 AM - 9 PM Colombia)',
  }
}
```

**Import change at `src/lib/domain/sms.ts:22`:**

```typescript
// Before:
import { isWithinSMSWindow } from '@/lib/sms/utils'

// After:
import { isWithinMarketingSMSWindow, isTransactionalSource } from '@/lib/sms/utils'
```

### Pattern 2: Constants as single source of truth for source taxonomy

**What:** Export readonly arrays that both the predicate consumes and code review can spot literals against.
**Location:** `src/lib/sms/constants.ts`.

```typescript
/**
 * SMS sources that are inherently transactional — bypass time-window guard (24/7 allowed).
 * Per Colombian CRC Res. 5111/2017: transactional / utility SMS are exempt from schedule restrictions.
 *
 * CRITICAL: Adding a new source here permanently exempts it from the window.
 * If a new channel can initiate marketing SMS, add it to MARKETING_SOURCES instead.
 */
export const TRANSACTIONAL_SOURCES = ['automation', 'domain-call', 'script'] as const

/**
 * SMS sources that are marketing/commercial — subject to time-window guard.
 * Today: no caller sets these values (campaign module doesn't exist yet).
 * D-02: future campaign module MUST set source to one of these values by contract.
 */
export const MARKETING_SOURCES = ['campaign', 'marketing'] as const

export type TransactionalSource = typeof TRANSACTIONAL_SOURCES[number]
export type MarketingSource = typeof MARKETING_SOURCES[number]
export type SMSSource = TransactionalSource | MarketingSource
```

### Pattern 3: Pure predicate helper

**What:** Stateless `isTransactionalSource` next to `isWithinMarketingSMSWindow`. No classes, no I/O.
**Location:** `src/lib/sms/utils.ts`.

```typescript
import {
  SMS_GSM7_SEGMENT_LENGTH,
  SMS_UCS2_SEGMENT_LENGTH,
  TRANSACTIONAL_SOURCES,
} from './constants'

/**
 * Check whether an SMS source is transactional (bypass time-window guard).
 *
 * Permissive default (D-02): NULL/undefined/unknown sources are treated as transactional
 * so a missing `source` never blocks a legitimate dispatch. Marketing compliance is
 * defended by:
 *  - contract: sms_messages.source is NOT NULL (migration)
 *  - convention: callers must set source explicitly (enforced at code review)
 *
 * @param source - Value of SendSMSParams.source (possibly NULL/undefined).
 * @returns true if the source is transactional OR unknown (permissive); false only for
 *          explicit marketing sources ('campaign' | 'marketing').
 */
export function isTransactionalSource(source?: string | null): boolean {
  if (source == null) return true
  return (TRANSACTIONAL_SOURCES as readonly string[]).includes(source)
}

/**
 * Check if current time is within Colombia marketing-SMS sending window.
 * CRC regulation: marketing SMS only between 8 AM and 9 PM Colombia time.
 *
 * NOTE: This applies ONLY to marketing SMS. Transactional SMS bypass this check
 * via isTransactionalSource(). See standalone sms-time-window-by-type for rationale.
 *
 * NOTE: Current implementation is conservative (daily 8 AM - 9 PM). Actual CRC norm
 * differs by day (L-V 7-9PM, Sáb 8-8PM, Dom/festivos prohibited). Adjustment deferred
 * until campaign module exists.
 */
export function isWithinMarketingSMSWindow(): boolean {
  const now = new Date()
  const colombiaHour = parseInt(
    now.toLocaleString('en-US', {
      timeZone: 'America/Bogota',
      hour: 'numeric',
      hour12: false,
    })
  )
  return colombiaHour >= 8 && colombiaHour < 21
}
```

### Anti-Patterns to Avoid

- **Don't** unify `DomainContext.source` with `SendSMSParams.source`. They share a field name but carry different vocabularies (see Call Site Inventory).
- **Don't** make `isTransactionalSource` return `false` for NULL. D-02 is explicit: permissive default. A defensive NULL→false would re-introduce the 9:18PM production block and contradict the locked decision.
- **Don't** remove the default `'automation'` from `sms_messages.source`. It's the safety net for the NOT NULL migration and for any future RPC caller that forgets the param.
- **Don't** introduce `SMSSource` as a TypeScript enum (serializes to numbers or requires `const enum` quirks). Keep it as a union of string literals.
- **Don't** change the RPC signature. `insert_and_deduct_sms_message(..., p_source TEXT, ...)` already accepts the source field and INSERTs it. Only the TypeScript layer needs work.
- **Don't** touch `scripts/test-onurix-domain.mjs`. It's a diagnostic script. Its direct `sms_messages` insert already sets `source='domain-call'` — NOT NULL migration won't break it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Classify source as transactional/marketing | Elaborate taxonomy class, enum, or reflection lookup | `TRANSACTIONAL_SOURCES as readonly string[]).includes(source)` one-liner | The set is tiny (3 + 2 values), changes rarely (only when campaign module ships), and is code-reviewed. Array includes + `as const` typing is standard TypeScript idiom. |
| Enforce source field is set | Runtime assertion in TS with throw | DB `NOT NULL` constraint (D-02) | The DB rejects bad inserts loudly. TS assertions duplicate the check but only guard the one caller path, not ad-hoc scripts or future SQL. Defense-in-depth: TS sets `\|\| 'domain-call'` fallback in `sms.ts:148`, DB enforces NOT NULL. |
| Re-implement time-window logic | Parse Date, build timezone offsets manually | Keep existing `toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false })` | Already working, tested in prod since 2026-03-16, zero known bugs. D-04 explicitly freezes the logic. |
| Detect marketing content by text body | ML classifier, regex on URLs | Source field (origin-based classification per D-01) | The nature comes from the origin (who triggered it), not the text. Campaign module in the future will set `source='campaign'`. Content classification is explicitly rejected in CONTEXT §deferred. |
| Detect which callers bypass domain | Runtime trace, AOP logger | Grep (already done — zero bypass paths) | Code is small. Grep audit + code review on PRs covers it. |
| Emit custom events for marketing blocks | Inngest event `sms/blocked` | Current return `{ success: false, error: ... }` suffices | No downstream consumer needs to react. Automation execution log captures the error. Adding events is speculative until campaign module exists. |
| Make `params.source` required at type level | Change `source?: string` to `source: SMSSource` | Leave optional (D-02 permissive) | Making it required would force every caller to set it, but that's actually the same spirit as D-02. However tightening the type breaks the single caller that currently works + any future scripts. Deferred to a later phase if desired. |

**Key insight:** The cost of building anything custom exceeds the value — the existing stack already provides source propagation, default value, RPC signature, and the single entry point. The refactor is a 3-line guard swap + a 15-line helper + a 20-line migration.

---

## Common Pitfalls

### Pitfall 1: Default value masks missing source

**What goes wrong:** The RPC in `sms.ts:148` writes `params.source || 'domain-call'`. If a future caller forgets to set `source`, the DB row will read `'domain-call'` (transactional) rather than the real origin. That's correct for the guard but obscures the origin for audit.
**Why it happens:** Defense in depth — the caller should set `source`; the RPC fallback exists so the NOT NULL DB constraint is never violated.
**How to avoid:** Add a `console.warn` when falling back: `if (!params.source) console.warn('[SMS] source not set, falling back to domain-call')`. Also document in `SendSMSParams` JSDoc that source is effectively required-by-contract even though typed optional.
**Warning signs:** `SELECT source, COUNT(*) FROM sms_messages WHERE source = 'domain-call'` returning non-zero rows from non-script contexts.

### Pitfall 2: Migration ordering

**What goes wrong:** Running the NOT NULL migration before backfilling NULL rows fails with PG error. Worse, applying code that depends on NOT NULL before the migration exists on prod yields silent NULL writes until caught.
**Why it happens:** Regla 5 drift. Code + migration must be stage-gated: migration first, confirm, then push code.
**How to avoid:**
1. Run distribution query in prod.
2. If NULL count > 0, run `UPDATE sms_messages SET source = 'automation' WHERE source IS NULL;` FIRST.
3. Apply the NOT NULL migration.
4. Only THEN push the code changes (guard refactor + rename).
**Warning signs:** Migration fails with `ERROR: column "source" contains null values`. If code pushed first: prod logs show guard returning false incorrectly (pre-NOT-NULL rows still have NULL and isTransactionalSource returns true correctly, so actually code-first is SAFE in this phase — but Regla 5 still mandates the order).

### Pitfall 3: Rename leaving a stale import

**What goes wrong:** `isWithinSMSWindow` is exported from `utils.ts` and imported by `sms.ts`. If rename happens only on the export side, the importer breaks build. If rename happens only on the import side, the local is undefined at runtime.
**Why it happens:** TypeScript catches this at compile time, but refactor across two files needs both commits.
**How to avoid:** Atomic commit: rename in `utils.ts` AND update import at `sms.ts:22` AND update the call at `sms.ts:88` in a single commit. `npx tsc --noEmit` before push.
**Warning signs:** Build failure `Module has no exported member 'isWithinSMSWindow'`.

### Pitfall 4: Silent drift between constants and DB CHECK constraint

**What goes wrong:** Today there is NO CHECK constraint on `sms_messages.source` values. The constants in `utils.ts` and the set of values actually written to DB can drift.
**Why it happens:** Convention-based enforcement only.
**How to avoid:** Either (a) leave as-is and document that drift is possible + audited by code review (current approach, YAGNI), or (b) add a CHECK constraint `source IN ('automation','domain-call','script','campaign','marketing')` in the migration. Recommended: **option (a)** for this phase — adding a CHECK constraint now bakes the taxonomy into the schema and makes future additions require migrations, which is heavier than the current problem justifies. Revisit when campaign module lands.
**Warning signs:** Query 3 in production audit returns values outside the canonical set.

### Pitfall 5: Future caller adds marketing SMS without updating constants

**What goes wrong:** A developer adds a new channel that sends marketing-ish SMS but uses `source='automation'`. Permissive default + missing constant update → marketing SMS goes out 24/7, regulatory violation.
**Why it happens:** Constants-based convention can be bypassed by setting a transactional source value.
**How to avoid:** Code review checklist must include: "Does this caller set the correct SMS source value? If marketing, is it in `MARKETING_SOURCES`?" Document in `CLAUDE.md` or a scope rule. The ultimate defense is D-02's explicit acceptance: "If someone adds marketing without setting source='campaign', guard won't block. Mitigated by code review + tight typing."
**Warning signs:** A new file appears grep-matching `domainSendSMS(` and NOT in `action-executor.ts`.

### Pitfall 6: `scripts/test-onurix-domain.mjs` breaks after NOT NULL migration

**What goes wrong:** If a developer edits the script and drops the `source: 'domain-call'` line, the insert will fail with NOT NULL violation after the migration.
**Why it happens:** Script bypasses the domain layer by design (direct table insert).
**How to avoid:** Leave the script unchanged. FAIL-LOUD is actually desirable — it surfaces the bypass immediately instead of letting NULL rows accumulate.
**Warning signs:** Developer runs the script post-migration and it errors. Expected behavior.

### Pitfall 7: Conflation of `DomainContext.source` and SMS `source`

**What goes wrong:** A planner or engineer unifies the two `source` fields, deciding `DomainContext.source` should feed into `SendSMSParams.source`. The DomainContext vocabulary (`'webhook'`, `'adapter'`) doesn't map to the SMS vocabulary (`'automation'`, `'campaign'`) — the guard then misbehaves on webhook-originated SMS.
**Why it happens:** Shared field name, plausible-looking unification.
**How to avoid:** Treat them as separate taxonomies. Document in the `SendSMSParams.source` JSDoc that this is NOT `DomainContext.source`. The research already confirmed that `executeSendSms` passes `source: 'automation'` EXPLICITLY rather than relaying `ctx.source`.
**Warning signs:** A PR tries to replace `source: 'automation'` at action-executor.ts:1102 with `source: ctx.source` — reject it.

---

## Code Examples

### Example 1: Full migration SQL (conditional backfill + NOT NULL)

Path: `supabase/migrations/20260418040000_sms_source_not_null.sql`

```sql
-- Migration: 20260418040000_sms_source_not_null.sql
-- Phase: standalone/sms-time-window-by-type (D-02, D-05)
-- Depends on: 20260316100000_sms_onurix_foundation.sql (adds source column)
--             20260418030000_sms_provider_state_raw.sql (last prior migration)
--
-- Enforces by contract that every sms_messages row has a source value.
-- This is the compliance defense for the permissive isTransactionalSource
-- helper: if source is never NULL, no SMS silently bypasses the marketing guard
-- due to missing origin data.

-- 1. Conditional backfill — safe to run even if zero NULL rows exist.
--    All pre-existing SMS in prod are transactional (no campaign module yet),
--    so 'automation' is the correct default value.
UPDATE sms_messages
SET source = 'automation'
WHERE source IS NULL;

-- 2. Enforce NOT NULL. DEFAULT 'automation' from foundation migration preserved.
--    After this, any insert without explicit source falls back to 'automation'
--    via the column default. The RPC insert_and_deduct_sms_message already
--    requires p_source TEXT as a non-default parameter, so domain callers
--    cannot omit it.
ALTER TABLE sms_messages
  ALTER COLUMN source SET NOT NULL;

-- ============================================================================
-- END OF MIGRATION
-- Verification query (run post-apply, expected null_count = 0):
--   SELECT COUNT(*) AS null_count FROM sms_messages WHERE source IS NULL;
-- Expected: 0
-- ============================================================================
```

### Example 2: Full updated `src/lib/domain/sms.ts` guard block (lines 87-93)

```typescript
    // 2. Time window check — only applies to marketing SMS per CRC Res. 5111/2017.
    //    Transactional SMS (automation, domain-call, script) are exempt and can be
    //    sent 24/7. See .planning/standalone/sms-time-window-by-type/CONTEXT.md §D-01.
    if (!isTransactionalSource(params.source) && !isWithinMarketingSMSWindow()) {
      return {
        success: false,
        error: 'SMS no enviado: fuera de horario permitido (8 AM - 9 PM Colombia)',
      }
    }
```

### Example 3: Updated import at `src/lib/domain/sms.ts:21-22`

```typescript
import { formatColombianPhone } from '@/lib/sms/utils'
import { isWithinMarketingSMSWindow, isTransactionalSource } from '@/lib/sms/utils'
```

(Optionally consolidate into one import.)

### Example 4: Full `src/lib/sms/constants.ts` post-change

```typescript
// ============================================================================
// SMS Module — Constants
// ZERO imports from project (prevents circular dependencies).
// ============================================================================

/** Price per SMS segment in Colombian Pesos */
export const SMS_PRICE_COP = 97

/** Characters per segment for GSM-7 encoding (ASCII only) */
export const SMS_GSM7_SEGMENT_LENGTH = 160

/** Characters per segment for UCS-2 encoding (accents, emojis, special chars) */
export const SMS_UCS2_SEGMENT_LENGTH = 70

/** Onurix API base URL */
export const ONURIX_BASE_URL = 'https://www.onurix.com/api/v1'

// ============================================================================
// SMS Source Taxonomy
// ============================================================================

/**
 * Sources that are inherently transactional — bypass time-window guard (24/7 allowed).
 * Per Colombian CRC Res. 5111/2017: transactional / utility SMS are exempt from schedule.
 *
 * Adding a source here permanently exempts it from marketing-hours enforcement.
 * If a new channel can send marketing, add it to MARKETING_SOURCES instead.
 */
export const TRANSACTIONAL_SOURCES = ['automation', 'domain-call', 'script'] as const

/**
 * Sources that are marketing/commercial — subject to time-window guard.
 * Today: no caller sets these values (campaigns module doesn't exist yet).
 * Future campaign module MUST set source to one of these values by contract (D-02).
 */
export const MARKETING_SOURCES = ['campaign', 'marketing'] as const

export type TransactionalSource = typeof TRANSACTIONAL_SOURCES[number]
export type MarketingSource = typeof MARKETING_SOURCES[number]
export type SMSSource = TransactionalSource | MarketingSource
```

### Example 5: `isTransactionalSource` unit test (if a test runner were added later)

```typescript
// If a test suite is eventually added, this phase's helper should be covered by:
import { isTransactionalSource } from '@/lib/sms/utils'

describe('isTransactionalSource', () => {
  it.each([
    ['automation',  true],
    ['domain-call', true],
    ['script',      true],
    ['campaign',    false],
    ['marketing',   false],
    [undefined,     true],   // D-02 permissive
    [null,          true],   // D-02 permissive
    ['unknown',     true],   // D-02 permissive
    ['',            true],   // edge: empty string treated as "not in list" → permissive
  ])('source=%p → transactional=%p', (source, expected) => {
    expect(isTransactionalSource(source as any)).toBe(expected)
  })
})
```

**Note:** No test runner is installed in this repo (no vitest/jest config in root, no `.test.ts` files in `src/`). This example is for future adoption; the phase plan should NOT include a "run tests" task because there is no test runner to run them in.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Block all SMS outside 8 AM - 9 PM Colombia | Block only marketing SMS outside window; transactional 24/7 | This phase (2026-04-17) | Logistics/order/OTP SMS no longer lost at night. Observed production incident 2026-04-17 21:18 resolved. |
| `source` as optional, NULL-allowed | `source` NOT NULL (contract-defended) | This phase | Eliminates ambiguity class: every persisted SMS has attributable origin. |
| `isWithinSMSWindow` (ambiguous name) | `isWithinMarketingSMSWindow` (explicit name) | This phase | Future callers cannot accidentally use this for transactional gating. |

**Deprecated/outdated:**
- None removed. Logic of the window check stays literal (D-04).

---

## Runtime State Inventory

This is a rename + refactor + migration. Runtime state audit per GSD Step 2.5:

| Category | Items Found | Action Required |
|---|---|---|
| **Stored data** | `sms_messages.source` column values in production DB. Expected: all 'automation'. Must verify. | **Data migration:** conditional `UPDATE ... WHERE source IS NULL` only if distribution query finds NULL rows. Per D-05. |
| **Live service config** | None. Onurix credentials stored as env vars (ONURIX_CLIENT_ID, ONURIX_API_KEY), unchanged. No external service stores the renamed helper name. | None. |
| **OS-registered state** | None. No scheduled tasks, systemd units, pm2 process names reference `isWithinSMSWindow` or SMS source values. | None. |
| **Secrets/env vars** | None affected. `ONURIX_*` and `SUPABASE_*` env vars unchanged. No env var names reference the renamed helper. | None. |
| **Build artifacts / installed packages** | `.next/` build cache references the old import name indirectly through compiled chunks. Next.js rebuilds on deploy, so no manual action needed. No egg-info / compiled binaries. | None — standard Next.js rebuild on Vercel. |

**Canonical question answered:** After all files in the repo are updated, the only runtime system that still carries the old string is the in-flight Vercel serverless instances running the previous deploy — which rotate out within ~15 min naturally or immediately on the next push. No external system state carries `isWithinSMSWindow` as a persisted key.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Supabase CLI (optional, for migration dry-run) | Local validation before pushing migration | (user's machine) | n/a | Apply migration directly via Supabase Studio SQL editor (user does this per Regla 5) |
| TypeScript compiler | Build + verification | ✓ | package.json | — |
| `node` runtime | Scripts (test-onurix-*, check-source-distribution if created) | ✓ | v20+ (repo standard) | — |
| Prod DB access | Running distribution query (D-05) | via Supabase Studio (user) | n/a | Handoff query to user as checkpoint in plan |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None critical. Distribution query execution is a human-in-the-loop checkpoint per Regla 5.

---

## Validation Architecture

This repo has `workflow.nyquist_validation` not explicitly configured in `.planning/config.json` (verified via reading CONTEXT.md and STATE.md — no mention). Default is enabled, so this section is provided.

### Test Framework

| Property | Value |
|---|---|
| Framework | **None installed** — no vitest, jest, or mocha in root `package.json`. `.test.ts`/`.spec.ts` files inside `node_modules/` only. |
| Config file | None |
| Quick run command | `npx tsc --noEmit` (type check — the closest thing to a test in this repo) |
| Full suite command | `npx tsc --noEmit` + `npm run build` (Next.js build validates the full dependency graph) |

### Phase Requirements → Test Map

Since there is no test runner, validation is a combination of type-check + manual smoke + production distribution query.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| REQ-01 | Transactional SMS (`source='automation'`) sends at 22:00 Colombia time | manual-smoke | Wait until after 9 PM, trigger automation with SMS action, confirm delivery | n/a — manual verification post-deploy |
| REQ-02 | Marketing SMS (`source='campaign'`) blocked at 22:00 | manual-smoke | Not reachable today (no campaign caller exists). Planner may add a transient test-script task OR defer verification until campaign module | deferred |
| REQ-03 | NULL source treated as transactional | type-check + reasoning | `isTransactionalSource(null) === true` — verified by reading `constants.ts` + `utils.ts`. No runtime reachability today because DB enforces NOT NULL and defaults to 'automation'. | code review |
| REQ-04 | Rename does not break build | compile | `npx tsc --noEmit` | ✓ (will be run per task) |
| REQ-05 | Migration applies cleanly | DB apply | User runs in Supabase Studio per Regla 5 | n/a |
| REQ-06 | Domain guard compiles with new imports | compile | `npx tsc --noEmit` | ✓ |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit` (< 30s)
- **Per wave merge:** `npx tsc --noEmit && npm run build` (full Next.js build; Next.js build may be blocked by existing WSL Geist fonts outage per STATE.md — acceptable, Vercel build is the authoritative validation)
- **Phase gate:** Vercel production deploy succeeds + manual smoke: trigger an automation SMS after 9 PM Colombia and verify it sends.

### Wave 0 Gaps

**No test infrastructure gaps BECAUSE no test runner exists.** This is an acknowledged constraint in this repo (multiple phases have shipped without unit tests, validated by type-check + manual verification + production smoke).

- [ ] ~~Create `tests/test_sms_source.py`~~ — N/A
- [ ] ~~Create `tests/conftest.py`~~ — N/A
- [ ] ~~Install vitest~~ — explicitly OUT OF SCOPE for this phase. Introducing a test runner is its own standalone effort.

**Recommendation for planner:** Do NOT include a "add vitest" task in this phase. Rely on type-check + Vercel build + manual smoke. The refactor is small enough (~50 lines of production code change + 20-line migration) that TSC + eye-review covers it.

---

## Open Questions for Planner

### Q1: Production source distribution (D-05 gate)

**What we know:** The column default is `'automation'` since foundation migration; the only prod caller sets `'automation'` explicitly. Expected: all rows are `'automation'`, zero NULL.
**What's unclear:** Actual distribution. The conditional backfill decision depends on this.
**Recommendation:** Planner adds a CHECKPOINT task BEFORE the migration task:

```
Task: User runs distribution query in Supabase Studio and pastes output.
Query:
  SELECT source, COUNT(*) FROM sms_messages GROUP BY source;
  SELECT COUNT(*) AS null_count FROM sms_messages WHERE source IS NULL;
Outcome:
  - If null_count = 0: migration task includes only ALTER COLUMN ... SET NOT NULL
  - If null_count > 0: migration task adds the UPDATE backfill before the ALTER
```

### Q2: CHECK constraint — add or defer?

**What we know:** No CHECK constraint today on `source`. Constants in code are the only taxonomy definition.
**What's unclear:** Whether to bake the taxonomy into DB (`source IN ('automation','domain-call','script','campaign','marketing')`).
**Recommendation:** **Defer.** Adding CHECK couples future taxonomy changes to migrations (heavier change than warranted). The constants + code review are sufficient defense today. Revisit when campaign module lands. If planner or user wants it now, add to the same migration:
```sql
ALTER TABLE sms_messages
  ADD CONSTRAINT sms_messages_source_check
  CHECK (source IN ('automation','domain-call','script','campaign','marketing'));
```

### Q3: Per-source symbolic constants

**What we know:** CONTEXT.md §specifics recommends "NUNCA introducir un source nuevo sin agregarlo a la lista" — review-time enforcement.
**What's unclear:** Whether to ALSO export per-source constants (`SOURCE_AUTOMATION = 'automation'`) so that call sites use the constant instead of a string literal.
**Recommendation:** Optional. Adds one symbol import per caller but makes grep-auditing easier ("find all `SOURCE_AUTOMATION` usages"). Given one production caller today, benefit is marginal. Planner's call.

### Q4: Test runner introduction

**What we know:** No test runner installed.
**What's unclear:** Whether the planner should add vitest + the `isTransactionalSource` test from Example 5.
**Recommendation:** **No.** Out of scope per CONTEXT §fuera de alcance (implicitly — standalone is about the guard refactor). Test runner adoption is its own decision. Validate this phase via type-check + Vercel + smoke.

### Q5: Warning log for fallback `'domain-call'`

**What we know:** `src/lib/domain/sms.ts:148` uses `params.source || 'domain-call'` as a defense.
**What's unclear:** Whether to add `console.warn` when the fallback fires (helps identify future callers that forgot to set source).
**Recommendation:** **YES — add it** as part of the guard refactor task. Low cost, high diagnostic value. See Pitfall 1.

---

## Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Production has NULL `source` rows, NOT NULL migration fails | LOW (column defaults to 'automation' since 2026-03-16) | Migration rollback needed | Run distribution query per D-05 BEFORE migration task (Q1) |
| R2 | Someone adds marketing SMS channel in future without updating `MARKETING_SOURCES` → permissive default lets it through | MEDIUM (no compile-time enforcement, convention only) | Regulatory breach | Code review checklist + CLAUDE.md scope rule + PR-level grep audit. D-02 trade-off explicitly accepted. |
| R3 | Rename breaks a hidden import not caught by Grep | LOW (single `src/` import confirmed) | Build fail on Vercel | `npx tsc --noEmit` in task gate. Atomic commit covering both rename and import update. |
| R4 | Code deployed before migration applied → runtime sends NULL in old DB | LOW (Regla 5 enforces ordering) | Silent NULL writes | Regla 5 workflow: plan PAUSES on checkpoint for user to apply migration in Supabase Studio, confirms, THEN code task proceeds. |
| R5 | Error message parsed by UI somewhere (silent breakage if reworded later) | ZERO (grep audit confirmed zero UI consumers) | None | No action — string preserved verbatim per D-04. |
| R6 | `scripts/test-onurix-domain.mjs` runs post-migration without source column set | LOW (script hardcodes `source='domain-call'`) | Script insert fails (FAIL-LOUD, desirable) | Leave script unchanged; breakage is a good signal. |
| R7 | Conflation of `DomainContext.source` and `SendSMSParams.source` in a future PR | MEDIUM (shared field name, plausible mistake) | Guard misbehaves on webhook-origin SMS | JSDoc clarifying the distinction on `SendSMSParams.source` (see Pitfall 7). |
| R8 | `isTransactionalSource` inverted logic (returns false for transactional) | LOW (reviewable one-liner) | All transactional SMS blocked overnight — same incident as 2026-04-17 | Code review; helper is literally `includes(source)` — hard to invert without noticing. |
| R9 | Migration timestamp collision (new migration has same or earlier timestamp than latest) | LOW (last is 20260418030000; new is 20260418040000) | Migration ordering undefined, Supabase may skip or re-run | Use timestamp `20260418040000` or later. Planner verifies `ls supabase/migrations/ | tail -3` before writing migration name. |

**Ranking (highest risk first):** R7 > R2 > R4 > R1 > R3 > R6 > R8 > R9 > R5.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Production `sms_messages.source` has zero NULL rows (foundation migration applied DEFAULT to existing rows) | Current State Audit | Migration NOT NULL step fails; backfill task runs (non-destructive, safe) |
| A2 | All pre-existing rows in prod are transactional (no campaign channel has ever run) | Current State Audit | `UPDATE source='automation' WHERE source IS NULL` mislabels pre-existing marketing rows. But since no campaign module exists, this is effectively impossible. |
| A3 | Vercel build will rebuild without cache issues after the rename | Runtime State Inventory | Stale .next cache serves old import; fresh deploy fixes it. No persistent risk. |
| A4 | No downstream system (external webhook, analytics, Datadog tag) reads `source` values | Runtime State Inventory | A value-rename would require coordination, but this phase does NOT rename values — only enforces NOT NULL and narrows guard. So assumption is load-bearing only if someone later changes the set. |
| A5 | `apps/mobile/` does not send SMS | Call Site Inventory | Verified by grep — mobile app consumes API, doesn't call domain directly. |
| A6 | The JSDoc at `SendSMSParams.source` (`'automation' | 'domain-call' | 'script'`) accurately describes all current callers | Call Site Inventory | Verified by grep of literal source values. Only match is `'automation'` at action-executor.ts:1102. Fallback `'domain-call'` at sms.ts:148. |

**All assumptions marked [ASSUMED] map to one of A1-A6 above; everything else in this research is [VERIFIED] by the grep/read audit in this session.**

---

## Project Constraints (from CLAUDE.md)

Extracted from `/mnt/c/Users/Usuario/Proyectos/morfx-new/CLAUDE.md` and `.claude/rules/*.md`. Planner MUST respect ALL of these.

| Directive | How it applies here |
|---|---|
| **Regla 0: Siempre GSD completo** | This phase followed discuss → research → (plan next). Plan MUST include all of: atomic tasks, verified test criteria per task, LEARNINGS at end. |
| **Regla 1: Push a Vercel** | After code tasks, MUST push (`git add <archivos> && git commit && git push origin main`) before asking user for smoke verification. |
| **Regla 2: Zona horaria Colombia** | Already respected — `toLocaleString('en-US', { timeZone: 'America/Bogota' })` in `isWithinMarketingSMSWindow`. Unchanged in D-04. |
| **Regla 3: Domain Layer** | Already respected — `sendSMS` is the single mutation path. This phase REINFORCES it by making NULL writes impossible. |
| **Regla 4: Documentación Siempre Actualizada** | LEARNINGS.md at phase close. `docs/analysis/04-estado-actual-plataforma.md` may need an SMS section update (check current state of SMS module section before/after phase). Deuda técnica list: reduce the "SMS guard over-blocks transactional" item (if listed). |
| **Regla 5: Migración antes de deploy** | **CRITICAL — planner MUST structure**: migration task → CHECKPOINT for user to apply in Supabase Studio → code tasks push only AFTER confirmation. This is the bright-line rule of the phase. |
| **Regla 6: Proteger agente en producción** | This phase doesn't modify agent behavior. N/A, but note that `send_sms` action runs in automation runtime; the guard change is additive (fewer blocks, no new blocks), so agent responses that include SMS automations gain availability, never lose it. |
| **Agent scope rule** (.claude/rules/agent-scope.md) | N/A — no agent is being created/modified. |
| **code-changes rule** (.claude/rules/code-changes.md) | Enforced: this phase has CONTEXT + will have PLAN before any code task fires. |
| **gsd-workflow rule** (.claude/rules/gsd-workflow.md) | Enforced: research → plan → execute → LEARNINGS → verify-work. |

---

## Sources

### Primary (HIGH confidence)

- `src/lib/domain/sms.ts` — direct read, lines 1-232 [VERIFIED]
- `src/lib/sms/utils.ts` — direct read, lines 1-66 [VERIFIED]
- `src/lib/sms/constants.ts` — direct read, lines 1-17 [VERIFIED]
- `src/lib/sms/client.ts` — direct read, lines 1-92 [VERIFIED]
- `src/lib/sms/types.ts` — direct read, lines 1-41 [VERIFIED]
- `src/lib/domain/types.ts` — direct read, lines 1-34 [VERIFIED]
- `src/lib/automations/action-executor.ts` — read lines 200-218, 1040-1108 + grep 18 hits [VERIFIED]
- `src/app/actions/sms.ts` — full read, 299 lines [VERIFIED]
- `src/app/actions/sms-admin.ts` — full read, 248 lines [VERIFIED]
- `src/inngest/functions/sms-delivery-check.ts` — full read, 84 lines [VERIFIED]
- `supabase/migrations/20260316100000_sms_onurix_foundation.sql` — full read [VERIFIED]
- `supabase/migrations/20260418011321_sms_atomic_rpc.sql` — full read [VERIFIED]
- `supabase/migrations/20260418030000_sms_provider_state_raw.sql` — full read [VERIFIED]
- `scripts/test-onurix-sms.mjs`, `scripts/test-onurix-domain.mjs`, `scripts/diagnose-onurix-sms.mjs` — full reads [VERIFIED]
- Migration ordering: `ls supabase/migrations/ | tail -10` [VERIFIED]
- Grep audits: `sendSMS|domainSendSMS`, `sendOnurixSMS`, `isWithinSMSWindow`, `fuera de horario`, `source:` with known values [VERIFIED]
- Test file survey: `Glob **/*.test.ts` and `**/*.spec.ts` — only `node_modules/` hits [VERIFIED]
- `.planning/standalone/sms-time-window-by-type/CONTEXT.md` — full read [VERIFIED]
- `.planning/debug/sms-onurix-not-delivered.md` — full read [VERIFIED]

### Secondary (MEDIUM confidence)

- Regulatory claim that transactional SMS are exempt from CRC horario restrictions — [CITED: CONTEXT.md §regulatory_context which cites CRC Resolución 5111 de 2017 + Ley 1581 de 2012]. This research does NOT re-verify the regulation; CONTEXT.md is treated as authoritative user decision.

### Tertiary (LOW confidence)

- None. All load-bearing claims verified via codebase read/grep.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — "no new deps" is trivially verifiable
- Architecture: HIGH — single-caller, single-file refactor, every hop traced
- Pitfalls: HIGH — pitfalls derived from real code shape, not speculation
- Call-site inventory: HIGH — only one `sendSMS` caller in `src/` production code, verified by grep
- Bypass audit: HIGH — `sendOnurixSMS` has only 2 imports (domain.ts + delivery-check.ts which doesn't send)
- Production DB state: MEDIUM — column has default `'automation'` so NULL count is almost certainly 0, but the query hasn't been executed this session. Planner MUST run before migration task (A1).
- Regulatory interpretation: MEDIUM — relying on CONTEXT.md's citation of CRC + Ley 1581

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 days — stack is stable). Re-validate if: any new SMS caller is added, the campaign module starts implementation, or Onurix is replaced.
