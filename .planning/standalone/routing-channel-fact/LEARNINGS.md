# Standalone routing-channel-fact - Learnings

**Fecha:** 2026-05-04
**Duración:** ~1 sesión (discuss → plan → execute → verify)
**Plans ejecutados:** 1 (Plan 01, 2 tasks)

---

## Bugs Encontrados

Ninguno. El plan fue 100% determinístico (código exacto en cada `<action>` block) y no se descubrieron bugs en ejecución. Pre-existing routing tests (94 tests) siguieron verdes en el primer intento — D-12 backward compat preservado sin revisitar.

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| Solo el fact `channel` (string \| null) (D-01) | Helpers derivados como `isMetaChannel`, `isWhatsApp` | Mantener registry mínimo (12 facts vs 14+); operadores `equal`/`in` son suficientes hoy. Si surge fricción real → follow-up. |
| Resolver retorna `null` en miss/error (D-02) | Throw, lanzar warning, retornar `'unknown'` | Consistente con los 11 facts existentes; reglas con `equal`/`in` no matchean cuando es null (fail-safe — Pitfall 4). |
| `'channel'` en `FACT_NAMES_TO_SNAPSHOT` (D-03) | Excluirlo del audit log para reducir JSONB size | Beneficio de trazabilidad >> 1 propiedad extra en JSONB; tabla ya es JSONB sin migración. |
| `getConversationChannel` en domain layer aunque sea read-only (D-04) | Query directo desde `facts.ts` con `createAdminClient` | Regla 3: domain es la única capa que toca Supabase, incluso para reads. Mantiene la grep-test "0 createAdminClient en routing/" siempre verde. |
| `FactContext.conversationId?` opcional (D-05) | Hacerlo required y romper tests existentes | D-12 backward compat: dry-run y tests que arman engines manualmente no pasan conversationId; opcional + short-circuit a null preserva el contrato. |
| `BuildEngineInput.conversationId?` opcional (D-06) | Mismo razonamiento que D-05 | Dry-run y tests existentes invocan `buildEngine` sin conversationId; opcional → cero cambios cascada. |
| Plumbing `?? null` en route.ts (D-07) | Pasar `undefined` y dejar el resolver manejar | Explícito > implícito; `?? null` documenta la intención y es symmetric con cómo `RouteAgentInput.conversationId?: string \| null` ya está tipado. |
| Sin caching dedicado (D-08) | Cache LRU por conversationId | Query indexada (PK), <1ms p99; almanac ya cachea per-request. Cache extra sería overhead sin ganancia. |
| Schema JSON sin cambios (D-09) | Bump `schema_version` y agregar `channel` a un enum | El schema valida formato (string non-empty), no whitelist. Cero migración + cero rebuild de cache de reglas. |
| Sin migración DB (D-10) | Crear migration "add channel index" | Columna ya existe desde manychat-integration y está poblada. Indexada por PK (id). Regla 5 N/A explícitamente. |
| Sin feature flag (D-13) | Flag `routing_channel_fact_enabled` | Regla 6 N/A: el fact es read-only y solo se ejecuta si una regla lo referencia. Cero reglas existentes lo referencian al ship → cero cambio observable hasta que el operador escriba la primera regla con `channel`. |

## Problemas de Integración

Ninguno. Cero archivos consumidores cambiaron — `webhook-processor.ts:236-244` ya pasaba `conversationId` a `routeAgent`, así que el plumbing se completó solo con cambios en 4 archivos del módulo routing + 1 del domain.

## Tips para Futuros Agentes

### Lo que funcionó bien
- **Plan 100% prescriptivo (código exacto en `<action>`)**: el executor no tomó decisiones — solo aplicó cambios literales. 0 deviations, 0 retries. Pattern para reusar en standalones que extienden módulos locked.
- **`grep_validation_checklist` con counts esperados**: 16 grep-checks con número exacto de matches detectó cualquier deriva instantáneamente. Mejor que assertions vagas tipo "should match".
- **Modo sequential (1 plan, 1 wave)**: skip de worktree isolation evitó complejidad de merge para un standalone tan focalizado. Worktrees son para waves paralelas, no para every plan.
- **Read-only helper en domain layer**: aunque `getConversationChannel` no muta nada, vivir en `src/lib/domain/conversations.ts` mantiene la regla "0 `createAdminClient` fuera de domain" como invariante limpia y greppable.
- **Test E2E con `engine.run`**: validó la integración completa (regla → almanac → resolver → domain) en 4 tests de ~30 líneas cada uno. Más valioso que 20 tests unitarios aislados.

