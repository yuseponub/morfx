# CRM Stage Integrity — Learnings

**Shipped:** 2026-04-22 (Plan 05 cierre + push a Vercel)
**Standalone path:** `.planning/standalone/crm-stage-integrity/`
**Incidente origen:** 2026-04-21 — pedidos "se devuelven" de un stage a otro sin accion manual.
**Plans:** 01 (migration) → 02 (domain CAS + getAuthContext extended) → 03 (runner + kill-switch + cascade_capped audit) → 04 (builder cycle detection recursiva) → 05 (Kanban Realtime + pure helper + docs + LEARNINGS).

## Commits

### Plan 01 — Migration foundation (Wave 1)
- `e8aca1f` `feat(crm-stage-integrity-01): add composite migration — order_stage_history + realtime + flags`
- `5edf00e` `docs(crm-stage-integrity-01): Plan 01 SUMMARY — migration applied in prod`

### Plan 02 — Domain CAS + audit trail (Wave 2, flag-gated)
- `8dc4159` `feat(crm-stage-integrity-02): add CAS + audit log to moveOrderToStage (flag-gated)`
- `7353182` `feat(crm-stage-integrity-02): getAuthContext returns userId + bulk retorna failed list`
- `95a4b85` `feat(crm-stage-integrity-02): mobile stage route propaga actorId + 409 Conflict`
- `99aa3e7` `feat(crm-stage-integrity-02): crm-writer confirm propaga stage_changed_concurrently`
- `cbebd35` `test(crm-stage-integrity-02): integration test CAS concurrency (describe.skipIf)`
- `dae94bc` `test(crm-stage-integrity-02): integration test append-only RLS + .env.test.example`
- `b6f4cc5` `docs(crm-stage-integrity-02): Plan 02 SUMMARY — CAS + audit trail shipped (flag OFF)`

### Plan 03 — Inngest concurrency + kill-switch + cascade_capped (Wave 3)
- `e78f061` `feat(crm-stage-integrity-03): export kill-switch helpers + stacked concurrency + cascade_capped audit in automation-runner`
- `1b84a6e` `feat(crm-stage-integrity-03): log cascade_capped to history in trigger-emitter (pre-emit path)`
- `ad2cc64` `feat(crm-stage-integrity-03): plumb automation context + narrow CAS reject in executeChangeStage`
- `9f017f3` `test(crm-stage-integrity-03): add kill-switch + cascade_capped unit tests importing runner helpers`
- `8db7e38` `docs(crm-stage-integrity-03): Plan 03 SUMMARY — Inngest concurrency + kill-switch + cap audit`

### Plan 04 — Build-time cycle detection recursiva (Wave 4a)
- `d117552` `feat(crm-stage-integrity-04): expand conditionsPreventActivation to AND/OR + 9 operators + custom fields`
- `7687d28` `test(crm-stage-integrity-04): add exhaustive tests for conditionsPreventActivation (AND/OR, 9 operators)`
- `6a16231` `docs(crm-stage-integrity-04): Plan 04 SUMMARY — builder cycle validator recursive`

### Plan 05 — Kanban Realtime + pure helper + docs + LEARNINGS (Wave 4+5 cierre)
- `92f43b5` `feat(crm-stage-integrity-05): add Kanban Realtime + export handleMoveResult pure helper`
- `633dc63` `test(crm-stage-integrity-05): extend vitest config + add handleMoveResult unit test`
- `47dae62` `docs(crm-stage-integrity-05): document stage_changed_concurrently error contract in agent-scope (D-06)`
- `922f167` `docs(crm-stage-integrity-05): update platform state with CRM Stage Integrity ship (Regla 4)`
- `<hash-LEARNINGS>` `docs(crm-stage-integrity): LEARNINGS consolidation Plans 01-05` (este archivo)
- `<hash-push>` push a origin/main (Task 6) + SUMMARY Plan 05 (post-QA)

## Patterns Established

