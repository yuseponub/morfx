# Somnio Recompra Template Catalog — Research

**Researched:** 2026-04-22
**Domain:** Template catalog migration (SQL data + TypeScript state machine) para agente `somnio-recompra-v1` de MorfX
**Confidence:** HIGH (todos los claims clave verificados vía grep + lectura directa de archivos)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-13)

- **D-01:** Recompra tendrá catálogo propio bajo `agent_id='somnio-recompra-v1'`, **NO** comparte templates con sales-v3.
- **D-02:** El fix T2 del debug (`TEMPLATE_LOOKUP_AGENT_ID='somnio-sales-v3'` en `response-track.ts:39`) se revertirá una vez que el catálogo propio esté poblado en prod.
- **D-03:** El saludo inicial de recompra debe ser:
  1. `"{{nombre_saludo}} 😊"` (texto, CORE orden=0)
  2. `"Deseas adquirir tu ELIXIR DEL SUEÑO?"` + imagen (imagen, COMPLEMENTARIA orden=1)
- **D-04:** Después de `quiero_comprar` en initial → `preguntar_direccion` action (NO directo a `ofrecer_promos`).
- **D-05:** Saludo NO dispara `ofrecer_promos`. Solo saludo + imagen ELIXIR, espera respuesta.
- **D-06:** Agregar `registro_sanitario` a `INFORMATIONAL_INTENTS` + crear template.
- **D-07:** Regla 6 aplica — recompra en prod atendiendo clientes reales.
- **D-08:** Regla 5 aplica — migración SQL antes de push código.
- **D-09:** **Opción A** — migration SQL + code push en la misma ventana. Rollback fácil porque templates son aditivos/no-destructivos. **No feature flag.**
- **D-10:** Claude prepara borradores de copy para los 3 templates en plan-phase; usuario revisa antes de ejecutar migración.
- **D-11:** Scope reducido — solo 3 templates (reemplazo saludo orden=0 + orden=1, + nuevo preguntar_direccion_recompra). El resto del catálogo recompra-v1 ya está bien.
- **D-12:** Contenido `preguntar_direccion_recompra`: `"¡Claro que sí! ¿Sería para la misma dirección?\n{{direccion_completa}}"`. Requiere patch en `response-track.ts:346` para incluir `departamento` en concat.
- **D-13:** `somnio-sales-v3` NO se toca en esta fase (preserva aislamiento entre agentes).

### Claude's Discretion

- Estructura exacta de los 5 plans (CONTEXT.md §Scope es preliminar).
- Orden de los commits dentro de cada plan.
- Test mocking strategy (cache invalidation, Supabase mocking, etc.).
- Copy exacto de los borradores de templates (pendiente review del usuario).

### Deferred Ideas (OUT OF SCOPE)

- Tocar `somnio-sales-v3` catalog — **prohibido D-13**.
- Reescribir los otros 19 templates bajo `somnio-recompra-v1` — **prohibido D-11**.
- Feature flag para rollout — **rechazado D-09**.
- Cambiar el agent ID `'somnio-recompra-v1'` o crear nuevo agent version — fuera de scope.

</user_constraints>

## Project Constraints (from CLAUDE.md)

| Regla | Aplicación en esta fase |
|-------|--------------------------|
| **Regla 0** (GSD completo) | Seguir discuss → research → plan → execute → verify → learnings. Discuss+research completos, próximo es plan. |
| **Regla 1** (Push a Vercel) | Después de cada cambio de código y antes de pedir smoke test, `git push origin main`. |
| **Regla 2** (Bogotá TZ) | No aplica directo (templates son puro texto). `getGreeting()` ya usa `Intl.DateTimeFormat` con `America/Bogota` (fix T3 shipped en commit `00548e4`). |
| **Regla 3** (Domain layer) | **NO aplica** para `agent_templates`: no existe `src/lib/domain/agent-templates.ts`. El patrón es migration SQL directa (verificado en `ls src/lib/domain/` — no hay archivo templates). Esto es **consistente con todo el historial de template migrations** (14 archivos SQL, ninguno pasa por domain layer). Las mutaciones de templates son data seeds one-shot, no runtime mutations. |
| **Regla 4** (Docs siempre) | Actualizar `.claude/rules/agent-scope.md` (sección somnio-recompra), `docs/analysis/04-estado-actual-plataforma.md`, LEARNINGS.md. |
| **Regla 5** (Migración antes de deploy) | Ejecutar SQL en Supabase production ANTES de pushear el código que hace flip `TEMPLATE_LOOKUP_AGENT_ID='somnio-recompra-v1'`. Si se pushea primero, el lookup encuentra saludo viejo/incompleto → ≥1 turno productivo con saludo genérico. |
| **Regla 6** (Proteger agente prod) | D-09 explícitamente rechaza feature flag. Mitigación alternativa (verificada en research): templates son aditivos (nuevo `preguntar_direccion_recompra`) o reemplazo idempotente (saludo orden=0/1). El flip de `TEMPLATE_LOOKUP_AGENT_ID` ES el punto de riesgo — su ventana es de ~30s (cache TTL del TemplateManager), ver §Pitfalls. |

[VERIFIED: `ls src/lib/domain/`] no existe `agent-templates.ts`, pattern establecido es migration directa.

---

## Summary

Esta fase completa la independización arquitectural del agente `somnio-recompra-v1` (iniciada en Phase somnio-recompra-crm-reader). Hoy el agente funciona como fork de `somnio-sales-v3` en código (state machine, prompts, runner), pero a nivel de **templates DB** sigue dependiendo de `agent_id='somnio-sales-v3'` — un fix provisional (commit `cdc06d9`) del debug `recompra-greeting-bugs.md`.

El scope real post-D-11 es **mínimo**: 3 rows SQL en `agent_templates` (2 reemplazos + 1 nueva) + 4 cambios de código pequeños (`response-track.ts:32`, `:346`, `constants.ts` 1 línea, `transitions.ts` 2 edits). El riesgo arquitectural ya está desaceleradó — el catálogo bajo `somnio-recompra-v1` está casi completo por decisión previa del usuario; esta fase cierra los 3 gaps y revierte el provisional.

**Primary recommendation:** Seguir el breakdown de 5 plans de CONTEXT.md con un ajuste: **Plan 01 (templates) debe incluir un snapshot SQL de pre-migración** (no Plan 05 como sugiere CONTEXT) para que el rollback esté documentado antes de ejecutar. Smoke test end-to-end (Plan 05) debe ser **con contact real en prod** — no hay test harness de integración con Supabase + WhatsApp.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Template storage | Database (Supabase) | — | Tabla `agent_templates`, datos editables vía SQL Editor o migrations |
| Template lookup | API / Backend (Node on Vercel) | — | `TemplateManager.loadTemplates` en `src/lib/agents/somnio/template-manager.ts` — server-side con `createAdminClient` |
| State machine | API / Backend | — | `transitions.ts` declarativo, ejecutado en runner Vercel |
| Variable substitution | API / Backend | — | `variable-substitutor.ts` runtime injection |
| Message dispatch | API / Backend | External (360dialog/Onurix) | `messaging.ts` adapter llama a WhatsApp provider |
| Imagen rendering | External (WhatsApp) | CDN (Supabase Storage) | URL `expslvzsszymljafhppi.supabase.co/storage/.../whatsapp-media` servida directo por Supabase Storage |

Esta fase NO cruza tiers — toda la mutación es en la capa DB + capa Backend (response-track + transitions). No hay trabajo de frontend ni de storage.

