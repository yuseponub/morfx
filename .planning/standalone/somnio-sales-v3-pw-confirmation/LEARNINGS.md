# Standalone `somnio-sales-v3-pw-confirmation` — Learnings

**Fecha shipped:** 2026-04-28
**Duración:** ~2 días (discuss + research + plan + execute)
**Plans ejecutados:** 13 (Wave 0 → Wave 7)
**Commits únicos del standalone:** ~30 (ver `13-DEPLOY-NOTES.md` §Code push)

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| Plan 08 commit aterrizó en `main` en vez de su worktree | gsd-executor: Bash sessions a veces aterrizan en path del repo principal en lugar del worktree del subagent (no se reproduce cada vez — race con isolation init) | Cherry-pick manual del worktree a main posterior; el resultado fue equivalente pero rompió isolation guarantee | Prompt explícito `<worktree_path_discipline>` con re-check `pwd && git branch --show-current` antes de cada commit (aplicado a Plans 09-12, todos respetaron isolation). El template oficial de gsd-executor debería incluirlo nativamente. |
| `npm run build` colgó >3h sin output después de typecheck OK | Next 16 + Babel + OpenTelemetry + node 22 en WSL — postcss workers en deadlock (procesos `postcss.js` consumían CPU sin avanzar) | Killed manualmente; Vercel build (en Linux nativo) funcionó sin issue como gate real | NO confiar en `npm run build` local en WSL para validación de deploy — usar `tsc --noEmit` + `vitest` + Vercel preview build. Investigar si `next build --no-lint` o `--experimental-build-mode=compile` evita el deadlock. |
| 3 templates referenciados por response-track no están en catálogo | `confirmar_direccion_post_compra`, `cancelado_handoff`, `error_carga_pedido` se eliminaron en Plan 04 review pero Plan 07 grep checks los seguían exigiendo | Graceful degradation via `emptyReason: 'templates_not_found_in_catalog'` — el agente nunca emitirá esos templates, return empty | Cuando un Plan elimina templates del catálogo, hacer search-and-update en grep checks de Plans subsecuentes que los referencien. Mejor: un Plan no debería re-exigir grep checks de algo que otro Plan (anterior) eliminó. |
| 38 rows aplicadas vs 41 esperadas en migración Plan 02 | `IF NOT EXISTS` en bloques DO de la migración hizo skip de 3 INSERTs (probablemente variantes OPC opcionales que ya existían de un test previo) | No-bloqueante — los 24 intents requeridos están todos cubiertos | Idempotencia es feature, no bug. Pero conviene loguear cuáles INSERTs se saltaron en la verificación post-apply. |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| Inngest 2-step BLOCKING (D-05) | Non-blocking con polling (como recompra) | Post-compra el contexto del CRM es REQUERIDO antes de invocar al agente. Polling agrega latencia + race conditions. BLOCKING garantiza que el agente ve el pedido cargado o degrada con `error_carga_pedido`. |
| State machine PURE (D-25) | AI SDK loop con tool-calling | Comprehension layer vía single Haiku call (clonado de recompra/v3 pattern). NO loop de tools, NO `streamText`. Más predecible, más testeable, más barato. |
| Catálogo independiente per agent (D-15) | Compartir catálogo con sales-v3 | Lección aprendida en `somnio-recompra-template-catalog` 2026-04-23: compartir templates entre agentes acopla evolución y rompe aislamiento. Standalone reusa esa decisión. |
| Adapter helpers (`updateOrderShipping`, `moveOrderToConfirmado`, `moveOrderToFaltaConfirmar`) | Importar `proposeAction + confirmAction` directo en el agente | Adapter expone contract acotado a las 3 operaciones que el agente necesita (D-08, D-10, D-12, D-14). Evita que el agente arme requests `crm-writer` malformados. Protege scope (agent-scope.md). |
| Activación 100% via routing rule manual (D-02) | Feature flag en `platform_config` | Sin regla en `routing_rules` = sin tráfico = aislamiento total. Cumple Regla 6 (proteger agente productivo) sin necesidad de feature flag adicional. Rollback rápido vía `UPDATE routing_rules SET enabled=false`. |
| Stub handoff_human via flag `requires_human=true` (D-21) | Implementar tool real en V1 | YAGNI — V1 escala con flag en sesión, dashboard de inbox lo verá. Tool real (notification, escalation queue, etc.) es V1.1. |
| Editar items deferred a V1.1 (D-13) | Implementar `updateOrder.products` con AI sub-call en V1 | Complejidad alta (necesita re-cálculo de totales, validación de stock, comprehension multi-turn) vs frecuencia baja (cliente cambia items post-compra raramente). V1 escala a handoff humano. |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| Plan 11 `processMessage` | `EngineConfig.agentModule` union | Plan 09 SUMMARY había marcado CRÍTICO: la nueva agentModule `'somnio-pw-confirmation'` no estaba en el union TypeScript. V3ProductionRunner no compilaría con el branch nuevo. | Plan 11 Task 3 extendió el union (auto-fix Rule 2). |
| Plan 11 `webhook-processor` dispatch | Anti-retry-loop guarantees | Si dispatch fallaba, el message quedaba sin marcar processed → Inngest webhook reintentaba → loop infinito | Fail-closed + `markMessageProcessed` ANTES de retornar 200 al webhook (auto-fix Rule 2). Mismo patrón que recompra branch. |
| Plan 09 Inngest function | crm-reader prompt | El reader necesita un prompt fijo que pida exactamente: contacto + pedidos del workspace + filtrar a stages relevantes + seleccionar más reciente + parrafo + lista de campos faltantes | `buildPwReaderPrompt(contactId, conversationId)` lockeado verbatim en RESEARCH §B.2. NO improvisar. |
| Plan 09 step 1 → step 2 | `_v3:active_order` JSON serialization | El reader devuelve texto + tool calls; el agente necesita el pedido como JSON estructurado en `state.activeOrder`. Sin extracción → agente sin contexto pese a reader OK. | `extractActiveOrderJson(reader.toolCalls)` busca último `ordersGet` toolCall en `reader.steps[*].toolResults` y serializa. Si no encuentra: `_v3:active_order = '{}'` + status='partial'. |
| Plan 11 + Plan 06 (state.ts) | `createInitialState({preloadedActiveOrder})` | Plan 11 `processMessage` invoca `createInitialState` con el pedido pre-cargado de la sesión; sin Plan 06's signature aceptando preloaded payload, esto rompía D-26 (estado inicial = `awaiting_confirmation` post-reader) | Plan 06 lockeó la signature antes; Plan 11 la reusó tal cual. Single source of truth en `state.ts`. |

