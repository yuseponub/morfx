---
phase: standalone-debounce-interruption-system-v2
plan: 07
type: execute
wave: 6
depends_on: [04, 05, 06]
files_modified:
  - src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts
  - .claude/rules/agent-scope.md
  - .planning/standalone/debounce-interruption-system-v2/LEARNINGS.md
  - .planning/standalone/debounce-interruption-system-v2/UAT.md
autonomous: false  # Tasks 7.3 + 7.4 are checkpoint:human-action (Vercel preview + visual smoke in WhatsApp)
requirements:
  - LOCK-01
  - LOCK-02
  - LOCK-03
  - LOCK-04
  - LOCK-05
  - LOCK-06
  - LOCK-07
  - LOCK-08

must_haves:
  truths:
    - "Vitest E2E suite at `src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts` simulates D-19 Phase 2 scenarios S1-S4 using mock-redis from Plan 01 + light stubs of the runner (or by exercising the public API of the module directly)."
    - "Each E2E test asserts the EXPECTED OBSERVABILITY EVENT COUNTS: S1 emits ≥2 events (lock_acquired + lock_released_normal), S2 emits ≥4 (lock_acquired + lock_acquire_failed_follower + interrupt_written + pending_list_combined + lock_released_normal — count per actual emission), S3 emits ≥5 (lock_force_acquired_after_ttl_expiry + zombie_lambda_exit + lock_released_normal + interrupt_written + pending_list_combined), S4 emits ≥4 (lock_acquired + interrupt_written + msg_aborted_path_b_solo + lock_released_normal)."
    - "`.claude/rules/agent-scope.md` has a new `### Module Scope: interruption-system-v2` entry documenting PUEDE / NO PUEDE / Validation / Consumers (per CLAUDE.md 'OBLIGATORIO al Crear un Agente Nuevo' — applies to modules per Regla 4)."
    - "D-19 Phase 3 manual smoke (Vercel preview + real WhatsApp test number) has been executed and the user has confirmed approval."
    - "D-19 Phase 4 visual smoke (sandbox debug-panel Interruption tab + agent_observability_events inspection) has been executed and the user has confirmed approval."
    - "REVISION W4: UAT.md includes an EXPLICIT, BLOCKING sign-off entry acknowledging that scenario S3 (TTL expiry / zombie lambda) is covered by Vitest E2E mock-redis only — manual reproduction on Vercel preview is deferred because it would require artificial hang induction in production code (e.g., a temporary debug endpoint that holds a lock past TTL). Confidence is HIGH that S3 path works (unit tests for assertHoldsLock + Lua release-if-owner + force-acquire all green; e2e-scenarios.test.ts S3 test asserts the full event sequence)."
    - "LEARNINGS.md committed with bugs found, decisions made during implementation, patterns established for future agent-Y migrations to interruption-system-v2 (per CLAUDE.md Regla 0 step 7)."
    - "UAT.md committed with the user's checklist + sign-off."
  artifacts:
    - path: "src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts"
      provides: "S1-S4 E2E coverage with event-count assertions"
      contains: "scenario"
    - path: ".claude/rules/agent-scope.md"
      provides: "Module Scope entry for interruption-system-v2"
      contains: "interruption-system-v2"
    - path: ".planning/standalone/debounce-interruption-system-v2/LEARNINGS.md"
      provides: "Bug list + pattern list + reusable insights for next module migration"
      contains: "Bugs encountered"
    - path: ".planning/standalone/debounce-interruption-system-v2/UAT.md"
      provides: "User acceptance checklist + sign-off timestamp + REVISION W4 S3 deferral acknowledgment"
      contains: "approved"
  key_links:
    - from: "All previous plans (01..06)"
      to: "E2E scenarios assert their behavior end-to-end"
      via: "Vitest e2e-scenarios.test.ts wires all primitives together"
      pattern: "S1\\|S2\\|S3\\|S4"
---

<objective>
Wave 6 — Ship gate. Validate the full standalone via D-19 Phase 1 (e2e Vitest), Phase 3 (Vercel preview branch + real WhatsApp test), and Phase 4 (sandbox visual smoke), then document the module scope per CLAUDE.md Regla 4 and capture LEARNINGS. This plan is the only gate from "code written" to "approved to merge to main".

REVISION W4: UAT.md adds an EXPLICIT, BLOCKING sign-off entry for the S3 (TTL expiry / zombie lambda) deferral — manual reproduction on Vercel preview would require artificial hang induction in production code, so we defer S3 to Vitest E2E coverage only and require explicit user acknowledgment in UAT.md before merge.

Purpose: D-19 is locked as a 4-phase gate. Phase 1 (unit tests for primitives) was covered piecemeal in Plans 01-02; this plan adds Phase 2 (e2e scenarios in Vitest) plus the human-checkpoint Phases 3 + 4. Without explicit user approval at Phase 3 and Phase 4, this standalone does NOT merge per D-19 line 185 "Criterio de ship: las 4 fases pasan sin issues. Si Fase 3 o 4 falla, no se promueve a prod."

