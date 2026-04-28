---
phase: somnio-sales-v3-pw-confirmation
plan: 04
status: complete
wave: 2
completed: 2026-04-27
---

# Plan 04 SUMMARY — Wave 2 Constants Module

## Decision agregada
**GO** — `constants.ts` creado con todos los exports requeridos. UUIDs hardcoded literalmente del 01-SNAPSHOT.md. Typecheck limpio. NO push (per Regla del orchestrator standalone — Wave 0..6 quedan locales hasta Plan 13).

## Commit
- `02ebc84` — `feat(somnio-sales-v3-pw-confirmation): add constants.ts (intents, stage UUIDs, keywords, action-template map, shipping fields)` — 1 archivo, +377 lineas.

## Archivo creado
`src/lib/agents/somnio-pw-confirmation/constants.ts` — **377 lineas** (excede el min_lines=80 del plan).

## 5 Stage UUIDs hardcoded (Open Q7 resuelto)

Copiados verbatim de `.planning/standalone/somnio-sales-v3-pw-confirmation/01-SNAPSHOT.md` §Stage UUIDs locked:

| Constante                          | UUID                                     | Stage name           | Position | Rol                                    |
|------------------------------------|------------------------------------------|----------------------|----------|----------------------------------------|
| `PW_CONFIRMATION_STAGES.PIPELINE_ID`     | `a0ebcb1e-d79a-4588-a569-d2bcef23e6b8` | Ventas Somnio Standard | —        | Pipeline ID                            |
| `PW_CONFIRMATION_STAGES.NUEVO_PAG_WEB`   | `42da9d61-6c00-4317-9fd9-2cec9113bd38` | NUEVO PAG WEB        | 1        | Entry stage (D-04)                     |
| `PW_CONFIRMATION_STAGES.FALTA_INFO`      | `05c1f783-8d5a-492d-86c2-c660e8e23332` | FALTA INFO           | 3        | Entry stage (D-04, datos faltantes)    |
| `PW_CONFIRMATION_STAGES.FALTA_CONFIRMAR` | `e0cf8ecf-1e8c-46bc-bc57-f5580bfb12bd` | FALTA CONFIRMAR      | 4        | Entry stage + parking "espera" (D-14)  |
| `PW_CONFIRMATION_STAGES.CONFIRMADO`      | `4770a36e-5feb-4eec-a71c-75d54cb2797c` | CONFIRMADO           | 5        | Estado terminal del agente (D-28)      |

Tambien exportado `ENTRY_STAGE_NAMES = ['NUEVO PAG WEB', 'FALTA INFO', 'FALTA CONFIRMAR']` para routing rule fact `activeOrderStageRaw`.

## Sets / arrays exportados (count)

| Export                       | Tipo                | Count | Notas                                                                |
|------------------------------|---------------------|-------|----------------------------------------------------------------------|
| `PW_CONFIRMATION_INTENTS`    | `ReadonlySet<string>` | 22    | 14 informacionales + 7 sales + 1 fallback                          |
| `INFORMATIONAL_INTENTS`      | `ReadonlySet<string>` | 14    | clones de sales-v3 + tiempo_entrega alto-nivel + registro_sanitario |
| `SALES_INTENTS`              | `ReadonlySet<string>` | 7     | confirmar_pedido, cancelar_pedido, esperar, cambiar_direccion, editar_items, agendar, pedir_humano |
| `ESCAPE_INTENTS`             | `ReadonlySet<string>` | 1     | pedir_humano (escala directo a humano)                              |
| `INITIAL_AWAITING_STATES`    | `readonly string[]`   | 2     | guard del "si" (D-26)                                                |
| `SHIPPING_REQUIRED_FIELDS`   | `readonly string[]`   | 6     | nombre, apellido, telefono, shippingAddress, shippingCity, shippingDepartment (D-06 + RESEARCH §D.3) |
| `AFFIRMATIVE_KEYWORDS`       | `readonly string[]`   | 23    | si, dale, ok, confirmo, perfecto, etc. + emoji 👍 ✅                 |
| `NEGATIVE_KEYWORDS`          | `readonly string[]`   | 14    | no, cancelar, no me interesa, etc. + emoji ❌                        |
| `WAIT_KEYWORDS`              | `readonly string[]`   | 19    | espera, lo pienso, despues, manana, etc.                             |
| `ADDRESS_CHANGE_KEYWORDS`    | `readonly string[]`   | 17    | cambiar direccion, otra direccion, mejor a, mudar, etc.              |
| `ITEMS_CHANGE_KEYWORDS`      | `readonly string[]`   | 11    | agregar/quitar producto, cambiar cantidad, editar pedido             |
| `HUMAN_HANDOFF_KEYWORDS`     | `readonly string[]`   | 12    | asesor, humano, persona, reclamo, queja, devolucion                  |
| `ENTRY_STAGE_NAMES`          | `readonly string[]`   | 3     | string-match para routing rule fact                                  |

## ACTION_TEMPLATE_MAP (9 TipoAccion)

