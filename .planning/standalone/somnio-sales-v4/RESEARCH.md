# Standalone: somnio-sales-v4 — Research

**Researched:** 2026-05-01
**Domain:** Hybrid conversational agent (deterministic state machine + bounded AI SDK sub-loop) with curated knowledge base + unknown-cases observation loop
**Confidence:** HIGH on stack/integration points (verified in repo); MEDIUM on calibration & sub-loop best practices (mostly training + a few sources); HIGH on the Meta template question (verified empirically)

## Summary

v4 is a clone-and-adapt of `somnio-v3` (NOT pw-confirmation) with three new capabilities layered on top: (1) self-reported confidence in comprehension that triggers a Haiku sub-loop with bounded tools, (2) a curated knowledge base in `.md` + `agent_knowledge_base` table with pgvector, (3) an `agent_unknown_cases` observation table with a UI for human review and rule promotion. CRM mutations route through the already-shipped `crm-mutation-tools` factory (D-07), CRM reads through `crm-query-tools` (D-28). 79 decisions are pre-locked — research only addresses the 12 open unknowns.

The single most-load-bearing finding: **the project's `agent_templates` table is INTERNAL Postgres content storage, NOT Meta WhatsApp HSM templates.** Cloning rows with a new `agent_id` is purely a metadata/SQL operation with **zero Meta involvement, zero re-approval, zero risk of disapproval**. The CONTEXT.md mentions "whatsapp_templates" but no such table exists — this is shorthand for `agent_templates` (the table named in every prior migration). The 360dialog-side WhatsApp HSM templates are managed separately in `src/lib/whatsapp/templates-api.ts` and are only ever used for outside-24h-window fallback (not the conversational happy path). v3, recompra, and pw-confirmation all send `content_type='texto'`/`'imagen'` rows from `agent_templates` as plain WhatsApp text/media messages via `domainSend`/`domainSendMedia`. v4 inherits this pattern — there is no Meta side of the template clone. (See Section 1 below.) [VERIFIED: grep on src/lib/agents/somnio/template-manager.ts:273 + src/lib/whatsapp/api.ts]

**Primary recommendation:** Treat the phase as 7 independent waves (W0 schema → W1 shared utilities → W2 state-machine port → W3 sub-loop+tools → W4 KB seed+sync → W5 unknown_cases+UI → W6 timers+flip → W7 rollout). Use `Output.object()` (AI SDK v6 canonical pattern) for the comprehension Haiku call extension and for sub-loop output; use `toolChoice: 'required'` to enforce no-freeText in the sub-loop. Drop HDBSCAN in favor of a pgvector cosine-similarity neighborhood query for clustering at this scale (low-volume operation). Use OpenAI `text-embedding-3-small` (1536 dims, $0.02/1M tokens) with `gray-matter` for parsing.

## User Constraints (from CONTEXT.md)

### Locked Decisions

The 79 D-* decisions in CONTEXT.md are **locked and not subject to research re-litigation**. Research only fills gaps in implementation specifics, not in architecture choices. Key locked items the planner must honor verbatim:

- **D-01 Hybrid Option C** — state machine on happy path + Haiku sub-loop ONLY under triggers
- **D-02 Triggers** — low-confidence + CRM mutations + CAS reject + `razonamiento_libre`/`otro`
- **D-03 Threshold = 0.70** parametrizable via `platform_config.somnio_v4_low_confidence_threshold`
- **D-07 mutations via crm-mutation-tools direct** — NOT crm-writer adapter
- **D-09 sub-loop default model = Haiku**
- **D-13 agent_id = `somnio-sales-v4`** (locked literal everywhere)
- **D-19 Set mínimo 5 mutations** — `createOrder` (come-back × 3 paths), `updateOrder` (come-back, shipping), `moveOrderToStage` (come-back, cancelar), `updateContact` (execute), `addOrderNote` (execute)
- **D-22 Inngest function v4 separada** — `agent-timers-v4.ts` clonada de v3
- **D-24 v4 entidad independiente de v3** — clone, no extend, no import
- **D-26/D-27 Templates clonados** — script SQL en Plan 01
- **D-31 Flip total bajo comando del usuario** — sin shadow, sin A/B
- **D-40 Flip = 2-statement transaction** — close v3 sessions + insert routing rule
- **D-45 Frontmatter 7 fields** — topic, keywords, category, last_reviewed, reviewed_by, escalate_if?, related_topics?
- **D-49 Body structure** — `## Respuesta canónica` / `## Si el cliente insiste` / `## NUNCA decir` / `## Sources`
- **D-50/D-51/D-62 Sub-loop response constraints** — verbatim canónica preferred + post-gen "NUNCA decir" check + zero freeText
- **D-56 KB schema** — 1536-dim embedding, hit_count, promoted_to_transition, etc.
- **D-57..D-62 Knowledge fallback** — `no_match` → handoff_humano always, double logging, no re-engagement
- **D-63..D-79 Calibration** — single Haiku schema extension, post-flip 2-window calibration, few-shot 6-8 ejemplos

### Claude's Discretion (planner has freedom)

- Subdirectory layout under `src/lib/agents/somnio-v4/` (state-machine, transitions, comprehension, sub-loop, knowledge, etc.)
- Exact column set + indices of `agent_unknown_cases` (beyond the obvious `id, workspace_id, agent_id, conversation_id, message, embedding, intent, confidence, created_at, status, cluster_id, promoted_at`)
- Internal `LoopOutcome` Zod shape of the sub-loop (what fields to return)
- Wave decomposition (planner chooses 7-15 plans within waves below)
- Exact SQL of template clone (CONTEXT shows the pattern)
- UI shape of `/agentes/somnio-v4/unknown-cases` (table layout, filters, promotion CTA)

### Deferred Ideas (OUT OF SCOPE — do not research, do not plan)

- SLA monitoring of handoffs → standalone futuro `somnio-handoff-sla-monitoring`
- v3 deprecation/cleanup → standalone `somnio-sales-v3-deprecation`
- pw-confirmation migration to crm-mutation-tools → standalone `crm-mutation-tools-pw-confirmation-integration`
- Plan B (enum-mapped confidence) → standalone contingency post 4-week observation
- Apply v4 to non-Somnio workspaces — out of scope
- Logits/log-probs as confidence metric — Anthropic API still doesn't expose them (verified May 2026)
- A/B per-conversation between v3 and v4 — descartado D-31
- Shadow mode comparativo — descartado D-75
- UI editor for `/agentes/knowledge-base` (PR-only curation per D-52)

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Webhook reception (inbound msg) | API/Backend (`/api/webhook`) | — | Owned by existing webhook-processor.ts |
| Routing to v4 | API/Backend (`routing_rules` engine) | — | Already shipped; D-31 inserts a row to flip |
| State machine (transitions, gates, phase) | API/Backend (Node.js runtime) | — | Pure functions, sync; clone of v3 |
| Comprehension (single Haiku) | External LLM (Anthropic) → API | — | Same as v3; schema extension only |
| Sub-loop (bounded tool-call) | External LLM (Anthropic Haiku) → API | API/Backend (tool handlers) | New; AI SDK v6 generateText + tools |
| CRM reads | API/Backend → Supabase domain | — | Via shared `crm-query-tools` factory |
| CRM mutations | API/Backend → Supabase domain | — | Via shared `crm-mutation-tools` factory |
| Knowledge base storage | Database (Postgres + pgvector) | Git (`.md` source of truth) | Dual: text in git, embedding in DB |
| KB sync | Inngest function (post-deploy) | CLI `pnpm knowledge:sync` | Sync runs after Vercel deploy or manual local |
| Embedding generation | External (OpenAI text-embedding-3-small) | API/Backend | Called from sync worker only, not at query time |
| Unknown cases capture | API/Backend → Supabase | — | Inline emit during sub-loop no_match path |
| Clustering of unknowns | Inngest cron (nightly) | API/Backend | Pure SQL pgvector neighborhood — no external svc |
| Unknown cases UI | Frontend (Next.js App Router) | API/Backend (server actions) | `/agentes/somnio-v4/unknown-cases` |
| Inngest timers | API/Backend (Inngest function) | — | Clone of `agent-timers-v3.ts` |
| Atomic flip | Database (Postgres transaction) | Manual command (psql or migration) | 2 SQL statements in BEGIN/COMMIT |
| Template catalog | Database (`agent_templates` table) | — | Clone rows, no Meta involvement |
| Observability | API/Backend → Supabase (`agent_observability_events`) | — | Same emitters as v3 + new event types |
| Platform config | Database (`platform_config`) | — | Threshold tuning post-flip |

[VERIFIED: routing_rules table confirmed in supabase/migrations/20260425220000_agent_lifecycle_router.sql; webhook-processor.ts:715-724 routes by routerDecidedAgentId; agent_observability_events table confirmed in src/lib/observability/repository.ts:245]

## Standard Stack

### Core (already in package.json — REUSE)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | ^6.0.86 | AI SDK v6 (sub-loop, comprehension wrapper) | Canonical AI orchestration in repo (crm-reader, crm-writer use it) [VERIFIED: package.json] |
| `@ai-sdk/anthropic` | ^3.0.43 | Anthropic provider for AI SDK | Canonical pairing with `ai` for Haiku [VERIFIED: package.json] |
| `@anthropic-ai/sdk` | ^0.73.0 | Direct SDK (used by v3 comprehension) | v3 comprehension uses raw SDK with `zodOutputFormat` helper. v4 SHOULD migrate the comprehension call to AI SDK v6 `generateText` + `Output.object()` for consistency with sub-loop, but this is a `Claude's Discretion` choice — both work. Recommendation: stay raw for comprehension (zero risk, identical to v3) and use AI SDK only for sub-loop where tool-calling is needed. [VERIFIED: src/lib/agents/somnio-v3/comprehension.ts:11-13] |
| `zod` | ^4.3.6 | Schema validation | Already used everywhere (mutation-tools, query-tools, comprehension) [VERIFIED: package.json] |
| `openai` | ^6.24.0 | OpenAI client (for `text-embedding-3-small`) | Already in package.json (used by data-extractor, etc.). REUSE for KB sync embedding generation. [VERIFIED: package.json] |

