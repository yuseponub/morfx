---
status: resolved
created: 2026-04-22
updated: 2026-04-23
resolved: 2026-04-23
reporter: Jose
affected_agent: somnio-recompra-v1
workspace: a3843b3f-c337-4836-92b5-89c58bb98490 (Somnio)
related_phase: somnio-recompra-crm-reader (closed — enabler for turn 1+ context, NOT the cause of these bugs)
resolved_by: .planning/standalone/somnio-recompra-template-catalog/ (shipped 2026-04-23)
trigger: "Recompra agent turn-0 greeting broken — 3 bugs catalogued during smoke test of somnio-recompra-crm-reader phase close-out."
---

## Resolution summary (2026-04-22)

3 original bugs diagnosed + 4 commits shipped to prod:

- `2428789` T1 — preload guard bloqueado por `session.version === 0` (preload nunca corría para nombre/apellido/ciudad). Ahora usa marker `_v3:preloaded` en datos_capturados. **SHIPPED.**
- `cdc06d9` T2 — template lookup apuntaba a `somnio-recompra-v1` (vacío); cambió a `somnio-sales-v3`. **Fix parcial / arquitectura incorrecta** — el usuario confirma que recompra debe tener catálogo propio. Se revertirá en la fase `somnio-recompra-template-catalog` una vez migrado el catálogo.
- `00548e4` T3 — `getGreeting` reemplazó el patrón roto `new Date(toLocaleString)` por `Intl.DateTimeFormat` con `timeZone='America/Bogota'`. **SHIPPED.**
- `a23abec` T4 (hotfix colateral) — T1 expuso dead-code que intentaba escribir `_v3:agent_module` como columna top-level de session_state (no existe). Moví el marker dentro de `datos_capturados` + ajusté reader en `agent-timers-v3.ts:311`. **SHIPPED.**

QA después de deploys reveló que el flujo de saludo/compra de recompra **no matchea la intención de producto** (comment explícito en `transitions.ts:82` confirma que el diseño actual evita pedir confirmación de dirección, pero el usuario espera lo contrario). Esto trasciende "bug fix" — es redesign del catálogo de templates + flujo inicial.

**Handoff:** scope completo (redesign del catálogo recompra + flujo saludo → preguntar_direccion → promos + fix registro_sanitario gap) capturado en `.planning/standalone/somnio-recompra-template-catalog/CONTEXT.md`. Próximo paso: `/gsd:discuss-phase somnio-recompra-template-catalog`.

---


# Debug — Recompra agent greeting bugs

## Symptoms

**Expected behavior (turn 0 greeting for known recompra client):**
```
"Buenas tardes Jose 😊"
"Deseas adquirir tu ELIXIR DEL SUEÑO?" + IMAGEN
```

**Actual behavior (smoke test 2026-04-22 ~17:35 Bogotá):**
```
"Buenas noches 😊"
[promos genéricas — wrong template path]
```

**Error messages:** None. Silent bugs — agent responds but with wrong content.

**Timeline:** Preexisting. Surfaced during smoke test of `somnio-recompra-crm-reader` phase close-out on 2026-04-22. Not caused by that phase (which enables turn 1+ CRM context, does not touch turn 0 greeting).

**Reproduction:** Known recompra contact sends any message to Somnio workspace WhatsApp. Contact `285d6f19-87df-447d-a2dd-51c38bb0ff03` (is_client=true, name='Jose Romero', city='Bucaramanga') in workspace `a3843b3f-c337-4836-92b5-89c58bb98490`. Smoke test session `4639c20c-eeea-4e37-aba3-5ff3bcf86077`.

## Current Focus

- hypothesis: All 3 bugs root-caused from code reading. See Evidence section.
- test: N/A — confirmed by reading code paths.
- expecting: N/A
- next_action: User decides fix strategy.
- reasoning_checkpoint: null
- tdd_checkpoint: null

## Bugs to investigate (in priority order)

### Bug 1 — `loadLastOrderData` does NOT populate `nombre/apellido/ciudad` in `datos_capturados`

**Root cause:** `V3ProductionRunner` guards the preload block with `if (session.version === 0)` at `src/lib/agents/engine/v3-production-runner.ts:121`, but sessions are **created with `version: 1`** by `SessionManager.createSession` at `src/lib/agents/session-manager.ts:129` (DB schema also defaults `version INTEGER NOT NULL DEFAULT 1` in `supabase/migrations/20260205000000_agent_sessions.sql:21`). The gate is always false for new sessions — preload never executes.

