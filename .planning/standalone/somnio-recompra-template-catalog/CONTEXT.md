---
phase: somnio-recompra-template-catalog
status: discuss-complete
created: 2026-04-22
discuss_completed: 2026-04-22
origin: /gsd-debug recompra-greeting-bugs (session slug: recompra-greeting-bugs)
related_phase: somnio-recompra-crm-reader (closed, enabler)
affected_agent: somnio-recompra-v1
workspace: a3843b3f-c337-4836-92b5-89c58bb98490 (Somnio)
reporter: Jose
---

# Somnio Recompra — Template catalog independiente + redesign del flujo inicial

## Background

El agente `somnio-recompra-v1` se había forkeado como un agente aparte de `somnio-sales-v3` (diferente system prompt, diferente state machine, diferente set de transitions), pero **nunca terminó de independizarse a nivel de templates**. Durante el debug de los bugs de saludo (`.planning/debug/recompra-greeting-bugs.md`) se auditó el código y se descubrió:

1. `response-track.ts:32` tenía `const SOMNIO_RECOMPRA_AGENT_ID = 'somnio-recompra-v1'` que se pasaba a `TemplateManager.loadTemplates`, filtrando rígido por ese `agent_id`.
2. El catálogo de templates bajo `agent_id='somnio-recompra-v1'` está incompleto — el template "ELIXIR DEL SUEÑO" (imagen saludo recompra) vive bajo `agent_id='somnio-sales-v3'`.
3. El header comment del archivo admite el problema: `"Agent ID (recompra uses same templates as v3 for now)"` — pero el código nunca implementó ni fallback ni shared lookup.

Un fix provisional (commit `cdc06d9`, T2 del debug) apuntó el lookup a `'somnio-sales-v3'` para desbloquear acceso a los templates compartidos. **Ese fix es arquitecturalmente incorrecto** (lo confirma el usuario: "ES UN PUTO AGENTE DIREFERENTE") y esta fase lo revierte tras construir catálogo propio.

Adicionalmente se descubrió que el **flujo de primera-respuesta** del recompra agent no matchea la intención de producto:

**Comportamiento actual (código en `transitions.ts:76-83`):**
- Cliente saluda → `saludo+ofrecer_promos` → greeting template + 3 packs inmediatos
- Cliente dice "sí" a adquirir → `quiero_comprar → ofrecer_promos` → packs directos (sin confirmación de dirección)

**Comportamiento esperado por negocio:**
- Cliente saluda → `"Buenas tardes {nombre} 😊"` + `"Deseas adquirir tu ELIXIR DEL SUEÑO?"` + imagen (NO promos aún)
- Cliente dice "sí" → `"Claro que sí, ¿sería para la misma dirección? {direccion del CRM reader}"` (preguntar_direccion action)
- Cliente confirma dirección → promociones (3 packs)
- Cliente elige pack → confirmación con resumen
- Cliente confirma → crear orden

El diseño actual de `transitions.ts` tiene el comment `"Escenario 2: quiero_comprar → promos (sin gate de direccion)"` — decisión explícita de NO pedir dirección, que contradice la intención del negocio.

## Auditoría completa — mapa de `template_intents` que consume recompra

### Puntos de consumo en código

**Único archivo que hace lookups de templates:** `src/lib/agents/somnio-recompra/response-track.ts`. Dos ramas:

1. **Rama informational** (`response-track.ts:72-93`): toma el `intent` devuelto por Haiku. Si está en `INFORMATIONAL_INTENTS` (constants.ts:67-71), lo pushea literal como `template_intent`. Casos especiales:
   - `intent='precio'` → fuerza `['promociones', 'pago']` (nunca busca literal 'precio')
   - `intent='tiempo_entrega'` → resolver dinámico según zona de la ciudad

2. **Rama sales_action** (`response-track.ts:283-378`, `resolveSalesActionTemplates`): la acción del sales-track mapea a template_intents específicos con variables.

### Catálogo completo a crear bajo `agent_id='somnio-recompra-v1'`

**A. Informational directos (intent literal):**

| template_intent | Disparado por intent | Content_type(s) | Variables |
|---|---|---|---|
| `saludo` | saludo | texto (orden=0) + imagen (orden=1) | `{{nombre_saludo}}` |
| `promociones` | promociones, precio, ofrecer_promos action | texto(s) | — |
| `pago` | pago, precio (secundario) | texto | — |
| `envio` | envio | texto | — |
| `ubicacion` | ubicacion | texto | — |
| `contraindicaciones` | contraindicaciones | texto | — |
| `dependencia` | dependencia | texto | — |

**B. Tiempo_entrega (5 variantes por zona):**

| template_intent | Zona |
|---|---|
| `tiempo_entrega_same_day` | same_day |
| `tiempo_entrega_next_day` | next_day |
| `tiempo_entrega_1_3_days` | 1_3_days |
| `tiempo_entrega_2_4_days` | 2_4_days (default) |
| `tiempo_entrega_sin_ciudad` | ciudad aún no extraída |