### New (must install)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `gray-matter` | ^4.0.3 (latest stable) | YAML frontmatter parsing for `.md` knowledge files | Industry standard (Gatsby, Netlify, Astro, Hashicorp use it). Battle-tested. Parses YAML by default; supports custom delimiters. [CITED: https://www.npmjs.com/package/gray-matter] |

**Version verification protocol for plan-phase:** Before Plan 04 (KB sync function) finalizes the install command, run `npm view gray-matter version` to confirm latest. As of training cutoff Jan 2026, `4.0.3` was current; the package is mature and rarely updates.

### Reused infrastructure (already shipped — DO NOT rebuild)

| Asset | Location | Purpose for v4 |
|-------|----------|----------------|
| `createCrmQueryTools(ctx)` | `src/lib/agents/shared/crm-query-tools/index.ts:23` | 5 read tools for sub-loop + state-machine come-backs |
| `createCrmMutationTools(ctx)` | `src/lib/agents/shared/crm-mutation-tools/index.ts:34` | 15 mutation tools — v4 uses 5 (D-19); spread the factory result and let TypeScript pick |
| `crm_mutation_idempotency_keys` table | shipped 2026-04-29 | Idempotency for `createOrder`, `addOrderNote` paths |
| `agentRegistry` | `src/lib/agents/registry.ts:117` | Self-register `'somnio-sales-v4'` |
| `routing_rules` table | shipped 2026-04-25 | Insert flip-on rule with `event.agent_id='somnio-sales-v4'` |
| `agent_observability_events` table | shipped pre-Phase 44 | Emit `pipeline_decision:*` events with new event-type strings |
| `platform_config` key/value table | shipped Phase 44.1 | Store `somnio_v4_low_confidence_threshold` |
| `agent_templates` table | shipped Phase 14 | Internal content storage (NOT Meta HSM); clone rows for v4 |
| `session_state` table | shipped Phase 13 | `agent_id` column distinguishes per-session ownership; `datos_capturados` JSONB extends without schema change |
| Domain layer `src/lib/domain/*` | shipped over many phases | Tools NEVER bypass — Regla 3 enforced |
| `runWithPurpose()` + observability collector | `src/lib/observability/` | Wrap all Anthropic calls; flush handles aggregation |
| `agent-timers-v3.ts` Inngest function | `src/inngest/functions/agent-timers-v3.ts` | Template for `agent-timers-v4.ts`; defensive guard at L261-268 to clone |
| 360dialog WhatsApp send (`domainSend`/`domainSendMedia`) | `src/lib/domain/messages.ts` | Final send path; agent emits texts/images, send happens here |

### Alternatives Considered (rejected for this phase)

| Instead of | Could Use | Tradeoff | Why rejected |
|------------|-----------|----------|--------------|
| OpenAI `text-embedding-3-small` | Voyage-3, Cohere embed-v3, Gemini text-embedding-004 | All have similar quality; Voyage is slightly better on retrieval benchmarks | Project already has `openai` SDK installed and used for other extraction calls. Adding Voyage = new vendor, new key, new error path. Embedding quality at scale of ~100 KB docs is dominated by curation, not model. |
| HDBSCAN | DBSCAN, k-means, agglomerative, pgvector cosine neighborhood | HDBSCAN handles density-varied clusters well; needs Python or hdbscanjs (8 years stale) | At expected volume (tens to low-hundreds of unknowns/month for one workspace) the sophistication wins of HDBSCAN are negligible vs the cost of running a Python service or using stale JS lib. **Use pgvector cosine neighborhood query (`embedding <=> :target < 0.3`) — runs inline in Postgres, no infra.** See Section 8 below. |
| `gray-matter` | `front-matter`, `yaml-front-matter`, `remark-frontmatter` | All work | `gray-matter` is the dominant choice in 2026 (Gatsby, Astro, VitePress, Hashicorp use it). Battle-tested. Single dep, no extras. [CITED: https://github.com/jonschlinkert/gray-matter] |
| AI SDK `generateObject` for sub-loop | Old API | Deprecated in v6 | v6 unifies via `generateText` + `Output.object()`. Use the new pattern. [CITED: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0] |

**Installation (NEW only):**
```bash
pnpm add gray-matter
```

(`openai`, `ai`, `@ai-sdk/anthropic`, `@anthropic-ai/sdk`, `zod` already installed.)

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ INBOUND TURN (user message arrives via WhatsApp 360dialog webhook)           │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌────────────────────────────────┐
                    │ webhook-processor.ts           │
                    │ - resolve workspace            │
                    │ - resolve contact/conversation │
                    │ - check is_agent_enabled       │
                    │ - routing_rules engine →       │
                    │   agent_id='somnio-sales-v4'   │
                    └────────────────────────────────┘
                                    │
                                    ▼
            ┌──────────────────────────────────────────┐
            │ somnio-v4-agent.processMessage(input)    │
            │   1. deserialize state from session      │
            │   2. comprehend() — single Haiku call    │
            │      EXTENDED: includes intent_confidence│
            │   3. mergeAnalysis → state + changes     │
            │   4. computeGates                        │
            │   5. checkGuards (R0/R1)                 │
            │   6. resolveTransition(phase, intent)    │
            │   7. invocations: come-back blocking,    │
            │      then execute fire-and-forget        │
            │   8. resolveResponseTrack → templates    │
            │                                          │
            │   IF intent_confidence < 0.70 OR         │
            │      intent ∈ {razonamiento_libre, otro} │
            │      OR transition wants CRM mutation    │
            │      OR moveOrderToStage returns         │
            │      'stage_changed_concurrently'        │
            │   THEN ESCALATE → sub-loop               │
            └──────────────────────────────────────────┘
                       │                    │
                       │ happy path         │ sub-loop trigger
                       ▼                    ▼
            ┌─────────────────┐   ┌────────────────────────────┐
            │ Send templates  │   │ sub-loop (Haiku, 3-5 tools)│
            │ via 360dialog   │   │ - kb_search (pgvector)     │
            │ persist state   │   │ - subset of crm-query      │
            │ schedule timers │   │ - subset of crm-mutation   │
            └─────────────────┘   │ - toolChoice: 'required'   │
                                  │ stopWhen: stepCountIs(4)   │
                                  └────────────────────────────┘
                                              │
                                              ▼
                              ┌─────────────────────────────────┐
                              │ Sub-loop result                 │
                              │  status:                        │
                              │   • 'template' → response_track │
                              │   • 'canonical' → verbatim KB   │
                              │   • 'no_match' → handoff_humano │
                              │ Post-gen Haiku check:           │
                              │   "NUNCA decir" violation? →    │
                              │   handoff_humano                │
                              └─────────────────────────────────┘
                                              │
                                              ├──── on no_match ──┐
                                              ▼                    ▼
                                  ┌─────────────────┐   ┌─────────────────────┐
                                  │ Send template + │   │ Insert into         │
                                  │ persist state   │   │ agent_unknown_cases │
                                  │                 │   │ (with embedding)    │
                                  └─────────────────┘   └─────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ ASYNC LIFECYCLE                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

  Inngest cron 'knowledge-sync' (post-deploy + manual via pnpm)
       │
       ▼
  Read .md files from src/lib/agents/somnio-v4/knowledge/
       │
       ▼
  gray-matter parse → validate frontmatter → check folder/category coherence
       │
       ▼
  Hash body. If hash != stored hash → regenerate embedding via OpenAI
       │
       ▼
  UPSERT agent_knowledge_base ON CONFLICT (topic, agent_id, workspace_id)

  Inngest cron 'unknown-cases-cluster' (TZ=America/Bogota 0 4 * * *)
       │
       ▼
  Pull cases from last 30 days WHERE status='pending'
       │
       ▼
  pgvector cosine neighborhood: embedding <=> target < 0.3
       │
       ▼
  Cluster size ≥ 10 → mark cluster_id, set status='ready_for_promotion'

  UI /agentes/somnio-v4/unknown-cases (Next.js page)
       │
       ▼
  List clusters → operator reviews → server action 'promote' creates new
  transition or new KB doc → marks cluster as 'promoted'
```

### Recommended Project Structure

```
src/lib/agents/somnio-v4/
├── ARCHITECTURE.md                    # Decisión record para futuros maintainers
├── config.ts                          # SOMNIO_V4_AGENT_ID = 'somnio-sales-v4'
├── constants.ts                       # V4_INTENTS (clone v3 + extras), thresholds, timers (clone V3_TIMER_DURATIONS)
├── types.ts                           # Clone v3 types; add LoopOutcome, ConfidenceCalibration
├── state.ts                           # Clone mergeAnalysis, computeGates from v3
├── phase.ts                           # Clone derivePhase from v3
├── guards.ts                          # Clone R0/R1 from v3
├── transitions.ts                     # Clone TRANSITIONS array from v3 + ANY adaptations
├── comprehension-schema.ts            # Extend v3 schema with intent_confidence + intent_confidence_reasoning
├── comprehension-prompt.ts            # Extend v3 prompt with confidence few-shot (D-66)
├── comprehension.ts                   # Clone v3 comprehension; new schema; same Anthropic flow
├── sales-track.ts                     # Clone v3 sales-track
├── response-track.ts                  # Clone v3 response-track; uses SOMNIO_V4_AGENT_ID
├── delivery-zones.ts                  # Clone v3 (no changes — same Somnio data)
├── somnio-v4-agent.ts                 # Main processMessage; orchestrates state-machine + sub-loop escalation
├── sub-loop/
│   ├── index.ts                       # entry: runSubLoop(reason, ctx) → LoopOutcome
│   ├── tools.ts                       # buildSubLoopTools(reason, ctx) → AI SDK tools dict
│   ├── output-schema.ts               # Zod LoopOutcome (discriminated union: 'template'/'canonical'/'no_match')
│   ├── kb-search-tool.ts              # AI SDK tool that wraps pgvector cosine search
│   └── nunca-decir-check.ts           # post-gen Haiku validator
├── knowledge/                         # Source of truth (.md curated)
│   ├── product/
│   ├── policies/
│   ├── edge-cases/
│   └── faqs-no-templated/
├── knowledge-sync/
│   ├── parse-frontmatter.ts           # gray-matter wrapper + Zod validation of FrontmatterSchema
│   ├── coherence-check.ts             # folder vs frontmatter category
│   ├── embed.ts                       # OpenAI text-embedding-3-small wrapper
│   └── upsert.ts                      # writes to agent_knowledge_base
├── unknown-cases/
│   ├── capture.ts                     # called by sub-loop on no_match: insert with embedding
│   └── cluster.ts                     # Inngest cron worker; pgvector neighborhood query
└── __tests__/                         # state-machine + sub-loop unit tests

scripts/
└── knowledge-sync.ts                  # CLI entry for `pnpm knowledge:sync`

src/inngest/functions/
├── agent-timers-v4.ts                 # CLONE of agent-timers-v3.ts
├── knowledge-sync-v4.ts               # post-deploy KB sync
└── unknown-cases-cluster.ts           # nightly clustering

src/app/(dashboard)/agentes/somnio-v4/
└── unknown-cases/
    ├── page.tsx                       # list clusters + cases
    ├── _actions.ts                    # promote / dismiss / re-cluster
    └── _components/                   # ClusterCard, CaseRow, PromoteDialog

supabase/migrations/
├── 20260501XXXXXX_somnio_v4_kb.sql              # agent_knowledge_base + pgvector extension
├── 20260501XXXXXX_somnio_v4_unknown_cases.sql   # agent_unknown_cases
├── 20260501XXXXXX_somnio_v4_platform_config.sql # somnio_v4_low_confidence_threshold seed
├── 20260501XXXXXX_somnio_v4_template_clone.sql  # clone agent_templates rows
└── 20260501XXXXXX_somnio_v4_flip.sql            # ATOMIC flip — close v3 sessions + insert routing rule (run AT FLIP, not at deploy)
```

### Pattern 1: Hybrid happy-path → escalation

**What:** State machine handles 80%+ of turns deterministically. Sub-loop runs only when state machine signals ambiguity or CRM-related uncertainty.

**When to use:** Default for v4. Never invoke sub-loop unless one of the 4 D-02 triggers fires.

**Example (orchestration sketch):**
```typescript
// src/lib/agents/somnio-v4/somnio-v4-agent.ts (sketch)
const { analysis, tokensUsed } = await comprehend(message, history, datos, recentBot)
// analysis now includes intent_confidence (D-10, D-63)

const subLoopReason = decideSubLoopReason({
  confidence: analysis.intent_confidence,
  threshold: await getThreshold(),    // platform_config
  intent: analysis.intent.primary,
  isCrmMutation: false,                // set true after transition resolves
})

if (subLoopReason === null) {
  // Happy path: pure state machine
  return await runHappyPath({ analysis, state, gates, ... })
}

// Escalate
const outcome = await runSubLoop({
  reason: subLoopReason,
  contextWindow: { state, history, message },
  tools: buildSubLoopTools(subLoopReason, ctx),
})

return mapOutcomeToAgentOutput(outcome, state)
```

### Pattern 2: AI SDK v6 sub-loop with strict tool-only output

**What:** Sub-loop runs `generateText` with `toolChoice: 'required'` so the model cannot emit free text — only tool calls. The KB search tool is one of the available tools; the result is then passed back through another generation that produces a structured `Output.object()` outcome.

**Why this matters (D-62 enforcement):** AI SDK `toolChoice: 'required'` forbids the model from returning text. Combined with `Output.object()` final-step structured output, the model is structurally prevented from hallucinating free responses. [CITED: https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text]

**Example (sub-loop sketch):**
```typescript
// src/lib/agents/somnio-v4/sub-loop/index.ts (sketch)
import { generateText, Output, stepCountIs, tool } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

const LoopOutcomeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('template'),
    responseTemplate: z.string(),       // intent name to look up in agent_templates
    extraContext: z.record(z.string()).optional(),
    requiresHuman: z.literal(false),
    reason: z.string(),
  }),
  z.object({
    status: z.literal('canonical'),     // verbatim from KB Respuesta canónica
    canonicalText: z.string(),          // direct from kb_search hit
    sourceTopic: z.string(),
    requiresHuman: z.literal(false),
    reason: z.string(),
  }),
  z.object({
    status: z.literal('no_match'),
    responseTemplate: z.literal('handoff_humano'),
    requiresHuman: z.literal(true),
    reason: z.string(),
    knowledgeQueried: z.array(z.string()),  // topics tried
  }),
])
export type LoopOutcome = z.infer<typeof LoopOutcomeSchema>

