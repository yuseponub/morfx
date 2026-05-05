# Verification Report — agent-godentist-fb-ig

**Verification date:** 2026-05-05 (America/Bogota)
**Phase:** Wave 7 Plan 09 (cierre del standalone)
**Verified-against commit:** `7d036ab` (HEAD = origin/main)

---

## Verification 1 — TypeScript compile (sibling code clean)

```bash
npx tsc --noEmit
```

Output:
```
src/lib/domain/__tests__/conversations.test.ts(16,7): error TS7022: 'eqMock' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
src/lib/domain/__tests__/conversations.test.ts(16,22): error TS7024: Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.
```

Error count: **2** — both in `src/lib/domain/__tests__/conversations.test.ts`.

**Scope analysis:** these errors are in `src/lib/domain/__tests__/conversations.test.ts`, a test file added by the upstream standalone `routing-channel-fact` (commit `307aa8d`, shipped 2026-05-04). They are **outside** the `src/lib/agents/godentist-fb-ig/` scope of this standalone and pre-existed before the sibling work began. The sibling source files (`src/lib/agents/godentist-fb-ig/**`) emit zero TypeScript errors.

Filtered scope check:
```bash
grep -E "^src/lib/agents/godentist-fb-ig/" /tmp/tsc-output.txt
```
Output: empty (no errors in sibling code).

**Result:** [x] PASS for sibling scope (0 errors in `src/lib/agents/godentist-fb-ig/**`). Pre-existing routing-channel-fact test errors logged for backlog reference; out-of-scope per executor scope-boundary rule.

---

## Verification 2 — Sibling test suite

```bash
npx vitest run src/lib/agents/godentist-fb-ig/__tests__/
```

Output (verbatim summary):
```
 ✓ src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts  (16 tests) 8ms
 ✓ src/lib/agents/godentist-fb-ig/__tests__/transitions.test.ts  (34 tests) 16ms
 ✓ src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts  (9 tests) 55ms
 ✓ src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts  (15 tests) 13ms
 ✓ src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts  (13 tests) 15ms
 ✓ src/lib/agents/godentist-fb-ig/__tests__/godentist-fb-ig-agent.test.ts  (6 tests) 17ms

 Test Files  6 passed (6)
      Tests  93 passed (93)
   Duration  15.65s
```

**Result:** [x] PASS — 6 suites, 93/93 tests passed.

---

## Verification 3 — Existing routing tests no regression

```bash
npx vitest run src/lib/agents/routing/__tests__/
```

Output (verbatim summary):
```
 Test Files  9 passed (9)
      Tests  98 passed (98)
   Duration  21.43s
```

**Result:** [x] PASS — 9 suites, 98/98 tests, no regression introduced by the sibling work.

---

## Verification 4 — Anti-regression D-08 (Pitfall 1)

Goal: ensure the sibling source never references `GODENTIST_AGENT_ID` (the original constant). If it did, it would silently fall back to the godentist catalog at runtime — this is exactly the regression seen in commit `cdc06d9` for somnio-recompra (since reverted).

```bash
grep -rn 'GODENTIST_AGENT_ID\b' src/lib/agents/godentist-fb-ig/
```

Output: empty (grep exit code 1 → 0 matches).

**Result:** [x] PASS — 0 matches. Catalog isolation D-08 honored at the source level.

---

## Verification 5 — Sibling self-register grep

Goal: confirm `agentRegistry.register(godentistFbIgConfig)` is called once at module load.

```bash
grep -c 'agentRegistry.register' src/lib/agents/godentist-fb-ig/index.ts
```

Output: `1`

**Result:** [x] PASS — exactly 1 self-register call (Pattern 1: Self-Registering Agent Module).

---

## Verification 6 — Sibling pre-warm grep (anti-Pitfall 2 / B-001 cold-lambda race)

Goal: webhook-processor must pre-import the sibling module BEFORE `routeAgent` is called. Without this, the first cold-lambda invocation that routes to `godentist-fb-ig` would fail with `unregistered agent_id` because the dynamic import resolves after `agentRegistry.list()` is consulted.

```bash
grep -c "import('../godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts
```

Output: `2` — one in the pre-warm `Promise.all([...])` block, one in the dispatch branch.

**Result:** [x] PASS — pre-warm + dispatch both reference the sibling. Cold-lambda race mitigated.

---

## Verification 7 — Catalog entry grep

Goal: the sibling appears in the routing-editor dropdown via `AGENT_CATALOG`.

```bash
grep -c "id: 'godentist-fb-ig'" src/lib/agents/agent-catalog.ts
```

Output: `1`