This bug also breaks the adjacent block at `v3-production-runner.ts:131` that stores `_v3:agent_module` for timer routing (same `session.version === 0` guard) — timers for recompra/godentist will misroute on L3/L5 expiry because the module tag never gets written.

### Bug 2 — Wrong greeting template ⭐

**Root cause:** Recompra response-track calls `templateManager.getTemplatesForIntents(SOMNIO_RECOMPRA_AGENT_ID, ...)` at `src/lib/agents/somnio-recompra/response-track.ts:115-120`, and `SOMNIO_RECOMPRA_AGENT_ID = 'somnio-recompra-v1'` (`response-track.ts:32` and `config.ts:12`). `TemplateManager.loadTemplates` then filters with `.eq('agent_id', agentId)` at `src/lib/agents/somnio/template-manager.ts:275` — hard-scoped to the recompra agent_id.

User confirmed the ELIXIR DEL SUEÑO greeting template is registered under `agent_id='somnio-sales-v3'`. The recompra agent cannot see it. It falls back to whatever generic rows exist under `somnio-recompra-v1` (if any) — producing the observed "promos genéricas" output.

Note (per file header, line 30): `"Agent ID (recompra uses same templates as v3 for now)"` — the comment says "same templates" but the lookup uses a DIFFERENT agent_id. Either templates were never duplicated/migrated to `somnio-recompra-v1`, or the constant was meant to be `'somnio-sales-v3'`.

### Bug 3 — Time-of-day wrong ("noches" instead of "tardes") at ~17:35 local Bogotá

**Root cause:** `getGreeting` at `src/lib/agents/somnio-recompra/response-track.ts:229-247` uses the classic broken pattern:

```typescript
const colombiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
const hour = colombiaTime.getHours()
```

Problems:
1. `toLocaleString('en-US', ...)` returns a format like `"4/22/2026, 5:35:00 PM"` — an AM/PM 12-hour string that `new Date(...)` reparses as runtime-local time (Vercel = UTC). The resulting Date is NOT aligned to any particular timezone — the TZ information was lost on reparse.
2. `.getHours()` returns the hour in the runtime's LOCAL zone (UTC on Vercel), not in America/Bogota. The variable name `colombiaTime` is misleading.
3. Depending on Node's date-parsing quirks with `"M/D/YYYY, H:MM:SS AM/PM"`, the result can also be invalid/NaN or off by an AM/PM boundary — that's a plausible explanation for flipping 17:35 → 22:xx or similar, producing the `>= 18 → "Buenas noches"` branch.

Fix pattern (timezone-correct):

```typescript
const hour = Number(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Bogota',
  hour: 'numeric',
  hour12: false,
}).format(new Date()))
```

## Relation to closed phase

The `somnio-recompra-crm-reader` phase is the **enabler** for turn-1+ context but does NOT affect turn 0 greeting. These 3 bugs are **preexisting** — surfaced during the smoke test, not caused by it.

## Evidence

- timestamp: 2026-04-22T17:35-05:00 — Bug 1 root cause identified by code inspection.
  - `V3ProductionRunner.processMessage` gates preload on `session.version === 0` (`src/lib/agents/engine/v3-production-runner.ts:121`).
  - `SessionManager.createSession` inserts sessions with `version: 1` hardcoded (`src/lib/agents/session-manager.ts:129`).
  - DB schema: `version INTEGER NOT NULL DEFAULT 1` (`supabase/migrations/20260205000000_agent_sessions.sql:21`).
  - Conclusion: the gate is always false at creation time; preload never runs. Smoke test `session_state.datos_capturados` containing only `_v3:*` keys (no `nombre`/`apellido`/`ciudad`/`telefono`/`direccion`) is consistent with this.
  - Collateral: same guard at line 131 also blocks `_v3:agent_module` storage for recompra/godentist → timer routing broken too.

- timestamp: 2026-04-22T17:35-05:00 — Bug 2 root cause identified by code inspection.
  - `SOMNIO_RECOMPRA_AGENT_ID = 'somnio-recompra-v1'` at `src/lib/agents/somnio-recompra/config.ts:12` and duplicated at `src/lib/agents/somnio-recompra/response-track.ts:32`.
  - `templateManager.getTemplatesForIntents(SOMNIO_RECOMPRA_AGENT_ID, ...)` at `src/lib/agents/somnio-recompra/response-track.ts:115-120`.
  - `TemplateManager.loadTemplates` uses `.eq('agent_id', agentId)` at `src/lib/agents/somnio/template-manager.ts:275` — no cross-agent fallback.
  - User-confirmed: ELIXIR DEL SUEÑO saludo template is registered under `agent_id='somnio-sales-v3'` → invisible to recompra.
  - Header comment at `response-track.ts:30` says "recompra uses same templates as v3 for now" — documents the INTENT but the code does NOT implement a fallback / shared lookup.