1. **Optimistic CAS idiom en Supabase JS v2 (Plan 02)**

   ```typescript
   const { data: updated } = await supabase.from('orders')
     .update({ stage_id: newStageId, ...payload })
     .eq('id', orderId).eq('workspace_id', workspaceId)
     .eq('stage_id', previousStageId)  // CAS predicate — serialization sin schema
     .select('id')                      // MANDATORIO para detectar affected=0
   if (!updated || updated.length === 0) { /* CAS rejected */ }
   ```

   Usar para cualquier columna que requiera serializacion sin schema change. NO usar `count: 'exact'` en UPDATE (unreliable con Supabase JS v2). Precedent existente: `src/lib/agents/crm-writer/two-step.ts:140-155` (state machine UPDATE WHERE status='proposed').

2. **Append-only audit ledger con doble guardia (Plan 01)**

   Capa 1 — RLS policies:
   ```sql
   CREATE POLICY "prevent_delete" ON order_stage_history FOR DELETE USING (false);
   CREATE POLICY "prevent_update" ON order_stage_history FOR UPDATE USING (false);
   ```

   Capa 2 — trigger plpgsql (cubre service_role bypass):
   ```sql
   CREATE OR REPLACE FUNCTION prevent_order_stage_history_mutation()
   RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'order_stage_history is append-only'; END; $$;
   CREATE TRIGGER before_update_delete BEFORE UPDATE OR DELETE ON order_stage_history
     FOR EACH ROW EXECUTE FUNCTION prevent_order_stage_history_mutation();
   ```

   RLS solo no basta: service_role (admin client) bypass RLS. Trigger plpgsql cubre ambos caminos.

3. **Inngest stacked concurrency per-entity (v3 SDK, Plan 03)**

   ```typescript
   concurrency: [
     { key: 'event.data.workspaceId', limit: 5 },   // scope 1 — tenant fairness
     { key: 'event.data.orderId',     limit: 1 },   // scope 2 — FIFO per order
   ]
   ```

   Max 2 scopes. FIFO guaranteed per key. **BLOCKER 3 checker review:** el runner existente YA estaba definido con `concurrency: [{ ... }]` (array con 1 scope) — Plan 03 EXTIENDE el array, no migra de scalar a array. Validar con `git show HEAD:src/inngest/functions/automation-runner.ts | grep -A3 concurrency` antes de editar.

4. **Feature flag gate con fail-closed (CAS) vs fail-open (kill-switch)**

   - **CAS flag** (`crm_stage_integrity_cas_enabled`): fallback `false` = legacy path (safe regression-free rollout, sin CAS predicate). Semantica `fail-closed para el feature nuevo` = el comportamiento nuevo se activa solo explicitamente.
   - **Kill-switch flag** (`crm_stage_integrity_killswitch_enabled`): fallback `false` + si la query a `order_stage_history` falla (timeout, offline DB), retorna `{shouldSkip: false}` = automation corre normalmente. Semantica `fail-open para el safety guard` = el soft guard nunca causa downtime.

   Asymmetry intencional: fail-closed para features de correctness, fail-open para guards de resilience.

5. **Supabase Realtime + echo suppression via MutableRefObject (Plan 05)**

   ```typescript
   // Drag optimistic update
   recentMoveRef.current = true
   setTimeout(() => { recentMoveRef.current = false }, 2000)  // bounce-back window

   // Hook callback
   if (recentMoveRef.current) return  // skip own echo
   ```

   **Reglas no-negociables:**
   - NO agregar `ordersByStage` a useEffect deps del hook (reconnect storm — re-subscribe en cada prop change).
   - Reconnect resync: `if (status === 'SUBSCRIBED' && previousStatus && previousStatus !== 'SUBSCRIBED') onReconnect()` — Supabase Realtime NO tiene replay de eventos.
   - Cleanup mandatorio: `supabase.removeChannel(channel)` en useEffect return (StrictMode double-mount sensible).