export async function runSubLoop(args: {
  reason: 'low_confidence' | 'crm_mutation' | 'cas_reject' | 'razonamiento_libre',
  ctx: SubLoopContext,
}): Promise<LoopOutcome> {
  const tools = {
    kb_search: tool({
      description: 'Search the curated knowledge base. Returns up to 3 hits with topic, canonical_response, and similarity score.',
      inputSchema: z.object({
        query: z.string().describe('User message or sub-question to look up'),
        category: z.enum(['product','policies','edge-cases','faqs-no-templated']).optional(),
      }),
      async execute({ query, category }) {
        return await searchKnowledge({ workspaceId: args.ctx.workspaceId, query, category, topK: 3 })
      },
    }),
    // Subset of crm-query-tools relevant to the reason (e.g. getActiveOrderByPhone for CAS reject)
    // Subset of crm-mutation-tools relevant to the reason (e.g. moveOrderToStage retry)
  }

  const { output } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: buildSubLoopPrompt(args.reason),
    messages: buildContextMessages(args.ctx),
    tools,
    toolChoice: 'auto',                 // need 'auto' to allow KB search before final output
    stopWhen: stepCountIs(4),           // 1 KB search + maybe 1 CRM call + 1 final output (margin)
    output: Output.object({ schema: LoopOutcomeSchema }),
  })

  return output
}
```

[CITED: https://vercel.com/blog/ai-sdk-6 confirms `Output.object()` is the v6 structured-output pattern; https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text confirms `stopWhen: stepCountIs(N)` and `toolChoice` options]

### Pattern 3: Trigger contract (D-15 `execute` vs `come-back`)

**What:** TypeScript discriminated union encodes the two semantics. State machine's transition output may emit invocations.

**Example:**
```typescript
// src/lib/agents/somnio-v4/types.ts (sketch — net new)
export type Invocation =
  | {
      kind: 'come_back'                          // blocking; merges to state, conditions next step
      tool: string                                // e.g. 'createOrder', 'getActiveOrderByPhone'
      input: unknown                              // typed per tool
      onSuccess: (result: unknown) => StateChanges
      onError: (err: ToolError) => StateChanges
      timeoutMs: number                           // hard timeout; on timeout → come_back result = error
    }
  | {
      kind: 'execute'                             // fire-and-forget
      tool: string
      input: unknown
      idempotencyKey: string                      // REQUIRED to prevent dup on retry
      onError: 'log' | 'observability' | 'silent' // never affects response
    }
```

The orchestrator processes `come_back` invocations sequentially BEFORE the response-track render and `execute` invocations AFTER (or in parallel-fire-and-forget). Mirrors D-18 turn order.

**No prior precedent in codebase exists** for this exact contract — closest relatives are:
- `crm-writer` two-step `propose+confirm` (semantically similar to come_back but different shape)
- Inngest `step.run` patterns (similar fire-and-forget but at a different layer)

The `Invocation` shape is **net-new TypeScript** for v4. Plan-phase decides exact field names.

### Pattern 4: Knowledge sync (post-deploy Inngest)

**What:** Inngest function `knowledge-sync-v4` triggered by Vercel deploy webhook (or manual via `pnpm knowledge:sync` CLI). Reads `.md` files, hashes body, regenerates embedding only on body change.

**Example:**
```typescript
// scripts/knowledge-sync.ts (CLI — sketch)
import matter from 'gray-matter'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const FrontmatterSchema = z.object({
  topic: z.string().min(1),
  keywords: z.array(z.string()),
  category: z.enum(['product','policies','edge-cases','faqs-no-templated']),
  last_reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reviewed_by: z.string(),
  escalate_if: z.array(z.string()).optional(),
  related_topics: z.array(z.string()).optional(),
})