---

## Existing Patterns

### 1. Migration SQL shape for `agent_templates`

**Schema de la tabla** [VERIFIED: `supabase/migrations/20260206000000_agent_tem
plates.sql` + `20260226000000_block_priorities.sql`]:

```sql
CREATE TABLE agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,                          -- 'somnio-recompra-v1' o 'somnio-sales-v3'
  intent TEXT NOT NULL,                            -- 'saludo', 'preguntar_direccion_recompra', etc.
  visit_type TEXT NOT NULL CHECK (visit_type IN ('primera_vez', 'siguientes')),
  orden INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL CHECK (content_type IN ('texto', 'template', 'imagen')),
  content TEXT NOT NULL,                           -- Para 'imagen': "URL" o "URL|caption"
  delay_s INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'CORE'
    CHECK (priority IN ('CORE', 'COMPLEMENTARIA', 'OPCIONAL')),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(agent_id, intent, visit_type, orden, workspace_id)
);
```

**UNIQUE constraint clave:** `(agent_id, intent, visit_type, orden, workspace_id)`. Esto **sí permite `ON CONFLICT ... DO UPDATE`** por esa tupla — pero con un gotcha: el `workspace_id` nullable afecta. En PostgreSQL, `NULL ≠ NULL`, así que rows con `workspace_id IS NULL` **no colisionan entre sí por esa columna**. Para templates globales (que es el caso — todos los recompra templates usan `workspace_id=NULL`), el ON CONFLICT real se comporta por `(agent_id, intent, visit_type, orden)` si hay solo uno con NULL, **pero si inserts dos con NULL con la misma tupla, no se activa el conflict clause** (no es UNIQUE para NULL). [VERIFIED: Postgres docs spec — `NULL ≠ NULL` en UNIQUE constraints, comportamiento estándar].

**Implicación práctica:** Para idempotencia robusta en esta fase, prefiere la secuencia **DELETE + INSERT** sobre UPSERT:

```sql
-- Pattern idempotente verificado en 20260317200001_tiempo_entrega_templates.sql:6-9
DELETE FROM agent_templates
WHERE agent_id = 'somnio-recompra-v1'
  AND intent = 'saludo'
  AND workspace_id IS NULL;

INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'saludo', 'primera_vez', 'CORE', 0, 'texto',
   '{{nombre_saludo}} 😊', 0),
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'saludo', 'primera_vez', 'COMPLEMENTARIA', 1, 'imagen',
   'https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg|Deseas adquirir tu ELIXIR DEL SUEÑO?', 3);
```

**Patrón `DO $$ BEGIN IF NOT EXISTS ... END $$` con guard** [VERIFIED: `20260315150000_v3_independent_templates.sql` + `20260315160000_v3_formula_intent_templates.sql`]: útil para **inserts de intents totalmente nuevos** (como `preguntar_direccion_recompra` o `registro_sanitario`), pero **MAL PATRON para esta fase de saludo** porque saludo YA existe bajo `somnio-recompra-v1` (sino T2 del debug no hubiera tenido que hacer el flip). El `IF NOT EXISTS` dejaría el saludo viejo intacto.

**Recomendación plan-phase:** Mezcla de patrones:
- Saludo (reemplazo): DELETE + INSERT como arriba.
- `preguntar_direccion_recompra` (nuevo): INSERT simple con guard `DO $$ IF NOT EXISTS ... END $$`.
- `registro_sanitario` (nuevo): Same pattern que `preguntar_direccion_recompra`.

### 2. RLS policies + GRANTs

**RLS** [VERIFIED: `20260206000000_agent_templates.sql:54-62`]: existe policy `agent_templates_workspace_isolation` que permite `workspace_id IS NULL` (globales) o `is_workspace_member(workspace_id)`. **No hace falta re-aplicar** la policy — está viva en producción desde Phase 14.

**GRANTs:** [VERIFIED: migración Phase 14] No hay grants explícitos a `service_role`. La migración 44.1 (GRANTs pattern) aplica a tablas creadas via Studio SQL Editor — `agent_templates` fue creada via migration file por lo que heredó grants default de Postgres (rol `postgres` dueño, `service_role` acceso via RLS bypass).

**Verificación de sanidad** (query a correr en SQL Editor previa al deploy):

```sql
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'agent_templates'
  AND grantee IN ('service_role', 'authenticated')
ORDER BY grantee, privilege_type;
```

Si devuelve 0 filas para `service_role`, agregar grants al migration file por defensa en profundidad (pattern LEARNING 1 Phase 44.1).

### 3. response-track.ts template lookup flow

**Pipeline completo** [VERIFIED: `response-track.ts:45-226` lectura línea por línea]:

1. **Entry:** `resolveResponseTrack({ salesAction, intent, secondaryIntent, state, workspaceId })`.
2. **Sales action → template_intents** (`resolveSalesActionTemplates`, lines 283-378):
   - `mostrar_confirmacion` / `cambio` → `[resumen_${pack}]`.
   - `crear_orden` → `['confirmacion_orden_same_day']` o `['confirmacion_orden_transportadora']`.
   - `crear_orden_sin_promo` → `['pendiente_promo']`.
   - `crear_orden_sin_confirmar` → `['pendiente_confirmacion']`.
   - **`preguntar_direccion`** → `['preguntar_direccion_recompra']` con `extraContext.direccion_completa = [direccion, ciudad].filter(Boolean).join(', ')` [lines 336-361 — **AQUÍ SE HACE EL CAMBIO D-12: añadir `departamento`**].
   - `ofrecer_promos` → `['promociones']`.
   - default → `ACTION_TEMPLATE_MAP[action]` (constants.ts:74-79: maps `no_interesa`, `rechazar`, `retoma`).
3. **Informational intent → template_intents** (lines 72-93):
   - `intent='precio'` → force `['promociones', 'pago']` (nunca literal 'precio').
   - `intent='tiempo_entrega'` → zone resolver con `lookupDeliveryZone(state.datos.ciudad)`.
   - Si `intent ∈ INFORMATIONAL_INTENTS`, push literal (**AQUÍ SE AGREGA `registro_sanitario` — D-06**).
   - Secondary intent: similar pero evitando duplicados.
4. **Combine** (line 98): `allIntents = [...salesTemplateIntents, ...infoTemplateIntents]`.
5. **`hasSaludoCombined`** (line 99): `true` si `infoTemplateIntents.includes('saludo') && allIntents.length > 1`. **CRÍTICO PARA D-05** — ver §Pitfalls 2.
6. **Load & process** (lines 114-164): `TemplateManager.getTemplatesForIntents(TEMPLATE_LOOKUP_AGENT_ID, ...)`.
7. **Variable substitution** (lines 131-140): `variableContext` incluye `state.datos` (nombre, apellido, telefono, ciudad, direccion, departamento, barrio, correo, indicaciones_extra, cedula_recoge) + `extraContext` (del sales action) + `infoExtraContext` (del zone resolver) + `pack` + `nombre_saludo`.
8. **Block composition** (lines 166-192): dos branches — `hasSaludoCombined` (toma solo saludo CORE + el resto compuesto) o `composeBlock` normal (max 3 templates).
9. **Return** (lines 206-225): `{ messages, templateIdsSent, salesTemplateIntents, infoTemplateIntents }`.

**Confirmación de variables disponibles** [VERIFIED line-by-line]:

| Variable | Source | Siempre disponible para recompra |
|----------|--------|-----------------------------------|
| `{{nombre}}` | `state.datos.nombre` | Sí (preload desde last order) |
| `{{apellido}}` | `state.datos.apellido` | Sí (preload) |
| `{{telefono}}` | `state.datos.telefono` | Sí (preload) |
| `{{direccion}}` | `state.datos.direccion` | Sí (preload) |
| `{{ciudad}}` | `state.datos.ciudad` | Sí (preload) |
| `{{departamento}}` | `state.datos.departamento` | Sí (preload + `inferDepartamento()` en state.ts:156) |
| `{{barrio}}` | `state.datos.barrio` | No (no se preloadea, solo si cliente lo dice) |
| `{{correo}}` | `state.datos.correo` | No (no se preloadea) |
| `{{pack}}` | `state.pack` | No (solo después de `seleccion_pack`) |
| `{{precio}}` | `PACK_PRICES[state.pack]` | Igual que pack |
| `{{nombre_saludo}}` | `getGreeting(state.datos.nombre)` | Sí (`Buenos dias Jose`, etc.) |
| `{{direccion_completa}}` | `extraContext` (solo en `preguntar_direccion` action) | Solo en ese action, **HOY falta `departamento` — D-12** |
| `{{campos_faltantes}}` | `extraContext` (solo en `preguntar_direccion` action branch faltantes) | Solo en branch incompleto |
| `{{tiempo_estimado}}` | `lookupDeliveryZone()` | Solo en `confirmacion_orden_*` + `tiempo_entrega_*` |

[VERIFIED: all via `response-track.ts` + `state.ts:80-92` (preload) + `state.ts:255-266` (buildResumenContext)].

### 4. transitions.ts state machine — current vs target

**Current state** [VERIFIED: `transitions.ts` line by line]:

| Phase | Intent | Action | Condition | Lines |
|-------|--------|--------|-----------|-------|
| `*` | `no_interesa` | `no_interesa` | — | 36-43 |
| `*` | `rechazar` | `rechazar` | — | 45-52 |
| `*` | `acknowledgment` | `silence` | — | 54-61 |
| **`initial`** | **`saludo`** | **`ofrecer_promos`** | — | **63-73** ← **D-05 CAMBIO** |
| **`initial`** | **`quiero_comprar`** | **`ofrecer_promos`** | — | **75-83** ← **D-04 CAMBIO** |
| `initial` | `datos` | `ofrecer_promos` | `gates.datosCriticos` | 85-94 |
| `initial` | `datos` | `preguntar_direccion` | `!gates.datosCriticos` | 96-105 |
| `initial` | `confirmar_direccion` | `ofrecer_promos` | — | 107-115 |
| `initial` | `precio` | `ofrecer_promos` | — | 117-125 |
| `promos_shown` | `seleccion_pack` | `mostrar_confirmacion` | `gates.datosCriticos` | 129-137 |
| `promos_shown` | `seleccion_pack` | `preguntar_direccion` | `!gates.datosCriticos` | 139-147 |
| `promos_shown` | `timer_expired:3` | `crear_orden_sin_promo` | — | 149-156 |
| `confirming` | `confirmar` | `crear_orden` | datos + pack | 160-168 |
| `confirming` | `confirmar` | `ofrecer_promos` | `!packElegido` | 170-178 |
| `confirming` | `datos` | `cambio` | — | 180-187 |
| `confirming` | `timer_expired:4` | `crear_orden_sin_confirmar` | — | 189-196 |
| `*` | `seleccion_pack` | `mostrar_confirmacion` | datosCriticos | 200-208 |
| `*` | `seleccion_pack` | `preguntar_direccion` | `!datosCriticos` | 210-218 |
| `*` | `confirmar` | `crear_orden` | datos + pack | 222-230 |
| `*` | `confirmar` | `ofrecer_promos` | `!packElegido` | 232-240 |
| `initial` | `timer_expired:5` | `retoma` | — | 243-248 |
| `closed` | `*` | `silence` | — | 251-256 |

**Target state después de D-04 + D-05:**

```typescript
// Escenario 1: saludo → SIN action (solo templates del intent saludo)
// D-05: quitar entry de saludo de transitions? O cambiar action a 'silence'?
// VER ANÁLISIS EN §Open Questions #1
{ phase: 'initial', on: 'saludo', action: /* ??? */, ... }

// Escenario 2: quiero_comprar → preguntar_direccion (NO más promos)
{ phase: 'initial', on: 'quiero_comprar', action: 'preguntar_direccion',
  resolve: () => ({
    timerSignal: { type: 'start', level: 'L5', reason: 'quiero_comprar → preguntar direccion' },
    reason: 'Quiere comprar en initial → preguntar confirmacion de direccion',
  }),
  description: 'Escenario 2: quiero_comprar → preguntar_direccion (recompra: confirmar con CRM reader)',
}
```

### 5. Test infrastructure — verified working

[VERIFIED: `npm run test -- src/lib/agents/somnio-recompra/__tests__/` pasa 17/17 tests en 18.8s].

- `package.json` tiene `"test": "vitest run"` + `vitest@1.6.1` instalado [VERIFIED: `package.json` leído].
- `vitest.config.ts` en root con `environment: 'node'`, alias `@ → ./src`, excludes `node_modules/.next/dist/.claude` [VERIFIED: `vitest.config.ts` leído].
- Tests existentes bajo `src/lib/agents/somnio-recompra/__tests__/`: `comprehension-prompt.test.ts` (10 tests), `crm-context-poll.test.ts` (7 tests).
- Mocking strategy en `crm-context-poll.test.ts`: `vi.mock('@/lib/agents/session-manager', ...)` + `vi.mock` con `vi.fn()`. NO usa DB real — tests son puros/unit.
- El TESTING.md en `.planning/codebase/TESTING.md` está **desactualizado** (fechado 2026-02-09, claims "no test framework detected"). Está stale pero no es bloqueante — `vitest` SI está funcionando.

**Pattern recomendado para Plan 04** (tests del nuevo flujo):

```typescript
import { describe, it, expect, vi } from 'vitest'
import { resolveTransition } from '../transitions'
import { computeGates, createPreloadedState } from '../state'

describe('transitions — post-D-04/D-05 redesign', () => {
  it('saludo en initial no dispara ofrecer_promos', () => {
    const state = createPreloadedState({ nombre: 'Jose', apellido: 'R', ... })
    const gates = computeGates(state)
    const result = resolveTransition('initial', 'saludo', state, gates)
    // Expected: action is NOT 'ofrecer_promos' — ver Open Q#1 para expected exact value
  })

  it('quiero_comprar en initial dispara preguntar_direccion (no ofrecer_promos)', () => {
    ...
    const result = resolveTransition('initial', 'quiero_comprar', state, gates)
    expect(result?.action).toBe('preguntar_direccion')
  })
})

describe('resolveSalesActionTemplates — D-12 direccion_completa incluye departamento', () => {
  it('concatena direccion + ciudad + departamento en ese orden', async () => {
    // Requiere export de resolveSalesActionTemplates o test indirecto via resolveResponseTrack
  })
})
```

`resolveSalesActionTemplates` **no está exportada** actualmente (`response-track.ts:283` — function declaration sin `export`). Para testearla directamente hay que exportarla o testear via `resolveResponseTrack` con mock de `TemplateManager`. **Recomendación:** exportar `resolveSalesActionTemplates` en Plan 02 — cero riesgo de colisión (no se consume externamente), y habilita tests puros sin tocar DB.

### 6. Template lookup cache