6. **Pure helpers exportadas desde components para testability (WARNING 4 pattern)**

   Anti-pattern: tests placeholder que re-implementan la logica inline → 0% coverage, zero regression signal.

   Pattern correcto:
   - Extraer logica no-UI (branching de error, state updates, side effects invocados con mocks) a pure function exportada.
   - Typed interfaces `MoveOrderResult` + `HandleMoveResultCtx` exportadas.
   - Tests importan directamente — no requieren dnd-kit, ni Inngest dev server, ni jsdom.

   Ejemplos en este standalone:
   - `handleMoveResult(result, ctx)` en `kanban-board.tsx` — Plan 05.
   - `checkKillSwitch(admin, orderId)`, `logCascadeCap(admin, ...)` en `automation-runner.ts` — Plan 03.

7. **Per-file vitest environment opt-in (BLOCKER 4 pattern, Plan 05)**

   **Default:** `environment: 'node'` explicit en `vitest.config.ts` (no confiar en el default implicit).

   **Component tests** (React render, DOM queries) opt-in via comment al tope del file:
   ```typescript
   // @vitest-environment jsdom
   import { render } from '@testing-library/react'
   ```

   **Por que:** un `environment: 'jsdom'` global romperia cualquier test que use libs Node-only (Supabase admin client, fs, child_process) con `ReferenceError: window is not defined`. Plan 02 integration tests (`orders-cas.test.ts`, `order-stage-history-rls.test.ts`) requieren Node env explicitly.

## Pitfalls Encountered

1. **`.update().eq().select()` array vs null (Plan 02)** — PostgREST `return=representation` retorna `[]` cuando WHERE no matchea. Sin `.select()`, `data` es `null`. Sanity: `if (!updated || updated.length === 0) return CAS_REJECTED`.

2. **Same-stage drop = falso CAS reject si no se short-circuitea (Plan 02)** — mover pedido a su mismo stage activaria CAS con `previousStageId === newStageId`, el UPDATE seria trivial pero el caller podria confundirse. Short-circuit en el caller: `if (currentStageId === newStageId) return`.

3. **History insert failure no debe romper move (Plan 02)** — best-effort con `console.error`. Si el insert a `order_stage_history` falla (trigger error, RLS misfire), el move del pedido YA esta persistido — no rollback-ear el move por no poder loggear.

4. **Inngest concurrency.key=null = unbounded (Plan 03)** — si el evento no trae `orderId`, el `event.data.orderId` key evaluates to null y concurrency scope se desactiva (unbounded parallelism). Validar presencia de `orderId` en el emitter ANTES de `inngest.send(...)`.

5. **React StrictMode + Realtime cleanup (Plan 05)** — `supabase.removeChannel(channel)` en return del useEffect es mandatorio. Sin cleanup, StrictMode double-mount deja 2 subscripciones activas y eventos se aplican en duplicado.

6. **`actor_id uuid NULL` ambiguity (Plan 02)** — para moves desde agentes no hay user_id. La columna `source` es el discriminator (`manual | agent | automation | webhook | cascade_capped`); `actor_id` puede ser NULL + `actor_label` string descriptivo (`'agent:somnio-v3'`).

7. **`getAuthContext` no exponia `userId` (BLOCKER 1 Plan 02 checker review)** — el `user.id` ya estaba in-scope via `supabase.auth.getUser()` pero no se retornaba del helper; callers tenian que re-invocar. Plan 02 extendio la firma (`getAuthContext` ahora retorna `{ workspaceId, userId, ... }`). **Deuda residual:** `actor_label` en server-action usa fallback `'user:' + userId.slice(0,8)` — follow-up para enriquecer con `workspace_members.full_name` join.

8. **`requireMobileAuth` retorna `user` pero plan original asumia `session.userId` inexistente (BLOCKER 2 Plan 02 checker review)** — el helper siempre retorno `{ user, workspaceId, membership }`. Plan 02 consume `user.id` directamente + usa label hardcoded `'mobile-api'`.

