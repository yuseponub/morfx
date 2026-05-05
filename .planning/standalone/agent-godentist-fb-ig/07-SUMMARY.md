---
phase: agent-godentist-fb-ig
plan: 07
subsystem: agents/godentist-fb-ig + supabase/migrations
tags: [migration, sql, template-catalog, godentist-fb-ig, regla-5, blocking, wave-5, sibling-agent]

dependency_graph:
  requires:
    - "Plan 01 audit baseline: 79 godentist templates, workspace_id IS NULL, 100% content_type='texto' (01-SNAPSHOT.md Q-A)"
    - "Plan 06 tests passing (93/93) — Wave 4 anti-regression D-08 cubierto antes de tocar prod DB"
    - "Supabase production DB acceso (usuario aplica via SQL Editor — Regla 5 BLOCKING)"
    - "godentist source catalog en agent_templates (workspace_id IS NULL, agent_id='godentist')"
  provides:
    - "79 rows en agent_templates con agent_id='godentist-fb-ig' (workspace_id NULL — catalog global)"
    - "Saludo CORE D-05 verbatim aplicado (lead-capture con goBot + Habeas Data + Ley 1581)"
    - "Idempotency guard verificada: re-runable sin errores (DELETE-first inside BEGIN/COMMIT)"
    - "Plan 08 push UNBLOCKED — `templateManager.getTemplatesForIntents('godentist-fb-ig', ...)` retornara templates reales"
  affects:
    - "Plan 08 (Wave 6 push del codigo + integration routing-editor) — ahora puede pushear sin riesgo de empty Map fallback"
    - "Plan 09 (Wave 7 routing rule manual) — el sibling tiene catalog completo en prod, listo para ser activado"
    - "Anti-Pitfall 1 (cdc06d9 regression godentist↔somnio shared catalog) — aislamiento DB confirmado"

tech_stack:
  added:
    - "supabase/migrations/20260505220000_godentist_fb_ig_template_catalog.sql (130 LOC, INSERT...SELECT con CASE + 2 DO blocks sanity check)"
  patterns:
    - "Idempotent migration: BEGIN; DELETE; INSERT; DO; DO; COMMIT; — re-runable sin errores"
    - "INSERT...SELECT con CASE WHEN para content swap inline (single-pass, atomic, no separate UPDATE)"
    - "Sanity check DO blocks con RAISE EXCEPTION → rollback automatico si counts no match o D-05 missing"
    - "Patron sibling clonado de somnio-sales-v3-pw-confirmation/13-DEPLOY-NOTES.md (Regla 5 manual apply via Supabase Editor)"

key_files:
  created:
    - path: "supabase/migrations/20260505220000_godentist_fb_ig_template_catalog.sql"
      content: "Migration SQL idempotente: clona 79 templates godentist a agent_id='godentist-fb-ig' con saludo CORE reemplazado por D-05 verbatim (lead-capture + Habeas Data inline). 2 sanity checks DO blocks: (1) row count godentist == sibling, (2) saludo CORE contains 'goBot' + 'Habeas Data'."
    - path: ".planning/standalone/agent-godentist-fb-ig/07-APPLY-EVIDENCE.md"
      content: "Evidencia post-apply: 3 verificaciones SELECT verbatim del usuario en produccion. sibling_total=79, saludo D-05 verbatim con goBot+Habeas Data+Ley 1581, godentist_count=sibling_count=79. Decision agregada: Wave 5 PASA, Plan 08 UNBLOCKED."
  modified: []

decisions:
  - "Filename timestamp = `20260505220000` (day-of execute 2026-05-05, 22:00 UTC slot)."
  - "Workspace_id NULL en INSERT (catalog global) — el sibling solo se activa via routing rule manual del Plan 09 en workspace target `f0241182-f79b-4bc6-b0ed-b5f6eb20c514`. La separacion logica esta en routing, NO en agent_templates."
  - "Idempotency via DELETE-first dentro de BEGIN/COMMIT — atomico, re-runable, rollback automatico si los DO blocks raise EXCEPTION."
  - "D-05 saludo encoded con `\\Uxxxxxxxx` PostgreSQL escape sequences en E'...' string literal — preserva emojis 👋 🤖 🦷 ✨ 📌 🔒 💙 byte-perfect."
  - "Sanity check 1 (row count) usa LIKE '%goBot%' AND LIKE '%Habeas Data%' (no exact-match) — robusto a whitespace/encoding variations entre PostgreSQL y editor."
  - "NO push del Plan 07 commit — Plan 08 hace el push collective (Regla 5: SQL apply en prod ANTES del push)."