Context (lines 41-43 of `src/lib/agents/agent-catalog.ts`):
```
    id: 'godentist-fb-ig',
    name: 'GoDentist Valoraciones — FB/IG',
    description: 'Sibling de GoDentist para FB Messenger / Instagram Direct. Saludo lead-capture (nombre+celular upfront + Habeas Data inline).',
```

**Result:** [x] PASS — catalog entry registered with correct id + display name + description.

---

## Verification 8 — agentModule union extended

Goal: `engine/types.ts` union type allows the sibling string for `agentModule`.

```bash
grep -c 'godentist-fb-ig' src/lib/agents/engine/types.ts
```

Output: `1`

**Result:** [x] PASS — union extended.

---

## Verification 9 — VAL tag check extended (anti-Pitfall 6)

Goal: the VAL tag side-effect in `v3-production-runner.ts` must fire for BOTH `godentist` and `godentist-fb-ig`. If only `godentist` were checked, leads captured via FB/IG would NOT receive the VAL tag and would be invisible to dashboard metrics — silent break.

```bash
grep -cE "agentModule !== 'godentist' && (this\.config\.)?agentModule !== 'godentist-fb-ig'" src/lib/agents/engine/v3-production-runner.ts
```

Output: `1`

**Result:** [x] PASS — compound check at line ~597 covers both agents. VAL tag side-effect fires for the sibling. Pitfall 6 mitigated.

---

## Verification 10 — Regla 3 grep (no createAdminClient leak)

Goal: the sibling MUST go through the domain layer for all DB access. Direct imports of `createAdminClient` or `@supabase/supabase-js` violate Regla 3.

```bash
grep -rn 'createAdminClient\|@supabase/supabase-js' src/lib/agents/godentist-fb-ig/ | grep -v '//'
```

Output: empty (grep exit code 1 → 0 matches).

**Result:** [x] PASS — 0 leaks. Regla 3 honored across the entire sibling module.

---

## Verification 11 — Migration row count match (production)

**Reference:** `07-APPLY-EVIDENCE.md` §Verificacion 3.

```sql
SELECT
  (SELECT COUNT(*) FROM agent_templates WHERE agent_id = 'godentist' AND workspace_id IS NULL) AS godentist_count,
  (SELECT COUNT(*) FROM agent_templates WHERE agent_id = 'godentist-fb-ig') AS sibling_count;
```

Output (recorded in 07-APPLY-EVIDENCE.md):
```
[ { "godentist_count": 79, "sibling_count": 79 } ]
```

`godentist_count = 79`
`sibling_count   = 79`

**Result:** [x] PASS — equal (79 = 79). Migration cloned the catalog with the expected row count.

---

## Verification 12 — Saludo D-05 verbatim (production)

**Reference:** `07-APPLY-EVIDENCE.md` §Verificacion 2.

Saludo content (intent=`saludo`, priority=`CORE`, agent_id=`godentist-fb-ig`):
> "👋 ¡Hola! Soy goBot 🤖 de godentist ®️. ... 🔒 Al compartir tus datos, autorizas su tratamiento conforme a la Ley 1581 de 2011 (Habeas Data). ..."

Required content markers (locked verbatim per CONTEXT.md D-05):
- "goBot": [x] SI
- "Habeas Data": [x] SI
- "Ley 1581": [x] SI

**Result:** [x] PASS — D-05 saludo verbatim aplicado en production.

---

## Smoke 1 — Dropdown del routing-editor (CRITICAL)

**URL tested:** Vercel deployment at `morfx.app/agentes/routing/editor` (production deploy of commit `ce793dc`).
**Workspace:** GoDentist Valoraciones (`f0241182-f79b-4bc6-b0ed-b5f6eb20c514`).

**Verificacion:**
- Dropdown muestra `GoDentist Valoraciones — FB/IG`: [x] SI

**Confirmed by:** user (in chat at end of Plan 08 Wave 6 checkpoint).

**What this validates:**
1. Vercel deploy succeeded and the deployed bundle includes the sibling module.
2. `agentRegistry.register(godentistFbIgConfig)` executed in browser bundle (self-register on import works).
3. `AGENT_CATALOG` entry is wired correctly.
4. Side-effect import in `routing/editor/page.tsx` correctly pulls the sibling module into the editor's bundle.
5. `agentRegistry.list()` returns the sibling alongside existing agents.

**Result:** [x] PASS

---

## Smoke 4 — Anti-regresion godentist (D-04 intact)

Goal: confirm zero modifications to `src/lib/agents/godentist/**` across the entire sibling lineage.