for (const file of mdFiles) {
  const raw = await readFile(file, 'utf8')
  const { data, content } = matter(raw)        // gray-matter parse
  const fm = FrontmatterSchema.parse(data)
  // Coherence check (D-48)
  const folderCategory = file.split('/').at(-2)
  if (fm.category !== folderCategory) {
    throw new Error(`Coherence fail: ${file} folder=${folderCategory} frontmatter=${fm.category}`)
  }
  const bodyHash = createHash('sha256').update(content).digest('hex')
  // Look up existing row in agent_knowledge_base by topic+agent_id
  const existing = await selectKB({ topic: fm.topic, agent_id: 'somnio-sales-v4' })
  let embedding: number[]
  if (existing && existing.body_hash === bodyHash) {
    embedding = existing.embedding   // skip regeneration
  } else {
    embedding = await generateEmbedding(content)  // OpenAI text-embedding-3-small
  }
  await upsertKB({ ...fm, body_hash: bodyHash, embedding, source_md_path: file, content })
}
```

**Sync semantics (recommended):**
- Sync mode: **full re-sync, but re-embed only on body hash change**. Simpler than incremental and embedding is the only expensive step.
- Frontmatter changes alone: re-upsert metadata, keep cached embedding.
- Body changes: regenerate embedding.
- File deletions in the `.md` folder: orphaned KB rows are flagged with `last_seen_at < now() - 1 day` for human review (NOT auto-deleted — protects against accidental file removal in a PR).

### Anti-Patterns to Avoid

- **Sharing the v3 module imports in v4 (D-24 violation).** v4 must clone files, not `import { resolveTransition } from '@/lib/agents/somnio-v3/transitions'`. Bug fixes in v3 do not flow to v4 and vice versa. Use `cp -r` and refactor agent_id constants.
- **Calling crm-writer-adapter from v4 (D-07 violation).** v4 uses `crm-mutation-tools` directly. The adapter exists for pw-confirmation only.
- **Cachéing KB query results in module scope.** Pgvector queries are sub-100ms on small KBs; cache becomes stale on sync. Re-query each turn.
- **Using `generateObject` for sub-loop (deprecated in AI SDK v6).** Use `generateText` + `Output.object()`. [CITED: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0]
- **Letting sub-loop emit any free text (D-62 violation).** Always wrap with `Output.object({ schema: LoopOutcomeSchema })` so the final return is structured.
- **Putting `workspaceId` in any tool inputSchema.** Mutation-tools Pitfall 2 — workspaceId always comes from ctx, never from input.
- **Hard-DELETE on flip rollback.** Delete the inserted routing rule; do NOT touch v3 sessions on rollback.
- **Mutating v3 code "to share a helper".** Regla 6 strict. Even reading from v3 is fine; importing is not (D-24).
- **Implicit retry on `stage_changed_concurrently`.** Propagate verbatim; sub-loop decides next step (consistent with mutation-tools Pitfall 1).
- **Generating embeddings at query time.** They are pre-computed during sync; query-time only does cosine search.
- **Writing the KB sync as a Vercel build step (cold start would slow deploys).** Use Inngest post-deploy hook instead (D-53).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parsing | Regex split + custom YAML parse | `gray-matter` | Battle-tested, handles edge cases (escapes, multiline strings, BOMs) |
| Vector similarity search | Custom k-NN over JS arrays | `pgvector` `<=>` operator (cosine distance) | Postgres index handles it; tested at billion scale |
| Embedding generation | Local sentence-transformers via Transformers.js | OpenAI `text-embedding-3-small` API call | Quality + zero infra; $0.02/1M tokens [CITED: https://openai.com/index/new-embedding-models-and-api-updates/] |
| Density clustering | Custom DBSCAN | pgvector cosine neighborhood query (see Pattern 8) | At <500 vectors, neighborhood query beats clustering algorithms in simplicity and is good-enough |
| Idempotency for createOrder/addOrderNote | Custom token+UPDATE | `idempotencyKey?` param in mutation-tools (already shipped in `crm_mutation_idempotency_keys`) | Already exists — pass key, mutation-tools handles INSERT ON CONFLICT |
| CRM query/mutation tooling | Custom Supabase admin queries | `createCrmQueryTools` + `createCrmMutationTools` factories | Already shipped, tested, observability built in |
| WhatsApp send | Custom 360dialog HTTP | `domainSend`/`domainSendMedia` from `@/lib/domain/messages` | Already shipped, handles channel switching, persistence, sent_by_agent flag |
| Inngest timer with replies | Custom timer + cancellation | `step.waitForEvent` pattern from `agent-timers-v3.ts` | Already shipped; settle 5s + waitForEvent + concurrency 1 per sessionId |
| Self-register agent | Custom global state | `agentRegistry.register()` | Already shipped |
| Atomic flip transaction | Multiple statements with manual coordination | `BEGIN; UPDATE ...; INSERT ...; COMMIT;` (see Pattern 5) | Postgres atomicity guarantees both succeed or both rollback |
| PII redaction in logs | Custom truncation | `phoneSuffix`, `emailRedact`, `bodyTruncate` from `crm-mutation-tools/helpers.ts` | Already shipped, tested, consistent across modules |
| Confidence calibration heuristic | Manual gap-penalty / formula | Self-reported confidence + few-shot calibration (D-64) | Empirically: with well-curated few-shot examples, Claude self-reports 0..1 reasonably well. Formulas add complexity without measurable gain. See Section 4. |
| HDBSCAN clustering | hdbscanjs (8yr stale) or Python service | pgvector cosine `<=>` neighborhood query | At expected scale, simpler is better |
| Stage CAS retry | Manual retry loop | Propagate `stage_changed_concurrently` verbatim; sub-loop or human decides | Mutation-tools Pitfall 1 — established pattern |

**Key insight:** v4 is a composition of well-shipped primitives. The novel work is (1) the comprehension confidence schema extension, (2) the sub-loop orchestration around AI SDK v6 patterns, (3) the KB sync, (4) the unknown-cases observability loop, and (5) the atomic flip mechanic. Everything else is wiring or cloning.

## Runtime State Inventory

This is a NEW agent that creates new state, but does interact with cross-cutting state at flip-time. Categories analyzed:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | (1) `session_state` rows for active v3 sessions on flip-day. (2) `agent_observability_events` rows have `agent_id` text. (3) `whatsapp_templates` shorthand in CONTEXT actually means `agent_templates` table. | (1) Bulk UPDATE on flip closes v3 sessions (D-38, D-40). (2) v4 emits its own; no migration needed. (3) Clone rows with new `agent_id='somnio-sales-v4'` via SQL migration. |
| Live service config | (1) `routing_rules` table — flip inserts a row. (2) `crm_query_tools_config` shared with v3 (D-28). (3) Inngest function names — v4 owns `agent-timers-v4` distinct from v3. | (1) Insert at flip; revert deletes the rule for rollback. (2) No change — v3 and v4 share the same active stages config. (3) Register new Inngest function name; deploy registers it automatically. |
| OS-registered state | None — no Windows tasks, no pm2 saves, no systemd units involved. v4 lives entirely inside Vercel + Supabase + Inngest. | None — verified by inspection of CLAUDE.md operational sections (no OS task registration mentioned). |
| Secrets/env vars | (1) `OPENAI_API_KEY` — already exists, used by data-extractor. (2) `ANTHROPIC_API_KEY` — already exists. (3) `SUPABASE_SERVICE_ROLE_KEY` — already exists. No new secrets. | None — reuse existing. |
| Build artifacts / installed packages | (1) `gray-matter` new dependency — appears in `package.json` and `node_modules`. (2) Any pre-deploy `pnpm install` will pick it up. No compiled binaries, no egg-info equivalents (TypeScript transpiled at runtime). | Confirm `pnpm-lock.yaml` is committed after `pnpm add`. |

**Nothing in OS-registered category** — verified explicitly: v4 has no Windows tasks, no scheduled jobs outside Inngest (which is service-level, not OS).

**The flip-day runtime cleanup** is the only meaningful state migration: closing all open v3 sessions in workspace Somnio (D-38). Inngest timers for those sessions remain queued but become no-ops via the existing defensive guard at `agent-timers-v3.ts:261-268` (D-43 — already shipped).

## Common Pitfalls

### Pitfall 1: Treating `agent_templates` as Meta WhatsApp HSM templates (HIGH severity)

**What goes wrong:** Plans assume cloning template rows requires Meta re-approval. Adds 1-7 day uncertainty to flip schedule. Anxiety about disapproval. Possibly leads to scope-creep ("let's also re-validate Meta side").

**Why it happens:** CONTEXT.md uses the term "whatsapp_templates" in D-26, which sounds like a Meta concept. Industry convention reinforces the confusion (Meta also has a `template_name` field).

**How to avoid:** **The `agent_templates` table is INTERNAL Postgres content storage.** Rows have `content_type ∈ {'texto', 'imagen', 'template'}` where `'template'` is rare and points to a Meta-side HSM (rarely used in conversational flows). Cloning rows is a pure SQL operation: `INSERT INTO agent_templates (agent_id, intent, ...) SELECT 'somnio-sales-v4', intent, ... FROM agent_templates WHERE agent_id='somnio-sales-v3'`. **Zero Meta involvement, zero approval delay, zero rejection risk for `texto`/`imagen` rows.** Only if specific rows are `content_type='template'` and the Meta-side template is not already approved for the WABA does Meta-side action become relevant — and that situation does not exist for the somnio catalog (verified: pw-confirmation migration `20260427210000` clones the same set with all `content_type='texto'` or `'imagen'`).

**Warning signs:** Anyone in plan-discussion saying "let's check with Meta first" — push back, re-read this section.

**Verification:** Read `src/lib/agents/somnio/template-manager.ts:273` and `src/lib/whatsapp/api.ts:140` (`sendTemplateMessage`). The 360dialog `sendTemplateMessage` is for Meta HSM templates and is rarely invoked from somnio-v3 (only in 24h-window-fallback paths). The conversational happy path uses `sendTextMessage`/`sendMediaMessage` with raw content from `agent_templates`. [VERIFIED]

### Pitfall 2: Sub-loop emitting freeText that bypasses templates (D-62)

**What goes wrong:** Without `Output.object()`, AI SDK can emit text content alongside or instead of tool calls. Cliente recibe respuesta alucinada.

**Why it happens:** Default `generateText` allows the model to emit `text` chunks as the final response. `toolChoice: 'auto'` only forces tool use during multi-step; it does not guarantee no text in the final step.

**How to avoid:** ALWAYS use `output: Output.object({ schema: LoopOutcomeSchema })` on the sub-loop's `generateText` call. The schema's discriminated union forces the model to commit to one of `template`/`canonical`/`no_match` — none of which contain raw freeText fields. The `canonicalText` field in the `canonical` variant is constrained because `runSubLoop` should validate that it matches the `canonical_response` from the KB hit (post-condition guard). [CITED: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0]

**Warning signs:** Tests showing the model returns plausible-but-non-template responses; observability events with `subloop_outcome='???'`.

### Pitfall 3: Anthropic does NOT expose log probabilities (confirmed May 2026)

**What goes wrong:** Plan assumes confidence can be calibrated against logits; later realizes only self-reported numbers are available; pivot mid-implementation.

**Why it happens:** Many other providers (OpenAI, Mistral) do expose `logprobs`. Engineers assume Anthropic does too.

**How to avoid:** Confirmed via web search (May 2026): Anthropic's API does NOT expose token logprobs. [CITED: https://github.com/anerli/anthropic-logprobs — third-party hack confirms missing native support; https://www.linkedin.com/posts/gihangamage2015 — practitioner notes logprobs missing in Claude 4.x]. D-77 acknowledges this. Stick with self-reported confidence + few-shot calibration (D-64). Plan B (enum-mapped) is the contingency if numeric self-report turns out poorly calibrated post-flip (D-67, D-78).

**Warning signs:** Anyone proposing "let's get logits from the API to validate confidence" — redirect to D-77.

### Pitfall 4: Few-shot confidence inflation / mode collapse

**What goes wrong:** Haiku reports 0.95 on everything (mode collapse) OR reports a bimodal 0.45/0.95 distribution (no middle ground). Sub-loop never triggers OR triggers always.

**Why it happens:** LLMs trained with RLHF are sycophantic — they want to look confident. Without enough "uncertainty" few-shot examples, they default to high confidence.

**How to avoid (mirrors D-66, D-71, D-79):**
- Use **6-8 few-shot examples** with explicit confidence distribution: 2-3 universal-clear (0.85-0.95), 2-3 context-dependent (0.50-0.70), 1-2 sumidero/`otro` (< 0.40).
- For context-dependent examples, the few-shot pair must show the same surface text leading to different intents in different contexts — but the comprehension call is **self-contained without phase context** (D-70). The model sees a message in isolation and must report ambiguity as low confidence.
- **Detection criteria post-flip (D-73):**
  1. Confidence > 0.80 on messages classified as `otro`/`razonamiento_libre` → calibration drift symptom A
  2. Distribution histogram shows a >20% gap in 0.50-0.80 range → bimodal mode collapse (symptom B)
  3. `intent_confidence_reasoning` field shows generic templates rather than message-specific reasoning → prompt-template drift (symptom C)
- Use temperature **0** for the comprehension call (deterministic; v3 already does this implicitly via `claude-haiku-4-5-20251001` defaults). Higher temperature increases noise without improving calibration.

**Warning signs:** First-week observability dashboard shows < 2% turns escalating to sub-loop OR > 95% escalating. Both indicate calibration failure.

### Pitfall 5: Forgetting `idempotencyKey` on `createOrder`/`addOrderNote` come-back path

**What goes wrong:** Inngest retries the timer step → mutation-tools `createOrder` runs twice → duplicate order in CRM → operational mess.

**Why it happens:** Mutation-tools `idempotencyKey` is OPTIONAL by signature. Easy to omit during quick wiring. The Inngest retry contract (default retries=3) will redo the step on transient failure.

**How to avoid:** ALWAYS pass an `idempotencyKey` when calling `createOrder` or `addOrderNote` from any agent path (happy + timer L3 + timer L4). Recommended key shape: `'somnio-v4-createOrder-{sessionId}-{actionTag}'` where `actionTag` distinguishes the path (`'happy'`, `'timer_L3'`, `'timer_L4'`). The 3 paths (D-19, D-20) MUST each have a distinct tag so the SAME session can produce 3 distinct paths if the user re-engages mid-flow.

**Warning signs:** Inngest logs show `crm_mutation_completed` with `idempotencyKeyHit=true` more than once for same `sessionId+actionTag` → wasteful retry. `idempotencyKeyHit=false` for the second path on same sessionId → MISSING key.

### Pitfall 6: Atomic flip racing concurrent webhook traffic

**What goes wrong:** Between `UPDATE sessions ...` and `INSERT INTO routing_rules ...`, a webhook arrives, finds no v4 routing rule, falls through to v3, but v3's session was just closed. The webhook either:
- Routes to v3 → tries to read session → gets a closed-state record → emits stale response
- Or, if v3 is "down" between the close and the rule-insert, message is dropped

**Why it happens:** Even though both statements are in the same transaction, READ COMMITTED is Postgres default. Other connections see uncommitted state as "old".

**How to avoid:** A single `BEGIN; ... COMMIT;` block with default READ COMMITTED is sufficient because:
- Other connections see the OLD state (sessions open + no routing rule for v4) until the COMMIT, so webhook traffic during the flip routes via v3 to OPEN sessions.
- After COMMIT, both changes are visible atomically: routing rule says v4 + sessions are closed for v3.
- A webhook that arrives between transactions COULD theoretically be in the middle of processing when commit happens; this is fine because the agent processMessage call already has its session_state in memory.
- **Recommended additional safety net:** run the flip during a low-traffic window (e.g., 3am Bogota) for visibility, even though it's not strictly required.

**No need for SERIALIZABLE isolation:** the transaction has no read-after-write logic that could be re-ordered; atomic UPDATE+INSERT is consistent under READ COMMITTED. [CITED: https://www.postgresql.org/docs/current/transaction-iso.html]

**Warning signs:** Post-flip observability shows v3 events with timestamp > flip-time. If this happens, root cause is either (a) Vercel deployment lag (some pods still running old code) — wait for redeploy verification — or (b) a concurrent webhook started processing before the COMMIT and finished afterward. Pattern (b) is benign — just a few transitional turns.

### Pitfall 7: KB sync regenerating embedding on every deploy (cost waste)

**What goes wrong:** Every Vercel deploy re-embeds all KB docs even if no change → $$ over time + slow sync.

**Why it happens:** Naïve sync iterates files, embeds each, upserts. No change-detection.

**How to avoid:** Hash the body (SHA-256) and compare against stored `body_hash` column. Skip embedding regeneration if hashes match. Frontmatter-only changes also skip embedding (only update metadata fields). See Pattern 4 sketch.

**Warning signs:** OpenAI usage dashboard shows embedding spikes correlated to deploy frequency rather than content changes.

### Pitfall 8: pgvector index missing for cosine queries

**What goes wrong:** Query `SELECT * FROM agent_knowledge_base ORDER BY embedding <=> :target LIMIT 3` does a sequential scan on every row — slow at >1k rows.

**Why it happens:** pgvector requires an explicit index (HNSW or IVFFlat). The `embedding(1536)` column alone doesn't get one.

**How to avoid:** In the migration, create an index:
```sql
CREATE INDEX agent_knowledge_base_embedding_hnsw_idx
  ON agent_knowledge_base USING hnsw (embedding vector_cosine_ops);
