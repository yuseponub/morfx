# Phase somnio-v4-crm-subloop — Research

**Researched:** 2026-05-29
**Domain:** Internal codebase integration — consolidate v4 CRM mutations into the sub-loop orchestrator (grounded LLM decides+executes), replacing the deterministic inline path. v4 DORMANT (Regla 6).
**Confidence:** HIGH on the integration surface (every claim cited file:line + verbatim read). MEDIUM on the D-15 flow-change downstream effects (automations audited live in DB; behavioral effects reasoned, not executed). LOW on a few items explicitly flagged for user decision.

> **Method note (user mandate honored):** every factual claim below cites `file:line` from code I read this session, or a live DB query I ran this session, or is explicitly marked `[ASSUMED]` / `NOT VERIFIED`. Where the spec assumed something that the code contradicts, I say so loudly.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-16 — research HOW, do not re-decide)
- **D-01:** Gate de activación del sub-loop CRM vive **post-sales-track** (`somnio-v4-agent.ts:441-481`). NO mover a comprehension.
- **D-02:** Gate determinista pero amplio (alto recall): `salesResult.accion ∈ CRM-actions` ∨ `changes.newFields ∩ {direccion,ciudad,depto,barrio,correo}` ∨ `classification.category='datos'`.
- **D-03:** gate preciso (recall) + sub-loop grounded rescata extracción fallida (precisión) + guards red final. NO "prender siempre + filtrar con guards".
- **D-04:** Dentro del sub-loop, el LLM grounded decide+ejecuta la mutación (no re-decisión determinista mecánica).
- **D-05:** Aditivo: `resolveResponseTrack` (`:606`) sigue corriendo y enviando templates el mismo turno. El sub-loop CRM es **solo el camino de mutación**, concurrente con el track conversacional.
- **D-06:** Big-bang: ELIMINAR `executeInvocations` (`invocations.ts`) + el `createOrder` del runner (`v4-production-runner.ts:1126-1143`). El sub-loop `crm_mutation` es el ÚNICO camino CRM.
- **D-07:** `cancelar` se queda en handoff (guard R1). `moveOrderToStage(CANCELADO)` NO se activa en este standalone.
- **D-08:** Dos ground truths — Vista A (DB via crm-query-tools) + Vista B (ledger `crmActions[]` + `accionesEjecutadas`). Discrepancia A↔B = señal.
- **D-09:** Grounding contiene: pedido activo (id, stage, creado, items, valor, dirección) + historial (`order_stage_history` + notas) + contacto (id, email/tel, tags) + **mensaje crudo**.
- **D-10:** Cache snapshot Vista A en `session_state` bajo clave propia `_v4` (NO `_v3:*`). Carga 1ª vez que el gate prende; ledger actualiza snapshot tras mutación propia; **re-query fresco a DB ANTES de createOrder**; CAS en moveOrderToStage.
- **D-11:** Grounding lazy (solo al prender el gate). "Pedido activo existe" es contexto para decidir crear-vs-actualizar, NO condición de disparo.
- **D-12 (3a):** `createOrder` con pedido activo existente (stage no-terminal) → guard rechaza y devuelve el pedido existente (`already_exists`). Backstop: idempotency key reusando `crm_mutation_idempotency_keys`.
- **D-13 (3b):** `moveOrderToStage` en scope (confirmación). CAS existente (`orders.ts:631-667`, flag `crm_stage_integrity_cas_enabled`). Whitelist: **solo → CONFIRMADO desde stages pre-confirmación**.
- **D-14 (4a):** El sub-loop puebla `crmActions[]` del ledger con `{tool, args, result, code?, origen:'rag', stageAtTime?}`.
- **D-15:** `createOrder` se ADELANTA: dispara con datos+pack listos (`mostrar_confirmacion`/`seleccion_pack`+datosCriticos); nace en primer stage ANTES de confirmar. R5 (`transitions.ts:261-269`) cambia de `confirmar→crear_orden` a `confirmar→moveOrderToStage(CONFIRMADO)`. Consecuencia aceptada: lead-capture (pedidos sin confirmar en primer stage).
- **D-16 (4b):** Sin feature flag. Big-bang en v4 DORMANT + greps Regla 6. Rollback = no activar v4.

### Claude's Discretion
- Forma exacta de inyectar el grounding al `SubLoopContext` (campo nuevo tipado fuerte).
- Mecánica de actualizar el snapshot `_v4` desde el resultado de la mutación.
- Cómo se pasa la "instrucción/hint determinista" (qué mutación sugiere el state-machine) al prompt del sub-loop.

### Deferred Ideas (OUT OF SCOPE)
- Invalidación de cache por edición humana en CRM.
- Whitelist de transiciones configurable por workspace (por ahora hardcode → CONFIRMADO).
- Observabilidad CRM "completa" más allá del ledger.
- Turno híbrido template+RAG (standalone #3).
- `cancelar` / moveOrderToStage(CANCELADO).
</user_constraints>

---

## Summary

This phase replaces v4's deterministic inline CRM path (`executeInvocations` + the runner's `createOrder`) with a grounded sub-loop that decides+executes mutations. The locked decisions are clear; the work is almost entirely **internal wiring** plus three **non-trivial gaps** the discuss-phase did not surface:

1. **The sub-loop's `crm_mutation` path cannot execute mutations today and is structurally incapable of reporting them.** `isCrmMutation` is hardcoded `false` (`somnio-v4-agent.ts:225`), so the path is dead. Worse: even when reached, `runLegacySubLoop` (`sub-loop/index.ts:724`) returns a `LoopOutcome` whose schema (`output-schema.ts:35-93`) has **no CRM-action output fields** — only `template`/`no_match`. The LLM can *call* the mutation tools (they're wired in `tools.ts:52-62`), but the orchestrator has **no contract to read back what was mutated** to populate `crmActions[]` (D-14). This is the single largest design gap and needs a schema extension. [VERIFIED]

2. **`createOrder` requires `contactId` (uuid) + `pipelineId` (uuid); the v4 agent never resolves them.** `crm-mutation-tools.createOrder` (`crm-mutation-tools/orders.ts:77-98`) takes UUIDs, not a phone. Today the *runner* resolves contact/pipeline/stage via `ProductionOrdersAdapter` + `OrderCreator.findOrCreateContact` (`engine-adapters/production/orders.ts:108-201`). D-06 deletes that path, so the sub-loop must acquire a `contactId` + `pipelineId` + `stageId` first. The grounding (View A `getActiveOrderByPhone`) returns a contact only *if one exists*; **new clients have no contact yet** → the sub-loop needs a create-or-resolve-contact step that domain-layer-compliant code does not currently expose to v4. [VERIFIED]