Variables: `{{ciudad}}`, `{{tiempo_estimado}}`.

**C. Sales actions (consumidos por `resolveSalesActionTemplates`):**

| template_intent | Action que lo dispara | Variables |
|---|---|---|
| `preguntar_direccion_recompra` | preguntar_direccion | `{{direccion_completa}}`, `{{nombre_saludo}}`, `{{campos_faltantes}}` |
| `resumen_1x` / `resumen_2x` / `resumen_3x` | mostrar_confirmacion, cambio | `{{nombre}}`, `{{apellido}}`, `{{telefono}}`, `{{direccion}}`, `{{ciudad}}`, `{{departamento}}`, `{{pack}}`, `{{precio}}` |
| `confirmacion_orden_same_day` | crear_orden (zona same_day) | idem resumen + `{{tiempo_estimado}}` |
| `confirmacion_orden_transportadora` | crear_orden (demás zonas) | idem resumen + `{{tiempo_estimado}}` |
| `pendiente_promo` | crear_orden_sin_promo (timer L3) | — |
| `pendiente_confirmacion` | crear_orden_sin_confirmar (timer L4) | — |
| `no_interesa` | no_interesa | — |
| `rechazar` | rechazar | — |
| `retoma_inicial` | retoma (timer L5 initial) | — |

**D. Deuda técnica descubierta:** `registro_sanitario` está declarado en `comprehension-prompt.ts` como intent válido pero NO está en `INFORMATIONAL_INTENTS` (constants.ts:67-71). Si Haiku devuelve `intent='registro_sanitario'`, response-track no lo matchea → respuesta vacía. Agregar el intent al set y crear template correspondiente.

### Total

~22 `template_intents` únicos (algunos admiten múltiples rows por `orden`). Estimado: 30-40 rows totales en `agent_templates`.

## Variables globales inyectadas por response-track

```
{{nombre}}, {{apellido}}, {{telefono}}, {{direccion}}, {{ciudad}}, {{departamento}}
{{pack}} (1x / 2x / 3x)
{{nombre_saludo}} (ej: "Buenas tardes Jose")
```

## Decisiones capturadas

- **D-01**: Recompra tendrá catálogo propio bajo `agent_id='somnio-recompra-v1'`, **NO** comparte templates con sales-v3. ("ES UN PUTO AGENTE DIFERENTE").
- **D-02**: El fix T2 del debug (`TEMPLATE_LOOKUP_AGENT_ID='somnio-sales-v3'` en `response-track.ts`) se revertirá una vez que el catálogo propio esté poblado en prod.
- **D-03**: El saludo inicial de recompra debe ser:
  1. `"{{nombre_saludo}} 😊"` (texto, CORE)
  2. `"Deseas adquirir tu ELIXIR DEL SUEÑO?"` + imagen (imagen, COMPLEMENTARIA)
- **D-04**: Después de `quiero_comprar` en initial, el bot debe **preguntar confirmación de dirección** (no saltar directo a promos). Flujo:
  - `quiero_comprar` en initial → `preguntar_direccion` action → template `preguntar_direccion_recompra` con `{{direccion_completa}}` del CRM reader
  - `confirmar_direccion` → `ofrecer_promos` action → promociones
- **D-05**: Saludo NO dispara `ofrecer_promos`. Solo muestra el saludo + imagen ELIXIR y espera respuesta del cliente.
- **D-06**: Deuda técnica `registro_sanitario` se agrega a `INFORMATIONAL_INTENTS` dentro de esta fase + template correspondiente.
- **D-07**: Regla 6 aplica — recompra está en prod atendiendo clientes. La migración del catálogo + cambios de código debe protegerse con feature flag o estrategia de rollout (a decidir en plan).
- **D-08**: Regla 5 aplica — la migración SQL de templates se aplica en prod ANTES de pushear código que las consuma.
- **D-09** (rollout): **Opción A** — migration SQL + code push en la misma ventana. Si rompe, rollback del código y los templates son aditivos/no-destructivos. No se usa feature flag.
- **D-10** (copy): Claude prepara borradores de copy para los 3 templates en plan-phase basándose en lo que ya sabe; el usuario revisa antes de ejecutar la migración. El resto del catálogo bajo `somnio-recompra-v1` ya está escrito y se respeta tal cual.
- **D-11** (alcance real — scope reduction grande): Los templates bajo `agent_id='somnio-recompra-v1'` ya están bien **EXCEPTO**:
  - `intent='saludo'` — reemplazar orden=0 (texto) y orden=1 (imagen ELIXIR)
  - `intent='preguntar_direccion_recompra'` — crear (no existe hoy)

  **El resto del catálogo (precio, promociones, pago, envio, ubicacion, contraindicaciones, dependencia, tiempo_entrega_*, resumen_*, confirmacion_orden_*, pendiente_*, no_interesa, rechazar, retoma_inicial) no se toca.** Esto reduce el trabajo de 22 templates nuevos a **3 templates** (2 reemplazo + 1 nuevo).
