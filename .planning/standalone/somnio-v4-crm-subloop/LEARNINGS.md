# Phase somnio-v4-crm-subloop - Learnings

**Fecha:** 2026-05-29
**Duración:** ~2h ejecución (7 planes, 4 waves, secuencial sobre árbol principal)
**Plans ejecutados:** 7 (28 commits desde baseline `6e0a8d1a`)
**Verificación:** 10/10 goal elements DELIVERED · Regla 6 clean · 252 tests passed, 0 fallos nuevos · 0 migraciones

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| `tsc` rompe asignabilidad `accionesEjecutadas` (v4) → `SandboxState` (v3) al añadir 3 miembros al union `TipoAccion` | El sandbox tipa contra `somnio-v3`; ampliar el union v4 desincroniza | Cast de frontera `as SandboxState['accionesEjecutadas']` en los 2 sitios de `engine-v4.ts` (mismo patrón que el `packSeleccionado as PackSelection` ya existente a una línea) | Al ampliar un union compartido entre v4 y el sandbox v3-tipado, esperar el cast de frontera — NO tocar los tipos v3 (rompería Regla 6) |
| `tsc` rompe al invocar `tool.execute()` programáticamente | AI SDK v6 tipa `execute` como union `Result \| AsyncIterable` con firma 2-args | Helper `asExec<I,O>` (patrón canónico de `invocations.ts:46-50`) | Reusar `asExec` siempre que se llame `.execute()` fuera del runtime del SDK |
| `somnio-v4-agent.test.ts` rompe tras borrar `invocations.ts` | El test mockeaba `../invocations` (módulo eliminado en el big-bang) | Reemplazar por mock de `../crm-gate` | Al borrar un módulo, `grep -rn "vi.mock.*<modulo>"` antes de commitear |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| `crmActions[]` derivado de `rawResult.steps[].toolResults` (ground-truth) | Auto-reporte del LLM ("dime qué hiciste") | El LLM mentiría/alucinaría; el SDK ya registra los tool-calls reales (D-23) |
| Big-bang: borrar `invocations.ts` + bloque `createOrder` del runner | Coexistencia con feature flag | v4 DORMANT (0 workspaces) → sin riesgo prod; flag = deuda (D-06/D-16) |
| `simulate` seam por contexto en el sub-loop | Mockear mutation-tools en el caller de cada test | El sandbox necesita paridad de mecanismo sin escribir DB; tools simuladas no-op sin import domain/supabase (D-22) |
| Idempotencia createOrder vía key `somnio-v4-createOrder-{sessionId}` + re-query fresco + chequeo `!hasPriorOrder` (triple, S1) | Solo re-query | El cascarón se dispara temprano y en paralelo a interrupciones; triple barrera evita duplicados (D-12) |
| Cascarón nace en `NUEVO PEDIDO` (`6be952b0`), nunca `NUEVO PAG WEB` | Reusar el stage del pw-confirmation | NUEVO PAG WEB es scope del agente pw-confirmation; v4 origina su propio pedido |
| `pipelineId` vía `getPipelineUuid()` env-bridge fail-closed | `pipelines_list` en runtime | Determinismo + sin round-trip; mismo patrón que los stage UUIDs |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| `v4-production-runner.ts` (bloque createOrder eliminado) | consumidores `orderCreated/orderId/contactId/state_committed` | Al borrar el bloque, los consumidores quedaban colgando (Pitfall 6) | Re-cablear a `output.crmResult` del sub-loop; tombstone comments en el runner marcando el rewire |
| sub-loop `runCrmSubLoop` (nueva firma `{outcome, crmActions}`) | callers RAG/cas_reject existentes | Cambiar la firma rompía los callers legacy | Refactor `runLegacySubLoopRaw` preserva la firma original; `runCrmSubLoop` la envuelve |

## Tips para Futuros Agentes

### Lo que funcionó bien
- **Documentar los fallos pre-existentes en CADA prompt de executor** (`few-shots.test.ts`, `smoke-rag-b.test.ts`, 6 tsc errors): evitó que los ejecutores los mal-atribuyeran y "arreglaran" código sano, y mantuvo el gate de tests interpretable.
- **Verificación independiente del orquestador de la Regla 6** (no confiar solo en el SUMMARY): correr `git diff --stat 6e0a8d1a -- <5 siblings>` yo mismo tras Plan 06 confirmó el byte-identical.
- **Ejecución secuencial en árbol principal** en vez de worktrees paralelos: había 16 worktrees stale-locked que habrían envenenado el merge-loop del workflow; secuencial evitó el hazard y la lentitud de `/mnt/c`.