- timestamp: 2026-04-22T17:35-05:00 — Bug 3 root cause identified by code inspection.
  - `getGreeting` in `src/lib/agents/somnio-recompra/response-track.ts:229-247` uses `new Date(Date.toLocaleString('en-US', { timeZone: 'America/Bogota' }))`.
  - `.toLocaleString('en-US', ...)` returns AM/PM 12-hour format string. Reparsing with `new Date(...)` loses TZ and produces runtime-local Date; `.getHours()` then reads hours in runtime TZ (UTC on Vercel serverless), not in America/Bogota.
  - Matches the documented CLAUDE.md Regla 2 violation — code should use `Intl.DateTimeFormat` with `timeZone: 'America/Bogota'`, not reparsed localized strings.

## Eliminated

- H1-workspace-mismatch (Bug 1): Not the primary cause. Even if `loadLastOrderData` returned data correctly, the preload gate prevents it from being written. Contact workspace validation is irrelevant until the gate is fixed.
- H1-crm-reader-overwrite (Bug 1): Not the cause. `SessionManager.updateCapturedData` merges (`{...state.datos_capturados, ...newData}` in `session-manager.ts:402-414`) — merge-safe. Also `recompra-preload-context` only writes `_v3:crm_context*` keys, not shipping fields.

## Proposed fixes

### Bug 1 fix
Change the gate at `src/lib/agents/engine/v3-production-runner.ts:121` and `:131` from:
```typescript
if (... && session.version === 0) {
```
to a "new session" detection that actually works. Three equivalent options (pick one, recommend #3):

1. `session.version === 1` — aligns to current create-time value. Risk: coincidentally matches any session exactly one update in (unlikely for these pre-processMessage writes, but fragile).
2. Compute `isNewSession` in `getOrCreateSession` return value (storage adapter exposes a boolean flag).
3. **Recommended:** Check `Object.keys(session.state.datos_capturados ?? {}).length === 0` — if the session has no captured data yet, it's effectively a fresh one for preload purposes. Idempotent and robust against version drift.

Alternative: gate on `turnNumber === 1 || history.length === 0`.

### Bug 2 fix
Decide the product question first: **do recompra templates differ from sales templates, or are they identical?**
- If identical (per the `response-track.ts:30` comment): change `SOMNIO_RECOMPRA_AGENT_ID` constant used in `TemplateManager` lookups to `'somnio-sales-v3'`. Keep `'somnio-recompra-v1'` as the AGENT identifier (for `agent_sessions.agent_id`, `crm_bot_actions`, rate-limiting, observability), but use `'somnio-sales-v3'` as the TEMPLATE lookup key. This decouples "which agent" from "which template pack".
- If they should differ: keep `'somnio-recompra-v1'` and either (a) INSERT the needed templates under `agent_id='somnio-recompra-v1'` (data migration), or (b) add a fallback pass in `TemplateManager.loadTemplates` that also pulls templates under a shared/parent agent_id.

Cleanest code-only change (option a of the identical branch): add a constant like `SOMNIO_RECOMPRA_TEMPLATE_AGENT_ID = 'somnio-sales-v3'` distinct from `SOMNIO_RECOMPRA_AGENT_ID`, and use the template constant for the TemplateManager call.

### Bug 3 fix
Replace `getGreeting` body in `src/lib/agents/somnio-recompra/response-track.ts:229-247` with:

```typescript
export function getGreeting(nombre: string | null): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
    hour12: false,
  }).format(new Date()))

  let greeting: string
  if (hour < 12) greeting = 'Buenos dias'
  else if (hour < 18) greeting = 'Buenas tardes'
  else greeting = 'Buenas noches'

  if (!nombre) return greeting
  const firstName = nombre.split(' ')[0] || nombre
  return `${greeting} ${firstName}`
}
```

Also scan codebase for the same pattern — any other `new Date(now.toLocaleString('en-US', { timeZone: ... }))` is the same pitfall.

## Artifacts to update on close

- `.claude/rules/agent-scope.md` (somnio-recompra section) if fix changes scope
- `docs/analysis/04-estado-actual-plataforma.md` (recompra agent section)
- LEARNINGS in standalone/quick for fix
- This file → move to `.planning/debug/resolved/` with `status: resolved`

## Resolution

<!-- Filled on close. -->
- root_cause: See Evidence section per bug (3 independent causes).
- fix: Not yet applied — awaiting user decision on fix strategy (see "Proposed fixes").