- **D-12** (contenido preguntar_direccion_recompra): `"¡Claro que sí! ¿Sería para la misma dirección?\n{{direccion_completa}}"` donde `direccion_completa = direccion + municipio + departamento` concatenados con ", ". **Requiere ajuste en código:** `response-track.ts:346` hoy hace `[direccion, ciudad].filter(Boolean).join(', ')` — debe pasar a `[direccion, ciudad, departamento].filter(Boolean).join(', ')` para cumplir el contrato.
- **D-13** (scope estricto): `somnio-sales-v3` NO se toca en esta fase. El copy de sales-v3 está validado por el usuario y mantenerlo intacto preserva el aislamiento entre agentes (consistente con D-01).

## Scope / breakdown preliminar (sujeto a `/gsd:plan-phase`)

Tras las decisiones de discuss, el scope se reduce a **3 templates + 4 cambios de código + registro_sanitario fix**. Breakdown:

- **Plan 01** — Templates bajo `somnio-recompra-v1` (3 rows):
  - SQL idempotente (UPSERT) para reemplazar `intent='saludo'` orden=0 (texto) y orden=1 (imagen ELIXIR)
  - SQL INSERT para crear `intent='preguntar_direccion_recompra'` orden=0 (texto) — content locked en D-12
  - Claude prepara borradores de copy (D-10); usuario aprueba antes de ejecutar en prod (D-08 Regla 5)
- **Plan 02** — Revertir T2 + deuda registro_sanitario:
  - `response-track.ts:32`: `TEMPLATE_LOOKUP_AGENT_ID` → `'somnio-recompra-v1'`
  - `response-track.ts:346`: `direccion_completa` incluye `departamento` (D-12)
  - `constants.ts`: agregar `'registro_sanitario'` a `INFORMATIONAL_INTENTS` + crear template `registro_sanitario` bajo recompra-v1 (D-06)
- **Plan 03** — Ajustes a `transitions.ts`:
  - `saludo` en initial: NO dispara `ofrecer_promos` (D-05) — dejar que el saludo templates salgan solos
  - `quiero_comprar` en initial: `action: 'ofrecer_promos'` → `'preguntar_direccion'` (D-04)
  - Review `hasSaludoCombined` branch (response-track.ts:176-188): asegurar que no dropea orden=1 (imagen ELIXIR) cuando saludo va solo
- **Plan 04** — Tests unitarios cubriendo nuevo flujo:
  - Turn-0 saludo produce greeting + ELIXIR imagen (sin promos)
  - "sí" post-saludo produce `preguntar_direccion_recompra` con `{{direccion_completa}}` del CRM reader
  - "dale"/"esa misma" post-preguntar_direccion produce promociones
  - `seleccion_pack` con datosCriticos produce resumen
  - `confirmar` produce crear_orden
- **Plan 05** — QA en prod + close-out:
  - Snapshot SQL pre-migración del estado actual de `somnio-recompra-v1`
  - Aplicar migración SQL en prod (Regla 5) → push código
  - Smoke test end-to-end con cliente Jose Romero (contact 285d6f19)
  - Mover `.planning/debug/recompra-greeting-bugs.md` a `resolved/`
  - Actualizar `.claude/rules/agent-scope.md` + `docs/analysis/04-estado-actual-plataforma.md` (Regla 4)
  - LEARNINGS.md con patterns aprendidos

## Puntos abiertos — todos cerrados

Todos los gray areas originales quedaron resueltos en la sesión de discuss (decisiones D-09 a D-13). Siguiente paso: `/gsd-research-phase somnio-recompra-template-catalog` (o directo a plan si el usuario considera que no hace falta research adicional — el audit de esta CONTEXT.md ya mapeó el codebase).

## Artifacts relacionados

- `.planning/debug/recompra-greeting-bugs.md` — origen de esta fase (status: handed_off a este standalone)
- `.planning/standalone/somnio-recompra-crm-reader/07-SUMMARY.md` — fase enabler que carga `{{direccion}}` desde CRM reader
- `src/lib/agents/somnio-recompra/response-track.ts` — principal consumidor
- `src/lib/agents/somnio-recompra/transitions.ts` — state machine a ajustar
- `src/lib/agents/somnio-recompra/constants.ts` — `INFORMATIONAL_INTENTS`, `ACTION_TEMPLATE_MAP`, `RECOMPRA_INTENTS`
- `src/lib/agents/somnio/template-manager.ts` — cliente del lookup (no tocar, solo cambia el agentId que se le pasa)

## Siguiente comando sugerido

```
/gsd:discuss-phase somnio-recompra-template-catalog
```

Para resolver los 5 puntos abiertos arriba + locking de decisiones adicionales antes de research + plan.