### Lo que NO hacer
- **NO diffear Regla 6 contra `main`** en este repo: la rama `exec/debounce-v2-wave6` está adelante de main con trabajo debounce-v2 ajeno → falsos positivos. El baseline correcto es el commit del standalone (`6e0a8d1a`).
- **NO ampliar un union v4 sin esperar el cast de frontera** hacia los tipos v3-tipados del sandbox.
- **NO confiar en el auto-reporte del LLM** para el ledger CRM — derivar de `toolResults`.

### Patrones a seguir
- **Cast de frontera v4↔v3-sandbox:** `x as SandboxState['accionesEjecutadas']`.
- **`asExec<I,O>` helper** para llamar `tool.execute()` programáticamente (AI SDK v6).
- **`deriveCrmActions(rawResult)`** → ground-truth desde `steps[].toolResults`, `origen:'rag'`.
- **Gate aditivo sin early-return:** `runCrmGate(...)` y luego SIEMPRE `resolveResponseTrack(...)` (los templates siguen corriendo el mismo turno — D-05).
- **Snapshot `_v4:crm_snapshot`** (NUNCA `_v3:*`) para el grounding cacheado.

### Comandos útiles
```bash
# Regla 6 no-regresión (baseline del standalone, NO main)
git diff --stat 6e0a8d1a -- src/lib/agents/somnio-v3/ src/lib/agents/godentist/ \
  src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/

# Suite del standalone (smoke-rag es network-bound — excluir)
npx vitest run src/lib/agents/somnio-v4/ src/lib/domain/ \
  src/lib/agents/shared/crm-mutation-tools/ --exclude '**/smoke-rag-*.test.ts'

# Confirmar cero migraciones nuevas
git diff --stat 6e0a8d1a -- supabase/migrations/
```

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| `few-shots.test.ts:132` falla en baseline (regex tono RAG `compañero (humano )?experto` ausente de `prompt.ts`) — divergencia del standalone RAG previo, ajena al CRM | Media | Follow-up de `somnio-v4-rag-generative` (alinear test con el prompt actual) |
| `smoke-rag-b.test.ts` network-bound (no corre en CI offline) | Baja | Mockear el provider o marcarlo `it.skip` con guard de red |
| 6 errores tsc pre-existentes (`conversations.test.ts`, `.next/dev/types/validator.ts`) | Baja | Limpieza de tipos transversal |
| `crmResult.orderId` best-effort (no stub estricto — `crmResult.success` es la señal load-bearing) | Baja | Endurecer si un consumidor futuro necesita el orderId garantizado |

## Notas para el Módulo

Información que un agente de documentación de `somnio-v4` necesitaría saber:

- **El CRM de v4 ya NO vive inline.** Todo pasa por `crm-gate.ts` (`crmGateFired` predicate + `runCrmGate` orchestrator) post-sales-track. `invocations.ts` fue ELIMINADO (D-06 big-bang). El runner ya no crea pedidos.
- **Lifecycle nuevo:** datos-críticos → createOrder-cascarón en `NUEVO PEDIDO` → `updateOrder` con pack (`items[]`) → `confirmar` → `moveOrderToStage(CONFIRMADO)`. Los timers L3/L4 ya solo emiten templates `recordar_promo`/`recordar_confirmacion` (NO crean).
- **Grounding 2 vistas:** Vista A (DB vía crm-query-tools con fallback `config_not_set`) + Vista B (ledger `crmActions`). Cache `_v4:crm_snapshot`, re-query fresco antes de createOrder, CAS en moveOrderToStage.
- **Guards:** createOrder rechaza+devuelve existente (idempotency `somnio-v4-createOrder-{sessionId}`); moveOrderToStage whitelist SOLO →CONFIRMADO desde stages pre-confirmación.
- **Paridad prod↔sandbox:** prod escribe DB (mutation-tools reales), sandbox simula (`simulate:true`, tools no-op). Ambos registran en el ledger en el MISMO punto. Ver `INTERRUPTION-PARITY.md §6`.
- **Toques compartidos aditivos:** `crm-mutation-tools.updateOrder` += `items[]` opcional (D-25, V1.1 unblocked); domain `resolveOrCreateContact` (D-24).
- **Activación:** v4 sigue DORMANT (0 workspaces). Pasos manuales en `ACTIVATION-STEPS.md` (config `/agentes/crm-tools`, env vars stage/pipeline UUIDs incl. `SOMNIO_VENTAS_PIPELINE_UUID`, `UPDATE workspace_agent_config ... conversational_agent_id='somnio-sales-v4'` + rollback). Sin feature flag (D-16).

---
*Generado al completar la fase. Input para entrenamiento de agentes de documentación.*