metrics:
  duration: "~70 min total (Task 1 SQL author + commit ~30 min, Task 2 user apply + 3 verifications + evidence doc ~40 min spanning user-action wait)"
  completed_date: "2026-05-05"
  rows_cloned: 79
  rows_in_godentist_baseline: 79
  rows_with_d05_saludo: 1
  d05_markers_verified: 6  # goBot, Habeas Data, Ley 1581, valoración GRATIS, 📌 Nombre completo, 📌 Celular
  sanity_checks_passed: 2  # DO block 1 (row count) + DO block 2 (D-05 content)
  user_verifications_passed: 3  # sibling_total, saludo verbatim, godentist=sibling
  commits_local: 2  # SQL file + APPLY-EVIDENCE
  pushes: 0  # Regla 5: Plan 08 hace el push
---

# Phase agent-godentist-fb-ig Plan 07 Summary: Wave 5 — Migration SQL apply

## One-liner

Migration SQL idempotente clona 79 templates de `agent_id='godentist'` a `agent_id='godentist-fb-ig'` con saludo CORE reemplazado por D-05 verbatim (lead-capture + Habeas Data); aplicada manualmente en produccion via Supabase SQL Editor (Regla 5 BLOCKING) con 3 verificaciones SELECT post-apply confirmando 79=79 row count match + saludo D-05 verbatim presente; Plan 08 push UNBLOCKED.

## Commits

| Task | Hash      | Type | Files                                                                                | Notes                                       |
| ---- | --------- | ---- | ------------------------------------------------------------------------------------ | ------------------------------------------- |
| 1    | `ba4b300` | feat | `supabase/migrations/20260505220000_godentist_fb_ig_template_catalog.sql`           | Migration SQL author + local commit (no push) |
| 2    | (this)    | docs | `.planning/standalone/agent-godentist-fb-ig/07-APPLY-EVIDENCE.md` + `07-SUMMARY.md` | Apply evidence + plan summary               |

**Total:** 2 commits, 1 SQL file + 2 docs files. NO push (Plan 08 owns the collective push).

## Migration File

**Path:** `supabase/migrations/20260505220000_godentist_fb_ig_template_catalog.sql`
**Size:** 130 LOC
**Pattern:**

```sql
BEGIN;

-- Idempotent: clean slate
DELETE FROM agent_templates WHERE agent_id = 'godentist-fb-ig';

-- Clone all templates from godentist with single content swap for saludo CORE
INSERT INTO agent_templates (...)
SELECT
  gen_random_uuid(),
  'godentist-fb-ig',
  workspace_id,
  intent, visit_type, priority, orden, content_type,
  CASE
    WHEN intent = 'saludo' AND priority = 'CORE' THEN
      E'\U0001F44B ¡Hola! Soy goBot \U0001F916 de godentist ®️.\n\n...'  -- D-05 verbatim
    ELSE content
  END,
  delay_s
FROM agent_templates
WHERE agent_id = 'godentist' AND workspace_id IS NULL;

-- Sanity check 1: row count godentist == sibling (RAISE EXCEPTION if mismatch)
DO $$ ... END $$;

-- Sanity check 2: saludo CORE contains 'goBot' + 'Habeas Data' (RAISE EXCEPTION if missing)
DO $$ ... END $$;

COMMIT;
```

## Apply Evidence

