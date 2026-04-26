# Standalone: agent-lifecycle-router — Research

**Researched:** 2026-04-25
**Domain:** Rule-based agent routing engine (json-rules-engine on Next.js 15 / Vercel serverless / Supabase)
**Confidence:** HIGH for engine semantics + stack (verified by source code + live execution); MEDIUM for cache invalidation pattern (verified against Supabase Realtime constraints + ecosystem patterns); LOW for dry-run replay correctness (no canonical reference — best-practice synthesis)

---

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Phase 42 (session-lifecycle) shipped — router can assume sessions close correctly; returning client = new session = re-evaluation.
- **D-02:** **`json-rules-engine`** is the engine. Migration trigger to DMN: 25+ rules / non-tech editor / compliance.
- **D-03:** **8 lifecycle states** (`new_prospect`, `order_in_progress`, `in_transit`, `just_received`, `dormant_buyer`, `abandoned_cart`, `reactivation_window`, `blocked`).
- **D-04:** **5 hard-override tags + 1 soft attribute**: `forzar_humano`, `pausar_agente`, `forzar_sales_v3`, `forzar_recompra`, `vip` + `pago_anticipado`. Tags are normal `contact_tags` rows.
- **D-05:** Cache TTL **60s** + pub/sub invalidation. Implementation specifics → planner.
- **D-06:** Scope v1 = core router + admin form (5 surfaces) + dry-run + observability.
- **D-07:** **Routing decision is SYNCHRONOUS**, computed before `SessionManager.createSession`. `agent_id` is immutable post-create. Latency budget: <200ms p95.
- **D-08:** `routing_facts_catalog` table mandatory — declarative vocabulary.
- **D-10:** **Dry-run simulator mandatory** in v1 admin form (default 7d historical window).
- **D-12:** **JSON Schema versioned** in `src/lib/agents/routing/schema/rule-v1.schema.json`. `schema_version` field per rule row.

### Claude's Discretion
- JSON Schema nested structure + custom operators detail.
- Exact Supabase table layouts (`routing_rules`, `routing_facts_catalog`, `routing_audit_log`).
- UI design of admin form.
- Concrete operator names (`daysSince`, `tagMatchesPattern`, etc.) — researcher identifies, planner specifies.
- Naming for router agentRegistry entry.
- Cache implementation specifics (TTL=60s constant; mechanism = planner).

### Deferred Ideas (OUT OF SCOPE)
- `routing-builder` conversational agent (v2 — D-09).
- `dmn-js` advanced visual editor (v2 if 25+ rules).
- DMN migration (v2 with explicit triggers).
- Re-routing mid-session (requires session model refactor).
- Sub-personalities-in-one-agent architecture.
- ML/LLM hybrid router for free-text intent.
- Cross-stack portability via DMN export.

---

## Phase Requirements

(No formal REQ-IDs supplied for this standalone phase. Phase deliverables 1-8 enumerated in CONTEXT.md `<domain>` block.)

---

## Summary

**The library decision (json-rules-engine 7.3.1) is correct and verified.** Live execution confirms: async fact resolvers work cleanly, the almanac caches per-run automatically (one Supabase call serves N conditions), and a 3-rule run with 2 async facts completes in **3ms** — well under the 200ms p95 budget. Built-in operators cover `equal`/`notEqual`/`in`/`notIn`/`contains`/`doesNotContain`/`lessThan(Inclusive)`/`greaterThan(Inclusive)`, plus 6 decorators (`someFact`/`everyFact`/`someValue`/`everyValue`/`swap`/`not`). TypeScript types ship in the package — no `@types/json-rules-engine` needed.