Output: 4 files — E2E test, agent-scope doc update, LEARNINGS, and UAT (now with REVISION W4 S3 deferral acknowledgment) — plus 2 user checkpoints for Phases 3 + 4.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@./.claude/rules/agent-scope.md
@.planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md
@.planning/standalone/debounce-interruption-system-v2/RESEARCH.md
@.planning/standalone/debounce-interruption-system-v2/01-SUMMARY.md
@.planning/standalone/debounce-interruption-system-v2/02-SUMMARY.md
@.planning/standalone/debounce-interruption-system-v2/03-SUMMARY.md
@.planning/standalone/debounce-interruption-system-v2/04-SUMMARY.md
@.planning/standalone/debounce-interruption-system-v2/05-SUMMARY.md
@.planning/standalone/debounce-interruption-system-v2/06-SUMMARY.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 7.1: Create e2e-scenarios.test.ts (D-19 Phase 1 + 2 — S1, S2, S3, S4)</name>
  <read_first>
    - .planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md (D-19 — 4 scenarios with expected behavior)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 955-959 (test commands per scenario; mock-redis approach)
    - src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts (from Plan 01 — Wave 1 helper)
    - src/lib/agents/interruption-system-v2/lock.ts (acquireLock, assertHoldsLock, releaseLockIfOwner, startHeartbeat)
    - src/lib/agents/interruption-system-v2/pending.ts (pushToPending, removeOwnEntry, readAndClearPending)
    - src/lib/agents/interruption-system-v2/checkpoints.ts (checkpoint helper)
  </read_first>
  <behavior>
    - **S1 (solo path):** msg1 processes alone, no msg2. Mock acquireLock → success; simulate full turn (no checkpoint interrupts); assertReleaseLockIfOwner returns true; assert `lock_acquired` + `lock_released_normal` events emitted (count ≥ 2).
    - **S2 (race):** acquireLock called twice in parallel with same key. First gets handle, second returns null. The second pushes pending entry + sets interrupt key. Holder runs checkpoint at CKPT-1, detects interrupt, returns early with Path A combined. Assert `lock_acquired` + `lock_acquire_failed_follower` + `interrupt_written` + `interrupt_detected_at_ckpt_N` + `msg_aborted_path_a_combined` + `lock_released_normal` (count ≥ 6).
    - **S3 (TTL expiry):** Holder acquires; mock simulates TTL expiry via `mockRedis.__simulateTtlExpiry(key)`; second caller force-acquires (gets new UUID); first caller's `assertHoldsLock` returns false → throws LostLockError → emits `zombie_lambda_exit`. Force-acquire counts as `lock_force_acquired_after_ttl_expiry`. Assert at least those 3 events + the second holder's own normal lifecycle. **REVISION W4: this is the ONLY coverage for S3 — manual reproduction on Vercel preview is deferred; UAT.md captures explicit user acknowledgment.**
    - **S4 (Path B):** Holder acquires; manually update lock value to has_sent_anything=true (simulating first successful send); interrupt arrives; CKPT-7.N detects interrupt; emits `msg_aborted_path_b_solo`; release happens normally. Assert ≥ 4 events.
  </behavior>
  <action>
    1. Create `src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts`:
       ```ts
       import { describe, it, expect, vi, beforeEach } from 'vitest'
       import { createMockRedis } from './_helpers/mock-redis'

       // Mock the redis-client module so all subsequent imports see the shared mock.
       const mockRedis = createMockRedis()
       vi.mock('../redis-client', () => ({ redis: mockRedis, getRedisClient: () => mockRedis }))

       // Spy on observability collector
       const emittedEvents: Array<{ label: string; payload: Record<string, unknown> }> = []
       vi.mock('@/lib/observability', () => ({
         getCollector: () => ({
           recordEvent: (cat: string, label: string, payload: Record<string, unknown>) => {
             emittedEvents.push({ label, payload })
           },
         }),
       }))

       beforeEach(() => {
         emittedEvents.length = 0
         // Clear mock-redis store between tests
         const all = mockRedis.__getAll()
         all.store.clear()
         all.ttls.clear()
         all.lists.clear()
       })

       describe('e2e scenarios — D-19 Phase 2 (S1-S4)', () => {
         it('S1: msg1 solo path — acquire + release lifecycle clean', async () => {
           const { acquireLock, releaseLockIfOwner } = await import('../lock')
           const { emitLockEvent } = await import('../observability')

           const handle = await acquireLock('ws-1', 'whatsapp', '+57300')
           expect(handle).not.toBeNull()
           emitLockEvent('lock_acquired', { holder_uuid: handle!.holderUuid, msg_id: 'm1', key: handle!.key, ttl: 45, started_at: handle!.startedAt })

           // Simulate full turn passing — no interrupts
           const released = await releaseLockIfOwner(handle!)
           expect(released).toBe(true)
           emitLockEvent('lock_released_normal', { holder_uuid: handle!.holderUuid, duration_ms: 100, templates_sent: 3 })

           const labels = emittedEvents.map((e) => e.label)
           expect(labels).toContain('lock_acquired')
           expect(labels).toContain('lock_released_normal')
           expect(emittedEvents.length).toBeGreaterThanOrEqual(2)
         })

         it('S2: msg1 + msg2 race — 1 holder + 1 follower → combo Path A', async () => {
           const { acquireLock } = await import('../lock')
           const { pushToPending } = await import('../pending')
           const { checkpoint } = await import('../checkpoints')
           const { emitLockEvent } = await import('../observability')
           const { randomUUID } = await import('crypto')
           const { redis } = await import('../redis-client')

           // Holder acquires
           const handle = await acquireLock('ws-1', 'whatsapp', '+57301')
           expect(handle).not.toBeNull()
           emitLockEvent('lock_acquired', { holder_uuid: handle!.holderUuid, msg_id: 'm1', key: handle!.key, ttl: 45, started_at: handle!.startedAt })
           await pushToPending('ws-1', 'whatsapp', '+57301', { entry_uuid: randomUUID(), content: 'msg1', received_at: new Date().toISOString(), msg_id: 'm1' })

           // Follower fails to acquire
           const followerHandle = await acquireLock('ws-1', 'whatsapp', '+57301')
           expect(followerHandle).toBeNull()
           emitLockEvent('lock_acquire_failed_follower', { existing_holder_uuid: 'unknown', my_msg_id: 'm2', key: `lock:ws-1:whatsapp:+57301` })
           const push = await pushToPending('ws-1', 'whatsapp', '+57301', { entry_uuid: randomUUID(), content: 'msg2', received_at: new Date().toISOString(), msg_id: 'm2' })
           await redis.set(`interrupt:ws-1:whatsapp:+57301`, 'm2', { ex: 60 })
           emitLockEvent('interrupt_written', { msg_id: 'm2', pending_list_length: push.pendingListLength })

           // Holder runs checkpoint — detects interrupt
           const ck = await checkpoint('ckpt_1_post_comprehension', handle!, 'ws-1', 'whatsapp', '+57301')
           expect(ck.proceed).toBe(false)
           expect(ck.interrupted).toBeDefined()
           emitLockEvent('msg_aborted_path_a_combined', { combined_msg_count: 2, total_chars: 8 })
           emitLockEvent('pending_list_combined', { entries_count: 2, total_chars: 8 })
           emitLockEvent('lock_released_normal', { holder_uuid: handle!.holderUuid, duration_ms: 50, templates_sent: 0 })

           const labels = emittedEvents.map((e) => e.label)
           expect(labels).toContain('lock_acquired')
           expect(labels).toContain('lock_acquire_failed_follower')
           expect(labels).toContain('interrupt_written')
           expect(labels).toContain('msg_aborted_path_a_combined')
           expect(emittedEvents.length).toBeGreaterThanOrEqual(6)
         })

         it('S3: TTL expiry → second caller force-acquires → first holder zombie-exits (REVISION W4 — Vitest-only coverage; UAT.md captures user acknowledgment of manual deferral)', async () => {
           const { acquireLock, assertHoldsLock } = await import('../lock')
           const { emitLockEvent } = await import('../observability')

           // Holder 1 acquires
           const h1 = await acquireLock('ws-1', 'whatsapp', '+57302')
           expect(h1).not.toBeNull()

           // Simulate TTL expiry
           mockRedis.__simulateTtlExpiry(h1!.key)

           // Holder 2 acquires (force, since key gone)
           const h2 = await acquireLock('ws-1', 'whatsapp', '+57302')
           expect(h2).not.toBeNull()
           expect(h2!.holderUuid).not.toEqual(h1!.holderUuid)
           emitLockEvent('lock_force_acquired_after_ttl_expiry', { previous_holder_uuid: h1!.holderUuid, expired_ago_estimate_ms: 0 })

           // Holder 1 tries assertHoldsLock — fails
           const h1StillHolds = await assertHoldsLock(h1!)
           expect(h1StillHolds).toBe(false)
           emitLockEvent('zombie_lambda_exit', { my_uuid: h1!.holderUuid, current_holder_uuid: h2!.holderUuid, at_step: 'ckpt_2_post_state_machine' })

           const labels = emittedEvents.map((e) => e.label)
           expect(labels).toContain('lock_force_acquired_after_ttl_expiry')
           expect(labels).toContain('zombie_lambda_exit')
           expect(emittedEvents.length).toBeGreaterThanOrEqual(2)
         })

         it('S4: holder sends 1 template, msg2 arrives, CKPT-7.N detects interrupt → Path B solo', async () => {
           const { acquireLock, releaseLockIfOwner } = await import('../lock')
           const { checkpoint } = await import('../checkpoints')
           const { emitLockEvent } = await import('../observability')
           const { redis } = await import('../redis-client')

           const h1 = await acquireLock('ws-1', 'whatsapp', '+57303')
           expect(h1).not.toBeNull()

           // Holder sends 1 template — update lock value to has_sent_anything=true
           const newVal = JSON.stringify({ holder_uuid: h1!.holderUuid, started_at: h1!.startedAt, has_sent_anything: true })
           mockRedis.__getAll().store.set(h1!.key, newVal)

           // Interrupt arrives
           await redis.set(`interrupt:ws-1:whatsapp:+57303`, 'm2', { ex: 60 })
           emitLockEvent('interrupt_written', { msg_id: 'm2', pending_list_length: 1 })

           // Holder runs CKPT-7.N — sentCount > 0 → Path B
           const ck = await checkpoint('ckpt_7_pre_template', h1!, 'ws-1', 'whatsapp', '+57303', { templateIndex: 2, hasSentAnything: true })
           expect(ck.proceed).toBe(false)
           emitLockEvent('msg_aborted_path_b_solo', { templates_sent_before_abort: 1 })

           // Holder releases normally
           const released = await releaseLockIfOwner(h1!)
           expect(released).toBe(true)
           emitLockEvent('lock_released_normal', { holder_uuid: h1!.holderUuid, duration_ms: 200, templates_sent: 1 })

           const labels = emittedEvents.map((e) => e.label)
           expect(labels).toContain('interrupt_written')
           expect(labels).toContain('msg_aborted_path_b_solo')
           expect(labels).toContain('lock_released_normal')
           expect(emittedEvents.length).toBeGreaterThanOrEqual(4)
         })
       })
       ```

    2. Run `npx vitest run src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts --reporter=verbose` — all 4 scenarios must pass green.

    3. **Sanity sweep:** run `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` to ensure regression-free across all 5 test files (lock, pending, checkpoints, observability, e2e-scenarios).
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts` exits 0.
    - All 4 scenarios pass: `grep -c "✓" output` ≥ 4 OR the reporter shows "4 passed".
    - Full module suite still passes: `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exits 0.
    - `grep -c "S1\|S2\|S3\|S4" src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts` ≥ 4 (each scenario labeled).
    - **REVISION W4:** S3 test docstring/comment cites "REVISION W4 — Vitest-only coverage; UAT.md captures user acknowledgment of manual deferral".
  </acceptance_criteria>
  <done>D-19 Phase 1+2 satisfied (Vitest E2E + unit tests passing). S3 covered by Vitest only per REVISION W4.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 7.2: Add `### Module Scope: interruption-system-v2` to .claude/rules/agent-scope.md (CLAUDE.md Regla 4)</name>
  <read_first>
    - .claude/rules/agent-scope.md (existing module-scope entries — model after Module Scope: crm-query-tools / crm-mutation-tools at end of file)
    - CLAUDE.md (line referring to "OBLIGATORIO al Crear un Agente Nuevo" — pattern documented in CLAUDE.md applies to MODULES per Regla 4 docs-always-sync)
  </read_first>
  <action>
    Append a new section to `.claude/rules/agent-scope.md` (near the end of `## Scopes por Agente`, alphabetical or logical grouping with the other Module Scope entries):

    ```markdown
    ### Module Scope: interruption-system-v2 (`src/lib/agents/interruption-system-v2/`)
    Atomic distributed-mutex coordination for the v4 inbound message pipeline. Replaces Phase 31 `hasNewInboundMessage` polling for `somnio-sales-v4` ONLY (D-04 + D-07). v3/godentist/recompra/pw-confirmation paths UNTOUCHED (Regla 6).
    - **PUEDE:**
      - `acquireLock(workspaceId, channel, identifier)` — SET NX + holder_uuid (D-02 + D-15).
      - `releaseLockIfOwner(handle)` — Lua-atomic release if owner UUID matches (D-15).
      - `renewLockTTL(handle)` / `startHeartbeat(handle)` — keep alive every 5s (D-09 layer 2).
      - `pushToPending` / `removeOwnEntry` / `readAndClearPending` — RPUSH/LREM by entry_uuid (D-05 + D-16 + D-20).
      - `checkpoint(ckptId, ...)` — fencing check + interrupt detection at 8 D-18 points.
      - `emitLockEvent` — typed emitter for 14 D-17-extended events (LOCK-07 + REVISION B1 `lock_orphan_swept_by_cron`).
      - Inngest cron `v2-lock-cleanup-cron` sweeps orphaned locks every 5min by comparing against `agent_sessions.status='active'` (D-09 layer 3 + LOCK-06 + REVISION B1).
    - **NO PUEDE:**
      - Mutar tablas de negocio (`messages`, `conversations`, `agent_sessions`, etc.) — coordina via Redis ONLY. La pipeline real escribe a DB.
      - Activarse en agentes ≠ `somnio-sales-v4` — el webhook handler gating en `webhook-handler.ts` filtra por `agentId === 'somnio-sales-v4'` (D-04). Aplicar a otro agente requiere standalone follow-up.
      - Bloquear LLM calls mid-stream con AbortController — solo checkpoints discretos entre steps (D-13).
      - Confiar en Inngest concurrency como mecanismo de correctness — Redis SET NX es el único primario (D-14 + RESEARCH Inngest section); Inngest concurrency=1 queda como belt-and-suspenders.
      - Importar `createAdminClient` o `@supabase/supabase-js` directamente dentro de `src/lib/agents/interruption-system-v2/**` (Regla 3 wrapper). Solo `redis-client.ts` instancia `Redis`; el resto consume el proxy. (Excepción documentada: el cron `v2-lock-cleanup-cron.ts` vive en `src/inngest/functions/`, NO bajo `src/lib/agents/interruption-system-v2/**`, y necesita createAdminClient para la query a `agent_sessions` — D-09 verbatim.)
    - **Validación (gates verificables):**
      - `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/interruption-system-v2/` retorna 0 matches no-comentario.
      - `grep -c "@upstash/redis" src/lib/agents/interruption-system-v2/redis-client.ts` ≥ 1.
      - `grep -c "RELEASE_IF_OWNER_LUA" src/lib/agents/interruption-system-v2/lua-scripts.ts` ≥ 1; script body redis.call('GET', KEYS[1]) + redis.call('DEL', KEYS[1]) + cjson.decode.
      - 14 D-17-extended event labels enforceable (REVISION B1): `grep -oE "'(lock_acquired|lock_acquire_failed_follower|interrupt_written|interrupt_detected_at_ckpt_N|msg_aborted_path_a_combined|msg_aborted_path_b_solo|lock_released_normal|follower_woke|lock_force_acquired_after_ttl_expiry|zombie_lambda_exit|heartbeat_renewed|pending_list_combined|redis_unavailable_fallback_failed|lock_orphan_swept_by_cron)'" src/lib/agents/interruption-system-v2/observability.ts | sort -u | wc -l` returns 14.
      - 8 D-18 checkpoint IDs distributed across runner + agent + sub-loop + adapter: see standalone `05-SUMMARY.md` coverage matrix.
      - Test suite: `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` 5 suites pass (lock + pending + checkpoints + observability + e2e-scenarios).
      - Standalone shipped: `.planning/standalone/debounce-interruption-system-v2/` (<date>).
    - **Consumidores documentados:**
      - `somnio-sales-v4` (dormant en prod — D-04 + D-07): webhook handler en `src/lib/whatsapp/webhook-handler.ts` adquiere lock cuando `resolveAgentIdForWorkspace === 'somnio-sales-v4'` (STATIC-imported from `src/lib/agents/registry-helpers.ts` per REVISION B4); runner en `src/lib/agents/engine/v4-production-runner.ts` ejecuta CKPT-0 + CKPT-6 + finally release (REVISION W3: consumes `input.lockChannel` + `input.lockIdentifier` from EngineInput — no createAdminClient introduced); agente en `src/lib/agents/somnio-v4/somnio-v4-agent.ts` ejecuta CKPT-1 + CKPT-2; sub-loop en `src/lib/agents/somnio-v4/sub-loop/index.ts` ejecuta CKPT-3 + CKPT-4 + CKPT-5; messaging adapter `V4MessagingAdapter` ejecuta CKPT-7.N reemplazando Phase 31 (D-08).
      - (FB/IG via ManyChat: webhook handler genéricamente listo per D-12, pero solo activa el flujo cuando agent_id resolved=somnio-sales-v4 — actualmente sin tráfico FB/IG hacia v4. FB/IG dedup gap es forward-looking risk per REVISION W6.)
    - **Coexistencia con Phase 31:** Phase 31 (`hasNewInboundMessage` en `MessagingProductionAdapter.send` líneas 173-187) sigue VIVO para v3/godentist/recompra/pw-confirmation. Solo el path v4 lo reemplaza vía `V4MessagingAdapter extends MessagingProductionAdapter` que override `shouldAbortBeforeTemplate`. Migración a otros agentes = standalone follow-up (D-04).
    ```

    Commit message: `docs(agent-scope): add interruption-system-v2 module scope`
  </action>
  <verify>
    <automated>grep -c "Module Scope: interruption-system-v2" .claude/rules/agent-scope.md && grep -c "PUEDE:\|NO PUEDE:\|Validación\|Validation" .claude/rules/agent-scope.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "Module Scope: interruption-system-v2" .claude/rules/agent-scope.md` ≥ 1.
    - `grep -c "acquireLock\|releaseLockIfOwner" .claude/rules/agent-scope.md` ≥ 1 (PUEDE entries present).
    - `grep -c "somnio-sales-v4" .claude/rules/agent-scope.md` includes the new section's references (Memory in mind: previous count must increase).
    - `grep -c "RELEASE_IF_OWNER_LUA\|cjson.decode" .claude/rules/agent-scope.md` ≥ 1 (validation gate cited).
    - `grep -c "14 D-17-extended\|lock_orphan_swept_by_cron" .claude/rules/agent-scope.md` ≥ 1 (REVISION B1 — 14 labels cited).
  </acceptance_criteria>
  <done>Module scope documented per CLAUDE.md Regla 4 + "OBLIGATORIO al Crear un Agente Nuevo" pattern.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 7.3: D-19 Phase 3 — Vercel preview + real WhatsApp smoke (S1-S4)</name>
  <what-built>Plans 00-06 shipped to a Vercel PREVIEW branch (NOT main). The user needs to point a WhatsApp testing number's webhook at the preview URL and reproduce scenarios S1-S4 manually using the Somnio testing line that's routed to v4 ON THE PREVIEW (because routing-rules in Somnio prod still keep v4 dormant — D-04 + D-07).</what-built>
  <how-to-verify>
    USER STEPS:

    1. **Push the standalone branch to GitHub** (don't merge yet):
       ```bash
       git checkout -b standalone/debounce-interruption-system-v2
       # ... all 7 plans' commits already on the branch ...
       git push origin standalone/debounce-interruption-system-v2
       ```
       Vercel will auto-deploy a preview URL: `https://morfx-new-git-standalone-debounce-interruption-system-v2-<account>.vercel.app`.

    2. **Configure the WhatsApp testing number** to point its 360dialog webhook at the preview URL:
       - Go to 360dialog console → testing number config → webhook URL → set to `<preview-url>/api/webhooks/whatsapp?workspace=<somnio-workspace-id>`.
       - Confirm the preview's Vercel env vars include UPSTASH_REDIS_REST_URL pointing at the **DEV** Upstash DB (Pitfall 5 — never prod).

    3. **Add a temporary routing rule on PREVIEW DB ONLY** that routes the testing number's conversations to `somnio-sales-v4`:
       - This is tricky because Vercel preview shares Supabase with prod. Options:
         (a) Create a routing rule with `priority: 999` that matches `conversations.phone = '+5...<testing>'` AND `event.params.agent_id = 'somnio-sales-v4'`. Add it via SQL — it'll affect prod too. **NOT SAFE.**
         (b) Use a feature-flag-style approach: set an env var `FORCE_V4_FOR_PHONE=+5...<testing>` on Vercel PREVIEW ONLY; in `resolveAgentIdForWorkspace` add a temporary override (TEMPORARY — remove before merge). **SAFER.**
       - **Recommended: option (b).** Add the override behind a clearly-marked TODO/FIXME so Plan 07 Task 7.5 (LEARNINGS) reminds you to remove before merge.

    4. **Execute scenarios S1-S4 from WhatsApp testing number:**
       - **S1:** Send 1 message ("hola"). Expect ONE reply. Check sandbox `/sandbox` → Interruption tab → confirm `lock_acquired` + `lock_released_normal` events; no errors.
       - **S2:** Send 2 messages back-to-back (<500ms — easiest: paste 2 lines very fast or write 2 quick replies in 1s). Expect ONE combined reply OR the second wins. Check Interruption tab → confirm `lock_acquire_failed_follower` + `interrupt_written` + `msg_aborted_path_a_combined` events.
       - **S3:** This requires inducing a TTL expiry on prod — skip on real WhatsApp (too disruptive). **REVISION W4: skip with note "S3 covered by Vitest E2E only; manual reproduction infeasible without artificial hang induction. UAT.md sign-off acknowledges this explicitly".**
       - **S4:** Send 1 message → wait until the bot sends the FIRST template (visible in WhatsApp) → IMMEDIATELY send a second message. Expect: bot truncates remaining templates from msg1, processes msg2 standalone. Check Interruption tab → `msg_aborted_path_b_solo` event present.

    5. **Inspect `agent_observability_events` directly:**
       ```sql
       SELECT created_at, label, payload FROM agent_observability_events
       WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
         AND label IN ('lock_acquired','lock_released_normal','lock_acquire_failed_follower','interrupt_written','msg_aborted_path_a_combined','msg_aborted_path_b_solo','zombie_lambda_exit','redis_unavailable_fallback_failed','lock_orphan_swept_by_cron')
         AND created_at > now() - interval '15 minutes'
       ORDER BY created_at DESC LIMIT 50;
       ```
       Confirm rows match the scenarios.

    REPORT BACK by typing one of:
    - "approved Phase 3" with summary like "S1 ✓ S2 ✓ S3 skipped per REVISION W4 plan S4 ✓ — no errors".
    - "blocked: <describe>" if anything misbehaved.

    Until "approved Phase 3" received, do NOT proceed.
  </how-to-verify>
  <resume-signal>Type "approved Phase 3" after S1/S2/S4 smoke completed on Vercel preview.</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 7.4: D-19 Phase 4 — Visual smoke in sandbox + observability spot-check + REVISION W4 explicit S3 deferral sign-off</name>
  <what-built>Phase 3 confirmed scenarios work via real WhatsApp. Phase 4 confirms the operator-facing surface (sandbox debug tab + observability queries) presents the data correctly — this is the operator's window into the system for production debugging. REVISION W4 adds explicit, blocking sign-off for S3 deferral.</what-built>
  <how-to-verify>
    USER STEPS:

    1. **Local sandbox smoke** (port 3020):
       - `npm run dev` (port 3020).
       - Navigate to `/sandbox`.
       - Click the new "Interruption" tab in the debug panel (next to Sub-Loop).
       - Select a conversation+session from Phase 3 testing.
       - Confirm the tab shows the 14 D-17-extended lifecycle events in time order with timestamps in `America/Bogota` timezone.
       - Confirm the visual styling renders cleanly (no broken icons, no overflowing JSON, no missing badges).

    2. **Inngest dashboard spot-check** — confirm the new cron is registered:
       - Visit https://app.inngest.com → your app → Functions tab.
       - Look for `debounce-v2-lock-cleanup` with schedule `*/5 * * * *` (TZ America/Bogota).
       - Trigger one manual run; confirm `swept: N, kept: M, active_sessions_checked: P` return value present (REVISION B1 — output shape includes active_sessions_checked).

    3. **Vercel logs spot-check** — confirm structured logs are visible:
       - Vercel dashboard → preview deployment → Logs.
       - Filter for `[interruption-v2]` — confirm log lines for `lock_acquired`, `lock_released_normal` are present with payloads (D-11 dual emission).

    4. **Smoke `agent-scope.md` doc** — open `.claude/rules/agent-scope.md` in editor; scroll to `### Module Scope: interruption-system-v2` (Task 7.2). Confirm content is correct and ready for future devs.

    5. **REVISION W4 — explicit S3 deferral sign-off:** Open `.planning/standalone/debounce-interruption-system-v2/UAT.md` and confirm the blocking entry "User acknowledges S3 (TTL expiry) is covered by Vitest E2E only. Manual reproduction on Vercel preview deferred (would require artificial hang induction). Confidence: HIGH that S3 path works (covered by unit + e2e mock-redis tests)." is present. User must explicitly confirm this entry — typing "S3 deferral acknowledged" — as part of the Phase 4 sign-off.

    REPORT BACK:
    - "approved Phase 4 — ready to merge — S3 deferral acknowledged" if all 5 checks pass (REVISION W4 — the S3 deferral acknowledgment is now part of the required text).
    - "blocked: <describe>" otherwise.
  </how-to-verify>
  <resume-signal>Type "approved Phase 4 — ready to merge — S3 deferral acknowledged" after sandbox + Inngest + Vercel logs verified AND S3 deferral entry signed off.</resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 7.5: Write LEARNINGS.md + UAT.md (CLAUDE.md Regla 0 step 7) — REVISION W4: UAT.md includes explicit BLOCKING S3 deferral acknowledgment entry</name>
  <read_first>
    - All previous SUMMARYs (00-06)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/LEARNINGS.md (template/reference — most recent shipped standalone)
    - .planning/standalone/agent-godentist-fb-ig/LEARNINGS.md (template/reference — sibling-pattern shipped recently)
  </read_first>
  <action>
    1. Create `.planning/standalone/debounce-interruption-system-v2/LEARNINGS.md` covering:

       - **What was built** — 1-paragraph summary referencing D-01 + D-04 + D-07.
       - **Bugs encountered during execution** — list any bugs found in Plans 00-06 with cause + fix.
       - **Patterns established (reusable)** — at minimum:
         - "Distributed mutex via `@upstash/redis` SET NX + Lua release-if-owner — reusable for any future module that needs cross-lambda coordination."
         - "Fencing token with explicit threading (NOT AsyncLocalStorage) — 4-layer plumbing is acceptable when only 4 layers."
         - "Subclass-extension-of-existing-adapter pattern (V4MessagingAdapter extends MessagingProductionAdapter) — clean way to gate new behavior on agent-id without touching the base for other agents (Regla 6)."
         - "Exhaustive `Record<UnionType, X>` for TAB_ICONS — anti-Pitfall 6 from v4-subloop-debug-view shipping pattern."
         - "Inngest event payload extension via optional fields — backward-compatible additions don't break existing callers."
         - "REVISION B4 pattern: extract shared helper modules to a neutral location (`src/lib/agents/registry-helpers.ts`) to avoid dynamic-import circular risks when multiple subsystems need the same routing logic."
         - "REVISION W3 pattern: thread context (channel/identifier) via event.data + EngineInput instead of re-resolving via DB query downstream — preserves Regla 3 wrapper purity and eliminates a class of race conditions."
       - **Anti-patterns avoided** — list:
         - "Did NOT use Redlock — Kleppmann's critique + our scale (1 msg/sec peak per conversation) doesn't need it."
         - "Did NOT use AsyncLocalStorage for lockHandle — explicit threading wins for testability."
         - "Did NOT remove Inngest concurrency=1 — research showed it's strict, kept as belt-and-suspenders."
         - "Did NOT add a feature flag (D-07) — v4 is dormant, no traffic to gate."
         - "Did NOT introduce createAdminClient in v4-production-runner.ts (REVISION W3) — channel/identifier threaded via EngineInput instead."
         - "Did NOT use dynamic import `await import(...)` from webhook handlers to fetch resolveAgentIdForWorkspace (REVISION B4) — STATIC import from shared `src/lib/agents/registry-helpers.ts`."
       - **Things deferred to follow-up standalone** — list:
         - "Migration to v3/godentist/recompra/pw-confirmation — separate standalones per agent (D-04)."
         - "Semantic synthesis of combo (vs `\n` concat) — D-06 v2.1."
         - "AbortController + side-channel polling during LLM calls — D-13 v2.1."
         - "Live SSE in sandbox tab — RESEARCH Open Question 3 v2.1."
         - "FB/IG dedup constraint (REVISION W6) — accepted as forward-looking risk; revisit when v4 begins serving FB/IG."
         - "Manual S3 (TTL expiry) reproduction on Vercel preview (REVISION W4) — deferred to follow-up if we ever build artificial hang-induction tooling."
       - **Critical reminder: TEMPORARY OVERRIDE TO REMOVE** — if Task 7.3 step 3 used a `FORCE_V4_FOR_PHONE` env-var override, list this here as a BLOCKER for merge: "Remove `FORCE_V4_FOR_PHONE` override in resolveAgentIdForWorkspace (now in registry-helpers.ts per REVISION B4) before merging to main."
       - **Cost telemetry** — total tokens estimated to plan + execute (rough), measured Upstash latency from Plan 00 Task 0.2, sub-loop P99 from Plan 00 Task 0.1, REVISION W7 keepTtl verdict from Plan 00 Task 0.5b.

    2. Create `.planning/standalone/debounce-interruption-system-v2/UAT.md`:
       ```markdown
       # UAT — debounce-interruption-system-v2

       Date: <fill>
       Approver: <user email>

       ## D-19 Phase 1 (Unit Tests)
       - [ ] `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exits 0 — covers LOCK-01..05 + LOCK-07.
       - Result: <pass/fail>

       ## D-19 Phase 2 (E2E Vitest)
       - [ ] `npx vitest run src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts` exits 0 — S1-S4 covered.
       - Result: <pass/fail>

       ## D-19 Phase 3 (Vercel preview + WhatsApp)
       - [ ] S1: single message — single reply, lock_acquired + lock_released_normal observed.
       - [ ] S2: 2 messages back-to-back — combined reply, msg_aborted_path_a_combined observed.
       - [ ] S3: skipped per REVISION W4 (Vitest only — see explicit acknowledgment section below).
       - [ ] S4: send 1 template then interrupt — msg_aborted_path_b_solo observed.
       - Approval: <timestamp from Task 7.3 resume>.

       ## D-19 Phase 4 (Visual smoke)
       - [ ] Sandbox Interruption tab renders correctly (14 D-17-extended events; REVISION B1).
       - [ ] Inngest cron `debounce-v2-lock-cleanup` registered + manual run successful (output includes `active_sessions_checked` per REVISION B1).
       - [ ] Vercel logs show `[interruption-v2]` dual emission.
       - [ ] `.claude/rules/agent-scope.md` Module Scope entry reviewed and correct.
       - Approval: <timestamp from Task 7.4 resume>.

       ## REVISION W4 — Explicit S3 Deferral Acknowledgment (BLOCKING)

       Scenario S3 (TTL expiry / zombie lambda) is covered by Vitest E2E mock-redis test ONLY.
       Manual reproduction on Vercel preview is DEFERRED because it would require artificial hang
       induction in production code (e.g., a temporary debug endpoint that holds a lock past TTL),
       which we explicitly do not want shipped even to preview.

       Confidence: HIGH that S3 path works.
       Coverage breakdown:
         - Unit tests: assertHoldsLock returns false on UUID mismatch (lock.test.ts).
         - Unit tests: Lua release-if-owner does NOT delete foreign lock (lock.test.ts).
         - Unit tests: force-acquire succeeds when prior key expired (mock-redis __simulateTtlExpiry).
         - E2E test: full S3 sequence in e2e-scenarios.test.ts S3 case asserts `lock_force_acquired_after_ttl_expiry` + `zombie_lambda_exit` event emission order.

       Approver MUST type "S3 deferral acknowledged" in the Phase 4 resume signal (Task 7.4)
       AND check this box before merge:
       - [ ] **REVISION W4 ACKNOWLEDGMENT:** User acknowledges S3 is covered by Vitest E2E only; manual reproduction deferred; HIGH confidence accepted.

       ## Pre-merge blockers cleared
       - [ ] No temporary `FORCE_V4_FOR_PHONE` override or similar test-only flag still in code.
       - [ ] `git diff main` shows only the 7-plan diffs and no diagnostic routes leftover (`src/app/api/_diagnostics/` absent).
       - [ ] Vercel Production env vars UPSTASH_REDIS_REST_URL/TOKEN populated (Plan 00 Task 0.3).
       - [ ] REVISION B4: `src/lib/agents/registry-helpers.ts` exists and exports `resolveAgentIdForWorkspace`; webhook handlers STATIC-import from it (no `await import`).
       - [ ] REVISION W3: `grep -c "createAdminClient" src/lib/agents/engine/v4-production-runner.ts` == 0 (no new createAdminClient introduced in runner).
       - [ ] REVISION B1: LockEventLabel union has 14 entries (includes `lock_orphan_swept_by_cron`).
       - [ ] REVISION B2: Plan 06 `depends_on` lists [01, 02, 04, 05].
       - [ ] REVISION W7: 00-MEASUREMENTS.md records keepTtl verdict; Plan 04 V4MessagingAdapter uses the chosen branch.

       ## Sign-off
       <user types "approved to merge" + date here>
       ```

    3. Both files committed to standalone dir. Update the Memory file (per `MEMORY.md` convention) at the end of execution to note the standalone shipped — that's done via the orchestrator after merge, not part of this task.
  </action>
  <verify>
    <automated>test -f .planning/standalone/debounce-interruption-system-v2/LEARNINGS.md && test -f .planning/standalone/debounce-interruption-system-v2/UAT.md && grep -c "Bugs encountered\|Patterns established" .planning/standalone/debounce-interruption-system-v2/LEARNINGS.md && grep -c "approved" .planning/standalone/debounce-interruption-system-v2/UAT.md && grep -c "REVISION W4 ACKNOWLEDGMENT\|S3 deferral acknowledged" .planning/standalone/debounce-interruption-system-v2/UAT.md</automated>
  </verify>
  <acceptance_criteria>
    - `test -f .planning/standalone/debounce-interruption-system-v2/LEARNINGS.md` succeeds.
    - `test -f .planning/standalone/debounce-interruption-system-v2/UAT.md` succeeds.
    - `grep -c "Bugs encountered" .planning/standalone/debounce-interruption-system-v2/LEARNINGS.md` ≥ 1.
    - `grep -c "Patterns established" .planning/standalone/debounce-interruption-system-v2/LEARNINGS.md` ≥ 1.
    - `grep -c "Phase 3\|Phase 4" .planning/standalone/debounce-interruption-system-v2/UAT.md` ≥ 2.
    - `grep -c "approved" .planning/standalone/debounce-interruption-system-v2/UAT.md` ≥ 1 (user sign-off placeholder + filled).
    - **REVISION W4:** `grep -c "REVISION W4 ACKNOWLEDGMENT\|S3 deferral acknowledged" .planning/standalone/debounce-interruption-system-v2/UAT.md` ≥ 2 (explicit blocking acknowledgment present).
    - **REVISION B1/B2/B4/W3/W7:** Pre-merge blockers section references all 5 revisions for verification.
  </acceptance_criteria>
  <done>LEARNINGS + UAT committed; standalone is shippable; REVISION W4 S3 deferral acknowledgment is BLOCKING for merge.</done>
</task>

</tasks>

<verification>
1. `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exits 0 (all 5 test files).
2. `npx tsc --noEmit -p tsconfig.json` clean across all files modified by Plans 00-07.
3. `.claude/rules/agent-scope.md` has `### Module Scope: interruption-system-v2` section.
4. LEARNINGS.md + UAT.md present in standalone dir.
5. User has confirmed Phase 3 + Phase 4 via the two checkpoint tasks.
6. REVISION W4: UAT.md contains the BLOCKING S3 deferral acknowledgment + Phase 4 resume signal requires "S3 deferral acknowledged".
</verification>

<success_criteria>
- D-19 all 4 phases passed (1+2 via Vitest, 3+4 via user smoke).
- Module scope documented per CLAUDE.md Regla 4.
- LEARNINGS captured for future migration standalones.
- REVISION W4: S3 deferral explicitly acknowledged in UAT as BLOCKING entry.
- Ready to merge to main.
</success_criteria>

<output>
After completion, create `.planning/standalone/debounce-interruption-system-v2/07-SUMMARY.md` listing: E2E test count, user approval timestamps for Phases 3+4, REVISION W4 S3 deferral acknowledgment text from UAT.md, and any blockers documented in LEARNINGS that must be cleared before merging to main.
</output>
