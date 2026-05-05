---
phase: agent-godentist-fb-ig
plan: 01
subsystem: routing
tags: [audit, agent-templates, godentist, fb-ig, routing-rules, snapshot, wave-0]

# Dependency graph
requires:
  - phase: routing-channel-fact
    provides: "fact `channel` resuelto en agent-lifecycle-router (shipped 2026-05-04) — habilita reglas con `{ fact: 'channel', operator: 'in', value: ['facebook','instagram'] }` que el sibling necesitara en Plan 09"
  - phase: agent-lifecycle-router
    provides: "agentRegistry.list() consumed by routing-editor + fall-through legacy cuando no hay rules — confirma viabilidad de greenfield routing rule en Plan 09"
provides:
  - "Audit production verbatim de 4 queries SELECT-only (templates inventory, content_type breakdown, FB/IG conversations count, baseline pre-migration, priorities libres)"
  - "79 rows godentist templates target row count locked para sanity check de la migration en Wave 5 Plan 07 DO block"
  - "100% content_type='texto' confirmado → cero anomalias FB/IG, clonado verbatim safe"
  - "Greenfield baseline confirmado (0 rows agent_id='godentist-fb-ig') → migration land cleanly"
  - "Priority slot 100 recomendado para routing rule manual de Plan 09 (workspace target tiene 0 active rules)"
  - "Q1/Q2/Q3 RESUELTAS sin ajustes a Plans 02/05 — page.tsx solo necesita 1 import line, dentos-availability.ts clonado verbatim, migration sin logica especial para media"
  - "Plan 09 deployment pre-check NUEVO: verificar `workspace_agent_config.lifecycle_routing_enabled=true` antes de crear la rule (workspace tiene 0 active rules → dispatch actual va via legacy fallback)"