9. **Inngest concurrency shape ya era array con 1 scope (BLOCKER 3 Plan 03 checker review)** — el plan original asumia shape scalar `{ key, limit }` y lo reemplazaba; la correccion fue EXTENDER el array existente con spread condicional (segun triggerType).

10. **Placeholder tests dan 0% module coverage (WARNING 3/4/6 Plans 03/05)** — re-implementar logica inline en tests NO da regression signal. El patron correcto es exportar helpers puros desde el component/runner + importarlos en tests. Plan 05 elimino el placeholder `stage-changed-concurrency.test.ts` del plan original.

## Rollout Guide

**Post-deploy state (flags al dia 0):**
- `crm_stage_integrity_cas_enabled = false` → moveOrderToStage corre legacy path (no CAS predicate). Byte-identical behavior al pre-standalone.
- `crm_stage_integrity_killswitch_enabled = false` → automation-runner no consulta kill-switch. Byte-identical al pre-standalone.
- `order_stage_history` SE POPULA desde primer move post-deploy (additive, sin flag).
- Inngest concurrency per-orderId ACTIVA (sin flag, additive).
- Kanban Realtime ACTIVO (sin flag, additive).
- Cycle detection builder ACTIVA (sin flag, additive pure function).

**Step-by-step flip:**

1. **Observar audit log por 24-48h:**

   ```sql
   SELECT source, COUNT(*), DATE_TRUNC('hour', changed_at) AS hour
   FROM order_stage_history
   WHERE changed_at > NOW() - INTERVAL '48 hours'
   GROUP BY source, hour
   ORDER BY hour DESC;
   ```

   Buscar: rows con `source='cascade_capped'` (indica loops que YA estan siendo truncados por cascade cap layer 3 — visible via history aunque el CAS flag este OFF).

2. **Flipear CAS en staging (o test workspace dedicado):**

   ```sql
   -- Nota: platform_config key es global, NO per workspace.
   -- Para per-workspace test: crear workspace dedicado y flipear global.
   UPDATE platform_config
   SET value = 'true'::jsonb
   WHERE key = 'crm_stage_integrity_cas_enabled';
   ```

   Esperar 30-60s (cache TTL). Smoke test: mover 2 pedidos simultaneamente desde 2 browsers → uno debe recibir toast `"Este pedido fue movido por otra fuente. Actualizando..."`.

3. **Si OK tras 1 semana:** dejar CAS activo globalmente. Si `stage_change_rejected_cas` events >1% de moves → investigar antes de rollout ampliado (podria ser false-positive en algun flujo conocido como `revalidatePath` race).

4. **Flipear kill-switch tras CAS estabilizado:**

   ```sql
   UPDATE platform_config
   SET value = 'true'::jsonb
   WHERE key = 'crm_stage_integrity_killswitch_enabled';
   ```

   Smoke: crear automation circular de prueba (stage A → B → A cycle via 2 automations con conditions complementarias) y disparar manualmente. Tras 5 cambios en 60s → kill-switch se dispara, warning `[kill-switch]` en Vercel logs + runner retorna `skipped: 'kill_switch_triggered'`.

5. **Rollback rapido** (si CAS causa false-positive rejections en uso normal):

   ```sql
   UPDATE platform_config
   SET value = 'false'::jsonb
   WHERE key = 'crm_stage_integrity_cas_enabled';
   ```

   Codigo queda inerte (legacy path). Investigar + fix + re-activar. NO requiere revert del codigo.

## Inngest Smoke Manual

**D-08 automated coverage deferred pending inngest-test-engine evaluation.**

Esta seccion documenta el gate manual actual para verificar la serializacion FIFO per-orderId (WARNING 6 fix). El placeholder `src/__tests__/integration/stage-changed-concurrency.test.ts` del plan original fue ELIMINADO (0% module coverage sin valor regression).

**Procedimiento smoke manual:**