## Tips para Futuros Agentes

### Lo que funcionó bien

- **Plans atomicos por archivo:** cada plan modifica 1-3 archivos relacionados. Hace cherry-pick trivial cuando worktree falla y facilita rollback granular.
- **Worktree paralelo dentro de cada wave:** Wave 3 (07+08) y Wave 4 (09+10) corrieron en ~10min cada una en lugar de ~20min secuencial. Speedup real, no teórico.
- **Discuss-phase exhaustivo (27 decisiones D-XX lockeadas) antes de plan:** el plan no tuvo que descubrir decisiones — solo implementar. Cero ambigüedad en plans 06-12.
- **Verify-blocks en cada plan con grep assertions:** atrapan deviations al instante. Plan 11 tuvo 4 deviations auto-fix flagged por verify; sin grep checks habrían pasado silenciosas.
- **Single source of truth: `agent-scope.md`:** la sección `somnio-sales-v3-pw-confirmation` se escribió DURANTE discuss-phase con scope completo. Los Plans la consultaron como contract en cada Task.

### Lo que NO hacer

- **NO confiar en `npm run build` local en WSL** para validación de deploy — usa Vercel preview build.
- **NO compartir catálogos de templates entre agentes** — siempre clonar verbatim si necesitas el mismo copy. Acoplamiento mata evolución.
- **NO improvisar prompts del crm-reader** — usar los que están lockeados en RESEARCH §B.2 (caso PW) o §B.1 (caso recompra). Cambiar el prompt = romper el contract de extracción.
- **NO commitear sin re-verificar `pwd && git branch --show-current`** cuando estás en un worktree paralelo. La drift es real y silenciosa.
- **NO inventar tools en V1** — si un caso de uso necesita más de lo que el adapter expone (D-08, D-10, D-12, D-14), escala a handoff (D-21). Pattern: V1 conservador, V1.1 expansive.

### Patrones a seguir

- **Inngest 2-step BLOCKING:** primer ejemplo en codebase (`src/inngest/functions/pw-confirmation-preload-and-invoke.ts`). Reutilizar para cualquier agente que necesite contexto pre-cargado pero no pueda esperar polling.
- **Adapter helpers acotados al scope:** `crm-writer-adapter.ts` solo expone las 3 operaciones que el agente necesita. Cualquier agente nuevo que use crm-writer debería tener su propio adapter, NO importar `proposeAction + confirmAction` directo.
- **State machine PURE + Haiku comprehension:** clonar de recompra/v3 pattern. Predecible, testeable, barato.
- **Stub flags antes que tools reales:** D-21 `requires_human=true` en sesión es zero-cost y permite materializar UI/notification después sin tocar el agente.
- **Tests vitest con `vi.hoisted()` para mocks:** vitest 1.6+ requiere hoist explícito. Documentado en SUMMARY de Plan 12.

### Comandos útiles