```bash
# First sibling commit
FIRST_SIBLING_COMMIT=$(git log --reverse --format=%H -- src/lib/agents/godentist-fb-ig/ | head -1)
# = 1f76a4de67ece1f297dfe9acd5cb20420f7338c9

PRE_SIBLING=$(git rev-parse "${FIRST_SIBLING_COMMIT}^")
# = e83eb0e4b73209319120f185234555594cc932c4

git diff "$PRE_SIBLING" HEAD --name-only -- 'src/lib/agents/godentist/' | sort -u
```

Output: empty (no files listed).

```bash
git diff "$PRE_SIBLING" HEAD --stat -- 'src/lib/agents/godentist/'
```

Output: empty (no stats — no files changed).

**Conclusion:** 0 archivos del godentist original modificados durante el standalone. The sibling work is entirely additive at `src/lib/agents/godentist-fb-ig/` plus 5 registration sites that extend (not replace) existing agent dispatch logic.

**Result:** [x] PASS — D-04 honored. Original godentist agent intact. Regla 6 (proteger agente en produccion) satisfied without ceremony.

---

## Smoke 2 + 3 — E2E manual mensajes reales FB/IG

**Status:** DEFERIDO al usuario (D-18 — el equipo no mantiene script automatizado contra Meta APIs por costo + flakiness).

**Activacion previa requerida:**
1. Usuario crea routing rule manual en `/agentes/routing/editor` (SQL pre-formado en `09-ROUTING-RULE-USER-ACTION.md` y en `agent-scope.md`).
2. Usuario manda mensaje real desde su perfil personal a la pagina FB / perfil IG del workspace target.

**Smoke 2 (saludo D-05):** Bot responde con texto que contiene `goBot 🤖` + `Habeas Data` + `Ley 1581`. Este es el saludo lead-capture; debería llegar antes de que el cliente envíe cualquier dato.

**Smoke 3 (lead capture happy path):** Cliente envía "Juan Perez, 3001234567" en turn 1 → bot responde con `pedir_datos_parcial` + `{{campos_faltantes}}` interpolado pidiendo "Sede de tu preferencia" (ya tiene nombre + celular, falta sede crítica).

**Verificacion alternativa via observability post-activacion:**
- `agent_observability_events` debe mostrar `agent='godentist-fb-ig'` + event `pipeline_decision.lead_capture_triggered` (turn 1, intent=`datos`, slots con nombre+telefono detectados, missing=['sede_preferida']).
- `agent_observability_events` debe mostrar `agent='godentist-fb-ig'` (NO `'godentist'`) — anti-Pitfall 1 confirmation.

**Status:** [ ] PENDING USER (post-activacion).

---

## Decision agregada

| # | Verification | Status |
|---|--------------|--------|
| 1 | TypeScript compile (sibling scope) | [x] PASS |
| 2 | Sibling test suite (93/93) | [x] PASS |
| 3 | Existing routing tests (98/98 no regression) | [x] PASS |
| 4 | Anti-regression D-08 grep (0 matches) | [x] PASS |
| 5 | Self-register grep (1 match) | [x] PASS |
| 6 | Pre-warm grep (2 matches) | [x] PASS |
| 7 | Catalog entry grep (1 match) | [x] PASS |
| 8 | agentModule union grep (1 match) | [x] PASS |
| 9 | VAL tag check compound (1 match) | [x] PASS |
| 10 | Regla 3 grep (0 leaks) | [x] PASS |
| 11 | Migration row count (79 = 79) | [x] PASS |
| 12 | Saludo D-05 verbatim | [x] PASS |
| Smoke 1 | Dropdown routing-editor | [x] PASS (user-confirmed) |
| Smoke 4 | Anti-regresion godentist (D-04) | [x] PASS |
| Smoke 2 | E2E saludo D-05 (FB/IG) | [ ] DEFERRED to user (D-18) |
| Smoke 3 | E2E lead-capture happy path (FB/IG) | [ ] DEFERRED to user (D-18) |

**Aggregate:** 14/14 automatable gates PASS. Smoke 2/3 deferred to user per D-18 (manual E2E with real Meta channel messages — out of scope for the engineering team's verification surface).

- [x] **Wave 7 PASS — standalone SHIPPED.**
- [ ] Wave 7 BLOCKER — n/a.

The sibling code is deployed in production, the catalog migration is applied, all source-level gates verify clean. The only remaining action is the user creating the routing rule manually (D-15) to direct FB/IG traffic to the sibling — at which point Smoke 2/3 become live.

---

*Authored: 2026-05-05*
*Wave 7 Plan 09 Task 1 — verification report*