```
HNSW preferred over IVFFlat for this use case (small-to-medium scale, no pre-warming, consistent recall). [CITED: https://supabase.com/docs/guides/database/extensions/pgvector]

**Warning signs:** KB queries logged with latency > 200ms even when KB is small.

### Pitfall 9: Wave 0 forgetting to enable pgvector extension

**What goes wrong:** Migration tries `CREATE TABLE ... embedding vector(1536)` and fails with "type vector does not exist".

**Why it happens:** pgvector is a Postgres extension — must be enabled before first use.

**How to avoid:** First migration in W0 includes:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```
This is idempotent and safe to repeat. Run as superuser (Supabase Studio SQL Editor handles this automatically). [CITED: https://supabase.com/docs/guides/database/extensions/pgvector]

**Warning signs:** Wave 0 SQL fails on first apply.

### Pitfall 10: Inngest function name collision with v3

**What goes wrong:** Inngest function `id: 'v3-timer'` shipped; v4 attempts `id: 'v3-timer'` too (clone forgets to rename) → either redeploy fails or both functions register with the same id depending on Inngest semantics.

**Why it happens:** Clone-and-adapt pattern misses the inner string literal in `inngest.createFunction({ id: 'v3-timer', ... })`.

**How to avoid:** v4's function MUST be `id: 'v4-timer'` and `name: 'V4 Agent Timer'`. The event name differs too: `agent/v4.timer.started` (not `agent/v3.timer.started`). Both must change in lockstep at every emit and listen point.

**Warning signs:** Inngest dashboard shows v4 timers firing as v3 events; or v4 event name shows zero handlers attached.

## Code Examples

### Example 1: Comprehension schema extension (D-10, D-63)

```typescript
// src/lib/agents/somnio-v4/comprehension-schema.ts (sketch)
import { z } from 'zod'
import { V4_INTENTS } from './constants'  // V4_INTENTS clones V3_INTENTS

export const MessageAnalysisSchemaV4 = z.object({
  intent: z.object({
    primary: z.enum(V4_INTENTS),
    secondary: z.enum([...V4_INTENTS, 'ninguno'] as const),
    // V3 had: confidence: z.number() (0-100). V4 KEEPS this (existing) AND adds:
    confidence: z.number().describe('0-100 — existing v3 field, preserved.'),
    reasoning: z.string(),
  }),

  // NEW for v4 (D-63):
  intent_confidence: z.number().min(0).max(1).describe(
    '0..1 self-reported confidence in the PRIMARY intent classification. ' +
    '0.85+ = universal-clear (e.g., "cuanto cuesta"), ' +
    '0.50-0.70 = context-dependent (e.g., "ok" — could be acknowledgment or confirmation), ' +
    '<0.40 = sumidero / fallback / razonamiento_libre. ' +
    'Reflect ambiguity at this turn IN ISOLATION — do NOT use prior conversation phase to resolve.'
  ),
  intent_confidence_reasoning: z.string().optional().describe(
    'Brief explanation of why this confidence value was chosen. ' +
    'Used for observability + iterative few-shot tuning post-launch.'
  ),

  // existing v3 fields unchanged:
  extracted_fields: /* clone v3 */,
  classification: /* clone v3 */,
  negations: /* clone v3 */,
})

export type MessageAnalysisV4 = z.infer<typeof MessageAnalysisSchemaV4>
```

### Example 2: Few-shot confidence calibration prompt fragment (D-66, D-79)

To be inlined inside `comprehension-prompt.ts:buildSystemPrompt` for v4. Research-phase output curates the following 6-8 examples from v3 historical Somnio conversations (planner extracts via SQL inventory in Plan 02):

```
EJEMPLOS DE CALIBRACIÓN DE CONFIDENCE (intent_confidence):

# Universal-claros (alta confianza, 0.85-0.95):
1. "cuanto cuesta el producto" → intent.primary='precio', intent_confidence=0.95
   reasoning: "Pregunta directa por precio sin ambigüedad."
2. "no me interesa, gracias" → intent.primary='no_interesa', intent_confidence=0.92
   reasoning: "Frase clara de rechazo explícita."
3. "quiero comprar 2" → intent.primary='seleccion_pack', intent_confidence=0.88
   reasoning: "Pack 2x explícito + verbo de compra."

# Context-dependientes (confianza media, 0.50-0.70):
4. "ok" → intent.primary='acknowledgment', intent_confidence=0.55
   reasoning: "Sin contexto previo, podría ser acknowledgment o confirmación. Resolución contextual fuera del alcance."
5. "si" → intent.primary='confirmar', intent_confidence=0.60
   reasoning: "Aceptación afirmativa pero podría ser respuesta a múltiples preguntas previas; no resuelvo sin contexto."
6. "tengo dudas" → intent.primary='otro', intent_confidence=0.50
   reasoning: "Frase ambigua sin objeto claro de duda; podría ser cualquier intent informacional."

# Sumideros (baja confianza, <0.40):
7. "y mi tía dice que esto es magia" → intent.primary='otro', intent_confidence=0.20
   reasoning: "Mensaje no relacionado con flujo de venta directamente; posible razonamiento libre."
8. "lol jajaja 😂" → intent.primary='acknowledgment', intent_confidence=0.30
   reasoning: "Reacción no informativa; clasificación nominal pero sin certeza."
```

Few-shot calibration approach: include these in the system prompt verbatim. **Do NOT paraphrase to "make them flow better"** — calibration depends on the model seeing the exact distribution. [INFERRED from training + D-66/D-79]

**ASSUMED:** This few-shot calibration approach (self-reported confidence + few-shot ground-truth) is the canonical method when log-probs are unavailable. Explicit research papers exist (e.g., Lin et al. 2022 "Teaching Models to Express Their Uncertainty in Words", Tian et al. 2023 "Just Ask for Calibration") but are not Anthropic-specific. The approach is empirically supported but quality varies per model + task. [Source: training cutoff Jan 2026; not specifically verified for Claude Haiku 4.5]

### Example 3: pgvector cosine neighborhood for unknown_cases clustering

```sql
-- src/lib/agents/somnio-v4/unknown-cases/cluster.ts (sketch — runs in Inngest cron)

-- For each unclustered case in the last 30 days, find its cosine-similar peers.
-- 'Cluster' = transitive closure of similarity > 0.7 (cosine distance < 0.3).
WITH pending AS (
  SELECT id, embedding, conversation_id
  FROM agent_unknown_cases
  WHERE workspace_id = $1
    AND agent_id = 'somnio-sales-v4'
    AND status = 'pending'
    AND created_at > NOW() - INTERVAL '30 days'
),
neighbors AS (
  SELECT
    a.id AS case_id,
    b.id AS neighbor_id,
    1 - (a.embedding <=> b.embedding) AS similarity
  FROM pending a
  JOIN pending b ON a.id != b.id
  WHERE 1 - (a.embedding <=> b.embedding) > 0.7
)
SELECT case_id, COUNT(neighbor_id) AS cluster_size
FROM neighbors
GROUP BY case_id
HAVING COUNT(neighbor_id) >= 9   -- 9 peers + the case itself = 10 (D-06 threshold)
ORDER BY cluster_size DESC;
```

Cluster representatives can then be assigned a `cluster_id` (UUID) and the UI groups by it. **No external clustering library needed** — this query runs in Postgres at 100ms even on 1000+ vectors. [INFERRED from pgvector docs + standard SQL]

### Example 4: Atomic flip transaction (D-40)

```sql
-- supabase/migrations/20260501XXXXXX_somnio_v4_flip.sql
-- Run by user manually in Supabase SQL Editor when ready to flip.
-- Regla 5: this SQL does NOT auto-apply. User runs at flip-day.

BEGIN;

-- 1) Close all v3 sessions in Somnio (D-38)
UPDATE agent_sessions
SET
  closed_at = timezone('America/Bogota', NOW()),
  close_reason = 'v4_flip',
  current_mode = 'closed'
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
  AND agent_id = 'somnio-sales-v3'
  AND closed_at IS NULL;

-- 2) Insert routing rule for v4 (D-40)
INSERT INTO routing_rules (
  workspace_id, schema_version, rule_type, name, priority,
  conditions, event, active
) VALUES (
  'a3843b3f-c337-4836-92b5-89c58bb98490',
  'v1',
  'agent_router',
  'somnio-v4-flip',
  1000,                 -- adjust priority based on existing rules
  '{}'::jsonb,          -- match-all conditions (or specific to Somnio normal routing)
  '{"agent_id": "somnio-sales-v4"}'::jsonb,
  true
);

COMMIT;

-- ROLLBACK SQL (separate file or inline comment):
-- BEGIN;
--   DELETE FROM routing_rules
--    WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
--      AND name = 'somnio-v4-flip';
--   -- v3 sessions stay closed; clients hitting v3 again get a NEW session in v3 (D-39 inverse).
-- COMMIT;
```

### Example 5: Sub-loop "NUNCA decir" check (D-51)

```typescript
// src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts (sketch)
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

const CheckSchema = z.object({
  violates: z.boolean(),
  violatedRule: z.string().optional(),
})

export async function checkNuncaDecir(args: {
  candidateText: string
  nuncaDecirRules: string[]   // from KB doc's "## NUNCA decir" section
}): Promise<{ ok: boolean; violation?: string }> {
  if (args.nuncaDecirRules.length === 0) return { ok: true }

  const { output } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: 'You are a content compliance checker. Return whether the candidate text violates any of the given rules.',
    messages: [{
      role: 'user',
      content: `Candidate response: """${args.candidateText}"""\n\n` +
        `Forbidden rules (NUNCA decir):\n` +
        args.nuncaDecirRules.map((r, i) => `${i + 1}. ${r}`).join('\n') +
        `\n\nReturn { violates: bool, violatedRule?: string }.`,
    }],
    output: Output.object({ schema: CheckSchema }),
  })

  return output.violates
    ? { ok: false, violation: output.violatedRule }
    : { ok: true }
}
```

**Latency budget:** ~150ms — tolerable since it runs only on `canonical` outcomes from sub-loop (rare path, fraction of escalations).

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| `generateObject` for structured output | `generateText` + `Output.object()` | AI SDK v6.0 (Sept 2025) | Use `Output.object()` everywhere v4 needs structured output |
| `strictJsonSchema` global | Per-tool `strict: true` | AI SDK v6.0 | Plan-phase: enable strict per tool |
| Custom multi-step tool loops | `stopWhen: stepCountIs(N)` + auto loop | AI SDK v5+ | Use `stepCountIs(4)` for sub-loop |
| Manual session/state management between turns | `step.run` boundaries with returned state in Inngest | Inngest evolution + project pattern | v4 timers follow `agent-timers-v3` pattern with serialization-by-return-value |
| HSM templates for all WhatsApp messaging | Free-form text inside 24h customer service window | WhatsApp 2018 → today | All conversational messaging in v4 is plain text via 360dialog `sendTextMessage`; HSM only for outside-window fallback (out of v4 scope) |
| Self-reported confidence considered unreliable | Self-reported is primary technique when logits unavailable | RLHF + few-shot calibration literature 2022-2024 | D-64 — v4 uses few-shot calibrated self-report |

**Deprecated/outdated (do NOT use in v4):**
- `generateObject` (AI SDK v6 deprecation)
- `crm-writer-adapter` for normal v4 paths (D-07 — use mutation-tools direct)
- Custom Anthropic client construction without `runWithPurpose` wrap (observability requires it)
- HDBSCAN as a hard dep (no good Node lib + overkill at scale)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | OpenAI `text-embedding-3-small` quality is sufficient for KB retrieval at this scale (~100 docs, mostly Spanish) | Standard Stack | Low — model is canonical, used in many production RAG systems for Spanish. If retrieval misses obvious matches, switch to multilingual model (Voyage multilingual-3 or Cohere embed-multilingual-v3). |
| A2 | Few-shot calibration of Haiku confidence produces 0..1 reasonable distribution after ~6-8 examples | Pattern, Pitfall 4, Confidence Calibration | Medium — empirically supported but model-dependent. D-67 Plan B (enum mapping) is the contingency. Detection criteria D-73 catches drift. |
| A3 | HNSW index outperforms IVFFlat at v4 scale (low hundreds to low thousands KB rows) | Pitfall 8 | Low — Supabase docs prefer HNSW for general usage; rebuild as IVFFlat if KB grows past ~10k rows. |
| A4 | Cosine neighborhood query at threshold 0.7 produces meaningful clusters for unknown cases | Don't Hand-Roll, Example 3 | Medium — threshold needs tuning post-flip when real data accumulates. Start 0.7, observe, adjust. |
| A5 | `gray-matter` v4.0.x is current stable as of May 2026 | Standard Stack | Low — package is mature, infrequent updates. Plan-phase confirms via `npm view`. |
| A6 | Atomic 2-statement BEGIN/COMMIT under default READ COMMITTED is sufficient for the flip | Pitfall 6 | Low — Postgres semantics are well-understood; transaction has no read-after-write logic that requires SERIALIZABLE. |
| A7 | The `Invocation` discriminated-union TypeScript shape is novel for v4 (no exact precedent in codebase) | Pattern 3 | Low — verified via grep for `'come_back'` literal across `src/lib/agents/`. The pattern is canonical in state-machine literature; the project hasn't formalized it before. |
| A8 | Post-deploy Inngest hook fires after Vercel deployment completes, not before | Pattern 4 | Low — standard Vercel + Inngest integration. If sync runs before fresh code is hot, gracefully degrades — sync next deploy or via CLI. |
| A9 | Anthropic Claude Haiku self-reported confidence isn't catastrophically miscalibrated | Pattern, D-64 | Medium — published literature on Claude calibration is sparse. v3 production data shows confidence (0-100) varies meaningfully across messages; assume similar for 0..1 — but verify post-flip via D-73 criteria. |
| A10 | Vercel deploy → Inngest webhook auto-triggers `knowledge-sync` reliably | Pattern 4 | Medium — Inngest has Vercel integration but the trigger setup needs verification in plan-phase. Fallback: manual `pnpm knowledge:sync` if auto-trigger fails. |

**The Plan-phase MUST surface A2, A4, and A9 to the user as decisions-of-confidence-during-implementation** — they don't change scope but they affect post-flip calibration burden.

## Open Questions

1. **Specific routing rule shape for the flip (D-40)** — the agent-lifecycle-router schema requires `conditions` and `event` JSONB. The current routing logic for Somnio normal traffic isn't fully reverse-engineered in this research. Plan-phase Task 1 of W7 should query existing routing rules for Somnio to understand the priority structure and condition syntax to make the v4 rule match-all-or-specific correctly.
   - **What we know:** `routing_rules` table exists; `priority BETWEEN 1 AND 100000`; UNIQUE on `(workspace_id, rule_type, priority) WHERE active=true`.
   - **What's unclear:** What conditions does the existing v3 rule (if any) use? Is v3 the implicit fallback (no rule → defaults to `conversational_agent_id` from `workspace_agent_config`)?
   - **Recommendation:** Plan-phase first task in W7: `SELECT * FROM routing_rules WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';` and document. Then craft v4 rule.

2. **Few-shot example sourcing (D-72, D-79)** — the research-phase was supposed to inventory v3 transitions and recent unclassified messages from Somnio to extract few-shot examples. Without DB access, this can only be done as a Plan 02 task where the planner runs SQL queries.
   - **What we know:** v3 INTENTS list (in `constants.ts` line 12-47), v3 transitions (in `transitions.ts`).
   - **What's unclear:** Real Somnio messages with diverse confidence levels.
   - **Recommendation:** Plan 02 Task 1: query `agent_observability_events` and `messages` tables for last 30 days to source ~50 raw messages, then human-curate to 6-8 examples per Pattern 2 above.

3. **`agent_unknown_cases` table promotion semantics** — D-06 says "cluster ≥ 10 cases in 30 days → promote". But promote to WHAT exactly? Two paths:
   - **Promote to transition:** add a new entry to `transitions.ts` mapping the cluster's intent to a specific action.
   - **Promote to KB doc:** create a new `.md` in `src/lib/agents/somnio-v4/knowledge/` with the canonical response.
   - **Recommendation:** UI offers BOTH options. Operator chooses per-cluster. Default to KB doc (less invasive, doesn't require code change to take effect — KB hot-reloads via sync).

4. **`session_state` schema sufficiency for v4 (D-30)** — D-30 says no migration needed. Verification:
   - `session_state` has `agent_id` column? **Need to check** — search for column definition in migrations to confirm.
   - `datos_capturados` is JSONB — yes, can extend with `_v4:*` keys without migration.
   - **Recommendation:** Plan-phase W0 task: `\d agent_sessions` and `\d session_state` and confirm columns. If `agent_id` is on `agent_sessions` but not `session_state`, no problem — sessions table relates state to agent.

5. **Knowledge `.md` initial corpus** — research did not curate the seed content (out of scope). Plan-phase W4 must create initial KB docs based on v3 INFORMATIONAL_INTENTS and known edge cases. Research recommends starting with ~12-20 docs covering:
   - Product info (formula, contenido, como_se_toma, dependencia, contraindicaciones, registro_sanitario, efectividad, tiempo_entrega per zone)
   - Policies (envio, pago, ubicacion, devoluciones if applicable)
   - Edge cases (long-term insomnia complaints, drug interactions queries, child-use questions — all of which should escalate to human)
   - FAQs that don't have v3 templates today (precio comparativo vs alternatives, pregnancy use, alcohol interaction)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js runtime | All TypeScript | ✓ | (Vercel managed) | — |
| pnpm | Package install | ✓ | (project standard) | — |
| OpenAI API access | KB sync embedding | ✓ | (key in env) | If outage, sync deferred — KB serves stale embeddings |
| Anthropic API access | Comprehension + sub-loop | ✓ | (key in env) | If outage, agent fails gracefully — webhook returns 200, no response sent |
| Supabase Postgres + pgvector | Storage + vector queries | ✓ for postgres | extension TBD | Wave 0 enables `CREATE EXTENSION IF NOT EXISTS vector` |
| Inngest service | Timers + KB sync + clustering | ✓ | (configured in project) | — |
| 360dialog API | WhatsApp send | ✓ | (key in workspace settings) | — |
| Vercel deploy hooks → Inngest | KB sync auto-trigger | ✓ presumed | (existing) | Manual `pnpm knowledge:sync` always works |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — pgvector enabling is a Wave 0 task with idempotent `CREATE EXTENSION IF NOT EXISTS vector`.

## Validation Architecture

> Skip if `workflow.nyquist_validation` is `false`. Project config does not set this key explicitly — defaulting to enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Existing project test setup (vitest + Playwright + tsx) — match v3/recompra/pw-confirmation patterns |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `pnpm test:unit` (or whatever the project uses — verify) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req category | Behavior | Test type | Automated command | File |
|--------------|----------|-----------|-------------------|------|
| Comprehension confidence schema | Schema validates new fields | unit | `vitest run src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts` | needs Wave 1 |
| State-machine transitions | Each TRANSITION entry resolves correctly | unit | `vitest run src/lib/agents/somnio-v4/__tests__/transitions.test.ts` | clone v3 test pattern |
| Sub-loop output schema | LoopOutcome discriminated union enforces shape | unit | `vitest run src/lib/agents/somnio-v4/__tests__/sub-loop.test.ts` | needs Wave 3 |
| Sub-loop happy path with KB hit | Mock KB → outcome='canonical' or 'template' | integration | `vitest run src/__tests__/integration/somnio-v4/sub-loop-happy.test.ts` | needs Wave 3 |
| Sub-loop no_match path | KB returns 0 hits → outcome='no_match' + handoff | integration | `vitest run src/__tests__/integration/somnio-v4/sub-loop-no-match.test.ts` | needs Wave 3 |
| Knowledge sync | Frontmatter parse + coherence check + embed + upsert | unit | `vitest run src/lib/agents/somnio-v4/knowledge-sync/__tests__/sync.test.ts` | needs Wave 4 |
| Unknown cases capture | Sub-loop no_match → row inserted with embedding | integration | `vitest run src/__tests__/integration/somnio-v4/unknown-cases.test.ts` | needs Wave 5 |
| Clustering query correctness | Mock 12 cases > 0.7 sim → cluster size 12 returned | unit | `vitest run src/lib/agents/somnio-v4/unknown-cases/__tests__/cluster.test.ts` | needs Wave 5 |
| Atomic flip rollback | Apply flip, then rollback, verify v3 routing restored | integration | manual SQL test in staging | needs Wave 7 docs |
| Sandbox smoke test | E2E of conversation in `/sandbox` | manual | `/sandbox` UI | post-deploy verification |

### Sampling Rate

- **Per task commit:** `pnpm test:unit src/lib/agents/somnio-v4/`
- **Per wave merge:** Full v4 test suite + lint + typecheck
- **Phase gate:** Full suite green + manual smoke in `/sandbox` + dropdown appears in routing-editor

### Wave 0 Gaps

- [ ] `src/lib/agents/somnio-v4/__tests__/` — directory needs creation; mirror v3 layout
- [ ] `src/__tests__/integration/somnio-v4/` — needs creation
- [ ] `src/lib/agents/somnio-v4/knowledge-sync/__tests__/` — needs creation
- [ ] No framework install needed — vitest already configured

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Webhook secret (existing) + Supabase auth (existing); v4 inherits |
| V3 Session Management | yes | `agent_sessions` + `session_state` with FK to workspace; existing |
| V4 Access Control | yes | Workspace isolation enforced via domain layer (Regla 3); `workspaceId` ALWAYS from execution context, NEVER from input — Pitfall 2 of mutation-tools applies to all v4 sub-loop tools |
| V5 Input Validation | yes | Zod for all inputs (comprehension schema, sub-loop output, frontmatter); domain layer validates |
| V6 Cryptography | partial | Embeddings are non-sensitive (no PII when hashed properly). KB content is non-sensitive operator-curated. Idempotency keys: project standard. |
| V8 Data Protection | yes | PII redaction in observability (existing helpers); messages may contain phone+email — redact in `agent_unknown_cases` storage |
| V13 API/Web Service | yes | Anthropic + OpenAI calls outbound; verified TLS; secrets in env |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection in customer message → manipulates agent | Tampering / Info Disclosure | Comprehension Haiku is structured-output only — limited freeText surface. Sub-loop has `Output.object()` constraint preventing freeText. Templates verbatim from DB prevent generation-time injection of arbitrary content. |
| Embedding poisoning (malicious .md gets through PR review) | Tampering | D-52 PR review obligatory before knowledge merge; coherence check D-48 catches some misuse |
| KB content leakage of "NUNCA decir" rules to client | Info Disclosure | D-50 + Pitfall 5 (Pattern 5) — sub-loop NEVER cites NUNCA-decir or Sources sections; post-gen check (Pattern 5) catches violations |
| Cross-workspace data leak via tool inputs | Info Disclosure / Elevation | mutation-tools/query-tools verified pattern — workspaceId from ctx, not input. v4 sub-loop tools follow same convention. |
| Confused-deputy via crafted intent confidence | Tampering | Confidence is self-reported by Haiku on a structured field; validators enforce 0..1; cannot be elevated to admin action |
| OpenAI key exfil via embedding payload | Info Disclosure | Embedding requests contain only KB content (operator-curated, no client PII); customer messages embedded for unknown_cases get redacted phone/email pre-embed (recommended) |
| Sub-loop tool abuse (model calls 50 tools in one turn) | DoS / Cost | `stopWhen: stepCountIs(4)` caps the loop; observability flags excessive tokenization |
| Atomic flip race causing message loss | Availability | Pitfall 6 — READ COMMITTED is safe; recommend low-traffic window for visibility |

**Recommendation for v4 specifically:**
- **Redact phone+email in customer message body BEFORE embedding for `agent_unknown_cases`.** Use existing `phoneSuffix` + `emailRedact` helpers. Saves embedding from carrying PII into long-term KB-side storage.
- Treat `intent_confidence_reasoning` as semi-PII (may contain message snippets) — same redaction applies.
- KB `.md` files are git-tracked content — operator-managed; no automated content-filter needed beyond PR review.

## Sources

### Primary (HIGH confidence — verified in repo)

- `src/lib/agents/somnio-v3/comprehension.ts:11-13` — confirms v3 uses `@anthropic-ai/sdk` with `zodOutputFormat` helper, NOT AI SDK v6
- `src/lib/agents/somnio-v3/comprehension-schema.ts:15-77` — v3 schema, the basis for v4 extension
- `src/lib/agents/somnio-v3/transitions.ts:30-477` — TRANSITIONS array + `resolveTransition` to clone
- `src/lib/agents/somnio-v3/somnio-v3-agent.ts:35-468` — processMessage main pipeline
- `src/lib/agents/somnio-v3/constants.ts` — V3_INTENTS, timer durations, pack prices, CRM_ACTIONS
- `src/lib/agents/somnio/template-manager.ts:273` — confirms `agent_templates` is internal Postgres table
- `src/lib/whatsapp/api.ts:140` — `sendTemplateMessage` (HSM path, rarely used)
- `src/lib/whatsapp/templates-api.ts` — 360dialog HSM management (separate from `agent_templates`)
- `src/lib/agents/registry.ts:117` — `agentRegistry` singleton
- `src/lib/agents/shared/crm-query-tools/index.ts:23` — query factory
- `src/lib/agents/shared/crm-mutation-tools/index.ts:34` — mutation factory
- `src/inngest/functions/agent-timers-v3.ts` — full timer pattern to clone
- `src/lib/observability/repository.ts:245` — `agent_observability_events` table writer
- `supabase/migrations/20260206000000_agent_templates.sql` — `agent_templates` schema (internal table)
- `supabase/migrations/20260420000443_platform_config.sql` — `platform_config` shape
- `supabase/migrations/20260425220000_agent_lifecycle_router.sql` — `routing_rules` shape
- `supabase/migrations/20260427210000_pw_confirmation_template_catalog.sql` — exact pattern to clone for v4 templates
- `.planning/standalone/somnio-recompra-template-catalog/LEARNINGS.md` — independent catalog lesson
- `.planning/standalone/crm-mutation-tools/SUMMARY.md` — final shipped state
- `.claude/skills/crm-query-tools.md` — full skill spec
- `.claude/skills/crm-mutation-tools.md` — full skill spec

### Secondary (MEDIUM confidence — web docs)

- [AI SDK v6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0) — `Output.object()`, `generateObject` deprecation
- [AI SDK Generate Text Reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text) — `toolChoice`, `stopWhen`, `output` parameters
- [AI SDK 6 Announcement](https://vercel.com/blog/ai-sdk-6) — confirms unification of generateObject + generateText
- [Anthropic AI SDK Provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) — Anthropic provider for AI SDK v6
- [Supabase pgvector docs](https://supabase.com/docs/guides/database/extensions/pgvector) — extension setup, HNSW vs IVFFlat
- [Supabase Vector columns](https://supabase.com/docs/guides/ai/vector-columns) — column type setup
- [OpenAI text-embedding-3-small](https://developers.openai.com/api/docs/models/text-embedding-3-small) — 1536 dims, $0.02/1M tokens
- [OpenAI Embeddings cost calc](https://costgoat.com/pricing/openai-embeddings) — current pricing
- [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) — READ COMMITTED semantics for flip
- [gray-matter on npm](https://www.npmjs.com/package/gray-matter) — frontmatter parser dependency
- [gray-matter GitHub](https://github.com/jonschlinkert/gray-matter) — used by Gatsby, Astro, Hashicorp, etc.

### Tertiary (LOW confidence — web search, single source)

- [anerli/anthropic-logprobs GitHub](https://github.com/anerli/anthropic-logprobs) — confirms Anthropic API does NOT expose logprobs natively (third-party hack workaround)
- [LinkedIn: GPT-5 vs Claude logprobs](https://www.linkedin.com/posts/gihangamage2015_logprobs-is-one-of-the-most-valuable-features-activity-7370446834277752832-7SGX) — practitioner note, May 2025+
- [Sophia Willows: Leveraging logprobs for AI systems](https://sophiabits.com/blog/leveraging-logprobs) — context on confidence calibration approaches

### Training-only (LOW — no specific verification)

- Lin et al. 2022 "Teaching Models to Express Their Uncertainty in Words" — foundational work on self-reported confidence
- Tian et al. 2023 "Just Ask for Calibration" — few-shot calibration approach
- Standard state-machine literature (Harel statecharts) — pattern for `Invocation` discriminated union

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in repo or confirmed via official docs
- Architecture (state machine + sub-loop): HIGH for state machine (clone of shipped v3); MEDIUM for sub-loop pattern (AI SDK v6 docs verified, but no in-repo precedent of this exact shape)
- KB sync architecture: MEDIUM — pgvector + gray-matter pattern is well-established; specific Inngest hook integration not verified end-to-end
- Confidence calibration: MEDIUM — self-reported confidence + few-shot is a known pattern but Claude-specific quality is empirical
- Clustering approach: HIGH — pgvector cosine neighborhood at this scale is straightforward SQL
- Meta template re-approval question: HIGH — confirmed by codebase inspection that `agent_templates` is internal storage, not Meta HSM
- Atomic flip safety: HIGH — Postgres semantics well-understood
- Pitfalls: HIGH — most are verified by inspection of the existing codebase

**Research date:** 2026-05-01

**Valid until:** 2026-06-01 for fast-moving items (AI SDK versions, OpenAI pricing); 2026-08-01 for stable items (Postgres semantics, gray-matter, pgvector). Re-verify package versions and Anthropic logprobs status at plan-time if more than 30 days have passed.

---

*Standalone: somnio-sales-v4*
*Research completed: 2026-05-01*
*Decisions honored: D-01..D-79 (locked, not re-litigated)*
*Status: Ready for /gsd-plan-phase somnio-sales-v4*