### Lo que NO hacer
- **NO modificar `dry-run.ts`** cuando se extiende `BuildEngineInput` con un campo opcional. La compilación sigue funcionando porque el campo es opcional y `dry-run.ts` no necesita el comportamiento. Cualquier cambio "preventivo" rompe D-12.
- **NO bumpear `schema_version`** del JSON schema cuando se agrega un fact name nuevo. El schema acepta strings arbitrarios para `fact`. Bumpear forzaría rebuild de cache de reglas y rompería D-09.
- **NO crear feature flag** para una primitiva read-only sin consumidores. Si nadie escribe una regla con `channel`, el resolver nunca se ejecuta. Flag = ceremonia sin valor.

### Patrones a seguir
- **Pattern: agregar fact al routing engine**:
  1. Domain helper read-only en `src/lib/domain/<entity>.ts` (Regla 3)
  2. Extender `FactContext` con campo opcional `<id>?: string | null` en `facts.ts`
  3. Extender `BuildEngineInput` con mismo campo opcional en `engine.ts`
  4. Forwardear `input.<id> ?? null` en `buildEngine → registerFacts`
  5. Plumear `conversationId ?? null` desde TODOS los call sites de `buildEngine` en `route.ts`
  6. Registrar `engine.addFact('<name>', async () => { try { ... } catch { console.error(...); return <sentinel> } })` con sentinel consistente con otros facts
  7. Agregar al `FACT_NAMES_TO_SNAPSHOT` (audit log)
  8. Tests: unit del helper + E2E de regla con operador `equal`/`in` matcheando/no-matcheando + assertion de `facts_snapshot.<name>` en `route.test.ts`

- **Pattern: read-only helper en domain layer**: replicar la firma exacta de `getContactIsClient` (`contacts.ts:665-688`): `(id: T, workspaceId: string) => Promise<X>`, `createAdminClient()`, `.eq('workspace_id', workspaceId).eq('id', id).single()`, retorna sentinel en error/miss.

### Comandos útiles
```bash
# Validar la suite completa de routing + domain en un solo run
npx vitest run src/lib/agents/routing/__tests__/ src/lib/domain/__tests__/

# Verificar pureza Regla 3 en facts.ts
grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/routing/facts.ts | grep -v -E "^[[:space:]]*(//|\*)"

# Confirmar D-12 (dry-run.ts inmutable) + D-09 (schema inmutable)
git diff <pre-phase-sha>..HEAD -- src/lib/agents/routing/dry-run.ts src/lib/agents/routing/schema/rule-v1.schema.json | wc -l   # expect 0

# Verificar plumbing en ambos call sites de buildEngine
grep -c "conversationId: input.conversationId ?? null" src/lib/agents/routing/route.ts   # expect 2
```

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| Decisión producto: cómo diferenciar saludo de GoDentist por canal — Opción A (agente sibling `godentist-fb`/`godentist-ig`) vs Opción B (columna `channel` en `agent_templates`) | Alta | Próxima conversación (ya documentada en CONTEXT.md `<deferred>`) |
| Reglas concretas en `routing_rules` que usen `channel` (workspace GoDentist) | Alta | Después de la decisión producto anterior |
| Posible fact futuro `isMetaChannel` (boolean helper) — solo si `channel in [facebook, instagram]` se vuelve patrón repetido | Baja | Solo cuando haya evidencia de fricción |
| UI de routing-editor que liste facts disponibles con descripción (hoy texto libre) | Baja | Backlog observability |

## Notas para el Módulo

Información específica que un agente de documentación de `agent-lifecycle-router` necesitaría saber:

- **El registry de facts ahora es 12 (no 11)**: `activeOrderStage`, `activeOrderStageRaw`, `activeOrderPipeline`, `daysSinceLastDelivery`, `daysSinceLastInteraction`, `isClient`, `tags`, `hasPagoAnticipadoTag`, `isInRecompraPipeline`, `lastInteractionAt`, `recompraEnabled`, **`channel`** (nuevo).
- **`facts_snapshot.channel`** aparece en cada decision de `routing_audit` después del merge. Útil para debugging "¿por qué fired esta regla?".
- **Schema de reglas no cambió** — el routing-editor (`/agentes/routing`) ya acepta `channel` como fact-string sin redeploy del UI ni rebuild de cache.
- **Cero reglas existentes referencian `channel`** al momento del ship → cero cambio observable. Activación real cuando el operador (o un standalone follow-up) escriba la primera regla.
- **Caller principal sin cambios**: `src/lib/agents/production/webhook-processor.ts:236-244` ya pasaba `conversationId` a `routeAgent` desde el shipped de agent-lifecycle-router (2026-04-25); el plumbing del fact `channel` reusa esa pipeline sin tocarla.
- **Backward compat absoluto (D-12)**: `dry-run.ts` y todos los tests existentes (94) pasan sin modificación. Engines armados sin `conversationId` reciben `null` por default y reglas que no usen `channel` no invocan el resolver (almanac lazy eval).

---
*Generado al completar la fase. Input para entrenamiento de agentes de documentación.*