affects: [agent-godentist-fb-ig-02, agent-godentist-fb-ig-03, agent-godentist-fb-ig-05, agent-godentist-fb-ig-07, agent-godentist-fb-ig-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 audit-snapshot pattern (heredado de somnio-sales-v3-pw-confirmation Plan 01): SQL SELECT-only file commiteado + outputs verbatim en SNAPSHOT.md + decisions Go/No-Go + Open Questions resolvidas por lectura de codigo en paralelo"

key-files:
  created:
    - ".planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql"
    - ".planning/standalone/agent-godentist-fb-ig/01-SNAPSHOT.md"
  modified: []

key-decisions:
  - "Q1 RESUELTA: routing-editor usa agentRegistry.list() directo en page.tsx:65 — 1 import line basta en Plan 05 para registrar el sibling"
  - "Q2 RESUELTA SAFE: 100% content_type='texto' (zero imagen, zero video) — clonado verbatim sin riesgo de URLs WhatsApp-only"
  - "Q3 RESUELTA: dentos-availability.ts hardcodea 'godentist-valoraciones' literal → robot Railway compartido sin ajustes"
  - "Workspace target tiene 0 active routing_rules → priority 100 recomendado + Plan 09 debe pre-checkar lifecycle_routing_enabled"

patterns-established:
  - "Wave 0 audit pattern: 4 queries SELECT-only contra prod + Open Questions resueltas en SNAPSHOT.md ANTES de tocar codigo en Wave 1+ (cero side-effects, falla rapido si catalog incompleto)"

requirements-completed: [GFB-01]

# Metrics
duration: ~30min (multi-session — initial audit creation + checkpoint pause + continuation con SQL outputs)
completed: 2026-05-05
---

# Plan 01: Wave 0 Production Audit + Open Questions Resolution Summary

**Audit production de 4 queries SELECT-only contra DB prod + lectura de codigo en paralelo desbloquearon Wave 1 con 79 rows godentist templates verificadas (100% texto, zero anomalias FB/IG), greenfield confirmado (0 rows pre-existentes en sibling), workspace target sin routing rules activas (priority 100 libre), y las 3 Open Questions de RESEARCH.md RESUELTAS sin ajustes adicionales a planes downstream.**

## Performance

- **Duration:** ~30min total (split en 2 sessions: initial audit + continuation post user-SQL-paste)
- **Completed:** 2026-05-05
- **Tasks:** 2 completed (Task 1 audit SQL file + Task 2 checkpoint:human-verify snapshot)
- **Files created:** 2 (`01-AUDIT.sql`, `01-SNAPSHOT.md`)

## Accomplishments

- **Audit SQL committed verbatim (4 queries + 1 summary auxiliar):** `01-AUDIT.sql` ejecutable en Supabase SQL Editor production con cero side-effects (Habeas Data compliant, no toca PII, solo schema/config).
- **79 rows godentist templates baseline locked:** target row count para el sanity check del DO block en la migration de Wave 5 Plan 07 (`godentist_count = sibling_count` assertion).
- **Greenfield confirmado:** 0 rows pre-existentes en `agent_templates WHERE agent_id='godentist-fb-ig'` → la migration `INSERT...SELECT` del Plan 07 land cleanly.
- **Pitfall 7 (channel fact) PASSED:** 1225 conversations facebook + 218 instagram con `channel` populated correctamente en el workspace target → fact `channel` resolvera correctamente cuando la rule del Plan 09 fire.
- **Q1/Q2/Q3 RESUELTAS sin ajustes downstream:**
  - **Q1** (routing-editor data source): `agentRegistry.list()` directo en page.tsx:65 → 1 import line basta en Plan 05.
  - **Q2** (FB/IG content safety): 100% `content_type='texto'` → cero riesgo, clonado verbatim sin logica especial.
  - **Q3** (robot Railway workspace string): hardcoded literal `'godentist-valoraciones'` en dentos-availability.ts:50 → clone verbatim funciona out-of-the-box, mismo robot, misma cuenta Dentos.
- **Plan 09 deployment pre-check NUEVO documentado:** workspace target tiene 0 active routing_rules → dispatch actual probablemente va via legacy fallback. Antes de crear la rule del sibling, usuario debe verificar/activar `workspace_agent_config.lifecycle_routing_enabled=true` (SQL snippet incluido en SNAPSHOT.md).

## Task Commits

Cada task committeado atomicamente. Commits NO pusheados (Wave 0 queda local hasta cierre del standalone con Wave 5 Plan 07 push):

1. **Task 1: Crear `01-AUDIT.sql` con las 4 queries SELECT-only** — `eb50597` (docs)
   - 5 queries (A inventario, A-summary content_type breakdown, B FB/IG conversations, C baseline sibling, D priorities) + comentarios + criterios Go/No-Go.
2. **Task 1 fix: corregir column `enabled` → `active` en routing_rules** — `61d2f4f` (fix)
   - Schema correction post-task1 antes de la ejecucion del usuario.
3. **Task 2 stub initial (Q1/Q3 resueltos por code-read, Q-A/B/C/D pending):** — `f961a04` (docs)
   - Stub inicial de `01-SNAPSHOT.md` con Q1 + Q3 resueltos por lectura de page.tsx + dentos-availability.ts. PENDING_USER_INPUT placeholders para outputs SQL.
4. **Task 2 final (snapshot completo + decision GO):** — `28f3157` (docs)
   - Snapshot finalizado con outputs verbatim de las 4 queries + Q2 RESUELTA SAFE + decision agregada GO + Plan 09 pre-check guidance documentado.

**Plan metadata:** este SUMMARY se commiteara junto con el final-commit del plan.

## Files Created/Modified

- `.planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql` — 4 queries SELECT-only para audit de production. Read-only, idempotente, safe to run multiple times.
- `.planning/standalone/agent-godentist-fb-ig/01-SNAPSHOT.md` — Outputs verbatim del Supabase SQL Editor + resolucion explicita de Q1/Q2/Q3 + decision agregada GO + datos locked para Waves 1-7.

## Decisions Made

- **Workspace target locked**: GoDentist Valoraciones (`f0241182-f79b-4bc6-b0ed-b5f6eb20c514`) — confirmado por D-02 del CONTEXT.
- **Target agent_id locked**: `godentist-fb-ig` (sibling, no reemplaza `godentist`).
- **Priority slot recomendado**: `100` (cualquier valor libre; sugerimos 100 o 500 para tener room arriba/abajo). Justification: cero rules activas en el workspace → cero colision con UNIQUE INDEX `uq_routing_rules_priority`.
- **Plan 09 deployment pre-check elevado a CRITICAL**: verificar/activar `workspace_agent_config.lifecycle_routing_enabled=true` antes de crear la rule. Discovery del audit: el workspace tiene 0 active rules → dispatch actual va via legacy fallback (webhook-processor.ts) o `workspace_agent_config.conversational_agent_id`. Sin este flag flip, la rule del sibling no se evaluara.

## Deviations from Plan

**1. [Rule 3 - Blocking] Schema correction: `routing_rules.enabled` → `routing_rules.active`**
- **Found during:** Task 2 (cuando el usuario intento ejecutar Query D)
- **Issue:** Plan 01-PLAN.md y el primer draft de `01-AUDIT.sql` referenciaban columna `enabled` en `routing_rules`, pero el schema productivo usa `active`.
- **Fix:** Edit en linea de `01-AUDIT.sql` (`enabled = true` → `active = true`).
- **Files modified:** `.planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql`
- **Verification:** Usuario corrio Query D sin error post-fix; output `Success. No rows returned` confirma execution clean.
- **Committed in:** `61d2f4f` (separate fix commit)

**2. [Rule 2 - Critical addition] Plan 09 pre-check obligatorio para `lifecycle_routing_enabled`**
- **Found during:** Task 2 analisis de Q-D output
- **Issue:** Q-D revelo que el workspace target tiene 0 active routing_rules. Esto NO era un escenario considerado en el plan original (que asumia rules activas con priority gap a identificar). Sin un pre-check, el usuario podria crear la rule en Plan 09 y nunca disparar el sibling porque el lifecycle router esta desactivado para este workspace.
- **Fix:** Documentar en SNAPSHOT.md §Query (D) un nuevo "Plan 09 deployment guidance" con SQL snippets para verificar y activar `workspace_agent_config.lifecycle_routing_enabled` antes de la creacion de la rule.
- **Files modified:** `.planning/standalone/agent-godentist-fb-ig/01-SNAPSHOT.md` §Query (D) + §Datos locked para Waves 1-7.
- **Verification:** snapshot final incluye snippet `SELECT lifecycle_routing_enabled FROM workspace_agent_config WHERE workspace_id='f0241182...'` + UPDATE statement listo para copy/paste.
- **Committed in:** `28f3157`

## Open Questions Status

| Q | Title | Status | Resolution path |
|---|-------|--------|-----------------|
| Q1 | routing-editor data source | [x] RESUELTA | Lectura de `src/app/(dashboard)/agentes/routing/editor/page.tsx:65` confirmo `agentRegistry.list()` directo |
| Q2 | content_types FB/IG safe | [x] RESUELTA SAFE | Q-A-summary output: `[{content_type:"texto", row_count:79}]` — zero media |
| Q3 | robot Railway workspace string | [x] RESUELTA | Lectura de `src/lib/agents/godentist/dentos-availability.ts:50` confirmo string literal hardcoded |

## Threat Flags

Cero nuevos threats introducidos. Audit es 100% SELECT-only contra DB de production:
- T-gfb-01-01 (Information Disclosure via content_preview): `accept` mantenido — content_preview de 200 chars son catalog publico (sin PII).
- T-gfb-01-02 (Tampering): `accept` mantenido — solo SELECT, sin riesgo.
- T-gfb-01-03 (Spoofing snapshot data): `mitigate` cumplido — outputs pegados verbatim del SQL Editor por el usuario, Claude no inventa rows. Verificable re-runneando las queries.

## Self-Check

**1. Created files exist:**
- `.planning/standalone/agent-godentist-fb-ig/01-AUDIT.sql` → FOUND
- `.planning/standalone/agent-godentist-fb-ig/01-SNAPSHOT.md` → FOUND

**2. Commits exist:**
- `eb50597` (Task 1 audit SQL file) → FOUND
- `f961a04` (Task 2 snapshot stub initial) → FOUND
- `61d2f4f` (Task 1 fix routing_rules column) → FOUND
- `28f3157` (Task 2 snapshot final + decision GO) → FOUND

**3. SNAPSHOT.md sanity:**
- Zero `PENDING_USER_INPUT` placeholders remain (verified via grep).
- Decision agregada `[x] GO` marked.
- Q1/Q2/Q3 marked `[x] RESUELTA`.
- Q-A row count `79` documented.
- Priority slot `100` documented.
- Plan 09 deployment pre-check (lifecycle_routing_enabled) documented.

**4. Wave 1 unblocked:**
- Plans 02 + 03 (paralelos) pueden ejecutarse sin re-investigar Q1/Q2/Q3.
- Plan 02 Wave 1: clonar `dentos-availability.ts` verbatim sin ajustes (Q3 resolved).
- Plan 03 Wave 1: ejecutar segun spec original (Q1 confirmed agentRegistry direct).

## Self-Check: PASSED
