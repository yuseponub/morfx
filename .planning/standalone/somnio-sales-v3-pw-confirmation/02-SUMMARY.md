---
phase: somnio-sales-v3-pw-confirmation
plan: 02
status: complete
wave: 1
completed: 2026-04-27
---

# Plan 02 SUMMARY — Wave 1 Template Catalog Migration

## Decision agregada
**GO** — Migration SQL escrita y commiteada. Approval del usuario obtenido vía ediciones inline durante checkpoint (3 templates eliminados, resto aprobado por silencio + clones verbatim de sales-v3 que no requerian re-approval por D-27).

## Commits
- `c12fabd` — `feat(somnio-sales-v3-pw-confirmation): add migration for PW-confirmation independent template catalog (~28 templates...)` — version inicial con 27 INSERTs + comentario header.
- `63ff680` — `fix(somnio-sales-v3-pw-confirmation): remove 3 templates per checkpoint feedback` — eliminacion de 3 templates innecesarios post-checkpoint.

## Archivo de migracion
`supabase/migrations/20260427210000_pw_confirmation_template_catalog.sql`
- Timestamp `20260427210000` posterior a la ultima migracion en main (`20260427160000_routing_facts_pipeline_stage_raw.sql`).
- 24 INSERTs across 24 distinct intents.
- 41 rows totales cuando se aplique (varios intents con CORE+COMP+OPC).
- 66 referencias literales a `somnio-sales-v3-pw-confirmation`.
- Idempotente via `DO $$ IF NOT EXISTS ... INSERT ... END $$` por intent + `UNIQUE(agent_id, intent, visit_type, orden, workspace_id)` schema constraint.
- Wrapped en `BEGIN; ... COMMIT;`.
- 2 GRANTs defensivos al final (LEARNING 1 Phase 44.1).

## Catalogo final (24 intents)

### Informacionales (clonados verbatim de sales-v3 — D-15, D-27)
1. `saludo` (CORE texto + COMPLEMENTARIA imagen)
2. `precio` (CORE + COMP + OPC)
3. `promociones` (CORE)
4. `contenido` (CORE + COMP)
5. `formula` (CORE + COMP + OPC)
6. `como_se_toma` (CORE + COMP + OPC)
7. `pago` (CORE)
8. `envio` (CORE + COMP)
9. `ubicacion` (CORE + COMP)
10. `contraindicaciones` (CORE + COMP)
11. `dependencia` (CORE)
12. `efectividad` (CORE + COMP + OPC)
13. `registro_sanitario` (CORE — INVIMA / PHARMA SOLUTIONS SAS)
14. `tiempo_entrega_same_day` (CORE)
15. `tiempo_entrega_next_day` (CORE)
16. `tiempo_entrega_1_3_days` (CORE)
17. `tiempo_entrega_2_4_days` (CORE)
18. `tiempo_entrega_sin_ciudad` (CORE)

### Sales clonados de sales-v3 verbatim (D-10)
19. `confirmacion_orden_same_day` (CORE post-fix migration 20260317210000 + COMP)
20. `confirmacion_orden_transportadora` (CORE + COMP)

### Nuevos / adaptados (D-11, D-12, D-14)
21. `pedir_datos_post_compra` (D-12) — `Para poder despachar tu pedido nos haria falta:\n\n{{campos_faltantes}}`
22. `agendar_pregunta` (D-11) — `¿Deseas agendarlo para alguna fecha futura?`
23. `claro_que_si_esperamos` (D-14, lockeado verbatim CONTEXT) — `Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio 😴`
24. `fallback` (clonado verbatim sales-v3) — `Regálame 1 minuto por favor`

### Eliminados post-checkpoint usuario
- ~~`confirmar_direccion_post_compra`~~ — REDUNDANTE: `direccion_entrega` pre-activacion ya hace esa pregunta. Verificado en Plan 01 SNAPSHOT.md (template productivo `direccion_entrega` body: "Tu pedido se entregara en esta direccion: {{1}}, {{2}}, {{3}}. Por favor confirma que los datos son correctos").
- ~~`cancelado_handoff`~~ — Handoff es SILENCIOSO en somnio-v3/recompra: `engine.ts` retorna `messages: []` cuando `action='handoff'`. State machine emite event de observability + cambio de mode a HANDOFF, sin envio al cliente.
- ~~`error_carga_pedido`~~ — Mismo patron handoff silencioso. Plan 11 engine debe tratar `crm_context_status='error'` con failover a `action='handoff'` sin envio (no template lookup).

## Implicancias para Plans subsiguientes

### Plan 06 (transitions.ts)
- `D-12 cambiar_direccion` → accion ya NO es `actualizar_direccion` con template `confirmar_direccion_post_compra`. En su lugar: `crm-writer.updateOrderShipping(...)` directo + acuse via texto natural en respuesta o silencio (decidir en Plan 06/07). Considerar replicar el patron de sales-v3 que envia `direccion_entrega` template post-update.
- `D-21 handoff` → emit `action='handoff'` + `state.requires_human=true` + sin template lookup en response-track.

### Plan 07 (response-track.ts)
- `salesAction='handoff'` → return `{ messages: [] }` (NO lookup de template). Replicar patron de `engine-v3.ts:101` y `somnio-v3-agent.ts` lineas 327-345.
- `salesAction='actualizar_direccion'` → revisar si reusa `direccion_entrega` (template productivo de Somnio, agent_id NULL) o emite texto natural. Decision pendiente Plan 06/07.
- NO crear branches para `cancelado_handoff` / `error_carga_pedido` / `confirmar_direccion_post_compra` (no existen en catalog).

### Plan 11 (engine)
- `crm_context_status === 'error'` → `action='handoff'` + `messages: []` (sin envio). Documenta el path en SUMMARY.

## Self-Check
- [x] Archivo `supabase/migrations/20260427210000_pw_confirmation_template_catalog.sql` existe con 24 INSERTs.
- [x] Wrapping `BEGIN; ... COMMIT;` presente.
- [x] Bloques `DO $$ BEGIN IF NOT EXISTS ... END $$` por cada intent.
- [x] `agent_id = 'somnio-sales-v3-pw-confirmation'` en cada row + `workspace_id = NULL` + `visit_type = 'primera_vez'`.
- [x] `INVIMA / PHARMA SOLUTIONS SAS` literal en registro_sanitario (D-27).
- [x] `claro_que_si_esperamos` exact verbatim D-14.
- [x] `agendar_pregunta` exact verbatim.
- [x] `confirmacion_orden_same_day` CORE post-fix "comunicara".
- [x] GRANTs defensivos service_role + authenticated.
- [x] NO contiene placeholders sin resolver.
- [x] NO aplicado en prod (Regla 5 strict — Plan 13 Task 1 lo aplica).
- [x] 2 commits atomicos en git, NO pusheados.
- [x] Approval del usuario via checkpoint inline (3 templates eliminados, resto aprobado tacitamente).

## Desviaciones del plan template
1. **URL imagen ELIXIR (saludo orden=1)**: Shopify CDN en lugar de Supabase storage. La URL Supabase storage devuelve HTTP 400 en prod (verificado en hotfix recompra 20260423152233). Usamos la misma URL que recompra-v1 post-hotfix.
2. **3 templates eliminados** post-checkpoint (`confirmar_direccion_post_compra`, `cancelado_handoff`, `error_carga_pedido`). El plan-checker original verify (line 430) buscaba `cancelado_handoff` — esa verify-line no aplica con la decision actualizada del usuario.

**Self-Check: PASSED**