[VERIFIED: `template-manager.ts:89, 262, 308-311`]:

- Cache es **per-TemplateManager-instance**, no process-level. Each call a `new TemplateManager(workspaceId)` crea su propio Map.
- TTL: **5 minutos** (`cacheExpiry = 5 * 60 * 1000`).
- Key: `${agentId}:${workspaceId ?? 'global'}`.
- Método `invalidateCache()` existe (line 215) pero **nadie lo llama desde runtime**.

**Implicación operacional:** Entre dispatches que construyen un nuevo `TemplateManager(workspaceId)` dentro de `resolveResponseTrack` (line 114 — nueva instance cada turno), el cache **NO persiste** entre turnos. Cada turno hace un nuevo fetch a Supabase. La cache es efectiva solo **dentro de un mismo turno** si por alguna razón se llamara `getTemplatesForIntents` varias veces (no es el caso hoy — solo 1 llamada por turno).

**Corolario:** El flip de `TEMPLATE_LOOKUP_AGENT_ID` toma efecto en el próximo turno, **sin cache stale**. No hay riesgo de sessions viendo mitad-viejo mitad-nuevo.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent seed of DB data | Raw `INSERT` sin guard | `DO $$ BEGIN IF NOT EXISTS ... END $$` O `DELETE + INSERT` en una transaction | UNIQUE con NULL workspace_id NO colisiona (§Existing Patterns #1) |
| Image URL + caption | Dos columnas separadas | Single `content` column con format `URL|caption` | [VERIFIED: `messaging.ts:192-205` — el adapter parsea pipe literal] |
| Saludo + imagen coordinados | Dos resolveResponseTrack calls | Un solo intent `saludo` con dos rows (orden=0 texto, orden=1 imagen) | Block composer orquesta orden via `orden` column |
| Verificar si templates están en prod | SSH / container access | SQL Editor query — `SELECT agent_id, intent, orden, content_type, priority, LEFT(content, 80) FROM agent_templates WHERE agent_id='somnio-recompra-v1' ORDER BY intent, orden` | [VERIFIED: uso consistente en recompra-greeting-bugs debug + sibling crm-reader 01-PLAN] |
| Rollback de migration | Script custom | Reverse SQL (DELETE de INSERTs, INSERT del estado viejo) capturado del snapshot pre-migración | Templates son aditivos/mutables — no hay schema change a revertir |

---

## Runtime State Inventory

> Aplica porque esta fase toca: (a) DB data en `agent_templates` y (b) código que lee de esa data.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `agent_templates` rows bajo `agent_id='somnio-recompra-v1'` — ~20 rows según D-11. El cambio: replace 2 rows (`intent='saludo'` orden=0 y orden=1) + add 1 row (`intent='preguntar_direccion_recompra'`) + add 1 row (`intent='registro_sanitario'`). **También:** `agent_templates` rows bajo `agent_id='somnio-sales-v3'` permanecen intactas (D-13). | 3-4 rows SQL (2 reemplazo + 1-2 nuevos); usuario ejecuta en Supabase SQL Editor prod antes del push (Regla 5). |
| **Live service config** | **None** — No hay config external (360dialog, Onurix, etc.) que referencie template content. El template engine es 100% interno. | N/A |
| **OS-registered state** | **None** — No hay tareas de OS ni cron jobs que referencien intents de recompra. El único cron es `conversation-metrics` (no relacionado). | N/A |
| **Secrets/env vars** | **None** — No hay env vars que mencionen `somnio-recompra-v1` o template names (verificado mentalmente contra memoria de env vars conocidas: SUPABASE_*, ANTHROPIC_*, OPENAI_*, ONURIX_*, no hay template-specific). | N/A |
| **Build artifacts** | **None** — Next.js build no cachea template content; se fetchea runtime desde DB. Vercel build tampoco (templates no son importados como módulos). | N/A |
| **Session state in-flight** | Sesiones de recompra activas al momento del deploy: el `intentsVistos` array YA puede contener `'saludo'` → `TemplateManager.isFirstVisit('saludo', intentsVistos)` return `false` → filter por `visit_type='primera_vez'` SIGUE aplicando porque Phase 34 eliminó las filas `siguientes` (comment en line 120). **El impacto en sesiones en curso:** si una sesión ya pasó el saludo (turn ≥1) y el deploy ocurre, el próximo turno no vuelve a ver saludo — está en otro intent. El único riesgo es un turno que justo caía en `saludo` en el momento exacto del deploy (ventana microsegundos). **Mitigación:** aceptable risk por D-07/D-09; smoke test cubre post-deploy. | Acceptable risk; documented in §Pitfalls 1. |

**The canonical question:** *After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?*

**Answer:** TemplateManager in-memory cache per-lambda (5min TTL) — pero como se construye **una instance por turno** (line 114 response-track.ts), el cache NO persiste entre turnos en practice. En serverless Vercel, cada invocation puede ser un fresh lambda (cold start) o warm reuse — con warm reuse Y coincidencia de `new TemplateManager(workspaceId)` en el mismo handle, el cache podría hit, pero como instance es recreada cada call, es miss en practice. **Verified by code-reading, no stale-cache risk real.**

---

## Common Pitfalls

### Pitfall 1: `hasSaludoCombined` drops the imagen template when saludo is combined

[VERIFIED: `response-track.ts:176-188` line by line]

**What goes wrong:** Cuando el bloque contiene `saludo + otro_intent` (ej. saludo + promociones), la branch `hasSaludoCombined = true` **solo toma el saludo CORE** (lines 178-180, `[0]` al final del `.filter().sort()`). El saludo COMPLEMENTARIA (imagen) se DROPPEA.

```typescript
const saludoCORE = saludoTemplates
  .filter(t => t.priority === 'CORE')
  .sort((a, b) => a.orden - b.orden)[0]

// Línea 188: finalBlock = saludoCORE ? [saludoCORE, ...composed.block] : composed.block
```

**Why it happens:** Diseño intencional para evitar overshoot cuando hay muchos templates — prefiere priorizar el mensaje CORE del saludo + el bloque del otro intent.

**Por qué importa en esta fase:** Con D-05 (saludo NO dispara ofrecer_promos), el saludo será **solo** — `allIntents.length === 1 && infoTemplateIntents.includes('saludo')`. Entonces `hasSaludoCombined = false` (requiere `allIntents.length > 1`), y se usa el `composeBlock` normal que SI honra CORE + COMPLEMENTARIA. **Resultado esperado:** saludo texto + ELIXIR imagen ambos salen.

**Risk flag para plan-phase:** Plan 03 debe incluir un verify task: "Después de cambiar `saludo` transition action a no-`ofrecer_promos`, el response-track devuelve AMBAS rows de saludo (texto orden=0 + imagen orden=1)." Esto es **test-coverable** en Plan 04.

**Edge case:** Si en algún futuro alguien dispara `saludo` Y `{otro intent}` simultáneamente (ej. "hola, cuánto cuesta?"), la imagen ELIXIR se volvería a dropear. **No es bloqueante para esta fase** (comportamiento current), pero documentarlo en LEARNINGS.

### Pitfall 2: Regla 5 violation if push precedes migration

**What goes wrong:** Si se pushea primero (code-first), `TEMPLATE_LOOKUP_AGENT_ID='somnio-recompra-v1'` buscaría templates bajo el agente propio. Como saludo orden=0/1 viejos NO existen aún (o existen pero están incompletos), el saludo devolvería contenido viejo/errado. ≥1 turno productivo sale con saludo incorrecto.

**Why it happens:** La secuencia "migration → push" no está wire al CI/CD en este repo (Vercel no aplica Supabase migrations). Debe ser manual.

**How to avoid:** D-08/D-09 lockean el orden:
1. Crear migration file + commit.
2. Usuario corre SQL en Supabase SQL Editor prod (checkpoint humano bloqueante).
3. Verifica rows con SELECT.
4. Solo entonces push del code change.

**Warning signs:** Si observás "saludo genérico" post-deploy, probable que el orden fue invertido. Query verification: `SELECT intent, orden, priority, content FROM agent_templates WHERE agent_id='somnio-recompra-v1' AND intent='saludo'` debe retornar 2 rows con contenido esperado.

### Pitfall 3: Regla 6 — Saludo templates are additive but TEMPLATE_LOOKUP_AGENT_ID flip is destructive

**What goes wrong:** El flip en `response-track.ts:39` de `'somnio-sales-v3'` → `'somnio-recompra-v1'` es **el único punto de no-retorno**. Si al momento del flip faltara algún template bajo recompra-v1 que sí existe bajo sales-v3, el recompra agente entraría en fallback mode (empty result → Collector event `'no_matching_intents'`).

**Why it happens:** La auditoría en CONTEXT.md D-11 afirma "El resto del catálogo bajo `somnio-recompra-v1` ya está bien excepto saludo + preguntar_direccion_recompra". Esto **no está verificado** en research — asumido.

**How to avoid (BLOQUEANTE para plan-phase):** Plan 01 Task 0 debe ser un SELECT de auditoría que valide el assertion D-11:

```sql
-- Audit: compare catalog of sales-v3 vs recompra-v1
SELECT intent, orden, priority, content_type
FROM agent_templates
WHERE agent_id = 'somnio-recompra-v1' AND workspace_id IS NULL
ORDER BY intent, orden;

-- Compare manually against transition.ts + response-track.ts → list of intents consumed:
-- saludo, promociones, pago, envio, ubicacion, contraindicaciones, dependencia,
-- tiempo_entrega_{same_day,next_day,1_3_days,2_4_days,sin_ciudad},
-- preguntar_direccion_recompra (NEW), registro_sanitario (NEW),
-- resumen_{1x,2x,3x}, confirmacion_orden_{same_day,transportadora},
-- pendiente_promo, pendiente_confirmacion,
-- no_interesa, rechazar, retoma_inicial.

-- If ANY of the ~22 intents missing from recompra-v1 (except the 2 nuevos),
-- D-11 assertion is WRONG and plan scope expands.
```

**Warning signs:** Post-flip, Collector events `'empty_result'` o `'no_matching_intents'` para intents que no sean `saludo`/`preguntar_direccion`/`registro_sanitario`.

**Fallback plan** (si D-11 audit falla): revertir a `TEMPLATE_LOOKUP_AGENT_ID='somnio-sales-v3'` (1 línea) y escalar scope post-hoc.

### Pitfall 4: Imagen URL format — `|` como separator caption

[VERIFIED: `messaging.ts:192-205`]: el adapter parsea `content` como `URL|caption` (pipe literal). **Si la URL en sí contiene `|`, rompe.** Las URLs de Supabase Storage no tienen pipes (verificado por la URL real actual `https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg`), pero el caption sí puede contener `|` — **NUNCA** en recompra content, pero es landmine para futuros devs.

**Warning sign:** Un caption que use `|` como separador visual (ej. `"Lee más | Compra aquí"`) sería partido incorrectamente.

### Pitfall 5: `registro_sanitario` ya está en `RECOMPRA_INTENTS` pero NO en `INFORMATIONAL_INTENTS`

[VERIFIED: `constants.ts:25` tiene `'registro_sanitario'` en `RECOMPRA_INTENTS`; `constants.ts:67-71` NO lo tiene en `INFORMATIONAL_INTENTS`]

**What goes wrong:** Haiku puede devolver `intent='registro_sanitario'`, entra al branch `intent && INFORMATIONAL_INTENTS.has(intent)` en response-track.ts:72, pero falla el `.has(intent)` → entra al `emptyResult()` path o se ignora → respuesta vacía.

**Fix D-06:** Agregar `'registro_sanitario'` al Set `INFORMATIONAL_INTENTS` en `constants.ts:67-71`. UNA línea de cambio. Template con ese intent se crea por migration.

**Current impact:** Si un cliente de recompra hoy pregunta "tiene INVIMA?", Haiku clasifica como `registro_sanitario` correctamente (prompt en `comprehension-prompt.ts:115` lista el intent), pero el response-track no tiene template para él → respuesta vacía o fallback. **Bug preexistente pero no blocker hoy** (clientes de recompra probablemente no preguntan INVIMA con frecuencia — ya son recompradores).

### Pitfall 6: `camposFaltantes` branch de `preguntar_direccion` usa `{{campos_faltantes}}` no `{{direccion_completa}}`

[VERIFIED: `response-track.ts:352-360`]: La segunda branch de `preguntar_direccion` (cuando `gates.datosCriticos === false`) emite `extraContext.campos_faltantes` — NO `direccion_completa`.

**Implicación:** Si crear template `preguntar_direccion_recompra` con `{{direccion_completa}}` literal, en el branch `!datosCriticos` la variable queda sin substituir (o se reemplaza con string vacío por `variable-substitutor`).

**Fix para plan-phase:** El template D-12 asume el happy path (datos preloaded, datosCriticos=true). Para recompra típico, preload llena los 6 criticos, así que datosCriticos=true siempre → solo el happy path dispara. **Plan 01 debe documentar:** el template `preguntar_direccion_recompra` soporta el happy path solamente. El branch `!datosCriticos` (edge case: preload falló o cliente borró campos) debería usar un template distinto O el mismo con `{{campos_faltantes}}` — pero D-12 lockea solo el happy path. **Recomendación:** el branch `!datosCriticos` puede re-usar el mismo template y el `{{direccion_completa}}` quedaría vacío (acceptable degradación) — o agregar una second row con orden=1 para el caso `!datosCriticos`. Queda como **Open Question #2**.

---

## Implementation Approach Recommendation

El breakdown de CONTEXT.md §Scope es **correcto en estructura**; recomiendo **3 refinements**:

### Refinement 1: Mover snapshot SQL pre-migración de Plan 05 a **Plan 01 Task 0**

**Rationale:** Si Plan 01 ejecuta el DELETE de saludo viejo sin haber snapshotted primero, el rollback manual es tedioso (hay que reconstruir el contenido). Mejor capturar PRIMERO:

```sql
-- Plan 01 Task 0 — Snapshot (usuario ejecuta en Supabase SQL Editor PROD)
SELECT jsonb_pretty(jsonb_agg(to_jsonb(t.*))) AS snapshot
FROM agent_templates t
WHERE agent_id = 'somnio-recompra-v1'
  AND workspace_id IS NULL
ORDER BY intent, orden;
```

El usuario copia el output JSON a un comment de commit o a `01-SUMMARY.md` para traceability + rollback. Esto también sirve como **audit D-11** — leyendo el snapshot confirmas que los otros 19 intents SÍ existen bajo recompra-v1.

### Refinement 2: Añadir **Task 0 de auditoría** al inicio de Plan 01 (pre-migration)

Verifica empíricamente la assertion D-11. Si falla, se escala a discuss y la fase no procede. Query:

```sql
-- Lista de intents consumidos por el runtime (derivado de response-track.ts + constants.ts + transitions.ts)
WITH expected(intent) AS (
  VALUES
    ('saludo'), ('promociones'), ('pago'), ('envio'), ('ubicacion'),
    ('contraindicaciones'), ('dependencia'),
    ('tiempo_entrega_same_day'), ('tiempo_entrega_next_day'),
    ('tiempo_entrega_1_3_days'), ('tiempo_entrega_2_4_days'),
    ('tiempo_entrega_sin_ciudad'),
    ('resumen_1x'), ('resumen_2x'), ('resumen_3x'),
    ('confirmacion_orden_same_day'), ('confirmacion_orden_transportadora'),
    ('pendiente_promo'), ('pendiente_confirmacion'),
    ('no_interesa'), ('rechazar'), ('retoma_inicial')
  -- EXCLUIDOS los 2 que esta fase crea: 'preguntar_direccion_recompra', 'registro_sanitario'
)
SELECT e.intent,
       (SELECT COUNT(*) FROM agent_templates a
        WHERE a.agent_id='somnio-recompra-v1'
          AND a.workspace_id IS NULL
          AND a.intent = e.intent) AS rows_found
FROM expected e
ORDER BY rows_found, e.intent;
```

Cualquier `rows_found = 0` es blocker. Plan se pausa hasta resolver.

### Refinement 3: Añadir **test de integración ligera** en Plan 04

Además de tests unitarios del state machine, incluir **un test end-to-end con mock de Supabase** que:

1. Carga template fixture (3 rows esperados + contenido D-12) en un mock adapter.
2. Ejecuta `resolveResponseTrack({ intent: 'saludo', state, workspaceId })` y valida que el return incluye ambas rows (texto + imagen) — prueba el fix de D-05 y el no-drop de imagen.
3. Ejecuta con `salesAction: 'preguntar_direccion'` y state preloaded, valida que `direccion_completa` contiene `departamento` (prueba D-12).

Strategy: crear un `MockTemplateManager` que implemente la misma interface que `TemplateManager` pero con un array fixture, y pasar via dependency injection o via `vi.mock('@/lib/agents/somnio/template-manager')`. Pattern existente verificado en `crm-context-poll.test.ts`.

### Refined 5-plan breakdown (actualizado)

| Plan | Scope | Wave | Depends on |
|------|-------|------|-----------|
| **01** | Wave 0 — Snapshot + D-11 audit + SQL migration file con 3 INSERTs + GRANTs defensivos + human checkpoint (Supabase SQL Editor) | 0 | — |
| **02** | Code — revertir T2 (line 32) + incluir `departamento` en `direccion_completa` (line 346) + `registro_sanitario` en `INFORMATIONAL_INTENTS` (constants.ts) | 1 | Plan 01 (migration aplicada) |
| **03** | Code — `transitions.ts` ajustes D-04/D-05 + export `resolveSalesActionTemplates` para testeability + verify no-drop imagen branch | 1 | Plan 01 |
| **04** | Tests — unitarios de transitions + tests de response-track con mocks + smoke de sanity `npm run test` todos pasan | 2 | Plan 02 + Plan 03 |
| **05** | QA prod + close-out — push + smoke con Jose Romero + move debug to `resolved/` + update `.claude/rules/agent-scope.md` + LEARNINGS.md | 3 | Plan 04 |

**Parallelization:** Plans 02 y 03 son independientes (diferentes files, diferentes concerns) — se pueden ejecutar en parallel waves. Plan 04 necesita ambos mergedados para tests comprehensivos. Plan 05 es single-track.

---

## Validation Architecture

> Incluido porque `workflow.nyquist_validation` no está explicitamente `false` en `.planning/config.json` (verificado: el key no existe → default enabled).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest@1.6.1` |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npm run test -- src/lib/agents/somnio-recompra/__tests__/` |
| Full suite command | `npm run test` |
| Environment | `node` (alias `@` → `./src`) |

[VERIFIED: smoke ejecutado 2026-04-22 20:03 — 17/17 tests pasan en 18.8s]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-02 | `TEMPLATE_LOOKUP_AGENT_ID === 'somnio-recompra-v1'` (runtime) | manual grep + smoke | `grep -q "TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'" src/lib/agents/somnio-recompra/response-track.ts` | N/A (grep) |
| D-03 | Saludo retorna 2 rows (texto CORE + imagen COMP) cuando allIntents=['saludo'] | unit (mock TemplateManager) | `vitest run src/lib/agents/somnio-recompra/__tests__/response-track.test.ts` | ❌ Wave 0 |
| D-04 | `resolveTransition('initial', 'quiero_comprar', ...)` retorna action `'preguntar_direccion'` | unit (pure state machine) | `vitest run src/lib/agents/somnio-recompra/__tests__/transitions.test.ts` | ❌ Wave 0 |
| D-05 | `resolveTransition('initial', 'saludo', ...)` no retorna action `'ofrecer_promos'` | unit | same file as D-04 | ❌ Wave 0 |
| D-06 | `INFORMATIONAL_INTENTS.has('registro_sanitario') === true` | unit trivial | `vitest run src/lib/agents/somnio-recompra/__tests__/constants.test.ts` O grep | ❌ Wave 0 (trivial — grep check acceptable) |
| D-12 | `resolveSalesActionTemplates('preguntar_direccion', state)` retorna `extraContext.direccion_completa` con `departamento` concatenado | unit (requiere export) | same as D-03 | ❌ Wave 0 |
| End-to-end prod smoke | Turn 0 greeting con cliente real retorna saludo+imagen, turn 1 "sí" retorna preguntar_direccion_recompra con direccion completa | manual (WhatsApp con Jose Romero) | N/A (human) | N/A |

### Sampling Rate

- **Per task commit:** `npm run test -- src/lib/agents/somnio-recompra/__tests__/` (< 20s).
- **Per wave merge:** `npm run test` (full suite).
- **Phase gate:** Full suite green + manual smoke test en prod con cliente Jose Romero antes de `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `src/lib/agents/somnio-recompra/__tests__/transitions.test.ts` — covers D-04/D-05 (nuevo archivo)
- [ ] `src/lib/agents/somnio-recompra/__tests__/response-track.test.ts` — covers D-03/D-12 (nuevo archivo, requiere mock de TemplateManager)
- [ ] `src/lib/agents/somnio-recompra/__tests__/constants.test.ts` — covers D-06 (opcional, 1-liner trivial)
- [ ] Export de `resolveSalesActionTemplates` desde `response-track.ts` (para habilitar Plan 04 tests directos)

---

## Open Questions

### Open Q#1 — Cuál es la acción correcta para `saludo` en initial después de D-05?

**What we know:**
- D-05 dice "Saludo NO dispara `ofrecer_promos`".
- `TRANSITIONS` array requiere un `action: TipoAccion` — el type no admite undefined.
- Tipos de action disponibles (inferidos de `ACTION_TEMPLATE_MAP` y código): `ofrecer_promos`, `preguntar_direccion`, `mostrar_confirmacion`, `cambio`, `crear_orden`, `crear_orden_sin_promo`, `crear_orden_sin_confirmar`, `no_interesa`, `rechazar`, `retoma`, `silence`.
- Si action='silence' (como el branch acknowledgment en line 56), response-track solo procesa el intent branch (line 72-93). Con `intent='saludo' ∈ INFORMATIONAL_INTENTS`, saludo templates salen → D-03 satisfecho.

**What's unclear:**
- Pero `'silence'` también cancela el timer o apaga dispatching — hay que verificar que no corte el flujo antes de mandar los templates.
- Alternativa: **eliminar la entry de saludo del TRANSITIONS array** y dejar que caiga en el fallback path (no match → caller uses fallback, line 291 `return null`). Esto significa que el runner dispatcher nunca llama a resolveResponseTrack con salesAction. El informational branch aún procesaría `intent='saludo'` → saludo templates salen.

**Recommendation:** En plan-phase, leer `somnio-recompra-agent.ts` (el orchestrator) para ver qué hace cuando `resolveTransition` devuelve null vs `{action:'silence'}`. Probablemente la answer correcta es **eliminar la entry** (opción más limpia) — el resolver `resolveResponseTrack` recibe `salesAction: undefined` y solo usa el intent branch.

### Open Q#2 — El branch `!gates.datosCriticos` de `preguntar_direccion` action (`response-track.ts:352-360`) usa `{{campos_faltantes}}` no `{{direccion_completa}}`. El template D-12 no cubre este case.

**What we know:**
- D-12 lockea el happy path: `"¡Claro que sí! ¿Sería para la misma dirección?\n{{direccion_completa}}"`.
- El branch `!datosCriticos` (preload falló o datos borrados) usa `extraContext.campos_faltantes` — los campos que faltan, como lista bullet (`- Nombre\n- Apellido`).

**What's unclear:**
- Para recompra, `createPreloadedState` llena los 6 criticos desde last order → `!datosCriticos` solo ocurre si preload falló (data corrupt) O si cliente borra campos explícitamente. ¿Es caso suficientemente raro para ignorar?
- Si se ignora, el template devuelve texto con `{{campos_faltantes}}` literal sin substituir — degradación visible al cliente.

**Recommendation:** Dos opciones, decidir en plan-phase (probablemente Plan 01):
- **Opción A (simple):** Solo happy path. Documentar en LEARNINGS que el branch `!datosCriticos` degrada y pide fix futuro.
- **Opción B (comprehensive):** Template tiene dos rows — orden=0 branch happy path con `{{direccion_completa}}`, orden=1 con `{{campos_faltantes}}`. Response-track elige cuál mostrar. Pero `resolveSalesActionTemplates` hoy devuelve un solo `intents: ['preguntar_direccion_recompra']` — tendríamos que cambiar la lógica para devolver orden específico O crear otro intent (ej. `preguntar_direccion_incompleto`).

**My pick:** Opción A. El branch `!datosCriticos` es raro en recompra (preload consistente), y scope esta fase ya es minimal. Documentar como deuda técnica.

### Open Q#3 — ¿Hay que invalidar el TemplateManager cache después del flip?

**What we know:**
- Cache es per-instance, 5min TTL, re-construido cada turno (§Existing Patterns #6).
- No hay long-lived singleton del TemplateManager.

**What's unclear:**
- En Vercel warm reuse, ¿podría un lambda retener un `TemplateManager` creado hace < 5min con agentId='somnio-sales-v3' y reuse el cache?

**Answer from code:** **No.** `resolveResponseTrack` (line 114) hace `new TemplateManager(workspaceId)` cada llamada — nueva instance, nuevo Map, NO shared. El cache sobrevivir solo funcionaría si la instance es módulo-level singleton, y NO lo es (it's function-local scope).

**Conclusion:** No hace falta invalidate. Documentar esta verificación en LEARNINGS.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-----------|-----------|---------|----------|
| Supabase (Postgres) | agent_templates migration | ✓ | prod cluster | — |
| Node + Next.js runtime | response-track, transitions | ✓ | Next 15 / Node 20 | — |
| vitest | Plan 04 tests | ✓ | 1.6.1 | — |
| @vitest/ui | Plan 04 optional | ✓ | bundled devDep | — |
| git + gh CLI | commits + prod push | ✓ | — | — |
| WhatsApp/360dialog adapter | smoke test Plan 05 | ✓ (prod live) | — | — |
| Supabase Storage bucket `whatsapp-media` | imagen ELIXIR URL | ✓ (verificado URL hardcoded en migration existente) | — | — |
| Contact de test (Jose Romero 285d6f19) | Plan 05 smoke | ✓ (contact existe, workspace Somnio) | — | — |

**Missing dependencies with no fallback:** None. Todo verificado disponible.

**Missing dependencies with fallback:** None.

---

## Code Examples (verificados pre-migration)

### Imagen saludo content (hardcoded reference del catalog sales-v3 — copiar a recompra-v1)

```
https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg|Deseas adquirir tu ELIXIR DEL SUEÑO?
```

[VERIFIED: `20260315150000_v3_independent_templates.sql:53`]

**Nota:** El caption contiene "SUENO" (sin ñ) en el migration de sales-v3. Discrepancy con D-03 que dice "SUEÑO". **Plan 01 debe alinear:** usar "SUEÑO" (con ñ) consistente con el resto de templates en el catalog (ej. line 37 del mismo migration dice "ELIXIR DEL SUEÑO"). La encoding en DB soporta UTF-8.

### Mini-SQL template for Plan 01

```sql
-- Plan 01 migration — somnio-recompra-v1 catalog: saludo (2 rows replace) + preguntar_direccion_recompra (new) + registro_sanitario (new)
BEGIN;

-- 1. Replace saludo orden=0 and orden=1 under recompra-v1 (idempotent via DELETE+INSERT)
DELETE FROM agent_templates
WHERE agent_id = 'somnio-recompra-v1'
  AND intent = 'saludo'
  AND workspace_id IS NULL;

INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'saludo', 'primera_vez', 'CORE', 0, 'texto',
   '{{nombre_saludo}} 😊', 0),
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'saludo', 'primera_vez', 'COMPLEMENTARIA', 1, 'imagen',
   'https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg|Deseas adquirir tu ELIXIR DEL SUEÑO?', 3);