| TipoAccion                       | Templates emitidos                                                | Notas                                                                                              |
|----------------------------------|-------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| `confirmar_compra`               | `['confirmacion_orden_same_day', 'confirmacion_orden_transportadora']` | response-track Plan 07 elige zone-specific dinamicamente (patron recompra response-track:301-302) |
| `pedir_datos_envio`              | `['pedir_datos_post_compra']`                                     | D-12 — campos faltantes interpolados                                                              |
| `actualizar_direccion`           | `[]`                                                              | Decision deferida Plan 06/07 (reusar `direccion_entrega` workspace-level vs texto natural)        |
| `editar_items`                   | `[]`                                                              | V1 → handoff silencioso (D-13 deferred)                                                            |
| `cancelar_con_agendar_pregunta`  | `['agendar_pregunta']`                                            | D-11 — 1er "no" pregunta agendar futuro                                                            |
| `cancelar_definitivo`            | `[]`                                                              | D-11 — 2do "no" → handoff silencioso                                                               |
| `mover_a_falta_confirmar`        | `['claro_que_si_esperamos']`                                      | D-14 — "espera lo pienso" → mover stage + acuse                                                   |
| `handoff`                        | `[]`                                                              | D-21 — engine retorna `messages: []` (patron somnio-v3 engine-v3.ts:101)                          |
| `noop`                           | `[]`                                                              | Ignorar turn                                                                                       |

**Templates eliminados post-checkpoint Plan 02** (verificacion grep negativa pasada):
- ❌ `confirmar_direccion_post_compra` — redundante con `direccion_entrega` (template productivo workspace-level pre-activacion)
- ❌ `cancelado_handoff` — handoff es silencioso
- ❌ `error_carga_pedido` — mismo patron silencioso

## Otras constantes exportadas

| Export                                | Valor                                            | Consumo                                  |
|---------------------------------------|--------------------------------------------------|------------------------------------------|
| `TEMPLATE_LOOKUP_AGENT_ID`            | `'somnio-sales-v3-pw-confirmation'`              | response-track Plan 07 (TemplateManager) |
| `SOMNIO_PW_CONFIRMATION_AGENT_ID`     | re-export de `./config`                          | self-consistency                         |
| `LOW_CONFIDENCE_THRESHOLD`            | `80` (porcentaje, alineado recompra/v3)          | sales-track Plan 08 fallback             |
| `READER_TIMEOUT_MS`                   | `25_000` (D-05 bloqueante)                       | Inngest function Plan 09                 |
| `INNGEST_EVENT_PRELOAD_AND_INVOKE`    | `'pw-confirmation/preload-and-invoke'`           | webhook-processor Plan 09 + function     |

## Type exports

- `ShippingFieldName = (typeof SHIPPING_REQUIRED_FIELDS)[number]` — union literal de los 6 campos.

## Imports del archivo

ZERO imports a otros modulos del proyecto. Solo:
- `import { SOMNIO_PW_CONFIRMATION_AGENT_ID } from './config'` (mismo modulo del agente)
- `import type { TipoAccion } from './types'` (mismo modulo del agente)

Patron anti-circular dependencies clonado de `somnio-recompra/constants.ts` (line 1-3 comment).

## Typecheck

```
$ npx tsc --noEmit 2>&1 | wc -l
0

$ npx tsc --noEmit 2>&1 | grep -E "src/lib/agents/somnio-pw-confirmation"
(no output)
```

**0 errores TS** introducidos por `constants.ts`. EXIT=0 limpio.

## Verify checklist (acceptance_criteria del Plan 04)

- [x] `constants.ts` existe con >=80 lineas (377 lineas).
- [x] `PW_CONFIRMATION_STAGES` con 5 UUIDs literales (formato 8-4-4-4-12 hex con guiones).
- [x] NO existen placeholders `<<PEGAR>>` sin reemplazar (`grep -F "<<PEGAR" → 0`).
- [x] Sets `PW_CONFIRMATION_INTENTS`, `INFORMATIONAL_INTENTS`, `SALES_INTENTS` exportados.
- [x] `INFORMATIONAL_INTENTS` incluye `'registro_sanitario'` (D-27).
- [x] `SHIPPING_REQUIRED_FIELDS` array de 6 strings (`nombre`, `apellido`, `telefono`, `shippingAddress`, `shippingCity`, `shippingDepartment`).
- [x] `INITIAL_AWAITING_STATES` array con 2 strings (`awaiting_confirmation`, `awaiting_confirmation_post_data_capture`).
- [x] `ACTION_TEMPLATE_MAP` cubre las 9 TipoAccion del types.ts (Plan 03).
- [x] Keywords arrays definidos (afirmativo, negativo, espera, cambio direccion, items, humano).
- [x] `READER_TIMEOUT_MS = 25_000` exportado.
- [x] `INNGEST_EVENT_PRELOAD_AND_INVOKE = 'pw-confirmation/preload-and-invoke'` exportado.
- [x] typecheck OK.
- [x] Commit atomico (`02ebc84`), NO pusheado.

## Desviaciones del plan template