1. Script adhoc (no committeado) `scripts/smoke-inngest-concurrency.ts`:
   ```typescript
   import { inngest } from '@/inngest/client'
   await Promise.all([
     inngest.send({
       name: 'order.stage_changed',
       data: { orderId: 'X', workspaceId: 'W', previousStageId: 'A', newStageId: 'B', pipelineId: 'P' }
     }),
     inngest.send({
       name: 'order.stage_changed',
       data: { orderId: 'X', workspaceId: 'W', previousStageId: 'A', newStageId: 'C', pipelineId: 'P' }
     }),
   ])
   ```

2. Abrir Inngest Dashboard → Functions → `automation-order-stage-changed`.

3. Observar: `running: 1`, `queued: 1` durante la ejecucion del primero. Tras ~2s (o lo que tome el primer run), `running: 1`, `queued: 0`.

4. Confirmar en logs Vercel que los 2 runs procesaron en orden FIFO (no paralelos).

**Cuando se habilite coverage automatico:** evaluar `inngest-test-engine` (https://www.inngest.com/docs/reference/testing) en una phase futura. Crear `src/__tests__/integration/stage-changed-concurrency.test.ts` con tests reales que emitan eventos al Inngest test engine + assert-een `running`/`queued` counts + orden FIFO.

## Open Questions / Follow-ups

- **`stage-changed-concurrency` integration test** — NO existe actualmente (WARNING 6 fix). Sera creado cuando `inngest-test-engine` sea evaluado + adoptado en una phase dedicada.
- **Full component drag-simulation tests** — coverage actual es via `handleMoveResult` pure function (WARNING 4). Una capa adicional con `@dnd-kit/test` o refactor del drag handler es follow-up opcional — el helper puro ya cubre las 4 ramas de error-branching.
- **`actor_label` display-name enrichment** — server action hoy usa fallback `'user:' + userId.slice(0,8)`. Follow-up: join con `workspace_members.full_name` o `users_profiles.full_name` para `actor_label` mas humano en la UI del future timeline.
- **Timeline UI** — `order_stage_history` populado habilita UI futura ("Historial" tab en pedido sheet). Deferred per CONTEXT.md — entrega data sin consumer UI todavia.
- **Per-workspace feature flags** — `platform_config` es global. Para rollout per-workspace, agregar columna `workspace_id` a `platform_config` O crear tabla separada (`workspace_feature_flags`). Fuera de scope de este standalone.
- **Cache TTL del platform_config helper** — 30s TTL puede causar mixed behavior durante 30s tras un flip. Runbook item documentado en threat register T-csi-05 (`accept` disposition).

## Anti-Patterns (evitar en futuras fases)

- **NO usar `count: 'exact'` para detectar affected rows en UPDATE** — usar `.select('id')` + `data.length === 0` (Pitfall 1).
- **NO retries en domain layer tras CAS reject** — caller decide UX (agent-scope.md §CRM Writer Bot NO PUEDE explicita).
- **NO `REPLICA IDENTITY FULL` para Realtime** — el cliente no necesita `payload.old`; usar default identity (solo PK en el payload).
- **NO deps array con `ordersByStage` en Realtime useEffect** — reconnect storm (re-subscribe en cada render que ordersByStage cambie). Use eslint-disable exhaustive-deps con rationale en comentario.
- **NO blocking del Inngest runner por history insert failure** — best-effort + console.error; move del pedido no debe revertirse por fallo de observability.
- **NO placeholder tests que re-implementan logica inline** — extraer helpers puros + importar en tests (Pattern 6).
- **NO `environment: 'jsdom'` global en vitest.config** — rompe integration tests Node-only. Usar per-file comment `// @vitest-environment jsdom` (Pattern 7).
- **NO fire-and-forget `inngest.send()` en webhooks o API routes Vercel serverless** — lambda se destruye antes del flush; siempre `await inngest.send(...)`.

---

**Status del cierre de standalone (22 abril 2026):**
- 5/5 plans shipped.
- Flags default OFF (Regla 6 rollout gradual).
- QA checkpoint Plan 05 en curso (usuario flipea flags en staging + smoke).