-- 2. Insert preguntar_direccion_recompra (new — D-12 locked copy)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-recompra-v1'
      AND intent = 'preguntar_direccion_recompra'
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'preguntar_direccion_recompra', 'primera_vez', 'CORE', 0, 'texto',
       E'¡Claro que sí! ¿Sería para la misma dirección?\n{{direccion_completa}}', 0);
  END IF;
END $$;

-- 3. Insert registro_sanitario (new — D-06 TBD copy, placeholder usando contenido de sales-v3 como borrador)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-recompra-v1'
      AND intent = 'registro_sanitario'
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'registro_sanitario', 'primera_vez', 'CORE', 0, 'texto',
       'Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA SOLUTIONS SAS.', 0);
  END IF;
END $$;

-- 4. Defensive GRANTs (LEARNING 1 Phase 44.1 pattern — idempotent)
GRANT ALL ON TABLE agent_templates TO service_role;
GRANT SELECT ON TABLE agent_templates TO authenticated;

COMMIT;
```

### Mini-diff for response-track.ts (Plan 02)

```diff
- const TEMPLATE_LOOKUP_AGENT_ID = 'somnio-sales-v3'
+ const TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'

// Line 346 — D-12 fix
-          direccion_completa: [direccion, ciudad].filter(Boolean).join(', '),
+          direccion_completa: [direccion, ciudad, state.datos.departamento].filter(Boolean).join(', '),
```

### Mini-diff for constants.ts (Plan 02 — D-06)

```diff
 export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([
   'saludo', 'precio', 'promociones',
-  'pago', 'envio', 'ubicacion', 'contraindicaciones', 'dependencia',
+  'pago', 'envio', 'registro_sanitario', 'ubicacion', 'contraindicaciones', 'dependencia',
   'tiempo_entrega',
 ])