3. **`getActiveOrderByPhone` (View A) returns `config_not_set` for the Somnio workspace today.** Live query: `crm_query_tools_config` and `crm_query_tools_active_stages` are **empty** for `a3843b3f-...`. So the primary grounding tool returns `status:'config_not_set'` and never surfaces an active order. View A is effectively blind until the operator configures active stages OR the sub-loop passes a `pipelineId` override (which still needs active-stage config to partition active vs terminal). [VERIFIED via live DB]

The **D-15 automation risk is real but currently dormant**: there IS one `order.created` automation ("template final ultima", id `71c4f524...`) firing 3 WhatsApp templates + 1 SMS — but it only matches when the order is created in stage **NUEVO PAG WEB** (`42da9d61...`). The deterministic agent creates orders in **NUEVO PEDIDO** (`6be952b0...`, resolved by name in `production/orders.ts:164-173`), not NUEVO PAG WEB. So as long as early `createOrder` lands in the same stage the deterministic path used (NUEVO PEDIDO) or domain's positional first stage (AGENDADO, position 0), **the order.created automation does not fire**. The plan must pin the createOrder stage explicitly to avoid accidentally landing in NUEVO PAG WEB. [VERIFIED via live DB + `automation-runner.ts:95-101`]

**Primary recommendation:** Treat this as a sub-loop **output-contract extension** + **grounding-tool wiring** problem, not just a "move the call site" problem. Extend `LoopOutcomeSchema` with a `crmActions[]` echo, give the sub-loop a contact-resolution + create-order tool path with UUIDs pre-resolved by the orchestrator, configure (or hardcode-bridge) the active-stage grounding, and pin every stage UUID config-driven (env-var bridge like the existing `SOMNIO_CANCELED_STAGE_UUID` pattern at `invocations.ts:64`). Pin createOrder's birth stage to NUEVO PEDIDO (status quo) to keep automations dormant.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Gate de activación CRM | Agent pipeline (`somnio-v4-agent.ts`) | — | Único punto con `salesResult.accion` + `changes.newFields` (D-01, verified post-sales-track). |
| Decisión+ejecución mutación | Sub-loop orchestrator (`sub-loop/index.ts`) | crm-mutation-tools | LLM grounded decide (D-04); tools ejecutan vía domain (Regla 3). |
| Grounding View A (DB truth) | crm-query-tools (`getActiveOrderByPhone`/`getOrderById`) | domain/orders | Read-only autoritativo; Regla 3 via domain. |
| Grounding View B (agent memory) | Ledger `crmActions[]` + `accionesEjecutadas` in session_state | state.ts deserialize | Gratis desde session_state, ya deserializado. |
| Idempotencia createOrder | crm-mutation-tools `withIdempotency` + `crm_mutation_idempotency_keys` table | domain/crm-mutation-idempotency | Tabla existente, TTL 30d cron. |
| CAS moveOrderToStage | domain/orders (`moveOrderToStage`, flag `crm_stage_integrity_cas_enabled`) | crm-mutation-tools propaga verbatim | CAS vive en domain (orders.ts:631). |
| Whitelist → CONFIRMADO | Sub-loop guard (recommend) | tool guard | No existe whitelist hoy; debe construirse v4-scoped. |
| Contact resolution (UUID) | **GAP — no v4-accessible domain path** | OrderCreator (to be deleted by D-06) | See Pitfall 6 / Open Question. |
| Stage UUID resolution | env-var bridge + (future) config-driven | crm_query_tools_config | Pattern `SOMNIO_CANCELED_STAGE_UUID` (invocations.ts:64). |

---

## Phase Requirements

> No formal REQ-IDs were provided. The 16 decisions D-01..D-16 are the requirement set; this table maps each to the research finding that enables it.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01 | Gate post-sales-track | Insertion point §A.1 — replace `executeInvocations` call at `somnio-v4-agent.ts:467`. Available context verified. |
| D-02 | Broad gate predicate | §A.2 — `salesResult.accion`, `changes.newFields`, `analysis.classification.category` all available at `:441-452`. |
| D-04 | LLM decides+executes | §C/§D — needs schema extension (Pitfall 1) + tool wiring (already in `tools.ts:52-62`). |
| D-05 | Additive to response-track | §A.3 — sub-loop must NOT early-return; thread between `:481` and `:606`. |
| D-06 | Big-bang removal | §E — exact consumers of `invOutcome` / `shouldCreateOrder` enumerated. |
| D-08/D-09 | Two-view grounding | §B — View A tools + shape; View B from ledger. **Gaps:** OrderDetail lacks stage name + history; config empty. |
| D-10 | `_v4` snapshot + re-query | §B.4 — `serializeState`/`commitTurn` write path; `V4_META_PREFIX='_v4:'` exists. |
| D-12 | createOrder already_exists guard | §C.1 — idempotency table + pre-check pattern. |
| D-13 | moveOrderToStage CAS + whitelist | §C.2 — CAS verified `orders.ts:631`; whitelist must be built. |
| D-14 | Populate crmActions[] origen:'rag' | §F — **requires LoopOutcome schema extension** (Pitfall 1). |
| D-15 | Adelantar createOrder | §D — transitions change + automation audit (dormant). |
| D-16 | No flag | §G — Regla 6 grep gates. |

---

## Standard Stack