**Primary recommendation:** Build a 3-layer pipeline `(facts → classifier → router)` where each layer is a separate `Engine` instance, evaluated sequentially. Use **per-tenant unique priorities** to guarantee FIRST-hit semantics, and call `engine.stop()` inside `onSuccess` to halt evaluation of lower priority groups. Cache rules with **per-instance LRU + version-column-on-read** (revalidate stale entries by checking `MAX(updated_at)` on the rules table — cheaper than Supabase Realtime which doesn't work in serverless). Validate every rule with **Ajv 8 against `rule-v1.schema.json`** on every write to `routing_rules`.

**Biggest risk (HIGH severity):** Two rules with identical priority both fire in parallel — `engine.stop()` halts the *next* priority group but cannot un-fire concurrent rules in the *same* group. **Empirically verified** in this research session. Mitigation: enforce a `UNIQUE(workspace_id, rule_type, priority)` partial index on `routing_rules` and validate uniqueness in the admin form before write.

**Second-biggest risk (HIGH severity):** `jsonpath-plus` (transitive dep) had RCE CVE-2024-21534 + CVE-2025-1302 fixed in 10.3.0. Our test install resolved 10.4.0 (safe). The `path` field in conditions evaluates JSONPath expressions — **must NEVER accept user-input JSONPath strings from the v2 routing-builder LLM agent.** v1 admin form should restrict path access to a curated whitelist or disable the `path` field entirely.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Routing decision (sync) | API / Backend (Vercel serverless function — webhook handler chain) | — | Decision must complete before `SessionManager.createSession`; runs inside the existing `processMessageWithAgent` request lifecycle |
| Fact resolution (Supabase reads) | API / Backend (domain layer) | — | Regla 3: all reads via `src/lib/domain/*`; fact resolvers are thin wrappers around domain functions |
| Rule storage | Database (Supabase Postgres) | — | JSONB columns hold rule definitions; `UPDATE` triggers cache invalidation via version column |
| Rule cache | API / Backend (per-instance LRU in Node process memory) | — | Each Vercel lambda has isolated memory; serverless cannot hold WebSocket subs (Supabase Realtime not viable for cache pubsub between lambdas) |
| Admin form (rule CRUD + dry-run UI) | Frontend Server (Next.js Server Components / Server Actions) | API/Backend (domain layer for writes) | Server Actions invoke domain functions; client-side form state for the rule builder |
| Dry-run simulator | API / Backend (Server Action invokes engine in dry-run mode) | — | Replays last N days of messages through candidate ruleset; runs inside Server Action with no commit |
| Audit log writes | API / Backend (domain layer + fire-and-forget insert) | — | Each routing decision writes one row to `routing_audit_log`; non-blocking |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `json-rules-engine` | **7.3.1** (verified 2025-02-20) `[VERIFIED: npm view]` | Rule definition + evaluation. Native TypeScript types included. | Decision locked (D-02). 275k DL/wk, ISC license, ships own `types/index.d.ts`. |
| `ajv` | **8.20.0** (verified 2026-04-25) `[VERIFIED: npm view]` — already in `morfx-new/package.json` | Validate `routing_rules` rows + admin form input against `rule-v1.schema.json` (D-12) | De-facto Node.js JSON Schema validator. Already dep in this project. Compiles schemas to fast functions. |
| `lru-cache` | **11.3.5** (verified 2026-04-25) `[VERIFIED: npm view]` | Per-instance bounded cache for compiled `Engine` instances per workspace | Most widely used Node LRU implementation. Bounded memory (avoids leak across long-lived Vercel lambda instances). |
| Supabase JS (`@supabase/supabase-js`) | already in project | Postgres reads/writes through `createAdminClient()` per Regla 3 | Existing stack. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Native `Intl.DateTimeFormat` + `date-fns-tz` (if not already in project) | latest | Compute `daysSince` / `monthsSince` in **America/Bogota** (Regla 2) | All custom temporal operators MUST honor America/Bogota timezone. |
| `eventemitter2` | transitive of json-rules-engine | Engine event bus (`on('success', ...)`) | Already pulled in. Useful for the audit-log listener that records every fired rule. |
| `jsonpath-plus` | transitive (resolved **10.4.0** in our test install) `[VERIFIED]` | Used internally by json-rules-engine for `path` field evaluation. | Verify `pnpm-lock.yaml` resolves ≥10.3.0 (CVE-2025-1302). Restrict the `path` field exposure in v1 admin form (see Pitfall 2). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `lru-cache` | `Map` with manual TTL | Map has no eviction → memory grows unbounded across long-lived lambda instances. Not recommended. |
| Ajv | `zod-to-json-schema` round-trip | Already have `zod` in project, but Ajv is faster + native JSON Schema; rule storage is JSONB, not zod-shape, so direct JSON Schema validation is the right fit. |
| Per-instance LRU + version-column | Supabase Realtime broadcasts | Supabase Realtime requires WebSocket subscriptions which Vercel serverless cannot maintain. Realtime is for browser clients — not lambda-to-lambda invalidation. `[CITED: supabase.com/docs/guides/realtime/broadcast — Next.js serverless functions cannot maintain persistent WebSocket connections]` |
| Per-instance LRU + version-column | Vercel Runtime Cache API + `revalidateTag` | Viable alternative. Tag-based invalidation works. Adds Vercel-specific dependency (limits future portability). Reasonable for the planner to evaluate as Option B. `[CITED: vercel.com/docs/caching/runtime-cache]` |

### Installation

```bash
npm install json-rules-engine lru-cache
# ajv already installed
# date-fns-tz only if not already present:
npm view date-fns-tz version  # check first
```

**Verified versions (2026-04-25 npm view):**
- `json-rules-engine@7.3.1` — published 2025-02-20 `[VERIFIED]`
- `ajv@8.20.0` `[VERIFIED]`
- `lru-cache@11.3.5` `[VERIFIED]`

---

## Architecture Patterns

### System Architecture Diagram

```
[WhatsApp 360dialog webhook]
        |
        v
[POST /api/webhooks/whatsapp/route.ts]
        |
        v
[whatsapp/webhook-handler.ts → processIncomingMessage()]
        |
        v
[Inngest dispatch to agent-production runner]
        |
        v
[agents/production/webhook-processor.ts]
        |
        +-- agentEnabled? skipTags? autoCreateContact? (lines 76-159, unchanged)
        |
        v
[NEW: src/lib/agents/routing/route.ts → routeAgent({contactId, workspaceId})]
        |  ┌─────────────────────────────────────────────────────────┐
        |  │ if (!workspace.lifecycle_routing_enabled)               │
        |  │     return legacyRouting(contact, recompraEnabled)      │ <-- backwards compat per D-12 / Regla 6
        |  │                                                         │
        |  │ rules = ruleCache.get(workspaceId)                      │ <-- per-instance LRU 60s TTL
        |  │ if (rules.stale) rules = await loadRulesFromSupabase()  │
        |  │                                                         │
        |  │ ┌─── Layer 1: Lifecycle Classifier ───┐                 │
        |  │ │ engine1 = new Engine(classifierRules)│                 │
        |  │ │ {state} = await engine1.run({contact, workspace})│     │
        |  │ │   (each rule has UNIQUE priority,    │                 │
        |  │ │    onSuccess calls engine.stop)      │                 │
        |  │ └──────────────────────────────────────┘                 │
        |  │                                                         │
        |  │ ┌─── Layer 2: Agent Router ──────────┐                   │
        |  │ │ engine2 = new Engine(routerRules)   │                   │
        |  │ │ {agent_id} = await engine2.run({    │                   │
        |  │ │     lifecycle_state: state,         │                   │
        |  │ │     tags, contact, workspace })     │                   │
        |  │ └─────────────────────────────────────┘                   │
        |  │                                                         │
        |  │ validate agent_id against agentRegistry.has()           │
        |  │ INSERT routing_audit_log (fire-and-forget)              │
        |  │ return {agent_id, lifecycle_state, fired_rule_id}       │
        |  └─────────────────────────────────────────────────────────┘
        |
        v
[branch on agent_id at webhook-processor.ts:443-511] (UNCHANGED — sales-v3 / godentist / unified)
        |
        v
[V3ProductionRunner / UnifiedEngine processMessage()]
        |
        v
[SessionManager.createSession({agentId, ...})]   <-- agent_id baked in
```

**External dependencies:**
- Supabase Postgres (reads from `routing_rules`, `routing_facts_catalog`, `contacts`, `orders`, `contact_tags`; writes to `routing_audit_log`)
- Vercel serverless runtime (per-instance memory for LRU)
- `agentRegistry` (in-process Map, populated at module load)

### Recommended Project Structure

```
src/lib/agents/routing/
├── engine.ts                    # buildEngine() factory: instantiates json-rules-engine, registers operators + facts
├── facts.ts                     # Fact resolvers (each is a thin wrapper around domain layer functions)
├── operators.ts                 # Custom operators: daysSince, monthsSince, tagMatchesPattern
├── route.ts                     # Public API: routeAgent({contactId, workspaceId}) — used by webhook-processor
├── cache.ts                     # Per-instance LRU + version-column revalidation
├── dry-run.ts                   # replayMessages({candidateRules, daysBack, workspaceId})
├── schema/
│   ├── rule-v1.schema.json     # JSON Schema (D-12) — versioned in repo
│   └── validate.ts              # Ajv compile + validate exports
└── __tests__/
    ├── engine.test.ts
    ├── operators.test.ts
    ├── facts.test.ts
    ├── route.test.ts
    └── dry-run.test.ts

src/lib/domain/routing.ts        # Regla 3 obligatorio: writes to routing_rules, routing_audit_log, routing_facts_catalog

src/app/configuracion/agentes/routing/
├── page.tsx                     # List of rules (D-06 surface 1)
├── editor/
│   ├── page.tsx                 # Rule editor (D-06 surface 2)
│   └── _components/
│       ├── ConditionBuilder.tsx
│       ├── FactPicker.tsx
│       ├── TagPicker.tsx
│       └── SimulateButton.tsx
└── audit/
    └── page.tsx                 # Audit log viewer (D-06 surface 5)

supabase/migrations/
└── YYYYMMDD_routing_engine.sql  # routing_rules, routing_facts_catalog, routing_audit_log tables + indexes
```

### Pattern 1: Three-Layer Engine Pipeline (Facts → Classifier → Router)

**What:** Two `Engine` instances chained per request. Layer 1 emits `lifecycle_state`; layer 2 consumes it (added as a runtime fact) + tags to emit `agent_id`.

**When to use:** Always, for v1. Reasoning: a single engine with both classifier and router rules at different priority bands creates ambiguity about which rule type fires when. Two engines = clean separation of concerns + clearer audit log.

**Example:**

```typescript
// src/lib/agents/routing/route.ts
// Pattern verified by live execution — see "Code Examples" section below.

import { Engine } from 'json-rules-engine'
import { agentRegistry } from '@/lib/agents/registry'
import { getRulesForWorkspace } from './cache'
import { registerFacts } from './facts'
import { registerOperators } from './operators'
import { recordAuditLog } from '@/lib/domain/routing'

export interface RouteDecision {
  agent_id: string | null  // null = forzar_humano / pausar_agente / blocked
  lifecycle_state: string
  fired_classifier_rule_id: string | null
  fired_router_rule_id: string | null
  latency_ms: number
}

export async function routeAgent(input: {
  contactId: string
  workspaceId: string
}): Promise<RouteDecision> {
  const t0 = Date.now()
  const { classifierRules, routerRules } = await getRulesForWorkspace(input.workspaceId)

  // Layer 1: Classifier
  const e1 = new Engine([], { allowUndefinedFacts: true })
  registerOperators(e1)
  registerFacts(e1, input)  // adds activeOrderStage, daysSinceLastOrder, tags, isClient, etc.

  let firedClassifierId: string | null = null
  let lifecycleState = 'new_prospect'  // safe fallback
  for (const rule of classifierRules) {
    e1.addRule({
      ...rule.compiled,
      onSuccess: (event, almanac, ruleResult) => {
        firedClassifierId = rule.id
        lifecycleState = event.params!.lifecycle_state
        e1.stop()  // halt evaluation of lower-priority groups
      },
    })
  }
  await e1.run({})

  // Layer 2: Router (lifecycle_state passed as runtime fact)
  const e2 = new Engine([], { allowUndefinedFacts: true })
  registerOperators(e2)
  registerFacts(e2, input)
  e2.addFact('lifecycle_state', lifecycleState)  // runtime constant fact

  let firedRouterId: string | null = null
  let agentId: string | null = null
  for (const rule of routerRules) {
    e2.addRule({
      ...rule.compiled,
      onSuccess: (event) => {
        firedRouterId = rule.id
        agentId = event.params!.agent_id  // may be null for forzar_humano
        e2.stop()
      },
    })
  }
  await e2.run({})

  // Validate agent_id against registry (skip null = human handoff)
  if (agentId !== null && !agentRegistry.has(agentId)) {
    throw new Error(`Routing emitted unregistered agent_id: ${agentId}`)
  }

  const decision: RouteDecision = {
    agent_id: agentId,
    lifecycle_state: lifecycleState,
    fired_classifier_rule_id: firedClassifierId,
    fired_router_rule_id: firedRouterId,
    latency_ms: Date.now() - t0,
  }

  // Fire-and-forget audit
  recordAuditLog({ ...input, ...decision }).catch(/* logged inside domain */)

  return decision
}
```

`[VERIFIED: live test in /tmp/jre-test/test.mjs — 3ms latency, almanac caches isClient call across 2 conditions]`

### Pattern 2: Fact Resolver Wrapping Domain Layer

**What:** Each entry in `routing_facts_catalog` corresponds to a function in `facts.ts` that imports a `src/lib/domain/*` function. Fact resolvers MUST go through domain layer per Regla 3.

**When to use:** For every fact in the catalog.

**Example:**

```typescript
// src/lib/agents/routing/facts.ts
import { Engine } from 'json-rules-engine'
import { getActiveOrderForContact } from '@/lib/domain/orders'
import { getContactTags } from '@/lib/domain/tags'
import { getContactById } from '@/lib/domain/contacts'

export function registerFacts(
  engine: Engine,
  ctx: { contactId: string; workspaceId: string }
) {
  // Async fact resolver — returns a Promise. Engine awaits + caches result.
  // Cache key = factId + JSON.stringify(params). Default cache=true.
  engine.addFact('activeOrderStage', async () => {
    const order = await getActiveOrderForContact(ctx.contactId, ctx.workspaceId)
    return order?.stage_kind ?? null  // 'preparation' | 'transit' | 'delivered' | null
  })

  engine.addFact('tags', async () => {
    return getContactTags(ctx.contactId, ctx.workspaceId)  // string[]
  })

  engine.addFact('isClient', async () => {
    const c = await getContactById(ctx.contactId, ctx.workspaceId)
    return c?.is_client ?? false
  })

  engine.addFact('daysSinceLastDelivery', async (params, almanac) => {
    // Demonstrates fact-to-fact dependency — almanac caches transitive lookups.
    const isClient = await almanac.factValue<boolean>('isClient')
    if (!isClient) return null
    const lastDelivered = await getLastDeliveredOrderDate(ctx.contactId, ctx.workspaceId)
    if (!lastDelivered) return null
    // America/Bogota timezone — Regla 2
    const nowBogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
    return Math.floor((nowBogota.getTime() - lastDelivered.getTime()) / 86400000)
  })

  // ... lastInteractionDays, hasPagoAnticipadoTag, isInRecompraPipeline, etc.
}
```

**Fact resolvers MUST be pure with respect to params** — the almanac caches by `(factId, JSON.stringify(params))`. Side effects → stale cache bugs.

### Pattern 3: Per-Instance LRU + Version-Column Revalidation

**What:** Vercel serverless functions cannot share memory between instances and cannot maintain WebSocket subscriptions for Supabase Realtime push invalidation. Use a **per-instance LRU** keyed by `workspaceId` with a 60s soft TTL, validated by a single cheap `SELECT MAX(updated_at)` query on cache miss / stale read.

**When to use:** Always for the rule cache. Cost: 1 extra query per workspace per 60s window per lambda instance — a fraction of a percent of the actual rule load query.

**Example:**

```typescript
// src/lib/agents/routing/cache.ts
import { LRUCache } from 'lru-cache'
import { createAdminClient } from '@/lib/supabase/admin'

interface CachedRules {
  classifierRules: CompiledRule[]
  routerRules: CompiledRule[]
  loadedAt: number
  maxUpdatedAt: string  // last updated_at across all rules at load time
}

const cache = new LRUCache<string, CachedRules>({
  max: 200,                     // workspaces
  ttl: 60_000,                  // 60s soft TTL (D-05)
  updateAgeOnGet: false,
})

export async function getRulesForWorkspace(workspaceId: string): Promise<CachedRules> {
  const cached = cache.get(workspaceId)
  if (cached) {
    // Soft revalidation: cheap MAX(updated_at) check
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('routing_rules')
      .select('updated_at')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()
    if (data && data.updated_at === cached.maxUpdatedAt) {
      return cached  // fresh
    }
    // else fall through to reload
  }
  return reloadRulesForWorkspace(workspaceId)
}

async function reloadRulesForWorkspace(workspaceId: string): Promise<CachedRules> {
  const supabase = createAdminClient()
  const { data: rows, error } = await supabase
    .from('routing_rules')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .order('priority', { ascending: false })  // higher priority first
  if (error) throw error

  const compiled = (rows ?? []).map(compileRule)  // validate vs JSON Schema + Rule()
  const result: CachedRules = {
    classifierRules: compiled.filter(r => r.rule_type === 'lifecycle_classifier'),
    routerRules: compiled.filter(r => r.rule_type === 'agent_router'),
    loadedAt: Date.now(),
    maxUpdatedAt: rows?.[0]?.updated_at ?? '1970-01-01',
  }
  cache.set(workspaceId, result)
  return result
}

export function invalidateWorkspace(workspaceId: string) {
  cache.delete(workspaceId)
}
```

The admin form Server Action calls `invalidateWorkspace(workspaceId)` after every `routing_rules` mutation — that handles the same-lambda case. **Across-lambda invalidation is bounded by the 60s TTL**, which is within acceptable staleness for non-financial routing decisions.

`[VERIFIED: lru-cache v11 API — npm; revalidation pattern is industry-standard — CITED: betterstack.com/community/guides/scaling-nodejs/ajv-validation/ general caching guide]`

### Pattern 4: Dry-Run Replay Loop

**What:** Replays the last N days of inbound webhook events through a candidate ruleset (one not yet committed) and reports decision deltas vs. the current production routing.

**When to use:** Triggered from admin form before saving a rule. D-10 mandates this as a v1 safety net.

**Critical correctness question — RESOLVED:** facts at dry-run time should be evaluated **AS OF NOW**, not as-of the historical message time. Reasoning:
1. Reconstructing historical fact state (e.g., "what stage was the active order in on 2026-04-18?") requires temporal queries against tables that may not preserve full history (e.g., `orders.stage_id` is a current pointer; only `order_stage_history` preserves the timeline post-Plan-02 of the crm-stage-integrity standalone).
2. The dry-run goal is "if I deploy these rules NOW, what would they decide for THIS contact in THE CURRENT state". Replaying with as-of-historical-time facts answers a different question (forensics), not the deployment question.
3. The dry-run UI should make this **explicit**: "Showing routing decisions for these N contacts using their CURRENT state, evaluated against your candidate rules."

**Example pseudo-code:**

```typescript
// src/lib/agents/routing/dry-run.ts
export interface DryRunResult {
  total_inbound: number
  decisions: Array<{
    conversation_id: string
    inbound_message_at: string  // historical timestamp
    contact_id: string
    current_decision: { agent_id: string | null; lifecycle_state: string } | null
    candidate_decision: { agent_id: string | null; lifecycle_state: string }
    changed: boolean
  }>
  summary: { changed_count: number; before: Record<string, number>; after: Record<string, number> }
}

export async function dryRunReplay(input: {
  workspaceId: string
  candidateRules: RoutingRule[]
  daysBack: number
}): Promise<DryRunResult> {
  // 1. Fetch unique (conversation_id, contact_id) pairs from inbound messages in window
  const inboundEvents = await fetchInboundsForLastDays(input.workspaceId, input.daysBack)
  // 2. For each: route with PRODUCTION rules (current cache) — reuse routeAgent
  // 3. For each: route with CANDIDATE rules in a fresh, throwaway Engine
  // 4. Diff decisions, build summary
  // ...
}
```

Dry-run does NOT write to `routing_audit_log`. Add a `dry_run: true` flag if shared logging is needed; safest is to keep dry-run results in a transient response payload only.

### Pattern 5: Audit Log Shape

Recommended shape (planner finalizes column names):

```sql
CREATE TABLE routing_audit_log (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  contact_id      uuid not null,
  conversation_id uuid,
  inbound_message_id uuid,                             -- FK to whatsapp_messages or null
  decided_at      timestamptz not null default now(),
  -- Decision
  agent_id              text,                          -- null when forzar_humano / pausar_agente
  lifecycle_state       text not null,
  fired_classifier_rule_id uuid,
  fired_router_rule_id     uuid,
  -- Snapshots for forensic reproducibility
  facts_snapshot  jsonb not null,                     -- {activeOrderStage: 'transit', tags: [...], isClient: true, ...}
  rule_set_version_at_decision text,                  -- e.g., "max(updated_at)" of rules at decision time
  -- Performance
  latency_ms      integer not null,
  -- Schema versioning
  schema_version  text not null default 'v1'
);

CREATE INDEX idx_routing_audit_workspace_decided ON routing_audit_log (workspace_id, decided_at DESC);
CREATE INDEX idx_routing_audit_contact ON routing_audit_log (contact_id, decided_at DESC);
```

Shape rationale (cross-checked vs. crm-stage-integrity Plan 02 audit pattern in this repo): include the `facts_snapshot` JSONB so that "why did this contact route to agent X?" is answerable months later without recomputing facts (which may have changed). This snapshot is also reusable input for the v2 routing-builder agent's training/grounding.

### Anti-Patterns to Avoid

- **Sharing one `Engine` instance across requests.** The almanac is per-`run()` and engines are mutable (rules, facts, operators). Cross-tenant pollution risk. Always: one Engine per request per layer (or use the LRU cache to memoize the *rule definitions*, then construct `new Engine()` per request from those).
- **Putting two rules at the same priority and expecting FIRST-hit determinism.** Both fire in parallel. Verified empirically — see Pitfall 1.
- **Calling Supabase in a fact resolver without going through domain.** Violates Regla 3. The `createAdminClient()` allowed in the routing engine ONLY in `src/lib/domain/routing.ts` (for write to audit log + rules CRUD). Fact resolvers IMPORT from `@/lib/domain/*` — never construct admin clients.
- **Validating rules only on write.** Validate **on load** too: a schema version bump (rule-v1 → rule-v2) means the cache reload step must also re-validate against the old schema for `schema_version='v1'` rows. Otherwise a deployed schema change silently corrupts decisions.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Boolean condition evaluation (all/any/not nesting) | Custom recursive evaluator | `json-rules-engine` `Engine.run()` | Library handles tree traversal, short-circuit, async fact deferral, error propagation. |
| Rule structure validation | Hand-written validator | **Ajv 8 + `rule-v1.schema.json`** | Compiles to fast functions, supports `$ref`, draft-07/2020-12, error reporting. Already a dep. |
| Fact memoization within a single decision | Manual `Map<string, Promise<any>>` | `Almanac` (built into json-rules-engine) | Caches by `(factId, JSON.stringify(params))` automatically. Already verified — 1 Supabase call serves N conditions. |
| Priority-based execution order | Sort and iterate manually | `Engine.prioritizeRules()` (internal) | Library groups by priority, runs each group's rules in parallel internally — you only set `priority` on each rule. |
| LRU cache eviction | Plain Map with manual TTL tracking | `lru-cache@11` | Battle-tested. Bounded memory. `ttl` + `max` options handle both dimensions. |
| Custom path access into fact return values | Hand-rolled `obj.a.b.c` resolver | json-rules-engine's `path` field (uses `jsonpath-plus` internally) | But: restrict user-input paths in v1 — see Pitfall 2 (CVE-2025-1302 surface). Use the `pathResolver` engine option with a safe whitelist resolver if you need it. |
| Rule diff / before-after for audit log | Custom diff logic | `fast-deep-equal` or just store full snapshots in JSONB | Postgres JSONB is cheap; storing full before/after rows is more useful than computed diffs. |
| Date arithmetic with timezones | Manual `new Date()` math (silent UTC bugs) | `Intl.DateTimeFormat` with `timeZone: 'America/Bogota'` (Regla 2) | All `daysSince` / `monthsSince` operators MUST use Bogota. Default `Date` math is UTC and will silently miscount across midnight. |

**Key insight:** json-rules-engine is the right level of abstraction. Going lower (custom evaluator) loses async caching + priority + onSuccess/Failure. Going higher (DMN) was already evaluated and rejected (D-02). The library does ~85% of the routing engine; the custom code is the **fact resolvers** (calling domain layer), the **operators** (`daysSince`, `tagMatchesPattern`), and the **schema/cache/audit plumbing**.

---

## Common Pitfalls

### Pitfall 1: Same-priority rules both fire — FIRST-hit ambiguity

**Severity:** HIGH (correctness — wrong agent_id can ship to production)

**What goes wrong:** Two rules with `priority: 100` whose conditions both evaluate truthy will BOTH execute their `onSuccess` handlers, even when each handler calls `engine.stop()`. Reason (verified in source `engine.js:412-419` + live test): rules in the same priority group run via `Promise.all` in parallel; `engine.stop()` only halts the next *priority group*, not parallel siblings.

**Why it happens:** Library convention treats "rules with the same priority should be commutative." For DMN-style FIRST-hit, the user must enforce uniqueness.

**How to avoid:**
1. Enforce a `UNIQUE(workspace_id, rule_type, priority)` constraint on `routing_rules` (or `UNIQUE(workspace_id, rule_type, priority) WHERE active = true`).
2. Validate uniqueness in the admin form before submit (catch it client-side, not at constraint violation).
3. Encode rules with widely-spaced priorities (1000, 900, 800, ...) so reorder operations have room to insert without collision.

**Warning signs:** Two `routing_audit_log` rows for the same `inbound_message_id` (audit log writer sees both `success` events); duplicated `pipeline_decision` events in observability collector.

`[VERIFIED: live execution in /tmp/jre-test/test2.mjs — same-priority rules A and B both fired despite engine.stop()]`
`[CITED: docs/engine.md "rules of the same priority are evaluated in parallel" + "even though the engine has been told to stop"]`

### Pitfall 2: `jsonpath-plus` RCE via user-input `path` field (CVE-2024-21534, CVE-2025-1302)

**Severity:** HIGH (security — RCE)

**What goes wrong:** The `path` field in conditions is evaluated by `jsonpath-plus`. CVE-2024-21534 (CVSS unspecified) and CVE-2025-1302 (CVSS 8.9) are RCE vulnerabilities via crafted JSONPath expressions. Fixed in 10.3.0+. Our test install resolves 10.4.0 (safe).

**Why it happens:** json-rules-engine ships `jsonpath-plus` as a transitive dep. The bundled version is currently safe, but **if the v2 routing-builder agent (LLM) generates rule JSON, it can author arbitrary `path` strings that get evaluated**. Even in v1, if the admin form lets a human type free-form path strings, an attacker with admin access could escalate to RCE on the Vercel runtime.

**How to avoid:**
1. Pin `jsonpath-plus >= 10.3.0` in package.json overrides (defensive, in case json-rules-engine ever loosens the range).
2. **DISABLE the `path` field in the v1 admin form.** None of the planned facts in the catalog actually need it — facts return scalars or arrays, not nested objects.
3. If `path` is needed later, supply a custom `pathResolver` engine option that uses a safe library (e.g., `lodash.get` with a regex-validated dotted path) and reject any input containing `(`, `)`, `?`, `$`, `@`, `[`, `]`, brackets, or `..`.
4. CI: add `npm audit --production` to the gate; fail on any json-rules-engine related advisory.

**Warning signs:** `path` field present in any `routing_rules.conditions` JSONB → audit and remove. `npm audit` flags `jsonpath-plus`.

`[VERIFIED: jsonpath-plus@10.4.0 resolved in test install]`
`[CITED: security.snyk.io/vuln/SNYK-JS-JSONPATHPLUS-7945884]`
`[CITED: advisories.gitlab.com/pkg/npm/jsonpath-plus/CVE-2025-1302]`

### Pitfall 3: Stale rule cache during high-traffic editor sessions

**Severity:** MEDIUM (UX — admin sees "I just edited this rule and the bot still uses the old version")

**What goes wrong:** Lambda instance A handles the admin form's "Save Rule" Server Action and calls `invalidateWorkspace()` on its local LRU. Lambda instance B is concurrently processing inbound webhooks for the same workspace and serves a 59-second-stale cached ruleset until its TTL expires.

**Why it happens:** Vercel serverless instances are isolated. No cross-instance memory.

**How to avoid:**
1. **Accept eventual consistency up to 60s.** Document this in the admin form: "Rules take up to 1 minute to take effect across all servers."
2. The version-column revalidation (Pattern 3 above) makes the worst-case ~60s + latency of one MAX query. This is acceptable for non-financial routing.
3. For higher consistency, the planner can evaluate **Vercel Runtime Cache + `revalidateTag('routing-rules-${workspaceId}')`** as Option B — it propagates instantly across instances. Trade-off: Vercel-specific, slightly more network hops per cache miss.
4. Pre-emptively in the form: render a "Estos cambios pueden tardar hasta 60 segundos en aplicarse" message after save. Set user expectation.

**Warning signs:** Support tickets "I edited the rule but it's not working." Audit log shows old `fired_*_rule_id` for >60s after edit timestamp.

`[CITED: vercel.com/docs/caching/runtime-cache]`

### Pitfall 4: Async fact resolver throws — engine.run() rejects, no partial decision

**Severity:** MEDIUM (availability — failure of one DB read fails the whole routing)

**What goes wrong:** A fact resolver (e.g., `getActiveOrderForContact`) throws because the DB connection pool is saturated. `engine.run()` rejects (Promise rejection). The whole routing decision aborts. The webhook-processor catches and... does what?

**Why it happens:** Fact errors propagate through `Promise.all` in `evaluateRules`. There's no built-in "skip this rule on fact error" behavior. `allowUndefinedFacts: true` only handles **missing** facts (no resolver registered), not **throwing** resolvers.

**How to avoid:**
1. Wrap each fact resolver in a try/catch that returns a **sentinel value** the rules can detect:
   ```typescript
   engine.addFact('activeOrderStage', async () => {
     try {
       return await getActiveOrderForContact(...)
     } catch (err) {
       logger.error({ err }, 'fact resolver failed: activeOrderStage')
       return '__error__'  // sentinel; rules can filter via notEqual '__error__'
     }
   })
   ```
2. Add a **fallback rule at lowest priority** (`priority: 1`) that always matches and emits the legacy/safe agent_id. This guarantees `routeAgent` always returns a decision.
3. Wrap `engine.run()` itself in try/catch in `routeAgent`; on throw, fall back to the legacy if/else routing (D-12 backwards-compat path) and emit `pipeline_decision: 'routing_failed_fallback_legacy'` for observability.

**Warning signs:** Spike in `pipeline_decision: 'routing_failed_fallback_legacy'` events; correlated with DB CPU/connection saturation.

`[CITED: docs/engine.md describes allowUndefinedFacts but not throwing-fact behavior]`

### Pitfall 5: JSON Schema drift between code and stored rules

**Severity:** MEDIUM (correctness — validation passes at write but blows up at load)

**What goes wrong:** A developer adds a new operator (`daysSinceLastDelivery`) and updates `rule-v1.schema.json` enum, ships, but rules in production with the old enum value pass write-time validation today and fail tomorrow's deploy.

**How to avoid:**
1. **Schema is append-only within a major version.** New operators added to enum: yes. Removing operators: requires schema version bump (`rule-v2.schema.json`) + migration of stored rows.
2. Each `routing_rules` row stores `schema_version` (D-12). The cache loader picks the correct schema based on the row's version.
3. CI validation step: load all production rules through the current schema after every deploy (one-shot validation script). Fail the deploy if any row fails to validate.
4. Migration story: when bumping to v2, write a domain function `migrateRulesV1ToV2(workspaceId)` that re-shapes rows + updates `schema_version`. Keep both schemas in repo until all rows are migrated.

**Warning signs:** Rule edits fail with cryptic Ajv errors; `routing_rules` rows with `schema_version` older than current code.

### Pitfall 6: Audit log row explosion

**Severity:** LOW (cost — but compounds)

**What goes wrong:** Every inbound message → 1 row in `routing_audit_log`. Active workspace = 5k inbound/day = 1.8M rows/year per workspace. Multi-workspace deployment = 100+ workspaces = 180M rows/year. JSONB `facts_snapshot` is ~1KB → ~180GB/year.

**How to avoid:**
1. **Retention policy:** Drop rows older than 90 days via a Postgres scheduled job. The dry-run feature only needs the last 7 days; forensic queries beyond 90 days are rare.
2. **Compression:** Postgres JSONB is already TOAST-compressed for large values. Confirmed adequate; no extra step needed.
3. **Partitioning:** If the table grows past ~50M rows, partition by `decided_at` (monthly). v1 doesn't need partitioning — defer.
4. **Sampling:** If retention isn't enough, sample 10% of `lifecycle_state='new_prospect'` decisions (the highest-volume bucket). Keep 100% of any row where `agent_id IS NULL` (blocked / handoff — the interesting cases). v1: NO sampling — keep everything until volume forces the decision.

**Warning signs:** Postgres autovacuum struggles on `routing_audit_log`; query latency on the audit viewer >500ms.

### Pitfall 7: Engine instance reuse across requests leaks state

**Severity:** MEDIUM (correctness + memory leak)

**What goes wrong:** A clever optimization "let's cache the Engine instance, not just the rule definitions" shares one Engine across requests. Since `addFact` registers facts on the Engine itself, two concurrent requests for different contacts would see each other's facts.

**How to avoid:**
1. Cache the **rule definitions** (compiled `RuleProperties` objects, validated once). Construct `new Engine()` per `routeAgent` call.
2. Engine construction is cheap — confirmed by the 3ms latency in the live test (which includes engine construction + rule registration + fact registration + 2 async fact calls + 3 rule evaluations).
3. Code review rule: any `import { Engine }` at module top-level that *constructs* an Engine at module top-level → flag.

**Warning signs:** Cross-contact data in audit log (rule fires for "wrong" contact).

`[VERIFIED: examined Engine source — facts/conditions/operators are all instance state on the Engine]`

---

## Runtime State Inventory

(Not applicable — this is a greenfield phase, not a rename/refactor. New tables, new code paths.)

---

## Code Examples

Verified patterns from official sources + live execution.

### Engine init in serverless context (per-request)

```typescript
// src/lib/agents/routing/engine.ts
// Source: official types/index.d.ts + verified by /tmp/jre-test/test.mjs
import { Engine } from 'json-rules-engine'
import type { RuleProperties } from 'json-rules-engine'
import { registerOperators } from './operators'
import { registerFacts } from './facts'

export interface BuildEngineInput {
  contactId: string
  workspaceId: string
  rules: RuleProperties[]
  runtimeFacts?: Record<string, unknown>  // e.g. lifecycle_state for layer 2
}

export function buildEngine(input: BuildEngineInput): Engine {
  const engine = new Engine([], {
    allowUndefinedFacts: true,    // missing facts → undefined, not throw (we validate via operators)
    allowUndefinedConditions: false,
    replaceFactsInEventParams: false,
  })
  registerOperators(engine)
  registerFacts(engine, { contactId: input.contactId, workspaceId: input.workspaceId })
  for (const [factId, value] of Object.entries(input.runtimeFacts ?? {})) {
    engine.addFact(factId, value)  // constant runtime fact
  }
  for (const rule of input.rules) engine.addRule(rule)
  return engine
}
```

### Custom operator: daysSince (timezone-aware)

```typescript
// src/lib/agents/routing/operators.ts
// Pattern: Source: examples/06-custom-operators.js + verified by inspecting
// engine-default-operators.js (numberValidator pattern reused).
import type { Engine } from 'json-rules-engine'

const BOGOTA = 'America/Bogota'

function nowInBogota(): Date {
  // Regla 2: all date math in America/Bogota
  return new Date(new Date().toLocaleString('en-US', { timeZone: BOGOTA }))
}

export function registerOperators(engine: Engine) {
  // daysSince — fact value is an ISO timestamp string; jsonValue is a number (max days)
  // Returns true if the timestamp is at most jsonValue days ago.
  engine.addOperator(
    'daysSinceAtMost',
    (factValue: string | null, jsonValue: number) => {
      if (!factValue) return false
      const ts = new Date(factValue)
      if (Number.isNaN(ts.getTime())) return false
      const diffDays = Math.floor((nowInBogota().getTime() - ts.getTime()) / 86400000)
      return diffDays <= jsonValue
    },
    // factValueValidator: factValue must be string (or null = false)
    (factValue) => factValue === null || typeof factValue === 'string'
  )

  engine.addOperator(
    'daysSinceAtLeast',
    (factValue: string | null, jsonValue: number) => {
      if (!factValue) return false
      const ts = new Date(factValue)
      if (Number.isNaN(ts.getTime())) return false
      const diffDays = Math.floor((nowInBogota().getTime() - ts.getTime()) / 86400000)
      return diffDays >= jsonValue
    },
    (factValue) => factValue === null || typeof factValue === 'string'
  )

  // tagMatchesPattern — fact is string[], jsonValue is a regex source string
  engine.addOperator(
    'tagMatchesPattern',
    (factValue: string[], jsonValue: string) => {
      // Reject regex with dangerous patterns at registration time, not eval time
      const re = new RegExp(jsonValue)
      return Array.isArray(factValue) && factValue.some(t => re.test(t))
    },
    (factValue) => Array.isArray(factValue)
  )

  // arrayContainsAny — fact is string[], jsonValue is string[] — OR-semantics
  engine.addOperator(
    'arrayContainsAny',
    (factValue: string[], jsonValue: string[]) => {
      return Array.isArray(factValue) && factValue.some(v => jsonValue.includes(v))
    },
    (factValue) => Array.isArray(factValue)
  )

  // arrayContainsAll — string[] vs string[] — AND-semantics
  engine.addOperator(
    'arrayContainsAll',
    (factValue: string[], jsonValue: string[]) => {
      return Array.isArray(factValue) && jsonValue.every(v => factValue.includes(v))
    },
    (factValue) => Array.isArray(factValue)
  )
}
```

`[VERIFIED: custom operator API signature confirmed in types/index.d.ts:71]`
`[CITED: examples/06-custom-operators.js — startsWith pattern]`

### Async fact with Supabase via domain layer

See **Pattern 2** above (full `src/lib/agents/routing/facts.ts` example).

### FIRST-hit pattern with engine.stop() and unique priorities

See **Pattern 1** above (full `routeAgent` implementation). The key fragment:

```typescript
for (const rule of classifierRules) {
  e1.addRule({
    ...rule.compiled,
    onSuccess: (event, almanac, ruleResult) => {
      firedClassifierId = rule.id
      lifecycleState = event.params!.lifecycle_state
      e1.stop()  // halts NEXT priority group (verified)
    },
  })
}
```

`[VERIFIED: live test in /tmp/jre-test/test.mjs — only the highest-priority matching rule's onSuccess fires; lower-priority rules are skipped]`

### Ajv schema validation on rule write

```typescript
// src/lib/agents/routing/schema/validate.ts
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import ruleV1Schema from './rule-v1.schema.json'

const ajv = new Ajv({ allErrors: true, strict: true })
addFormats(ajv)  // for "uuid", "date-time" etc.

const validateV1 = ajv.compile(ruleV1Schema)

export function validateRule(rule: unknown): { ok: true } | { ok: false; errors: string[] } {
  const ok = validateV1(rule)
  if (ok) return { ok: true }
  return {
    ok: false,
    errors: (validateV1.errors ?? []).map(e => `${e.instancePath} ${e.message}`),
  }
}
```

`rule-v1.schema.json` shape (planner finalizes):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://morfx.app/schemas/routing/rule-v1.json",
  "title": "Routing Rule v1",
  "type": "object",
  "required": ["schema_version", "rule_type", "name", "priority", "conditions", "event"],
  "properties": {
    "schema_version": { "const": "v1" },
    "rule_type": { "enum": ["lifecycle_classifier", "agent_router"] },
    "name": { "type": "string", "minLength": 1, "maxLength": 100 },
    "priority": { "type": "integer", "minimum": 1, "maximum": 100000 },
    "conditions": { "$ref": "#/$defs/topLevelCondition" },
    "event": {
      "type": "object",
      "required": ["type", "params"],
      "properties": {
        "type": { "const": "route" },
        "params": {
          "oneOf": [
            { "type": "object", "required": ["lifecycle_state"], "properties": { "lifecycle_state": { "enum": ["new_prospect", "order_in_progress", "in_transit", "just_received", "dormant_buyer", "abandoned_cart", "reactivation_window", "blocked"] } } },
            { "type": "object", "required": ["agent_id"], "properties": { "agent_id": { "type": ["string", "null"] } } }
          ]
        }
      }
    },
    "active": { "type": "boolean" }
  },
  "$defs": {
    "topLevelCondition": {
      "oneOf": [
        { "type": "object", "required": ["all"], "properties": { "all": { "type": "array", "items": { "$ref": "#/$defs/anyCondition" } } } },
        { "type": "object", "required": ["any"], "properties": { "any": { "type": "array", "items": { "$ref": "#/$defs/anyCondition" } } } },
        { "type": "object", "required": ["not"], "properties": { "not": { "$ref": "#/$defs/anyCondition" } } }
      ]
    },
    "anyCondition": {
      "oneOf": [
        { "$ref": "#/$defs/topLevelCondition" },
        { "$ref": "#/$defs/leafCondition" }
      ]
    },
    "leafCondition": {
      "type": "object",
      "required": ["fact", "operator", "value"],
      "properties": {
        "fact": { "type": "string" },
        "operator": { "type": "string" },
        "value": {}
      },
      "additionalProperties": false
    }
  }
}
```

Note `additionalProperties: false` on `leafCondition` deliberately rejects `path` (Pitfall 2 mitigation) — the schema is the enforcement layer.

`[CITED: github.com/cachecontrol/json-rules-engine/issues/203 — community schema as starting reference]`
`[CITED: ajv.js.org/json-schema.html for compile + validate API]`

### Dry-run replay loop

See **Pattern 4** above. Key implementation note: dry-run constructs **new** Engine instances with the candidate rules — does NOT touch the LRU cache or the production Engine state.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `if (is_client && recompra_enabled)` in webhook-processor | Declarative rule engine evaluated per request | This phase (2026-04-25 plan-stage) | Editable without redeploy; supports 5-10+ agents per workspace |
| LLM-based router (LangGraph/Swarm) | Deterministic rule engine for structured CRM state | Anthropic guidance + research session | LLM routing rejected: 300-900ms latency, non-deterministic, can't dry-run cleanly |
| DMN engine | json-rules-engine | D-02 — bus factor + JSON-native for v2 LLM editor | DMN ecosystem in Node has hundreds DL/wk vs 275k for json-rules-engine |
| Supabase Realtime for cache invalidation | Per-instance LRU + version-column polling | This research | Realtime requires WebSocket subscriptions; not available in serverless |

**Deprecated/outdated:**
- `addRuntimeFact` (almanac method) — deprecated in favor of `addFact` even mid-execution. Use `engine.addFact(factId, value)` for layer-2 runtime facts. `[CITED: docs/almanac.md]`
- `@types/json-rules-engine` — package no longer needed; types ship with the library since v6.x. `[VERIFIED: types/index.d.ts in node_modules]`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 60s soft TTL with version-column revalidation is acceptable for the admin form's UX expectations. | Pattern 3, Pitfall 3 | Higher: forces a switch to Vercel Runtime Cache + tag invalidation, slightly more complex. Discuss with user if instant propagation needed. |
| A2 | Dry-run uses CURRENT facts, not historical-as-of-message-time facts. | Pattern 4 | Higher: changes the semantics of the simulator. Discuss-phase already locked dry-run as v1; semantic interpretation is a research conclusion, not a user decision. Recommend explicit user confirmation before plan locks. |
| A3 | Audit log retention = 90 days is acceptable. | Pitfall 6 | Low: storage cost + forensic depth. Easy to change post-deploy. |
| A4 | Disabling the `path` field entirely in v1 admin form is acceptable (no current fact in the catalog needs it). | Pitfall 2, schema example | Low: re-enable later via a curated whitelist if a fact returns nested objects (currently planned facts return scalars/arrays). |
| A5 | The `routing_audit_log` shape includes a full `facts_snapshot` JSONB (vs. just rule IDs + decision). | Pattern 5 | Medium: bigger rows; bigger value for forensics + v2 routing-builder grounding. The crm-stage-integrity standalone in this repo went the same direction. Recommend confirming with planner. |
| A6 | Per-instance LRU keyed by workspaceId fits within Vercel lambda memory budgets. With 200 workspaces × ~5KB compiled rules each = 1MB. | Pattern 3 | Low: validated against typical Vercel lambda 1024MB allocation. |
| A7 | An average Vercel lambda instance lives long enough for the LRU to amortize the cache (versus restarting cold every request). | Pattern 3 | Medium: Vercel Fluid Compute enables instance reuse; classic serverless can be cold each time. If instance lifetime is too short, the cache hit rate drops and the version-column query becomes the new floor. Acceptable: that query is one indexed `MAX(updated_at)` ≈ <5ms. |

**Recommendation:** Discuss A1 and A2 with user before plan locks. The rest are sufficiently low-risk for `[ASSUMED]` to stand.

---

## Open Questions

1. **Should override tags be evaluated as conditions in classifier rules, or as a pre-filter before any rules run?**
   - What we know: D-04 says they're inputs to rules. A pre-filter could be cleaner: `if tags.includes('forzar_humano') return null` short-circuits the engine entirely.
   - What's unclear: putting them as the highest-priority classifier rule is the more declarative approach (consistent with D-08 vocabulary) but slightly slower (one engine.run() to evaluate).
   - Recommendation: encode them as the highest-priority classifier rules (priority 100000+). Latency cost is microseconds. Maintains the declarative model for the v2 LLM editor.

2. **Where does the legacy if/else routing live during rollout?**
   - What we know: `lifecycle_routing_enabled=false` per-workspace flag (Regla 6). When OFF, current `webhook-processor.ts:174-188` logic stays.
   - What's unclear: should the if/else logic be physically MOVED into a `legacyRouter.ts` and called from inside `routeAgent()` when the flag is OFF, or should the webhook-processor branch on the flag itself?
   - Recommendation: move it to `legacyRouter.ts`. `routeAgent()` becomes the single integration point. Webhook-processor only ever calls `routeAgent`. Reduces the diff at the integration point and makes the legacy path easy to delete after full rollout.

3. **Does `agent_id: null` from the engine need a distinct sentinel from "rule didn't match"?**
   - What we know: `forzar_humano` should explicitly emit "skip the bot, human handoff." This is a real decision, not a missing one.
   - What's unclear: should the absence of any matching rule in layer 2 also be `null`, or should the fallback rule emit a specific "no_agent_matched" sentinel?
   - Recommendation: distinguish them. Use `agent_id: null` for explicit human-handoff. Make the lowest-priority fallback rule emit a workspace-default agent_id (from `workspace_agent_config.conversational_agent_id`) — never `null` from a fallback. This way `null` always means "an explicit rule said skip the bot," which is observably distinct from "engine ran out of rules."

4. **How does the dry-run replay reconstruct the contact-state-at-message-time without temporal queries?**
   - What we know: A2 above resolves this — use CURRENT state. But the replay needs to enumerate messages from the last N days, which itself requires querying historical inbound messages.
   - What's unclear: which existing table is the source of truth for "inbound webhook events from contact X" — is it `whatsapp_messages WHERE direction='inbound'`?
   - Recommendation: planner should grep the codebase for `direction='inbound'` and confirm the canonical source table; spec the dry-run to query that table grouped by `(conversation_id, contact_id)` taking the LATEST message per contact in the window.

5. **Should the v1 admin form support drag-and-drop priority reordering, or just numeric input?**
   - What we know: D-06 says "Reordenable por prioridad drag-and-drop."
   - What's unclear: drag-and-drop with widely-spaced priorities (1000, 900, ...) is straightforward; with tight priorities, reorder requires re-numbering all rules in a transaction.
   - Recommendation: planner specifies priority as a `bigint` with default spacing of 1000 between rules; the drag-and-drop computes a new priority as the midpoint of the two adjacent rules. Falls back to renumbering only when midpoints exhaust.

---

## Validation Architecture

(`workflow.nyquist_validation` not explicitly set in `.planning/config.json` for this standalone — treat as enabled.)

### Test Framework

| Property | Value |
|----------|-------|
| Framework | The morfx-new repo uses `vitest` per existing test suites (e.g., `src/lib/agents/somnio-recompra/__tests__/*.test.ts` referenced in `.claude/rules/agent-scope.md`). Verify with the planner. |
| Config file | `vitest.config.ts` (root) — verify in Wave 0 |
| Quick run command | `npm test -- src/lib/agents/routing/__tests__/route.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Behavior | Test Type | Automated Command | Wave 0? |
|----------|-----------|-------------------|---------|
| FIRST-hit fires highest-priority matching rule + skips lower | unit | `vitest src/lib/agents/routing/__tests__/engine.test.ts -t "first-hit"` | ❌ create |
| Same-priority rules collision detected at admin form save | unit + integration | `vitest src/lib/agents/routing/__tests__/route.test.ts -t "priority-collision"` | ❌ create |
| Async fact resolver throw → fallback path (Pitfall 4) | unit | `vitest src/lib/agents/routing/__tests__/engine.test.ts -t "fact-throw-fallback"` | ❌ create |
| `daysSinceAtMost` honors America/Bogota | unit | `vitest src/lib/agents/routing/__tests__/operators.test.ts -t "daysSince"` | ❌ create |
| Schema validation rejects rule with `path` field | unit | `vitest src/lib/agents/routing/__tests__/schema.test.ts -t "rejects path"` | ❌ create |
| LRU cache invalidates on version-column delta | integration | `vitest src/lib/agents/routing/__tests__/cache.test.ts -t "version-revalidate"` | ❌ create |
| Dry-run does NOT write to audit log | integration | `vitest src/lib/agents/routing/__tests__/dry-run.test.ts -t "no-side-effects"` | ❌ create |
| End-to-end: webhook → router → session created with correct agent_id | integration | `vitest src/lib/agents/routing/__tests__/e2e.test.ts` | ❌ create |
| Feature flag OFF → legacy if/else preserved | integration | `vitest src/lib/agents/routing/__tests__/legacy.test.ts -t "flag-off"` | ❌ create |
| `forzar_humano` tag → `agent_id: null` distinct from missing | unit | `vitest src/lib/agents/routing/__tests__/route.test.ts -t "forzar_humano"` | ❌ create |

### Sampling Rate

- **Per task commit:** quick run on the file under edit
- **Per wave merge:** full `npm test` (or scoped to `src/lib/agents/routing/`)
- **Phase gate:** full suite green + manual smoke (admin form) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/agents/routing/__tests__/engine.test.ts` — first-hit, fact-throw, almanac caching
- [ ] `src/lib/agents/routing/__tests__/operators.test.ts` — custom ops in Bogota tz
- [ ] `src/lib/agents/routing/__tests__/route.test.ts` — full pipeline integration
- [ ] `src/lib/agents/routing/__tests__/schema.test.ts` — Ajv validation
- [ ] `src/lib/agents/routing/__tests__/cache.test.ts` — LRU + version revalidation
- [ ] `src/lib/agents/routing/__tests__/dry-run.test.ts` — replay + no side effects
- [ ] `src/lib/agents/routing/__tests__/legacy.test.ts` — feature flag OFF preserves current behavior
- [ ] `src/lib/agents/routing/__tests__/fixtures.ts` — sample rules + facts
- [ ] Verify `vitest` is the project test framework (`grep '"test":' package.json`)

---

## Project Constraints (from CLAUDE.md)

- **Regla 0:** GSD workflow obligatorio — research → plan → execute. (We're at research step.)
- **Regla 1:** Push to Vercel after code changes before user testing.
- **Regla 2:** All date/time logic in `America/Bogota`. **All custom operators (`daysSinceAtMost`, etc.) MUST honor this** — see `nowInBogota()` helper in code example.
- **Regla 3:** Domain layer obligatorio. ALL writes to `routing_rules`, `routing_audit_log`, `routing_facts_catalog` go through `src/lib/domain/routing.ts` using `createAdminClient()`. Fact resolvers (read path) IMPORT `@/lib/domain/*` functions; never construct admin clients in `src/lib/agents/routing/**`.
- **Regla 4:** Documentation always updated. Routing engine must update `docs/architecture/` and `docs/analysis/04-estado-actual-plataforma.md`.
- **Regla 5:** Migration before deploy. `routing_rules`, `routing_facts_catalog`, `routing_audit_log` migration MUST be applied to production BEFORE any code referencing them ships.
- **Regla 6:** Protect production agent. Router shipped behind `lifecycle_routing_enabled` per-workspace flag (default OFF). Existing if/else stays as fallback. Flip per workspace only after dry-run validation.
- **`.claude/rules/agent-scope.md`:** The router engine itself is NOT an agent (deterministic service). The future v2 `routing-builder` agent IS — must register scope in this file before merging v2.
- **`.claude/rules/code-changes.md`:** Atomic commits, descriptive messages in Spanish.

---

## Sources

### Primary (HIGH confidence)
- **json-rules-engine source code** (installed locally, version 7.3.1) — verified `engine.js`, `engine-default-operators.js`, `engine-default-operator-decorators.js`, `types/index.d.ts`. Source-of-truth for priority semantics and `engine.stop()` behavior.
- **Live execution** (`/tmp/jre-test/test.mjs`, `test2.mjs`) — verified FIRST-hit pattern, almanac caching, same-priority parallel firing pitfall.
- **Official docs** ([rules.md](https://github.com/CacheControl/json-rules-engine/blob/master/docs/rules.md), [engine.md](https://github.com/CacheControl/json-rules-engine/blob/master/docs/engine.md), [almanac.md](https://github.com/CacheControl/json-rules-engine/blob/master/docs/almanac.md), [facts.md](https://github.com/CacheControl/json-rules-engine/blob/master/docs/facts.md)) — fetched via WebFetch.
- **GitHub issue #180** ([link](https://github.com/CacheControl/json-rules-engine/issues/180)) and **#360** ([link](https://github.com/CacheControl/json-rules-engine/issues/360)) — confirms `engine.stop()` does not affect same-priority rules (no maintainer fix as of fetch).
- **GitHub issue #203** ([link](https://github.com/CacheControl/json-rules-engine/issues/203)) — community JSON Schema for rules; confirms no canonical schema in repo, schema must be authored.
- **Anthropic — Building Effective Agents** ([link](https://www.anthropic.com/research/building-effective-agents)) — endorses traditional/deterministic classifiers for structured inputs (Routing pattern). Verified via WebFetch.
- **npm registry** (`npm view`) — verified versions of `json-rules-engine@7.3.1`, `ajv@8.20.0`, `lru-cache@11.3.5`.
- **morfx-new codebase** — read: `webhook-processor.ts:1-250,440-520`, `registry.ts:1-118`, `session-manager.ts:100-260`, `webhook-handler.ts:40-100`, `agent-config.ts:1-100`, domain layer signatures.

### Secondary (MEDIUM confidence — multiple sources)
- **Snyk advisory** ([CVE-2025-1302](https://security.snyk.io/vuln/SNYK-JS-JSONPATHPLUS-7945884)) + **GitLab advisory** ([CVE-2024-21534](https://advisories.gitlab.com/pkg/maven/org.webjars.npm/jsonpath-plus/CVE-2024-21534/)) + **GitLab advisory** ([CVE-2025-1302 npm](https://advisories.gitlab.com/pkg/npm/jsonpath-plus/CVE-2025-1302/)) — three independent confirmations of `jsonpath-plus` RCE history. CVSS 8.9.
- **Vercel docs** ([Runtime Cache](https://vercel.com/docs/caching/runtime-cache), [Edge Caching](https://vercel.com/docs/functions/serverless-functions/edge-caching)) — confirms per-instance LRU + tag-based invalidation as the platform pattern.
- **Supabase docs** ([Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Realtime architecture](https://supabase.com/docs/guides/realtime/architecture)) — confirms Realtime is WebSocket-based and incompatible with Vercel serverless for inter-lambda pubsub.

### Tertiary (LOW confidence — synthesis from training + general patterns)
- Dry-run replay correctness (as-of-NOW vs as-of-historical-time): no canonical reference; conclusion is reasoned from system properties of this codebase. Flagged as A2 in Assumptions Log.

---

## Metadata

**Confidence breakdown:**
- Standard stack & engine semantics: **HIGH** — verified by source code + live execution + official docs.
- Architecture patterns (3-layer, fact resolvers, audit log shape): **HIGH** — patterns derived from official docs + analogous proven patterns in this repo (crm-stage-integrity audit log, somnio-recompra-crm-reader async enrichment).
- Cache invalidation strategy: **MEDIUM** — Realtime-doesn't-work-here is verified; per-instance LRU + version column is industry-standard but the planner can choose Vercel Runtime Cache as Option B.
- Dry-run replay semantics: **MEDIUM-LOW** — synthesized; recommend user confirms A2 before locking the plan.
- Pitfalls 1, 2, 7: **HIGH** — verified by code inspection or CVE advisories.
- Pitfalls 3, 4, 5, 6: **MEDIUM** — reasoned from system properties; mitigations are defensive best practices.

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 (30 days for a stable library; revisit if json-rules-engine 8.x ships, since 8.0.0-alpha.1 is published — alpha behavior may change priority semantics)

---

*Standalone: agent-lifecycle-router*
*Research conducted 2026-04-25 — verified via official docs (Context7 unavailable in this session, used WebFetch + WebSearch + direct npm install + live execution).*