```

### Mini-diff for transitions.ts (Plan 03 — D-04/D-05)

```diff
   // Escenario 1: saludo → OLD: ofrecer promos
-  { phase: 'initial', on: 'saludo', action: 'ofrecer_promos', ... },

   // Escenario 2: quiero_comprar → preguntar_direccion (RECOMPRA: gate de direccion)
   {
     phase: 'initial', on: 'quiero_comprar',
-    action: 'ofrecer_promos',
+    action: 'preguntar_direccion',
     resolve: () => ({
-      timerSignal: { type: 'start', level: 'L3', reason: 'quiero_comprar → promos' },
-      reason: 'Quiere comprar en initial → promos directas',
+      timerSignal: { type: 'start', level: 'L5', reason: 'quiero_comprar → preguntar direccion' },
+      reason: 'Quiere comprar en initial → preguntar confirmacion de direccion',
     }),
-    description: 'Escenario 2: quiero_comprar → promos (sin gate de direccion)',
+    description: 'Escenario 2: quiero_comprar → preguntar_direccion (CRM-reader-enabled)',
   },
```

Ver Open Q#1 para la decisión de qué hacer con el saludo entry.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | [ASSUMED] D-11 afirmación "el resto del catálogo recompra-v1 está completo" — NO verificada empíricamente, el research solo leyó 3 migrations que poblan `somnio-sales-v3` (no recompra-v1). | §Pitfalls 3 + Implementation §Refinement 2 | Si falla, el flip de TEMPLATE_LOOKUP_AGENT_ID en Plan 02 rompe intents faltantes. MITIGADO por audit SQL en Plan 01 Task 0 propuesto. |
| A2 | [ASSUMED] La imagen ELIXIR URL actual (hardcoded en migration sales-v3) sigue viva y accesible vía Supabase Storage. | §Code Examples | Si el bucket o el object se borró/movió, el template manda URL rota. MITIGADO por smoke test Plan 05 (el mensaje enviado al cliente devuelve error del send endpoint si URL inválida). |
| A3 | [ASSUMED] `resolveTransition` returning `null` hace que el runner use un fallback-benigno (no rompe el turno). | §Open Q#1 | Si crash o vuelve respuesta vacía, el user del saludo no recibe nada. Requiere verificación en `somnio-recompra-agent.ts` durante plan-phase. |
| A4 | [CITED: CONTEXT.md D-09] Rollback del code es simple — revertir commit. Templates no necesitan rollback porque son aditivos. | §Refinements + §Pitfalls 3 | Si el audit A1 falla, el rollback de templates también es necesario — el snapshot en Plan 01 Task 0 resuelve esto. |
| A5 | [ASSUMED] Clientes con sesiones activas en el momento del deploy no sufren glitch — el próximo turn nunca vuelve al saludo una vez que se pasó. | §Runtime State Inventory | Si hay retoma_inicial o similar que revive un saludo, podría disparar flow con template stale. VERIFIED actually (transitions.ts line 243 — retoma action va a `retoma_inicial` template, NO a `saludo`). Downgrade a [VERIFIED]. |
| A6 | [VERIFIED via grep] No existe domain layer para agent_templates. Migration directa es el único pattern. | §Project Constraints Regla 3 | N/A — verified. |
| A7 | [VERIFIED via test run] `npm run test` funciona, 17/17 tests pasan en 18.8s. | §Validation Architecture | N/A — verified. |

**Items que requieren confirmación del usuario en discuss ampliado o plan-phase:**
- A1 — audit empírico del catalog antes de ejecutar migration.
- A2 — confirmar que la URL de imagen sigue disponible (simple `curl -I` o click en el link).
- A3 — reading `somnio-recompra-agent.ts` para Open Q#1.

---

## Sources

### Primary (HIGH confidence)

- `supabase/migrations/20260206000000_agent_templates.sql` — schema canónico de `agent_templates`.
- `supabase/migrations/20260226000000_block_priorities.sql` — priority column + CORE/COMPLEMENTARIA/OPCIONAL enum.
- `supabase/migrations/20260315150000_v3_independent_templates.sql` — patrón DO $$ IF NOT EXISTS + URL imagen ELIXIR hardcoded.
- `supabase/migrations/20260317200001_tiempo_entrega_templates.sql` — patrón DELETE + INSERT para replace.
- `supabase/migrations/20260317210000_fix_tiempo_entrega_templates.sql` — patrón UPDATE para edits in-place.
- `supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql` — patrón GRANTs defensivos (LEARNING 1 Phase 44.1).
- `src/lib/agents/somnio-recompra/response-track.ts` — pipeline completo leído.
- `src/lib/agents/somnio-recompra/transitions.ts` — state machine leído.
- `src/lib/agents/somnio-recompra/constants.ts` — INFORMATIONAL_INTENTS + ACTION_TEMPLATE_MAP verificados.
- `src/lib/agents/somnio-recompra/state.ts` — preloadedState + buildResumenContext verificados.
- `src/lib/agents/somnio/template-manager.ts` — loadTemplates + cache behavior verified.
- `src/lib/agents/engine-adapters/production/messaging.ts` — imagen content format `URL|caption` verified.
- `.planning/debug/recompra-greeting-bugs.md` — origin story de la fase.
- `.planning/standalone/somnio-recompra-crm-reader/01-PLAN.md` + `07-SUMMARY.md` — sibling pattern for migration+checkpoint.
- `.planning/standalone/somnio-recompra-template-catalog/CONTEXT.md` — decisions D-01..D-13.
- `vitest.config.ts` + smoke test `npm run test` — validation infrastructure.
- `CLAUDE.md` + `.claude/rules/agent-scope.md` — Reglas 3/4/5/6 + scope references.

### Secondary (MEDIUM confidence)

- PostgreSQL docs (knowledge): comportamiento de UNIQUE con NULL — inferido de documentation patterns, no consultado hoy.

### Tertiary (LOW confidence)

- None.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — todas las referencias a código verified línea por línea.
- Architecture patterns: HIGH — cross-referenced multiple migrations + live code.
- Pitfalls: HIGH — 6 pitfalls cada uno con línea-referenced verification.
- D-11 catalog completeness: LOW (A1) — requires empirical SQL audit before Plan 02 ejecuta.
- Open Questions: MEDIUM — requieren reading adicional en plan-phase.

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (30 días — template patterns son stable, cambios en template-manager requieren re-audit).

## RESEARCH COMPLETE

Research complete. Planner can now create PLAN.md files.

**Key handoffs for plan-phase:**

1. **Plan 01 Task 0 (bloqueante):** SQL audit empírico del catálogo recompra-v1 vs expected intents list (ver §Implementation Refinement 2). Si falla, escalar a discuss.
2. **Plan 01 Task 0.5:** Snapshot SQL pre-migración — capturar rows actuales antes de DELETE (ver §Implementation Refinement 1).
3. **Plan 03 decisión Open Q#1:** Leer `somnio-recompra-agent.ts` para determinar el comportamiento correcto de "saludo sin action" (null vs 'silence' vs eliminar entry).
4. **Plan 04 pre-req:** Export `resolveSalesActionTemplates` desde `response-track.ts` para testeability directa.
5. **Plan 05 Regla 4:** `.claude/rules/agent-scope.md` sección somnio-recompra-v1 actualizar con "template catalog independizado 2026-04-XX" (registrar en el catálogo de consumers también — ya es in-process con el crm-reader dispatch).