1. **`ACTION_TEMPLATE_MAP` ajustado per critical_context_from_plan_02_checkpoint del prompt:**
   - El plan original (PLAN.md line 252-262) referenciaba `confirmar_direccion_post_compra`, `cancelado_handoff` que fueron ELIMINADOS del catalog post-checkpoint Plan 02.
   - **Adaptacion (Rule 1 fix):** mapear `actualizar_direccion`, `editar_items`, `cancelar_definitivo`, `handoff` a `[]` (arrays vacios) — handoff es silencioso, decision direccion deferida Plan 06/07.
   - `confirmar_compra` mapea a AMBOS `['confirmacion_orden_same_day', 'confirmacion_orden_transportadora']` para que response-track Plan 07 elija zone-specific (patron recompra response-track:301-302).

2. **Imports permitidos del propio modulo del agente:**
   - El plan dice "ZERO imports from other project files" en el comment de constants pero TAMBIEN el plan permite `import { SOMNIO_PW_CONFIRMATION_AGENT_ID } from './config'` y `import type { TipoAccion } from './types'` (interfaces section).
   - Coherencia: ZERO imports a OTROS modulos del proyecto, pero SI imports al propio modulo del agente. Mismo patron usado por somnio-recompra/somnio-v3.

3. **Concurrencia con Plan 05 worktree:**
   - Durante el commit de constants.ts (`02ebc84`), un agente paralelo en `.claude/worktrees/` commito Plan 05 (`03c87a9` — comprehension-schema.ts) usando el mismo branch `main`. Esto causo un blip donde mi `constants.ts` quedo unstaged temporalmente. Re-staged y commiteado limpio. Sin perdida de datos.

## Self-Check

- [x] Archivo `src/lib/agents/somnio-pw-confirmation/constants.ts` existe (377 lineas, 13 KB).
- [x] Commit `02ebc84` existe en `git log` con mensaje `feat(somnio-sales-v3-pw-confirmation): add constants.ts...`.
- [x] `git ls-files src/lib/agents/somnio-pw-confirmation/constants.ts` listo (tracked).
- [x] 5 UUIDs literal-hardcoded match Plan 01 SNAPSHOT exactly.
- [x] ZERO references a templates eliminados (`confirmar_direccion_post_compra`, `cancelado_handoff`, `error_carga_pedido`).
- [x] typecheck limpio (0 errores).
- [x] NO push a origin (verificado: `origin/main` queda en commit anterior, mi branch local esta 12 commits adelante).

**Self-Check: PASSED**

## Implicancias para Plans subsiguientes

### Plan 05 (comprehension Zod schema, ya commit `03c87a9` por worktree paralela)
- Plan 05 expone `PW_INTENT_VALUES` como source of truth del enum de intents Zod. Si Plan 05 difiere del set en `PW_CONFIRMATION_INTENTS`, ajustar este file (uno reusa al otro o se mantienen sincronizados manualmente — decidir en Plan 06).

### Plan 06 (state.ts + transitions.ts)
- Importa: `PW_CONFIRMATION_STAGES`, `INITIAL_AWAITING_STATES`, `SHIPPING_REQUIRED_FIELDS`, `AFFIRMATIVE_KEYWORDS`, `NEGATIVE_KEYWORDS`, `WAIT_KEYWORDS`, `ADDRESS_CHANGE_KEYWORDS`, `ITEMS_CHANGE_KEYWORDS`, `HUMAN_HANDOFF_KEYWORDS`.
- Implementa `shippingComplete(order, fields = SHIPPING_REQUIRED_FIELDS): boolean`.

### Plan 07 (response-track.ts)
- Importa: `TEMPLATE_LOOKUP_AGENT_ID`, `INFORMATIONAL_INTENTS`, `ACTION_TEMPLATE_MAP`.
- Para `salesAction='confirmar_compra'` → leer ambos templates del map y elegir zone-specific dinamicamente per `crm_context.zone` (clone exacto recompra response-track:301-302).
- Para `salesAction='handoff' | 'cancelar_definitivo' | 'editar_items'` → `[]` → return `{ messages: [] }` (silent handoff).
- Para `salesAction='actualizar_direccion'` → `[]` → decidir aqui en Plan 07 si emitir `direccion_entrega` (template workspace-level, agent_id NULL) o texto natural.

### Plan 08 (sales-track.ts)
- Importa: `PW_CONFIRMATION_STAGES`, `LOW_CONFIDENCE_THRESHOLD`, `SALES_INTENTS`, `ESCAPE_INTENTS`.
- `moveOrderToStage(orderId, PW_CONFIRMATION_STAGES.CONFIRMADO)` — terminal del agente (D-28).
- `moveOrderToStage(orderId, PW_CONFIRMATION_STAGES.FALTA_CONFIRMAR)` — para D-14 mover_a_falta_confirmar.

### Plan 09 (Inngest function preload-and-invoke)
- Importa: `READER_TIMEOUT_MS`, `INNGEST_EVENT_PRELOAD_AND_INVOKE`.
- AbortController inner timeout = `READER_TIMEOUT_MS` (25s).

### Plan 10 (crm-writer-adapter)
- Importa: `PW_CONFIRMATION_STAGES`, `SHIPPING_REQUIRED_FIELDS`.
- Validar shipping completo antes de mover a CONFIRMADO.