**Apply environment:** Supabase production (proyecto morfx prod, SQL Editor manual UI).
**Apply date:** 2026-05-05 (America/Bogota).
**Apply result:** `Success. No rows returned` (transaction COMMIT'd, ningun RAISE EXCEPTION).

### Sanity Checks (DO blocks)

Las RAISE NOTICE de los DO blocks no se renderizan en el panel de Supabase Dashboard (UI limitation — no NOTICE channel display). Pero la non-emision de RAISE EXCEPTION confirma que ambos sanity checks pasaron:

| Sanity Check | Mecanismo                                                  | Verdict |
| ------------ | ---------------------------------------------------------- | ------- |
| 1. Row count match | `IF sibling_count != godentist_count THEN RAISE EXCEPTION` | [x] PASS (transaccion no abortó) |
| 2. D-05 saludo content | `IF NOT (content LIKE '%goBot%' AND %Habeas Data%) THEN RAISE EXCEPTION` | [x] PASS (transaccion no abortó) |

### Verificaciones Post-Apply (3 SELECTs por el usuario)

#### Verificacion 1 — total row count

```json
[ { "sibling_total": 79 } ]
```

✓ **Match con Q-A baseline (01-SNAPSHOT.md): 79 = 79.**

#### Verificacion 2 — saludo D-05 verbatim

```json
[
  {
    "id": "3a7099d0-af89-45c7-9712-32bfd67711ad",
    "intent": "saludo",
    "priority": "CORE",
    "orden": 0,
    "content": "👋 ¡Hola! Soy goBot 🤖 de godentist ®️.\n\nTu valoración odontológica es totalmente GRATIS 🦷✨\nDéjanos estos datos y reservamos tu cita de inmediato:\n\n📌 Nombre completo\n📌 Celular\n\n🔒 Al compartir tus datos, autorizas su tratamiento conforme a la Ley 1581 de 2011 (Habeas Data).\n\nEstás a un paso de comenzar tu nueva sonrisa 💙 ¿Deseas agendar tu cita de valoración GRATIS?"
  }
]
```

**Primera linea del content:** `👋 ¡Hola! Soy goBot 🤖 de godentist ®️.`
**Ultima linea del content:** `Estás a un paso de comenzar tu nueva sonrisa 💙 ¿Deseas agendar tu cita de valoración GRATIS?`

D-05 markers verificados:
- [x] `goBot`
- [x] `Habeas Data`
- [x] `Ley 1581`
- [x] `valoración GRATIS`
- [x] Lead-capture pattern (`📌 Nombre completo` + `📌 Celular`)
- [x] Emojis preservados byte-perfect (👋 🤖 🦷 ✨ 📌 🔒 💙)

#### Verificacion 3 — comparison

```json
[ { "godentist_count": 79, "sibling_count": 79 } ]
```

✓ **godentist NO fue tocado (sigue con 79 rows propios). Sibling tiene 79 rows propios. Catalog independence (D-08) confirmado.**

## Decision Aggregada

| Check                            | Output                          | Verdict |
| -------------------------------- | ------------------------------- | ------- |
| sibling_total                    | 79                              | [x] matches baseline |
| saludo D-05 verbatim             | goBot + Habeas Data + Ley 1581 + lead-capture | [x] D-05 applied verbatim |
| godentist_count = sibling_count  | 79 = 79                         | [x] no row drops, no extras, godentist untouched |

**Wave 5 PASA. Plan 08 push UNBLOCKED.**

## Regla 5 (CLAUDE.md) Compliance

> TODA migracion de base de datos DEBE aplicarse en produccion ANTES de pushear codigo que la usa.

| Step | Cumplido |
| ---- | -------- |
| 1. Crear archivo de migracion en `supabase/migrations/` | [x] Task 1 commit `ba4b300` |
| 2. PAUSAR — pedir al usuario que aplique la migracion en produccion | [x] Task 2 checkpoint return previous executor |
| 3. ESPERAR confirmacion explicita del usuario | [x] Usuario respondio "migration aplicada" + 3 outputs JSON verbatim |
| 4. Solo entonces pushear el codigo que depende del nuevo schema | [x] Plan 08 (push) ahora UNBLOCKED — esta plan no hizo push |

**Patron clonado de somnio-sales-v3-pw-confirmation/13-DEPLOY-NOTES.md (2026-04-28):** SQL apply via Supabase SQL Editor manual + PAUSE + push posterior. Mismo handshake, mismo Regla 5 compliance.

## Anti-Pitfall 1 Verification (cdc06d9 regression guard)

El bug `cdc06d9` (revertido en somnio-recompra-v1) introducia un fallback de `TEMPLATE_LOOKUP_AGENT_ID` que filtraba un agent_id distinto al esperado en lookup → catalog cross-contamination. La defensa contra esta regresion vive en 3 capas:

1. **DB layer (this Plan 07):** sibling tiene su propio set de 79 rows con `agent_id='godentist-fb-ig'` independientes de godentist (verificado por Verificacion 3 — godentist sigue con 79 rows propios, sibling tiene otros 79 propios).
2. **Code layer (Plans 02-05, Wave 1-3):** `GODENTIST_FB_IG_AGENT_ID` constant locked en sibling module — no fallback a godentist.
3. **Test layer (Plan 06, Wave 4):** anti-regression D-08 con 6 asserts (3 positive + 3 negative) en `response-track.test.ts` + 5 asserts E2E.

Defense in depth confirmada.

## Deviations from Plan

None — plan executed exactly as written. Sequence:

1. Task 1 (SQL author + local commit) — completed by previous executor (commit `ba4b300`).
2. Task 2 checkpoint (`human-action`) — previous executor STOPPED correctly. User applied SQL in production via Supabase SQL Editor.
3. User responded "migration aplicada" + 3 SELECT outputs verbatim. This executor (resume) created `07-APPLY-EVIDENCE.md` + `07-SUMMARY.md` per plan output spec.

No auto-fixes triggered. No deviation rules applied. No pre-existing issues blocked execution.

## Notes

- **Standalone phase, not numbered phase:** STATE.md / ROADMAP.md updates skipped (not applicable to standalone phases). REQUIREMENTS.md `GFB-03` mark-complete also skipped (no REQUIREMENTS.md present in standalone). Compliance with skipping documented in execute-plan.md (standalone-aware).
- **Push deferred to Plan 08:** local commits stay un-pushed. Plan 08 owns the collective push of: SQL migration commit `ba4b300` + Plan 07 docs commit + Plan 08 code commits. This satisfies Regla 5 (SQL applied in prod BEFORE code push).
- **Idempotency proved by design:** the `DELETE FROM agent_templates WHERE agent_id = 'godentist-fb-ig'` inside BEGIN/COMMIT means re-running the migration is safe — clean slate every time, atomic.
- **Workspace isolation:** sibling templates have `workspace_id IS NULL` (catalog global). Activation per-workspace happens via routing rule (Plan 09 manual user action) in workspace target `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` (GoDentist Valoraciones).

## Status

- [x] Migration SQL file created with idempotency guard + 2 sanity checks
- [x] User applied SQL in production via Supabase SQL Editor (`Success. No rows returned`)
- [x] Verification 1 PASS — sibling_total=79
- [x] Verification 2 PASS — saludo D-05 verbatim with goBot + Habeas Data + Ley 1581 + lead-capture
- [x] Verification 3 PASS — godentist_count=sibling_count=79 (godentist catalog untouched)
- [x] Apply evidence documented in `07-APPLY-EVIDENCE.md`
- [x] Plan summary documented in this file
- [x] Local commits atomic (`ba4b300` + this Task 2 commit)
- [x] NO push (Plan 08 owns the collective push)
- [x] Regla 5 (CLAUDE.md) honored: SQL applied in prod BEFORE code push

**Plan 08 (Wave 6 — code push + routing-editor integration) UNBLOCKED.**

## Self-Check: PASSED

Verified:
- [x] `supabase/migrations/20260505220000_godentist_fb_ig_template_catalog.sql` exists (Task 1, commit `ba4b300`)
- [x] `.planning/standalone/agent-godentist-fb-ig/07-APPLY-EVIDENCE.md` exists (Task 2)
- [x] `.planning/standalone/agent-godentist-fb-ig/07-SUMMARY.md` exists (this file)
- [x] `git log --oneline | grep ba4b300` → present (Task 1 SQL commit)
- [x] User-provided 3 SELECT outputs JSON verbatim recorded in `07-APPLY-EVIDENCE.md`
- [x] Aggregate decision documented: 3/3 PASS, Wave 5 closed, Plan 08 UNBLOCKED
- [x] Regla 5 compliance documented (4-step workflow honored)
- [x] No push (Plan 08 owns push)