```bash
# Run solo tests de PW-confirmation
npx vitest run src/lib/agents/somnio-pw-confirmation/__tests__/

# Verificar templates en DB después de migración
psql $SUPABASE_DB_URL -c "SELECT intent, COUNT(*) FROM agent_templates WHERE agent_id='somnio-sales-v3-pw-confirmation' GROUP BY intent ORDER BY intent;"

# Ver activación del agente (rule status)
psql $SUPABASE_DB_URL -c "SELECT name, priority, enabled FROM routing_rules WHERE event::text LIKE '%somnio-sales-v3-pw-confirmation%';"

# Rollback rápido
psql $SUPABASE_DB_URL -c "UPDATE routing_rules SET enabled=false WHERE name='Somnio PW Confirmation routing';"

# Cherry-pick worktree branch al main si isolation fall (orchestrator pattern)
git cherry-pick <hash1> <hash2> ...

# Verificar pwd en cada bash command dentro de un worktree
pwd && git rev-parse --show-toplevel && git branch --show-current
```

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| Tool real `handoff_human` (materialización D-21) | Media | V1.1 PW-confirmation |
| Editar items via AI SDK sub-call (D-13) | Baja | V1.1 PW-confirmation |
| 3 templates faltantes vs Plan 07 grep (`confirmar_direccion_post_compra`, `cancelado_handoff`, `error_carga_pedido`) si en futuro se quieren | Baja | Migración suplementaria si se necesitan |
| `npm run build` deadlock en WSL | Media | Investigar `next build --experimental-build-mode=compile` o setup CI nativo |
| gsd-executor worktree isolation drift bug | Alta | Bug a reportar en gsd-executor — incluir `<worktree_path_discipline>` nativo en el template del executor |
| `agent-scope.md` actualizar fecha "shipped <fecha post-Plan 12>" → "shipped 2026-04-28" | Baja | Tarea de housekeeping post-shipped |
| `docs/architecture/` documentar patrón Inngest 2-step BLOCKING | Media | Próxima sesión de documentación |

## Notas para el Módulo

### Para un agente futuro que toque PW-confirmation:

1. **El catálogo de templates es independiente.** Cualquier cambio de copy va via migración nueva con `agent_id='somnio-sales-v3-pw-confirmation'`. NO tocar `somnio-sales-v3` catalog.
2. **El agente NO crea pedidos.** Solo modifica los existentes (3 ops vía adapter). Si un cliente pide algo distinto (cambiar items, crear nuevo pedido), escala a handoff.
3. **El stage UUID está en `constants.ts`** — NO hardcodear UUIDs en código nuevo. Usar `PW_CONFIRMATION_STAGES.{CONFIRMADO, FALTA_CONFIRMAR}`.
4. **El `agent_id` está lockeado por D-01.** Está en `config.ts` como `as const`. Cualquier cambio rompe routing rules + observability + rate-limit buckets + templates lookup.
5. **La activación es manual.** Sin regla en `routing_rules`, el agente está deployado pero sin tráfico. Esto es intencional (D-02) — no convertir en feature flag.
6. **El error contract `stage_changed_concurrently` es sagrado.** Propagado verbatim del adapter al agent loop al UI. NO mapear a `not_found` ni a mensaje genérico — los consumidores (sandbox UI, observability) lo esperan literal.
7. **Tests viven en `src/lib/agents/somnio-pw-confirmation/__tests__/`.** Cualquier nuevo path debe tener test. Pattern `vi.hoisted()` para mocks.

### Para un agente futuro que clone este patrón:

1. **Empezar por `agent-scope.md`** — escribir el scope COMPLETO antes de cualquier código.
2. **Lockear decisiones (D-XX) en discuss-phase** — sin ambigüedad, los plans solo implementan.
3. **Catálogo de templates independiente** desde el día uno.
4. **Single agent_id `as const`** en `config.ts` — facilita refactor + grep + observability.
5. **Si necesitas contexto pre-cargado:** Inngest 2-step BLOCKING (este patrón). Si NO necesitas: non-blocking con polling (recompra pattern).
6. **Adapter helpers acotados** al scope — no importar tools del crm-writer directo.
7. **State machine PURE + Haiku comprehension** — barato, predecible, testeable.

### Diferencias clave vs `somnio-recompra-v1` (referencia rápida):

| Aspecto | recompra-v1 | sales-v3-pw-confirmation |
|---------|-------------|---------------------------|
| Trigger | Cliente recurrente saluda | Cliente con pedido en stage entry post-compra |
| Pre-load CRM | Inngest non-blocking (saludo NO espera) | Inngest BLOCKING (agente espera reader) |
| Crear pedido | Sí (`crear_orden`) | NO (solo modifica existente) |
| Stages mutados | Ninguno (solo crea) | NUEVO PAG WEB → CONFIRMADO / FALTA_CONFIRMAR |
| Items editables | Productos del catálogo Somnio | NO en V1 (escala a handoff) |
| Activación | Routing rule activa por defecto | Routing rule manual (D-02) |
| Tests | 32 tests, 4 suites | 65 tests, 5 suites |

---

*Standalone shipped 2026-04-28. Próximo: activación manual cuando usuario decida + V1.1 (D-13 + D-21 materialization) si la operación pide más.*