This is an internal-integration phase. No new external libraries. The "stack" is existing modules to reuse (see Don't Hand-Roll).

| Module | Path | Purpose | Reuse for |
|--------|------|---------|-----------|
| crm-mutation-tools | `src/lib/agents/shared/crm-mutation-tools/` | 5 mutation tools (already wired to v4 sub-loop) | createOrder/updateOrder/moveOrderToStage/addOrderNote/updateContact execution (D-04/D-19) |
| crm-query-tools | `src/lib/agents/shared/crm-query-tools/` | read-only DB grounding | View A: `getActiveOrderByPhone`, `getOrderById`, `getLastOrderByPhone`, `getOrdersByPhone` |
| domain/orders | `src/lib/domain/orders.ts` | createOrder/moveOrderToStage (CAS) | execution backend (Regla 3) |
| crm_mutation_idempotency_keys | table + `src/lib/domain/crm-mutation-idempotency.ts` | dedup createOrder (D-12 backstop) | idempotency key reuse |
| Turn Ledger | `src/lib/agents/somnio-v4/types.ts:374-381` + `state.ts:468-487` | `CrmActionRegistrada` shape + `commitTurn` | D-14 population target (origen:'rag') |
| sub-loop | `src/lib/agents/somnio-v4/sub-loop/` | grounded LLM loop | host for CRM decision+execution |

**Verification (no new packages):** Phase touches only existing TS modules. No `npm install`.

---

## Architecture Patterns

### System Architecture Diagram (target state, D-06 applied)

```
                 inbound msg (WhatsApp / FB / IG)
                          │
              webhook-handler.ts (lock acquire, v4 only)
                          │  Inngest dispatch
                          ▼
        ┌──────────  v4-production-runner.processMessage  ──────────┐
        │  (CKPT-0 post-acquire; restart loop; finally release)     │
        │                       │                                   │
        │                       ▼                                   │
        │            somnio-v4-agent.processUserMessage             │
        │  1 comprehension → CKPT-1                                 │
        │  3 mergeAnalysis  4 computeGates  5 threshold             │
        │  6 escalation #1 (low_conf / razonamiento) ──► runSubLoop │
        │  7 guards R0/R1 → CKPT-2                                  │
        │  8 resolveSalesTrack  (salesResult.accion, changes)      │
        │                       │                                   │
        │      ╔════════════════▼═══════════════════╗   ← REPLACES │
        │      ║  NEW CRM GATE (D-01/D-02)           ║   executeInv │
        │      ║  predicate true?                    ║   ocations + │
        │      ║   ├─ load grounding (lazy, D-11)    ║   runner     │
        │      ║   │   View A: crm-query-tools (DB)  ║   createOrder│
        │      ║   │   View B: ledger crmActions[]   ║              │
        │      ║   │   + raw message (D-09)          ║              │
        │      ║   ├─ runSubLoop(reason='crm_mutation')             │
        │      ║   │     grounded LLM decides+executes               │
        │      ║   │     via crm-mutation-tools (Regla 3 → domain)   │
        │      ║   │     guards: idempotency (D-12) + CAS (D-13)     │
        │      ║   │     + whitelist →CONFIRMADO                     │
        │      ║   ├─ read back crmActions echo (SCHEMA EXT)        │
        │      ║   └─ update _v4 snapshot from result (D-10)        │
        │      ╚════════════════│═══════════════════╝               │
        │                       ▼  (ADDITIVE — does NOT return)     │
        │  11 resolveResponseTrack (templates, D-05) ── concurrent  │
        │  12 register action  13 templatesMostrados                │
        │  15 commitTurn(state, ledger w/ crmActions origen:'rag')  │
        └───────────────────────────────────────────────────────────┘
                          │
            V4MessagingAdapter send (CKPT-7.N) → WhatsApp
```

### Recommended Project Structure (files touched)

```
src/lib/agents/somnio-v4/
├── somnio-v4-agent.ts        # gate insertion + remove inline createOrder decision + populate crmActions
├── invocations.ts            # DELETE (D-06)
├── transitions.ts            # R5 change + early createOrder trigger (D-15)
├── sub-loop/
│   ├── index.ts              # crm_mutation path: grounding ctx + execute + crmActions echo
│   ├── tools.ts              # crm_mutation toolset (already wired; maybe add contact tools)
│   ├── output-schema.ts      # EXTEND LoopOutcome with crmActions[] (Pitfall 1)
│   └── prompt.ts             # crm_mutation prompt: grounding + hint + guard rules
├── crm-grounding.ts          # NEW — build View A+B grounding, _v4 snapshot read/write
└── config.ts                 # stage UUID constants / env bridges (CONFIRMADO, first stage)
```

### Pattern 1: Lazy grounding loaded only when the gate fires (D-11)
**What:** Build a strongly-typed `CrmGrounding` object only inside the gate branch.
**When:** Gate predicate true (post-sales-track).
**Example (shape proposal — Claude's discretion D-93):**
```typescript
// NEW file crm-grounding.ts
export interface CrmGrounding {
  // View A — DB truth (crm-query-tools)
  activeOrder: {
    id: string; stageId: string; createdAt: string; totalValue: number
    shippingAddress: string | null; shippingCity: string | null
    items: Array<{ sku: string; title: string; quantity: number; unitPrice: number }>
  } | null
  contact: { id: string; phone: string | null /* email/tags: see Pitfall 4 */ } | null
  activeOrderQueryStatus: 'found' | 'no_active_order' | 'not_found' | 'config_not_set' | 'error'
  // View B — agent memory (ledger + acciones)
  ledgerCrmActions: CrmActionRegistrada[]   // from input.turnLedgerDims.crmActions
  // raw message (D-09) already in ctx.userMessage
}
```
Thread it into `SubLoopContext` (currently `sub-loop/index.ts:77-84` has NO CRM state) as `grounding?: CrmGrounding`.

### Pattern 2: Stage UUID config-driven via env bridge (existing pattern)
**What:** Resolve CONFIRMADO + first-stage UUIDs lazily from env, fail-closed if unset.
**Source:** `invocations.ts:64-66` (`SOMNIO_CANCELED_STAGE_UUID`).
```typescript
// Verified Somnio UUIDs (live DB 2026-05-29, pipeline "Ventas Somnio Standard"
// id a0ebcb1e-d79a-4588-a569-d2bcef23e6b8, is_default=true):
//   CONFIRMADO     = 4770a36e-5feb-4eec-a71c-75d54cb2797c (position 5)
//   NUEVO PEDIDO   = 6be952b0-0a95-4957-b5f7-62e8fd8eb815 (position 2) ← agent's birth stage today
//   FALTA INFO     = 05c1f783-8d5a-492d-86c2-c660e8e23332 (position 3)
//   FALTA CONFIRMAR= e0cf8ecf-1e8c-46bc-bc57-f5580bfb12bd (position 4)
//   NUEVO PAG WEB  = 42da9d61-6c00-4317-9fd9-2cec9113bd38 (position 1) ← AVOID (automation fires)
function getConfirmadoStageUuid(): string | null {
  return process.env.SOMNIO_CONFIRMADO_STAGE_UUID ?? null
}
```

### Anti-Patterns to Avoid
- **Early-return from the CRM gate.** Would violate D-05 (response-track must still run). The existing `executeInvocations` does NOT early-return (it returns an outcome that the agent processes inline, `:467-569`); preserve that property. The *escalation* paths (`:251-313`, `:490-549`) DO early-return via `mapOutcomeToAgentOutput` — the new CRM gate must NOT follow that pattern.
- **Hardcoding stage names in transitions.ts.** D-29 (turn-ledger) + transitions.ts header forbid hardcoded names; use UUID env bridge.
- **Letting createOrder land in NUEVO PAG WEB.** Fires the `order.created` automation (3 templates + SMS). Pin to NUEVO PEDIDO.
- **Caching grounding between checkpoints.** D-10/D-15 require fresh re-query before createOrder.
- **Spreading all 15 mutation tools into the sub-loop.** `tools.ts:25-26` warns 15 tools degrades the tooling model's focus; keep the D-19 minimal set.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| createOrder dedup | Custom "did we already create" check | `crm_mutation_idempotency_keys` via `withIdempotency` (`crm-mutation-tools/helpers.ts:146-202`) | TTL 30d cron, race-safe ON CONFLICT, re-hydrate path (D-12 backstop) |
| Stage concurrency | Re-fetch + compare + update | CAS in `domain.moveOrderToStage` (`orders.ts:631-667`, flag `crm_stage_integrity_cas_enabled`) | Atomic swap predicate; same-stage no-op short-circuit (`:619-629`) |
| CRM action recording | New persistence dim | `CrmActionRegistrada` + `commitTurn` (`state.ts:468-487`) | Ledger already designed for `origen:'rag'` (D-14); PII redaction built in (`state.ts:423-453`) |
| Active-order partition | New "is active" query | `getActiveOrderByPhone` (`crm-query-tools/orders.ts:233-359`) | Config-driven active/terminal partition (D-15/D-17/D-27) — **BUT config empty today, see Pitfall 4** |
| Mutation execution | Direct supabase writes | crm-mutation-tools → domain (Regla 3) | Workspace isolation, observability events, soft-delete guarantees |
| Order detail re-fetch | Manual select | `getOrderById` (`domain/orders.ts:1853+`) | Already re-hydrates with items |

**Key insight:** Almost every "guard" the spec describes (idempotency, CAS) already exists in shared modules. The genuinely new work is (1) the sub-loop output contract for CRM, (2) contact UUID resolution, and (3) the active-stage config. Do NOT re-implement the guards.

---

## Common Pitfalls

### Pitfall 1: The sub-loop has no output contract to report CRM mutations (BLOCKER)
**What goes wrong:** D-14 says the sub-loop populates `crmActions[]` with `{tool, args, result, code?, origen:'rag', stageAtTime?}`. But `LoopOutcomeSchema` (`output-schema.ts:35-93`) only has `status ∈ {generated, template, no_match}` and NO field for executed mutations. The grounded LLM *calls* the tools (wired in `tools.ts:52-62`), and AI SDK records tool results in `rawResult.steps[].toolResults` — but `runLegacySubLoop` (`sub-loop/index.ts:724-914`) only reads the `Output.object` (`safeAccessOutput`, `:747`), never the tool results, for the return value. The `extractStepData` helper (`:144-225`) DOES parse tool results but only for the **debug payload**, not the outcome.
**Why it happens:** The schema was designed for the RAG path (text generation), and the crm_mutation path was dead (`isCrmMutation:false`), so nobody needed the echo.
**How to avoid:** Two options for the planner:
  - **(A) Extend `LoopOutcomeSchema`** with an optional `crmActions: CrmActionRegistrada[]-ish` array the LLM must emit describing what it executed. Risk: the LLM may lie about what it did vs what actually succeeded.
  - **(B) Have the orchestrator derive `crmActions[]` from the AI SDK tool-results** (`rawResult.steps[].toolResults`, shape already parsed at `index.ts:163-177`) — `tr.toolName` → `tool`, `tr.input` → `args`, `tr.output.status` → `result` (`'executed'`→`'success'`, `'stage_changed_concurrently'`→`'cas_reject'`, else `'failed'`). This is **ground-truth** (actual tool outputs) and aligns with the "guards as red final net" philosophy. **RECOMMENDED.** The `MutationResult` status enum (`crm-mutation-tools/orders.ts` returns `'executed'|'duplicate'|'resource_not_found'|'validation_error'|'stage_changed_concurrently'|'error'`) maps cleanly to `CrmActionRegistrada.result ∈ {'success','failed','cas_reject'}`.
**Warning signs:** A plan that wires the gate but never reads tool results = `crmActions[]` stays empty = D-14 unmet = View B grounding is permanently blind for future turns.

### Pitfall 2: createOrder needs contactId+pipelineId UUIDs the agent never resolves (BLOCKER)
**What goes wrong:** `crm-mutation-tools.createOrder.inputSchema` (`crm-mutation-tools/orders.ts:77-98`) requires `contactId: z.string().uuid()` and `pipelineId: z.string().uuid()`. The v4 agent works in `datosCapturados` (name/phone/address strings) — it has **no contactId UUID**. Today the runner's `ProductionOrdersAdapter.createOrder` (`engine-adapters/production/orders.ts:36-239`) resolves: contact via `OrderCreator.findOrCreateContact(contactData, sessionId)` (`:108`), pipeline via default-pipeline lookup (`:137-153`), and stage "NUEVO PEDIDO" by name (`:164-173`). D-06 deletes this. The sub-loop LLM calling `createOrder` would fail Zod validation without UUIDs.
**Why it happens:** The spec assumes the sub-loop can just "decide+execute createOrder", but the existing tool API is UUID-first and contact creation lives in a module D-06 removes.
**How to avoid:** The orchestrator must resolve `contactId` + `pipelineId` (+ stageId) **before** entering the sub-loop, and either (a) pass them into the grounding so the LLM passes them to the tool, or (b) pre-bind them. `getActiveOrderByPhone`/`getContactByPhone` return an existing contact, but **new clients have none**. Options:
  - Expose `findOrCreateContact` logic via a domain-layer / crm-mutation-tools path (NOT yet present — `crm-mutation-tools` has `createContact` at `contacts.ts` but it also takes no phone-lookup-then-create combined op). **NEEDS A PLAN DECISION** (see Open Questions).
  - Keep a thin contact-resolution helper in v4 that calls domain `resolveOrCreateContact` (verify it exists — `OrderCreator.findOrCreateContact` uses `executeToolFromAgent`, tool-handler path, which D-06 removal may orphan).
**Warning signs:** A plan that calls `createOrder` with phone instead of UUID; or that deletes `ProductionOrdersAdapter.createOrder` without replacing contact resolution.

### Pitfall 3: View A grounding returns `config_not_set` for Somnio today (HIGH)
**What goes wrong:** `getActiveOrderByPhone` (`crm-query-tools/orders.ts:233-359`) calls `findActiveOrderForContact` (`crm-query-tools/helpers.ts:90-129`), which reads `crm_query_tools_config` + `crm_query_tools_active_stages`. **Live query (2026-05-29): both tables are EMPTY for workspace `a3843b3f-...`.** So `configWasEmpty=true` → returns `status:'config_not_set'` (`orders.ts:303-310`) and **never surfaces an active order**, even if one exists in NUEVO PEDIDO/FALTA INFO/etc.
**Why it happens:** crm-query-tools was shipped but has "0 consumers in prod" (per CLAUDE.md); the Somnio operator never configured `/agentes/crm-tools`.
**How to avoid:** Either (a) the operator configures active stages for Somnio before activation (operational step, document it), or (b) the grounding code passes a `pipelineId` override AND the plan accepts that with empty `activeStageIds`, `findActiveOrderForContact` returns `active:null` + `lastTerminal` (since `activeStageIds.size===0` but `pipelineIdOverride !== undefined` skips the config_not_set branch — see `helpers.ts:111`). With override-and-empty-config, EVERY order is "terminal" → `active=null` → grounding thinks there's no active order → createOrder may duplicate. **This is the Doralba-class duplicate risk D-10 is meant to prevent.** Recommend: the grounding must NOT rely solely on `getActiveOrderByPhone`; fall back to `getLastOrderByPhone` / `getOrdersByPhone` (which work without config) + reason about stage via OrderDetail.stageId + a v4-local active-stage set.
**Warning signs:** Plan assumes `getActiveOrderByPhone` "just works"; no operator-config step; no fallback for empty config.

### Pitfall 4: OrderDetail has no stage NAME and no order_stage_history (MEDIUM)
**What goes wrong:** D-09 requires grounding with "pedido activo (id, stage, ...)" + "historial de cambios (`order_stage_history` + notas)". But `OrderDetail` (`domain/orders.ts:1853+`, verified select at getOrderById) returns only `stageId` (UUID) — **no stage name**, **no history**, **no notes**. crm-query-tools has NO function returning `order_stage_history` or order notes.
**Why it happens:** Query-tools were built for "active order + contact", not audit history.
**How to avoid:** For stage NAME, resolve UUID→name from `pipeline_stages` (a v4-local lookup or env-map of the 6 Ventas stages). For history/notes: either (a) descope to "id+stageId+items+value+address+contact" (the LLM rarely needs full history to decide create-vs-update), flagging the D-09 "historial" as partially deferred, or (b) add a domain read for `order_stage_history`. Recommend (a) for V1 — the discrepancy A↔B (View B ledger crmActions vs View A stage) already gives the "external change" signal D-08 wants, without needing full history.
**Warning signs:** Plan promises full history grounding without adding a domain read.

### Pitfall 5: D-15 early createOrder + the order.created automation (MEDIUM — currently dormant)
**What goes wrong:** D-15 creates the order at `mostrar_confirmacion` (before confirm). If it lands in **NUEVO PAG WEB** (`42da9d61...`), the live automation "template final ultima" (id `71c4f524...`) fires `pedido_recibido_v2` + `direccion_entrega` + `confirmar_compra` WhatsApp templates + an SMS — to a client who hasn't confirmed. That double-sends confirmation messaging and conflicts with the agent's own templates.
**Why it happens:** `automation-runner.ts:95-101` matches `order.created` automations by `triggerConfig.stageId === eventData.stageId` (+ pipelineId). The automation targets NUEVO PAG WEB.
**How to avoid:** Pin early createOrder to **NUEVO PEDIDO** (`6be952b0...`, what the deterministic path used via `production/orders.ts:164-173`) or domain's positional first stage **AGENDADO** (`dd7435c1...`, position 0). **Neither matches NUEVO PAG WEB → automation stays dormant.** Verified: no enabled `order.created` automation targets NUEVO PEDIDO or AGENDADO. Document the chosen birth stage as a locked config (env bridge).
**Warning signs:** Plan uses domain's bare `createOrder` without a stageId AND assumes "first stage" is safe without checking which stage that resolves to. (Domain first-stage by `position ASC` = AGENDADO; the *deterministic adapter* used NUEVO PEDIDO by name — these differ! Pick one deliberately.)

### Pitfall 6: Big-bang removal orphans the runner's order side-effects (MEDIUM)
**What goes wrong:** D-06 deletes the runner's createOrder (`v4-production-runner.ts:1126-1143`). That block also sets `orderResult` which is consumed downstream: `state_committed` event `orderCreated: !!orderResult?.success` (`:1085`), and the EngineOutput return fields `orderCreated`/`orderId`/`contactId` (`:1195-1197`). Removing it without rewiring leaves `orderResult` undefined → those fields go null/false even when the sub-loop created an order.
**Why it happens:** Order creation result flows back to webhook-processor via EngineOutput.
**How to avoid:** The sub-loop's CRM result (orderId/contactId/success) must flow back through `V4AgentOutput` → runner → EngineOutput. Today `V4AgentOutput` has `shouldCreateOrder`/`orderData` (`types.ts:284-289`) which D-06 obsoletes; replace with the actual mutation result (e.g., from the crmActions echo). Also the CAS-reject branch (`somnio-v4-agent.ts:484-549`) and mutation-fail audit (`:551-569`) currently depend on `executeInvocations` outcome — they must be re-expressed against the sub-loop result.
**Warning signs:** Plan deletes runner createOrder but webhook-processor still expects `orderCreated`/`orderId`.

### Pitfall 7: Interruption parity — CRM execution inside the sub-loop interacts with CKPT-3/4/5 (MEDIUM)
**What goes wrong:** The sub-loop fires CKPT-3 (post-tooling), CKPT-4 (post-generation), CKPT-5 (post-compliance) for the RAG path (`sub-loop/index.ts:291,396,454`); the legacy path fires a combined CKPT after its single `generateText` (`:760-789`). If the crm_mutation path executes a real DB mutation and THEN gets interrupted at a checkpoint, the mutation already happened but the turn is discarded (Path A escalates to `no_match` with `interrupted_at_ckpt_*`). Re-running the turn could double-execute — UNLESS idempotency (D-12) + CAS (D-13) catch it. This is exactly why D-10 mandates idempotency/CAS.
**Why it happens:** Checkpoints are between steps; a mutation is a side-effect that can't be rolled back.
**How to avoid:** (1) Ensure createOrder always passes an idempotency key (sessionId-derived, like `invocations.ts:271` pattern `somnio-v4-{tool}-{sessionId}-{tag}`) so a restart re-using the same key returns `duplicate`. (2) moveOrderToStage relies on CAS + same-stage no-op (`orders.ts:619-629`). (3) Per INTERRUPTION-PARITY.md §4: any mechanism change must be mirrored in `engine-v4.ts` (sandbox) AND `v4-production-runner.ts`. The sandbox does NOT execute real mutations (no orders adapter run — verified `engine-v4.ts` only passes `shouldCreateOrder` through, `:574`), so the planner must decide whether the sandbox should simulate CRM or remain a no-op (parity caveat — document like the RAG-send caveat in INTERRUPTION-PARITY.md §6).
**Warning signs:** createOrder without idempotency key inside an interruptible sub-loop; sandbox/prod CRM behavior diverging silently.

### Pitfall 8: `classification.category` availability for the gate (LOW — verified OK)
**What goes wrong:** D-02 uses `classification.category='datos'` as an anti-false-negative net. Need to confirm it's available post-sales-track.
**Resolution:** VERIFIED available — `analysis.classification.category` is read at `somnio-v4-agent.ts:376,820` (and `analysis` is in scope from `:164`). The gate at `:467` has full access to `analysis.classification.category`, `salesResult.accion`, and `changes.newFields`. No issue.

---

## Code Examples

### The gate predicate (D-02) — at the call site replacing `executeInvocations` (somnio-v4-agent.ts:461-481)
```typescript
// Source: composed from somnio-v4-agent.ts:441-481 + constants.ts:193-200
// CRM_ACTIONS = {crear_orden, crear_orden_sin_promo, crear_orden_sin_confirmar}
// NOTE: per D-15, the CRM-action set that fires the gate must also include
// mostrar_confirmacion (early createOrder) — extend a NEW set, do NOT mutate CRM_ACTIONS.
const SHIPPING_FIELDS = new Set(['direccion', 'ciudad', 'departamento', 'barrio', 'correo'])
const gateByAction = !!salesResult.accion && CRM_GATE_ACTIONS.has(salesResult.accion)
const gateByFields = changes.newFields.some((f) => SHIPPING_FIELDS.has(f))
const gateByCategory = analysis.classification.category === 'datos'
const crmGateFired = gateByAction || gateByFields || gateByCategory
if (crmGateFired) {
  // load grounding (lazy) → runSubLoop({ reason:'crm_mutation', ctx:{...grounding} })
  // read back crmActions echo → update _v4 snapshot
  // DO NOT return — fall through to response-track (D-05)
}
```

### Deriving crmActions[] from AI SDK tool results (Pitfall 1 option B — RECOMMENDED)
```typescript
// Source: extractStepData parsing pattern at sub-loop/index.ts:163-177
// MutationResult statuses: crm-mutation-tools/orders.ts execute() returns.
function deriveCrmActions(rawResult: any): CrmActionRegistrada[] {
  const steps = rawResult?.steps ?? []
  return steps.flatMap((step: any) =>
    (step.toolResults ?? [])
      .filter((tr: any) => MUTATION_TOOL_NAMES.has(tr.toolName))
      .map((tr: any) => {
        const status = tr.output?.status as string | undefined
        const result =
          status === 'executed' || status === 'duplicate' ? 'success'
          : status === 'stage_changed_concurrently' ? 'cas_reject'
          : 'failed'
        return {
          tool: tr.toolName,
          args: tr.input ?? {},
          result,
          code: tr.output?.error?.code,
          origen: 'rag' as const,
        } satisfies CrmActionRegistrada
      }),
  )
}
```

### The transitions.ts D-15 change (transitions.ts:261-269)
```typescript
// BEFORE (current — R5):
//   { phase:'*', on:'confirmar', action:'crear_orden',
//     condition:(_,g)=>g.datosCriticos && g.packElegido, ... }
// AFTER (D-15): confirmar with order already created → move to CONFIRMADO.
//   The createOrder now fires EARLIER at mostrar_confirmacion (seleccion_pack+datosCriticos,
//   transitions.ts:240-248). The 'confirmar' transition becomes a stage-move signal.
// IMPORTANT: transitions.ts produces TipoAccion symbols, NOT side effects. The actual
// mutation (createOrder early, moveOrderToStage on confirm) happens in the CRM gate /
// sub-loop. So D-15 needs BOTH:
//   (a) the gate to fire createOrder when accion==='mostrar_confirmacion' (early),
//   (b) a way for 'confirmar' to signal moveOrderToStage(CONFIRMADO) — either a new
//       TipoAccion (e.g. 'confirmar_orden') mapped in the gate, or reuse 'crear_orden'
//       semantics re-pointed. Recommend a new symbol to keep template mapping clean.
```

### Template mapping consequence of D-15 (response-track.ts:279-326)
```text
TODAY:  mostrar_confirmacion → resumen_<pack>           (response-track.ts:279-288)
        crear_orden          → confirmacion_orden_<zone> (response-track.ts:290-314)
AFTER D-15 (recommended mapping):
        mostrar_confirmacion → resumen_<pack>   (unchanged — order is created silently in NUEVO PEDIDO)
        confirmar(new sym)   → confirmacion_orden_<zone> (templates stay coherent: client confirms → "order placed" msg)
The createOrder side-effect moving earlier does NOT need to move the confirmacion_orden_*
template earlier — keep that template tied to the confirm step so the conversation reads:
  resumen → (client confirms) → confirmacion_orden. The early order is invisible to the client.
```

---

## Runtime State Inventory

> This is a refactor/flow-change phase. Inventory of runtime state that a code-only change does NOT auto-update.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `session_state.datos_capturados` keys with `_v4:` prefix (`constants.ts:179`); `turn_ledger_dims` column (standalone #1). NEW: `_v4` grounding snapshot key (D-10) — does not exist yet, will be written by this phase. | Code: define snapshot key + read/write in serialize/deserialize. No migration (jsonb). |
| Live service config | `crm_query_tools_config` + `crm_query_tools_active_stages` **EMPTY for Somnio** (live query 2026-05-29). Without it, View A grounding returns `config_not_set`. | Operational: operator configures `/agentes/crm-tools` for Somnio BEFORE activation, OR plan a v4-local active-stage fallback (Pitfall 3). |
| Live service config | Automation "template final ultima" (id `71c4f524...`) on `order.created` stage=NUEVO PAG WEB — lives in DB, not git. | Verify createOrder does NOT land in NUEVO PAG WEB (Pitfall 5). No change to the automation. |
| OS-registered state | None — no Task Scheduler / cron tied to this phase. Existing cron `crm-mutation-idempotency-cleanup` (30d TTL) is reused as-is. | None. |
| Secrets/env vars | `SOMNIO_CANCELED_STAGE_UUID` (referenced `invocations.ts:64`, NOT in `.env.local` — out of scope D-07). NEW (D-15): `SOMNIO_CONFIRMADO_STAGE_UUID` + birth-stage UUID env vars (recommended pattern). | Set new env vars in Vercel before activation. Fail-closed if unset. |
| Build artifacts | None — TS only, no compiled artifacts to stale. | None. |

---

## State of the Art

| Old Approach (today) | Current Approach (this phase) | When | Impact |
|--------------|------------------|--------------|--------|
| Deterministic inline CRM: `executeInvocations` (4 mutations) + runner createOrder | Grounded sub-loop decides+executes all 5 mutations | this standalone | LLM rescues failed extraction (D-03/D-04) |
| createOrder at `confirmar` (R5) | createOrder early at `mostrar_confirmacion`; confirm → moveOrderToStage(CONFIRMADO) | D-15 | Lead-capture orders; flow-change accepted |
| `crmActions[]` from deterministic acciones (`buildCrmActionsFromAcciones`, args={}) | `crmActions[]` from sub-loop tool results, origen:'rag', real args | D-14 | View B grounding becomes real |
| `crm_mutation` sub-loop path = dead (`isCrmMutation:false`) | `crm_mutation` path = the ONLY CRM path | D-06 | Removes dead-code flag; big-bang |

**Deprecated/removed by this phase:**
- `src/lib/agents/somnio-v4/invocations.ts` — entire file (D-06).
- `v4-production-runner.ts:1126-1143` createOrder block (D-06).
- `somnio-v4-agent.ts` inline createOrder decision `:571-603` + `buildCrmActionsFromAcciones` deterministic path (`:88-101`) for user-message turns (timer path may keep it — see Open Questions).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pinning early createOrder to NUEVO PEDIDO (or AGENDADO) keeps the `order.created` automation dormant. | Pitfall 5 | If a future automation targets NUEVO PEDIDO, early orders trigger it. Verified NONE enabled today. |
| A2 | Deriving crmActions[] from AI SDK `rawResult.steps[].toolResults` is reliable across the legacy `generateText` path. | Pitfall 1 / Code Examples | If AI SDK changes step shape, the echo breaks. Mitigated: `extractStepData` already depends on this shape (`:154-177`). |
| A3 | The sandbox (`engine-v4.ts`) does NOT execute real CRM mutations and may remain a no-op for CRM. | Pitfall 7 | If parity demands sandbox CRM simulation, more work. INTERRUPTION-PARITY.md §6 already documents a similar RAG-send no-op caveat. `[ASSUMED]` pending parity decision. |
| A4 | Full `order_stage_history` grounding (D-09) can be descoped to id+stageId+items+value+address+contact for V1. | Pitfall 4 | If the LLM needs history to decide, may mis-decide. Low — A↔B discrepancy gives the external-change signal. `[ASSUMED]` |
| A5 | `crm_query_tools_config` being empty is an operational gap fixable by operator config, not a code bug. | Pitfall 3 | If operator can't/won't configure, grounding needs a v4-local fallback (more work). `[VERIFIED empty; resolution ASSUMED]` |
| A6 | A new TipoAccion symbol for "confirm → move to CONFIRMADO" is cleaner than re-pointing `crear_orden`. | Code Examples | Adds a symbol + template mapping; alternative is reusing existing. Design choice for planner. |

---

## Open Questions

1. **Contact UUID resolution for new clients (BLOCKER — needs plan decision).**
   - What we know: `createOrder` needs `contactId` uuid; today `OrderCreator.findOrCreateContact` (deleted by D-06) does find-or-create via tool-handlers; `crm-mutation-tools.createContact` exists but is a pure create (no phone-lookup-then-create). `crm-query-tools.getContactByPhone` finds but doesn't create.
   - What's unclear: Does a domain-layer `resolveOrCreateContact(phone, data)` exist that v4 can call Regla-3-compliantly? Need to grep `src/lib/domain/contacts.ts`.
   - Recommendation: Plan a small contact-resolution step (reuse domain find-or-create if present; else add one). This is on the critical path for createOrder.

2. **crmActions echo: LLM-self-reported (schema ext) vs orchestrator-derived (tool results)?**
   - Recommendation: orchestrator-derived from tool results (Pitfall 1 option B) — ground truth, aligns with "guards as final net". Flag for confirmation.

3. **Sandbox CRM parity (INTERRUPTION-PARITY.md).** Should `engine-v4.ts` simulate CRM mutations, or remain a no-op like the RAG-send caveat (§6)? Affects test strategy.

4. **`getActiveOrderByPhone` config gap.** Will the operator configure Somnio active stages, or does the plan build a v4-local active-stage set as grounding fallback? (Pitfall 3.)

5. **Timer-path CRM (processSystemEvent, `:854-1004`).** D-06 removes inline createOrder for user messages; the timer path also produces `shouldCreateOrder` (`:925-928,980`) and `crear_orden_sin_promo`/`crear_orden_sin_confirmar` actions. Does the timer path also route through the sub-loop, or keep deterministic createOrder? Spec focuses on user-message gate (D-01 post-sales-track). **Needs scoping** — timers don't run comprehension/sales-track the same way.

6. **D-15 birth stage: NUEVO PEDIDO (status quo, by name) vs AGENDADO (domain positional first).** Both avoid the automation; NUEVO PEDIDO matches current behavior + Kanban expectations. Recommend NUEVO PEDIDO. Confirm with user.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (DB) | grounding, mutations | ✓ | service-role key in `.env.local` | — |
| `crm_mutation_idempotency_keys` table | D-12 backstop | ✓ | exists (domain/crm-mutation-idempotency.ts) | — |
| `order_stage_history` table | D-09 history | ✓ (written by moveOrderToStage `:685`) | — | descope reads (Pitfall 4) |
| `crm_query_tools_config` / `_active_stages` | View A active-order | ✗ EMPTY for Somnio | — | operator config OR v4-local active-stage set (Pitfall 3) |
| `SOMNIO_CONFIRMADO_STAGE_UUID` env | D-15 move-to-CONFIRMADO | ✗ not set | — | hardcode-bridge constant w/ verified UUID `4770a36e...` |
| OpenAI key `OPENAI_API_KEY_SALESV4` | sub-loop legacy path | ✓ (referenced `sub-loop/index.ts:55`) | — | — |

**Missing with no fallback:** none blocking — but `crm_query_tools_config` empty is the highest-impact operational gap (Pitfall 3).

---

## Validation Architecture

> `workflow.nyquist_validation` is ABSENT from `.planning/config.json` (workflow has research/plan_check/verifier/learnings only). Per instructions, absence ≠ false, so I include this section; treat as advisory.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (verified: existing suites `src/lib/agents/somnio-v4/__tests__/`, `interruption-system-v2/__tests__/`) |
| Config file | repo-root vitest config (existing) |
| Quick run command | `npx vitest run src/lib/agents/somnio-v4/__tests__/<file>.test.ts` |
| Full suite command | `npx vitest run src/lib/agents/somnio-v4/ src/lib/agents/shared/crm-mutation-tools/ src/lib/agents/shared/crm-query-tools/` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Command | File Exists? |
|-----|----------|-----------|---------|-------------|
| D-02 | gate predicate fires on accion/fields/category | unit (pure) | `npx vitest run src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts` | ❌ Wave 0 |
| D-12 | createOrder with active order → already_exists | unit | mutation-tools idempotency test (extend existing) | ⚠️ partial |
| D-13 | moveOrderToStage whitelist blocks non-CONFIRMADO | unit (pure) | `crm-whitelist.test.ts` | ❌ Wave 0 |
| D-14 | crmActions[] populated origen:'rag' from tool results | unit | `crm-actions-echo.test.ts` | ❌ Wave 0 |
| D-15 | confirmar → moveOrderToStage(CONFIRMADO); early createOrder | unit (transitions) | extend `transitions.test.ts` | ⚠️ extend |
| D-05 | response-track still runs after CRM gate | integration | extend agent pipeline test | ⚠️ extend |
| D-06 | Regla 6: v3/godentist/recompra/pw byte-identical | grep + behavioral | §G grep gates | ❌ Wave 0 |
| D-07 | Interruption parity: CRM mutation + CKPT idempotent | integration | extend `engine-v4-lock.test.ts` / `v4-production-runner-*.test.ts` | ⚠️ extend |

### Sampling Rate
- **Per task commit:** quick vitest on the touched file.
- **Per wave merge:** full v4 + shared-tools suite.
- **Phase gate:** full suite green + Regla 6 greps + sandbox manual smoke (v4 still DORMANT, so smoke is sandbox-only).

### Wave 0 Gaps
- [ ] `crm-gate.test.ts` — D-02 predicate
- [ ] `crm-whitelist.test.ts` — D-13 whitelist → CONFIRMADO only
- [ ] `crm-actions-echo.test.ts` — D-14 derive from tool results
- [ ] `crm-grounding.test.ts` — View A+B assembly, config_not_set fallback (Pitfall 3)
- [ ] Regla 6 grep gate script (§G)

---

## Security Domain

> `security_enforcement` absent in config = enabled. Internal agent integration; workspace isolation + injection are the relevant axes.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | inbound webhook auth handled upstream (webhook-handler) |
| V3 Session Management | partial | `agent_sessions` + `_v4` snapshot; workspace-scoped |
| V4 Access Control | **yes** | workspace isolation: `ctx.workspaceId` from execution context, NEVER input (D-pre-03). All grounding/mutations workspace-filtered via domain (Regla 3). |
| V5 Input Validation | **yes** | crm-mutation-tools Zod inputSchemas; LLM-chosen args validated by tool schema before domain write |
| V6 Cryptography | no | none new |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-workspace order/contact access | Information Disclosure / Elevation | `ctx.workspaceId` hardcoded `SOMNIO_WORKSPACE_ID` (config.ts:11); domain filters every query by workspace_id (Regla 3) |
| Prompt injection → LLM calls unintended mutation | Tampering | Tool guards (idempotency D-12, CAS+whitelist D-13) as the "final net" — exactly the D-03 philosophy. Whitelist blocks any stage move except →CONFIRMADO from pre-confirmation. |
| Duplicate order (Doralba class) | Tampering / integrity | Fresh re-query before createOrder (D-10) + idempotency key (D-12) + active-order pre-check |
| PII leakage in ledger/observability | Information Disclosure | `redactArgs` (state.ts:423-441) masks phone/email in crmActions; mutation-tools redact in observability (helpers.ts:32-51) |
| Lua/CAS race on stage move | Tampering | domain CAS predicate (orders.ts:637-667), propagate `stage_changed_concurrently` verbatim, NO retry |

---

## Sources

### Primary (HIGH confidence — read this session)
- `somnio-v4-agent.ts` (full) — pipeline, gate site `:461-481`, isCrmMutation `:225`, createOrder decision `:571-603`, buildCrmActionsFromAcciones `:88-101`, CAS branch `:484-549`.
- `invocations.ts` (full) — executeInvocations, env-var stage pattern `:64`.
- `transitions.ts` (full) — R5 `:261-269`, mostrar_confirmacion `:240-248`, timer crear_orden_sin_* `:337-353`.
- `constants.ts` (full) — CRM_ACTIONS/CREATE_ORDER_ACTIONS `:193-200`, V4_META_PREFIX `:179`, ACTION_TEMPLATE_MAP `:75-87`.
- `sub-loop/index.ts` (full) — runLegacySubLoop `:724`, extractStepData `:144-225`, SubLoopContext `:77-84`, CKPT-3/4/5.
- `sub-loop/tools.ts` (full) — crm_mutation toolset `:52-62`.
- `sub-loop/output-schema.ts` (full) — LoopOutcomeSchema `:35-93` (NO crm fields), invariants.
- `sub-loop/prompt.ts` (full) — crm_mutation prompt `:60-66`.
- `state.ts` (full) — commitTurn `:468-487`, serialize/deserialize, redactArgs `:423-441`.
- `types.ts` (full) — CrmActionRegistrada `:374-381`, TurnLedger, V4AgentInput/Output.
- `escalation.ts` (full) — decideSubLoopReason, isCrmMutation input.
- `response-track.ts` (full) — resolveSalesActionTemplates `:255-385` (mostrar_confirmacion→resumen, crear_orden→confirmacion_orden_*).
- `domain/orders.ts` — createOrder `:225-403` (no idempotency, first-stage-by-position `:248-259`, emitOrderCreated `:372`), moveOrderToStage `:598-679` (CAS `:631-667`, same-stage no-op `:619-629`), OrderDetail `:1853+` (stageId only, no name/history).
- `crm-mutation-tools/orders.ts` (full) — createOrder requires contactId+pipelineId uuid `:77-98`, MutationResult statuses.
- `crm-mutation-tools/helpers.ts` (full) — withIdempotency `:146-202`, mapDomainError `:71-76`.
- `crm-query-tools/orders.ts` (full) — getActiveOrderByPhone `:233-359` (config_not_set `:303-310`).
- `crm-query-tools/helpers.ts:74-129` — findActiveOrderForContact (empty-config branch `:111`).
- `engine-adapters/production/orders.ts` (full) — contact/pipeline/stage resolution `:108-201`, "NUEVO PEDIDO" by name `:164-173`.
- `v4-production-runner.ts:1050-1268` — createOrder block `:1126-1143`, orderResult consumers `:1085,1195-1197`.
- `engine-v4.ts:560-590` — sandbox passes shouldCreateOrder through, no order execution.
- `INTERRUPTION-PARITY.md` (full) — parity contract, RAG-send caveat §6.
- `automations/automation-runner.ts:63-101,240-300,582-700` — matchesTriggerConfig (order.created stageId match `:95-101`).
- `ARCHITECTURE.md:225-260` — crm_mutation dead-path confirmation.
- `config.ts:1-40` — SOMNIO_WORKSPACE_ID, SOMNIO_V4_AGENT_ID.

### Primary (HIGH — live DB queries this session, 2026-05-29)
- Somnio pipelines + stages (Ventas Somnio Standard default; CONFIRMADO=`4770a36e...`, NUEVO PEDIDO=`6be952b0...`, NUEVO PAG WEB=`42da9d61...`, etc.).
- Somnio enabled automations: 12 total; one `order.created` ("template final ultima" `71c4f524...`, stage=NUEVO PAG WEB, 3 templates + SMS).
- `crm_query_tools_config` + `crm_query_tools_active_stages` EMPTY for Somnio.
- Last 200 Ventas orders by stage (mostly CONFIRMADO/CANCELADO).

### Secondary / Reasoned (MEDIUM)
- D-15 template-mapping recommendation (reasoned from response-track.ts).
- crmActions echo derivation approach (reasoned from extractStepData shape).

---

## Metadata

**Confidence breakdown:**
- Integration surface (call sites, files to edit/delete): HIGH — every line cited.
- Grounding feasibility: MEDIUM — View A blocked by empty config (Pitfall 3); OrderDetail lacks history (Pitfall 4).
- Sub-loop CRM output contract: HIGH that it's missing; MEDIUM on the recommended fix.
- D-15 automation safety: HIGH (live-audited) that it's dormant if birth stage ≠ NUEVO PAG WEB.
- Contact UUID resolution: LOW — open question, domain path not yet verified (grep contacts.ts in planning).
- Interruption parity impact: MEDIUM — idempotency/CAS cover double-execute; sandbox parity needs a decision.

**Research date:** 2026-05-29
**Valid until:** ~2026-06-12 (14 days — internal code stable, but DB automation config + crm_query_tools_config can change; re-verify the empty-config + automation-stage facts at plan time).
