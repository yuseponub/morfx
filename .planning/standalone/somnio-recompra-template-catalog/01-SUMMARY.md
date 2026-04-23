---
plan: 01
phase: somnio-recompra-template-catalog
status: complete
completed: 2026-04-23
wave: 0
---

# Plan 01 SUMMARY — Audit D-11 + Snapshot + Migration file

## Outcome

Scope redefinido tras audit empirico. Los 3 templates del plan original
(saludo / preguntar_direccion_recompra / registro_sanitario) ya existen en
prod con copy equivalente o mejor — NO se tocan. Los gaps reales en prod
son 3 intents distintos (contraindicaciones + tiempo_entrega_1_3_days +
tiempo_entrega_2_4_days) que esta fase cierra.

## Commits

- `9088fc9` — feat(somnio-recompra-template-catalog): Plan 01 Task 1+2 — audit D-11 + snapshot + gaps migration

## Artefactos creados

- `.planning/standalone/somnio-recompra-template-catalog/01-audit.sql` — queries reusables (audit + snapshot JSON).
- `.planning/standalone/somnio-recompra-template-catalog/01-SNAPSHOT.md` — snapshot verbatim pre-migracion (34 filas bajo `agent_id='somnio-recompra-v1'`) + analisis D-11 + hallazgos.
- `supabase/migrations/20260423142420_recompra_template_catalog_gaps.sql` — SQL idempotente con 4 INSERTs (2 contraindicaciones + 1 tiempo_entrega_1_3_days + 1 tiempo_entrega_2_4_days) + GRANTs defensivos.

## Audit D-11 — resultado

| metric | value |
|--------|-------|
| Intents esperados | 22 |
| Intents con `rows_found = 0` (BLOCKER resuelto en esta fase) | 3 |
| Intents con `rows_found >= 1` (OK) | 19 |

Detalle 3 gaps:
- `contraindicaciones` — afecta cualquier cliente preguntando por contraindicaciones.
- `tiempo_entrega_1_3_days` — afecta ciudades zona 1-3 dias.
- `tiempo_entrega_2_4_days` — afecta ciudades zona DEFAULT (desconocidas) — impacto MASIVO.

## Hallazgos adicionales (no estaban en CONTEXT.md D-11)

- Templates YA existen en prod con copy equivalente o mejor:
  - `saludo` orden=0 CORE `{{nombre_saludo}} 😊` (identico a D-03).
  - `saludo` orden=1 COMPLEMENTARIA imagen ELIXIR (URL correcta; caption `SUENO` sin ñ — encoding, WhatsApp lo renderiza ok).
  - `preguntar_direccion_recompra` orden=0 CORE con copy MEJOR que D-12 (incluye `{{nombre_saludo}}` + pin 📍).
  - `registro_sanitario` orden=0 CORE con copy FDA/BDE NUTRITION. El gap D-06 es solo de codigo (Plan 02 lo agrega a `INFORMATIONAL_INTENTS`).
- Templates huerfanos (no consumidos por codigo): `tiempo_entrega_remote`, `tiempo_entrega_standard`, `efectos`, `fallback`. Fuera de scope.

## Copy aprobado por el usuario (D-10 checkpoint)

Timestamp: 2026-04-23 (America/Bogota).
Quote: "ok dale" (aprobacion explicita post-review de los 4 rows).

Fuente del copy: verbatim desde migraciones sales-v3 originales:
- contraindicaciones: `supabase/migrations/20260206000001_seed_somnio_templates.sql:174-175`
- tiempo_entrega_1_3_days: `supabase/migrations/20260317200001_tiempo_entrega_templates.sql:27-28`
- tiempo_entrega_2_4_days: `supabase/migrations/20260317200001_tiempo_entrega_templates.sql:31-32`

## Regla 5 respetada

Migracion NO aplicada en prod en este plan. Se aplica en Plan 05 Task 1
ANTES del push de codigo de Plans 02/03/04.

## Next

- Wave 1: Plans 02 + 03 en paralelo.
  - Plan 02: `response-track.ts` (TEMPLATE_LOOKUP_AGENT_ID -> recompra-v1 + direccion_completa concat con departamento + export resolveSalesActionTemplates) + `constants.ts` (agrega `'registro_sanitario'` a `INFORMATIONAL_INTENTS` — cierra D-06).
  - Plan 03: `transitions.ts` (remove saludo entry, quiero_comprar -> preguntar_direccion action).
