# Agent Forensics Panel — Research

**Researched:** 2026-04-23
**Domain:** Observability UI + AI auditor (Next.js 15 + React 19 + Supabase + AI SDK v6)
**Confidence:** HIGH (codebase patterns) / MEDIUM (a few design decisions pending user confirmation)

## Summary

This phase builds a forensics layer on top of the existing production observability infrastructure (Phase 42.1) at `src/app/(dashboard)/whatsapp/components/debug-panel-production/`. The observability pipeline is MATURE and well-instrumented: `ObservabilityCollector` captures events / SQL queries / AI calls in ALS, `flushCollector` persists them to 5 partitioned Supabase tables, `listTurnsForConversation` + `getTurnDetail` expose them read-only via `createRawAdminClient()`, and the panel polls them every 15s with a hand-rolled fetch pattern (no SWR, no react-query).

Of the three target bots, `somnio-v3` (sales), `godentist`, and `somnio-recompra-v1` all emit rich `pipeline_decision`, `guard`, `template_selection`, `comprehension`, and `mode_transition` events via `getCollector()?.recordEvent(...)`. The routing bug (recompra turns mislabeled as `somnio-v3`) is caused by: (a) the collector is instantiated once at the top of `whatsappAgentProcessor` with the workspace's `conversational_agent_id` (→ `somnio-v3`), and (b) the recompra branch at `webhook-processor.ts:174-398` runs a separate `V3ProductionRunner` with `agentId: 'somnio-recompra-v1'` but NEVER writes this back to the collector.

**Primary recommendation:** Implement as **5 plans** — Plan 01 ships the migration + backfill + runtime `responding_agent_id` fix (D-12 hard pre-req). Plans 02-05 build the forensics tab, per-bot spec files, auditor API route + UI, and Polish. Use `react-markdown@10.1.0` + `remark-gfm@4.0.1` for markdown rendering (zero currently in codebase), AI SDK v6 `streamText` with `@ai-sdk/anthropic` targeting `claude-sonnet-4-6` (already in use for sticker vision + OCR), and the existing `assertSuperUser()` gate on every server action.

## User Constraints (from CONTEXT.md + DISCUSSION-LOG.md)

### Locked Decisions

- **D-01.** Scope = 3 bots: `somnio-sales-v3`, `somnio-recompra-v1`, `godentist-valoraciones` (a.k.a. `godentist`).
- **D-02.** Forensics panel lives in existing `src/app/(dashboard)/whatsapp/components/debug-panel-production/` (wrapping / augmenting) + parallel new module (path decided below).
- **D-03.** Auditor invoked MANUALLY via button. Not automatic per turn.
- **D-04.** Timeline condensed: every event relevant to the bot mechanism (concrete list per bot below).
- **D-05.** ALL SQL queries hidden in condensed view. Toggle "Ver timeline completo" shows them (reuses existing `TurnDetailView`).
- **D-06.** Full `session_state` snapshot (no filtering / no summarization).
- **D-07.** Per-bot spec in dedicated file, user-editable, consolidated. Path decided below.
- **D-08.** Auditor model: `claude-sonnet-4-6` (Anthropic model ID, confirmed in use at `sticker-interpreter.ts:80`).
- **D-09.** Output format: markdown only. No JSON.
- **D-10.** Fix = Option B: schema change — add `responding_agent_id TEXT NULL` column to `agent_observability_turns` (partitioned table).
- **D-11.** Backfill historical rows. Criterion: see Open Items Resolution §4.
- **D-12.** Bug fix = FIRST plan of the standalone (pre-req of the panel).
- **D-13.** Auditor output = markdown with `file:line` pointers + narrative prose.

### Claude's Discretion

- Path / structure of the per-bot spec file (D-07).
- Concrete event whitelist per bot for condensed timeline (D-04).
- Column name / type / default / index strategy for `responding_agent_id` migration (D-10).
- Exact backfill SQL (D-11).
- Auditor invocation architecture: API route path, streaming vs blocking, context assembly (D-03 + D-13).
- Forensics module route + component hierarchy (D-02).

### Deferred Ideas (OUT OF SCOPE)

- Automatic auditor on every turn (D-03 explicitly manual).
- Extending forensics to ALL bots (only 3 pilot bots).
- Sandbox panel (`debug-panel-v4`) — different panel, out of scope.
- PR / code-writing automation from auditor output (only produces paste-able markdown).
- Modifying bot behavior (sales-v3, recompra-v1, godentist, crm-reader/writer).

## Phase Requirements

Not applicable — standalone phase without formal REQ-IDs from a REQUIREMENTS.md. The 13 locked decisions (D-01..D-13) serve as the requirements spine.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `responding_agent_id` schema migration | Database / Storage | — | Partitioned table alteration + backfill must execute in Postgres (Regla 5 → apply before push). |
| Runtime collector agent label capture | API / Backend (Inngest) | — | Only the webhook-processor recompra branch + godentist/v3 branch know which runner answered. Must be recorded BEFORE flush (in the Inngest function lambda). |
| Condensed timeline computation | API / Backend (server action) | Browser / Client (useMemo filter) | A server-side filter keeps transport payload small (less JSON over RSC boundary). But if the raw turn detail is already fetched for the "Ver completo" toggle, filtering in-memory in the client is acceptable. **Recommendation: filter client-side** — reuses existing `getTurnDetailAction` with zero new RPC. |
| Full `session_state` snapshot | Database / Storage (read) | API / Backend (server action) | Read from `session_state` table keyed by `agent_sessions.id` for the conversation. Server action wraps `createRawAdminClient()` query. |
| Per-bot spec file loading (auditor context) | API / Backend (fs.readFile) | — | Static markdown files at build time, read on auditor invocation. Node `fs.readFile` in the API route. |
| Auditor Claude invocation | API / Backend (API route with streaming) | — | Server-side to keep `ANTHROPIC_API_KEY` secret (same pattern as `/api/builder/chat`). |
| Markdown rendering (auditor output) | Browser / Client (react-markdown) | — | Client-only: pure presentation, no server concerns. |
| Forensics UI (tab / panel / button) | Browser / Client (React components) | API / Backend (server actions for data) | Standard Next.js 15 client-server split. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-markdown` | `^10.1.0` | Render auditor markdown output in panel | `[VERIFIED: npm view react-markdown version` → `10.1.0`]; zero currently in codebase (`grep -rln react-markdown src` returns empty); canonical React markdown renderer; safe by default (no raw HTML). |
| `remark-gfm` | `^4.0.1` | GitHub-Flavored Markdown plugin for tables / task lists / strikethrough | `[VERIFIED: npm view remark-gfm version` → `4.0.1`]; needed because auditor output contains tables and fenced code blocks with `file:line` anchors. |
| `@ai-sdk/anthropic` | `^3.0.43` | AI SDK provider wrapper for Anthropic | `[VERIFIED: package.json line 11]`; already used in `src/app/api/builder/chat/route.ts` and `src/app/api/config-builder/templates/chat/route.ts`. |
| `ai` (AI SDK v6) | `^6.0.86` | `streamText` + `toUIMessageStreamResponse` | `[VERIFIED: package.json line 52]`; standard pattern: `result = streamText({ model, system, messages })` → `result.toUIMessageStreamResponse()`. |
| `@ai-sdk/react` | `^3.0.88` | `useChat` hook for client-side streaming consumption | `[VERIFIED: package.json line 12]`; already used in `builder-chat.tsx` + `chat-pane.tsx`. |
| `@anthropic-ai/sdk` | `^0.73.0` | Direct Anthropic client for non-streaming calls | `[VERIFIED: package.json line 13]`; used by `sticker-interpreter.ts:80` + `extract-guide-data.ts:72` with `model: 'claude-sonnet-4-6'`. Fallback if AI SDK doesn't meet needs. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@uiw/react-json-view` | `^2.0.0-alpha.41` | Render full `session_state` JSON snapshot collapsibly | `[VERIFIED: package.json line 45]` — already a dependency. Use for the "snapshot" section of the forensics panel instead of hand-rolled `<pre>`. |
| `lucide-react` | `^0.563.0` | Icons (expand toggle, auditor button, pointer arrow) | `[VERIFIED: package.json]`; standard throughout dashboard. |
| `sonner` | `^2.0.7` | Toast for "Copied to clipboard" after auditor markdown copy | `[VERIFIED: package.json]`; standard. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-markdown` | `marked` + `DOMPurify` | Marked is faster but requires manual XSS sanitization. react-markdown is safe-by-default (no dangerouslySetInnerHTML). |
| AI SDK `streamText` | Raw `@anthropic-ai/sdk` with manual SSE | SDK gives us `toUIMessageStreamResponse()` + `useChat` on the client for free — 30 lines vs 200. Precedent set by `builder/chat/route.ts`. |
| `useChat` hook | Fetch + ReadableStream consumer by hand | Rejected — useChat already solves cancellation, loading states, error boundaries. |

**Installation (Plan 03 or 04 action):**
```bash
npm install react-markdown@^10.1.0 remark-gfm@^4.0.1
```

**Version verification:** Confirmed via `npm view react-markdown version` (→ 10.1.0) and `npm view remark-gfm version` (→ 4.0.1) on 2026-04-23. Both stable, both compatible with React 19.

## Architecture Patterns

### System Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│                   USER (super-user, morfx.app/whatsapp)               │
└──────────────────────────┬────────────────────────────────────────────┘
                           │ selects conversation → panel opens
                           ▼
┌───────────────────────────────────────────────────────────────────────┐
│    DebugPanelProduction  (existing wrapper, src/.../debug-panel-      │
│                          production/index.tsx)                        │
│    ┌─────────────┬─────────────────────────────────────────────┐      │
│    │ TurnList    │  TabbedDetailPane (NEW — Plan 02)           │      │
│    │ (existing,  │  ┌──────────────┬─────────────┬──────────┐  │      │
│    │  shows      │  │ Forensics    │ Raw         │ Auditor  │  │      │
│    │  responding │  │ (condensed   │ (existing   │ (manual  │  │      │
│    │  agent_id)  │  │  timeline +  │  TurnDetail │  button) │  │      │
│    │             │  │  state snap) │  View)      │          │  │      │
│    └─────────────┴──┴──────────────┴─────────────┴──────────┘  │      │
└────────────┬────────────────┬──────────────────────┬───────────┘      │
             │                │                      │                  │
             │ server action  │ server action        │ API route        │
             ▼                ▼                      ▼                  │
   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐    │
   │ getForensics    │  │ getTurnDetail   │  │ /api/agent-         │    │
   │ ViewAction      │  │ Action          │  │   forensics/audit   │    │
   │ (NEW — Plan 02) │  │ (existing,      │  │ (NEW — Plan 04)     │    │
   │                 │  │  repository.ts) │  │                     │    │
   └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘    │
            │                    │                      │               │
            │ reads              │ reads                │ reads         │
            ▼                    ▼                      │               │
   ┌─────────────────────────────────────┐              │               │
   │ agent_observability_* (partitioned) │              │               │
   │  + session_state (joined via        │              │               │
   │    agent_sessions.id)               │              │               │
   └─────────────────────────────────────┘              │               │
                                                        │               │
                   ┌────────────────────────────────────┤               │
                   │                                    │               │
                   ▼                                    ▼               │
       ┌──────────────────────────┐       ┌─────────────────────────┐   │
       │ Anthropic API            │       │ src/lib/agent-specs/    │   │
       │ claude-sonnet-4-6        │       │  somnio-sales-v3.md     │   │
       │ via AI SDK streamText    │       │  somnio-recompra-v1.md  │   │
       │                          │       │  godentist.md           │   │
       └──────────────────────────┘       └─────────────────────────┘   │
                   │                                                    │
                   ▼ SSE stream                                         │
       (renders in Auditor tab via useChat + react-markdown)            │
                                                                        │
┌───────────────────────────────────────────────────────────────────────┘
│ Write path (Plan 01 — bug fix)
│
│   webhook event                                                        
│      │                                                                 
│      ▼                                                                 
│   whatsappAgentProcessor (agent-production.ts)                         
│      │                                                                 
│      │ 1. Create collector with agentId from workspace_agent_config    
│      │    (e.g. 'somnio-v3') + respondingAgentId: null                 
│      ▼                                                                 
│   processMessageWithAgent (webhook-processor.ts)                       
│      │                                                                 
│      ├── contactData.is_client && recompra_enabled                     
│      │   ├── recordEvent pipeline_decision.recompra_routed             
│      │   ├── **NEW: collector.setRespondingAgentId(                    
│      │   │     'somnio-recompra-v1')**                                 
│      │   └── V3ProductionRunner('somnio-recompra').processMessage()    
│      │                                                                 
│      ├── agent_id === 'godentist'                                      
│      │   └── **NEW: collector.setRespondingAgentId('godentist')**      
│      │   └── V3ProductionRunner('godentist').processMessage()          
│      │                                                                 
│      └── agent_id === 'somnio-sales-v3'                                
│          └── **NEW: collector.setRespondingAgentId('somnio-v3')**      
│          └── V3ProductionRunner.processMessage()                       
│                                                                        
│   collector.flush() → INSERT with responding_agent_id populated        
└───────────────────────────────────────────────────────────────────────
```

### Recommended Project Structure

```
.planning/standalone/agent-forensics-panel/
├── CONTEXT.md            # existing
├── DISCUSSION-LOG.md     # existing
├── RESEARCH.md           # this file
├── 01-PLAN.md            # migration + backfill + runtime fix (D-12)
├── 02-PLAN.md            # forensics tab UI + condensed timeline
├── 03-PLAN.md            # per-bot spec files + session_state snapshot
├── 04-PLAN.md            # auditor API route + useChat UI
└── 05-PLAN.md            # polish + docs update + LEARNINGS

src/
├── lib/
│   ├── agent-specs/                    # NEW (Plan 03) — consolidated bot spec
│   │   ├── README.md                   # edition guide (D-07: "user-editable")
│   │   ├── somnio-sales-v3.md
│   │   ├── somnio-recompra-v1.md
│   │   └── godentist.md
│   ├── agent-forensics/                # NEW (Plan 02-04)
│   │   ├── condense-timeline.ts        # event whitelist logic per bot
│   │   ├── load-agent-spec.ts          # fs.readFile + cache
│   │   ├── load-session-snapshot.ts    # reads session_state via admin client
│   │   └── auditor-prompt.ts           # builds system prompt for Claude
│   └── observability/
│       ├── collector.ts                # MODIFY: add setRespondingAgentId + respondingAgentId field
│       ├── flush.ts                    # MODIFY: include responding_agent_id in INSERT
│       └── repository.ts               # MODIFY: expose respondingAgentId in TurnSummary
├── app/
│   ├── (dashboard)/whatsapp/components/
│   │   └── debug-panel-production/
│   │       ├── forensics-tab.tsx       # NEW (Plan 02)
│   │       ├── condensed-timeline.tsx  # NEW (Plan 02)
│   │       ├── session-snapshot.tsx    # NEW (Plan 03)
│   │       ├── auditor-tab.tsx         # NEW (Plan 04) — useChat + react-markdown
│   │       ├── tabs.tsx                # NEW (Plan 02) — wraps forensics/raw/auditor
│   │       ├── index.tsx               # MODIFY — integrates tabs
│   │       └── turn-list.tsx           # MODIFY — show respondingAgentId ?? agentId
│   ├── actions/
│   │   └── observability.ts            # MODIFY: add getForensicsViewAction + getSessionSnapshotAction
│   └── api/
│       └── agent-forensics/
│           └── audit/
│               └── route.ts            # NEW (Plan 04)

supabase/migrations/
└── 20260424100000_agent_observability_responding_agent_id.sql  # NEW (Plan 01)
```

### Pattern 1: Partitioned-table ALTER + backfill (D-10 + D-11)

**What:** Add a column to a partitioned parent table and all its existing partitions.
**When to use:** Schema evolution on `agent_observability_turns` without dropping data.
**Example:**
```sql
-- Source: verified pattern from existing codebase migrations (observability_schema.sql)
-- ALTER on the PARENT cascades to all partitions automatically in PG 12+.
BEGIN;

ALTER TABLE agent_observability_turns
  ADD COLUMN responding_agent_id TEXT NULL;

-- Index for the forensics view "recent turns for this conversation where
-- responding bot = X" query. Partial index keeps it small (only populated rows).
CREATE INDEX IF NOT EXISTS idx_turns_responding_agent
  ON agent_observability_turns (responding_agent_id, started_at DESC)
  WHERE responding_agent_id IS NOT NULL;

-- Backfill: see §4 of Open Items Resolution for criterion derivation.
-- Criterion: look inside agent_observability_events for the turn_id that
-- carries either 'recompra_routed' (→ somnio-recompra-v1) or
-- 'webhook_agent_routed' with agentId='godentist' / agentId='somnio-sales-v3'.
UPDATE agent_observability_turns AS t
SET responding_agent_id = 'somnio-recompra-v1'
WHERE EXISTS (
  SELECT 1 FROM agent_observability_events e
  WHERE e.turn_id = t.id
    AND e.category = 'pipeline_decision'
    AND e.label = 'recompra_routed'
);

UPDATE agent_observability_turns AS t
SET responding_agent_id = 'godentist'
WHERE responding_agent_id IS NULL
  AND EXISTS (
    SELECT 1 FROM agent_observability_events e
    WHERE e.turn_id = t.id
      AND e.category = 'pipeline_decision'
      AND e.label = 'webhook_agent_routed'
      AND e.payload->>'agentId' = 'godentist'
  );

UPDATE agent_observability_turns AS t
SET responding_agent_id = 'somnio-v3'
WHERE responding_agent_id IS NULL
  AND EXISTS (
    SELECT 1 FROM agent_observability_events e
    WHERE e.turn_id = t.id
      AND e.category = 'pipeline_decision'
      AND e.label = 'webhook_agent_routed'
      AND e.payload->>'agentId' = 'somnio-sales-v3'
  );

-- Fallback: turns with NO routing event (media_gate ignored / handoff'd
-- before any pipeline_decision fired) — use the entry agent_id as the
-- responding agent (since nothing else ran).
UPDATE agent_observability_turns
SET responding_agent_id = agent_id
WHERE responding_agent_id IS NULL;

COMMIT;
```

**Regla 5 enforcement:** This migration MUST apply in prod BEFORE the code that reads/writes `responding_agent_id` is pushed. Plan 01 Task 1 applies the SQL manually; Plan 01 Task 2 (separate commit) pushes the runtime code. This mirrors `somnio-recompra-template-catalog/05-PLAN.md` which bundles "migration apply → verify → push code" in sequence.

### Pattern 2: Collector setter for mid-turn mutation

**What:** Break the "immutable after construction" invariant on the collector, but ONLY for the `respondingAgentId` field.
**When to use:** The runner branch has knowledge the collector's creator didn't have.
**Example:**
```typescript
// src/lib/observability/collector.ts — MODIFY
export class ObservabilityCollector {
  readonly agentId: AgentId  // entry agent — unchanged, immutable
  respondingAgentId: AgentId | null  // NEW — mutable, set by routing branches

  constructor(init: ObservabilityCollectorInit) {
    // ...
    this.respondingAgentId = init.respondingAgentId ?? null
  }

  /**
   * Set the agent that actually produced the response. Called by the
   * recompra / godentist / somnio-v3 branches of webhook-processor.ts
   * once routing is resolved.
   *
   * Intentionally idempotent on the SAME value so replays don't matter.
   * Defensively swallows attempts to set a different value mid-turn
   * (logs a warning) to preserve the routing audit trail.
   */
  setRespondingAgentId(id: AgentId): void {
    if (this.respondingAgentId && this.respondingAgentId !== id) {
      // Don't throw — observability must never break prod (REGLA 6).
      return
    }
    this.respondingAgentId = id
  }
}
```
Then `flush.ts` adds `responding_agent_id: collector.respondingAgentId` to the INSERT shape. Types file exports the updated signature.

### Pattern 3: Super-user-gated server action

**What:** Every panel-related action pre-gates via `assertSuperUser()`.
**When to use:** All forensics data access (timeline, snapshot, spec content) + the auditor invocation.
**Example:**
```typescript
// src/app/actions/observability.ts — pattern from existing `getTurnDetailAction`
'use server'
import { assertSuperUser } from '@/lib/auth/super-user'

export async function getSessionSnapshotAction(
  conversationId: string,
): Promise<{ snapshot: unknown; sessionId: string | null }> {
  await assertSuperUser()  // throws 'FORBIDDEN' if not the owner
  // ... read session_state via createRawAdminClient()
}
```

### Pattern 4: AI SDK streaming API route with useChat (auditor)

**What:** Server sends SSE via `streamText().toUIMessageStreamResponse()`, client consumes via `useChat` + `DefaultChatTransport`.
**When to use:** Auditor invocation (D-03 + D-08 + D-09).
**Example:**
```typescript
// src/app/api/agent-forensics/audit/route.ts
// Source: adapted from src/app/api/builder/chat/route.ts verbatim pattern
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { assertSuperUser } from '@/lib/auth/super-user'
import { loadAgentSpec } from '@/lib/agent-forensics/load-agent-spec'
import { buildAuditorPrompt } from '@/lib/agent-forensics/auditor-prompt'
import { condenseTimeline } from '@/lib/agent-forensics/condense-timeline'
import { loadSessionSnapshot } from '@/lib/agent-forensics/load-session-snapshot'
import { getTurnDetail } from '@/lib/observability/repository'

export async function POST(request: Request) {
  try {
    await assertSuperUser()  // throws FORBIDDEN

    const { turnId, startedAt, respondingAgentId, conversationId } =
      await request.json()

    // 1. Assemble context (parallel reads)
    const [detail, spec, snapshot] = await Promise.all([
      getTurnDetail(turnId, startedAt),
      loadAgentSpec(respondingAgentId),
      loadSessionSnapshot(conversationId),
    ])

    // 2. Condense timeline to the events relevant for this bot
    const condensed = condenseTimeline(detail, respondingAgentId)

    // 3. Build system prompt + messages
    const { systemPrompt, userMessage } = buildAuditorPrompt({
      spec,
      condensed,
      snapshot,
      turn: detail.turn,
    })

    // 4. Stream
    const result = streamText({
      model: anthropic('claude-sonnet-4-6'),  // D-08
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      // No tools — auditor only reads context + emits markdown (D-09).
      temperature: 0.3,  // low — we want deterministic diagnostic, not creativity
      maxOutputTokens: 4096,
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return new Response('Forbidden', { status: 403 })
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    )
  }
}
```

Client counterpart (simplified, from `builder-chat.tsx` pattern):

```typescript
// src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx
'use client'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function AuditorTab({ turnId, startedAt, respondingAgentId, conversationId }) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/agent-forensics/audit' }),
    [],
  )

  const { messages, sendMessage, status, error } = useChat({ transport })

  const runAudit = () =>
    sendMessage(
      { text: 'Auditar este turno' },  // content ignored by server
      { body: { turnId, startedAt, respondingAgentId, conversationId } },
    )

  const assistantText = messages
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => m.parts.filter((p) => p.type === 'text').map((p) => p.text))
    .join('\n')

  return (
    <div className="h-full flex flex-col">
      <button onClick={runAudit} disabled={status === 'streaming'}>
        {status === 'streaming' ? 'Auditando…' : 'Auditar sesión'}
      </button>
      <div className="flex-1 overflow-auto prose prose-sm dark:prose-invert">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{assistantText}</ReactMarkdown>
      </div>
      {error && <p className="text-destructive text-xs">{error.message}</p>}
    </div>
  )
}
```

### Anti-Patterns to Avoid

- **Don't call Anthropic directly in the client.** `ANTHROPIC_API_KEY` must stay server-side — route through `/api/agent-forensics/audit`.
- **Don't bypass `createRawAdminClient()` in the repository.** Using `createAdminClient()` re-enters the observability fetch wrapper → recursion. Every read in `forensics-*.ts` must use the raw client. (Pitfall 1 of Phase 42.1.)
- **Don't mutate `collector.agentId`.** It is semantically the "entry" agent. Use the new `respondingAgentId` field. Mutating `agentId` would corrupt the routing audit trail.
- **Don't set `collector.respondingAgentId` before the runner completes.** Set it AT the routing decision (before `runner.processMessage()`), so even if the runner throws the field is recorded. (The schema says the routing was to X, even if X failed.)
- **Don't `dangerouslySetInnerHTML` the auditor output.** Use react-markdown (safe-by-default). The markdown can legitimately contain `<script>` strings inside fenced code blocks — those are displayed, not executed.
- **Don't thread the per-bot spec through the API request body.** The spec can be 2-5KB; sending it client→server wastes bandwidth. Load from filesystem in the route handler.
- **Don't cache the spec file contents in a module-level variable in serverless.** Each Vercel lambda cold-starts fresh. Use `fs.readFile` on every invocation — the spec files are <10KB, the overhead is trivial, and the spec changes should reflect immediately.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown → HTML rendering | Custom parser / `dangerouslySetInnerHTML` + marked | `react-markdown@10.1.0` + `remark-gfm@4.0.1` | XSS safety, GFM tables, fenced code blocks with language hints — weeks of edge cases. |
| SSE stream parsing on the client | Manual `ReadableStream` consumer + state mgmt | `useChat` from `@ai-sdk/react` | Already handles cancellation, error boundaries, partial message concatenation, loading states. |
| Anthropic response parsing (token counts, tool calls) | Manual SDK call + response normalizing | AI SDK `streamText` + `toUIMessageStreamResponse` | Provider-agnostic (if we swap to Vertex), token accounting built in. |
| JSON state snapshot rendering | Custom `<pre>{JSON.stringify(…, null, 2)}</pre>` with collapse UI | `@uiw/react-json-view` | Already in `package.json`, supports deep collapse, syntax highlighting, search. |
| Copy-to-clipboard feedback | Manual `navigator.clipboard` + timeout | `sonner` toast + `navigator.clipboard.writeText` | Already standard in dashboard. |
| Timeline event filtering by category | Inline `.filter()` scattered across components | Single `condenseTimeline(detail, bot)` utility in `src/lib/agent-forensics/` | Single source of truth; easy to add bots. |
| Partitioned-table DDL | Manual loop over partitions | `ALTER TABLE <parent>` — PG 12+ cascades to all partitions automatically | Verified in PG docs; the observability schema is PARTITION BY RANGE and ALTER propagates. |
| Super-user auth guard | New custom check | `assertSuperUser()` from `@/lib/auth/super-user` | Already standard for `/super-admin` + observability server actions. |

**Key insight:** The codebase has a MATURE observability infrastructure (Phase 42.1). The forensics panel is a **presentation layer** over data that already exists. Resist the urge to re-instrument — the hard work of categorizing events (`pipeline_decision`, `guard`, `template_selection`, `comprehension`, `mode_transition`, etc.) was already done. The forensics layer JUST filters, groups, and renders.

## Runtime State Inventory

Not a rename / refactor / migration phase in the DevOps-state sense. However, the **schema migration** in Plan 01 has state implications:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `agent_observability_turns` table — partitioned by month (Apr/May/Jun 2026 + auto-created going forward). 4 partitions × 1 parent = 5 relations to ALTER. | `ALTER TABLE <parent> ADD COLUMN` cascades to all partitions (PG 12+). Verify via `\d+ agent_observability_turns_202604` post-migration. |
| Stored data | Historical rows in `agent_observability_turns` with `agent_id = 'somnio-v3'` when responding agent was `somnio-recompra-v1`. | Backfill UPDATE in same migration transaction. Criterion detects via joining on `agent_observability_events` (see Plan 01). |
| Live service config | None. Observability flag `OBSERVABILITY_ENABLED` is an env var, unchanged. | None. |
| OS-registered state | Inngest function `whatsapp-agent-processor` is code-defined, redeployed on push. | None — push propagates automatically. |
| Secrets / env vars | `ANTHROPIC_API_KEY` (already exists, used by sticker-interpreter / builder-chat). `MORFX_OWNER_USER_ID` (already set — super-user gate). | None — reuse existing. |
| Build artifacts | `src/lib/agent-specs/*.md` are static — bundled into the Vercel deployment. | Verify Next.js 15 `fs.readFile` works in API routes (it does — App Router API routes are Node.js runtime by default, not Edge). |

**Critical verification:** Test Plan 01 rollout in staging-equivalent first. If backfill criterion misses turns (because an event category was renamed or the routing branch changed), `responding_agent_id` stays NULL — **this is safe** because the UI falls back to `agent_id`. Regression impact = zero.

## Common Pitfalls

### Pitfall 1: ALS context lost across Inngest `step.run` boundaries

**What goes wrong:** If the responding-agent-id capture happens INSIDE `step.run('process-message', …)` but is read OUTSIDE, Inngest's replay model silently loses it. Every replay re-creates a fresh lambda — in-memory state (including `collector.respondingAgentId`) is GC'd.
**Why it happens:** Each Inngest step callback runs in exactly one Vercel lambda. Subsequent replays use the CACHED step output, not the callback.
**How to avoid:** Exactly as `Phase 42.1 Plan 07` already does for events/queries/aiCalls: capture `respondingAgentId` in the step output (add a `respondingAgentId` field to the `__obs` return value alongside `events/queries/aiCalls`). The outer handler's `mergeFrom` or a new `setRespondingAgentIdFromStepOutput` applies it before `flush()`.

**Concrete fix (Plan 01):**
```typescript
// webhook-processor.ts — BEFORE runner.processMessage for recompra:
getCollector()?.setRespondingAgentId('somnio-recompra-v1')

// agent-production.ts step output:
return {
  engineResult,
  __obs: stepCollector ? {
    events: stepCollector.events,
    queries: stepCollector.queries,
    aiCalls: stepCollector.aiCalls,
    respondingAgentId: stepCollector.respondingAgentId,  // NEW
  } : null,
}

// After step.run, merge into outer collector:
if (collector && stepResult.__obs?.respondingAgentId) {
  collector.setRespondingAgentId(stepResult.__obs.respondingAgentId)
}
```
**Warning signs:** `responding_agent_id` is NULL in DB for turns that DID route to recompra. Debug via inspecting the outer-collector dump in Inngest function logs.

### Pitfall 2: Backfill criterion false-negatives

**What goes wrong:** The backfill sets `responding_agent_id = 'somnio-recompra-v1'` only when `pipeline_decision · recompra_routed` exists for that turn. But pre-Phase-42.1-plan-X some turns may predate that event emission — they'd stay NULL.
**Why it happens:** The `recompra_routed` event was added in the somnio-recompra-v1 rollout (commit bf901da, ~2026-04). Turns older than that may lack it.
**How to avoid:** Fall back — if `responding_agent_id IS NULL` after all three criteria run, `UPDATE SET responding_agent_id = agent_id`. A NULL is worse than a "best-guess from entry agent" because the UI uses `responding_agent_id ?? agent_id` anyway.
**Warning signs:** Post-backfill, run `SELECT agent_id, responding_agent_id, COUNT(*) FROM agent_observability_turns GROUP BY 1,2` — sanity-check that no cell has a suspicious NULL count.

### Pitfall 3: Spec file not found on Vercel

**What goes wrong:** `fs.readFile('src/lib/agent-specs/somnio-recompra-v1.md')` throws ENOENT in the lambda because Next.js build didn't include the file.
**Why it happens:** Next.js 15 App Router only bundles files explicitly imported. Raw `fs.readFile` paths aren't tracked. In production, `src/…` doesn't exist in the lambda — the bundled code is in `.next/…`.
**How to avoid:** Use `path.join(process.cwd(), 'src/lib/agent-specs', `${botId}.md`)` and **configure `next.config` `outputFileTracingIncludes`** or use a compile-time import:
```typescript
// Option A: use outputFileTracingIncludes (next.config.ts)
outputFileTracingIncludes: {
  '/api/agent-forensics/audit': ['./src/lib/agent-specs/**/*.md'],
}

// Option B: statically import as raw text (preferred — simpler)
// Requires configuring Webpack raw-loader or Next.js 15 native .md imports
```
**Recommendation:** Use **Option A** (`outputFileTracingIncludes` in `next.config.ts`). It's a single config entry and Next 15 honors it for App Router API routes. Verified approach in Next 15 docs.
**Warning signs:** Auditor returns 500 in prod but works in `npm run dev`. `vercel logs` shows `ENOENT: no such file or directory`.

### Pitfall 4: react-markdown XSS via code block language

**What goes wrong:** Auditor outputs ````html\n<script>...</script>\n```` and a naive rendering could execute it.
**Why it happens:** Some markdown renderers preserve HTML-in-fenced-blocks unescaped.
**How to avoid:** `react-markdown@10.x` is safe-by-default — it does NOT pass through raw HTML. Do NOT enable `rehype-raw`. Do NOT set `dangerouslySetInnerHTML`. Confirm by reading `react-markdown` docs: "By default, we don't allow raw HTML in markdown."
**Warning signs:** Post-release XSS report. Defense: code review checks for `rehype-raw` or `skipHtml={false}`.

### Pitfall 5: Condensed timeline drops critical context

**What goes wrong:** The whitelist filter is too aggressive — drops an event that turns out to be load-bearing for diagnosis.
**Why it happens:** "Relevant" is subjective and per-bot.
**How to avoid:** (a) The raw view is ONE TOGGLE AWAY (D-05). (b) The whitelist lives in ONE file (`condense-timeline.ts`) and is editable without redeploy (well, requires a push, but it's a small file and easy to amend). (c) Start WIDE (include most event categories) and prune only if signal-to-noise is bad in practice. See Open Items Resolution §2 for the starting whitelist.
**Warning signs:** User says "I can see it in the raw view but not in the condensed view and I had to click the toggle" — indicator that the whitelist should be expanded for that event.

### Pitfall 6: Auditor prompt leaks prior conversation state (privacy)

**What goes wrong:** The auditor receives the full `session_state.datos_capturados` — which may include the user's phone, name, address.
**Why it happens:** D-06 mandates FULL snapshot (no filtering). Auditor spec generates a 3rd-party API call.
**How to avoid:** (a) The auditor call is a same-Anthropic-account call — no third-party data export beyond what already goes to the in-prod agents. (b) Document in the README that auditor input is unredacted. (c) Rate-limit auditor invocations (token budget tracking — reuse Phase 42.1 pricing.ts if helpful).
**Warning signs:** User asks "is this PII going somewhere unexpected?". Mitigation: document explicitly; do NOT redact (would break diagnostic utility).

### Pitfall 7: Inngest replay re-invokes the auditor

**What goes wrong:** Auditor call happens inside an Inngest step → replay fires Claude again → charges twice.
**Why it happens:** Developer accidentally wraps the auditor in `step.run`.
**How to avoid:** The auditor runs in a normal Next.js API route (`/api/agent-forensics/audit`), NOT an Inngest function. No step.run involvement. Clear separation.
**Warning signs:** Duplicate auditor token charges in Anthropic dashboard. Debug: ensure `route.ts` has NO `inngest.send` or `step.run` imports.

### Pitfall 8: Partial-index condition on `responding_agent_id` disables ORDER BY optimization

**What goes wrong:** The new partial index `WHERE responding_agent_id IS NOT NULL` doesn't help queries that filter on workspace+started_at (the dominant access pattern).
**Why it happens:** Partial indexes only help queries that match the predicate.
**How to avoid:** KEEP the existing composite indexes (`idx_turns_workspace_agent`) untouched. The partial index is SECONDARY — used only for rare "find all turns where responding_agent_id = X" cross-conversation queries (by the auditor, maybe). The primary query (listTurnsForConversation) still uses `idx_turns_conversation`.
**Warning signs:** Post-deploy, `EXPLAIN ANALYZE` on `listTurnsForConversation` shows a full scan. Fix: remove partial index.

## Code Examples

### Example: Condensed timeline filter (Plan 02)

```typescript
// src/lib/agent-forensics/condense-timeline.ts
// Source: event categories verified from src/lib/observability/types.ts:47-71

import type { TurnDetail, TurnDetailEvent } from '@/lib/observability/repository'

/**
 * Event categories considered "mechanism-relevant" for the condensed
 * timeline (D-04). Queries are ALWAYS excluded (D-05). AI calls kept
 * only if they correspond to a pipeline decision (classifier, comprehension,
 * no_repetition).
 */
const CORE_CATEGORIES = new Set<string>([
  'session_lifecycle',       // turn_started / turn_completed
  'pipeline_decision',       // routing decisions, track results, auto_trigger
  'mode_transition',         // mode changes
  'guard',                   // blocked / passed (R0 / R1)
  'template_selection',      // block_composed, empty_result
  'tool_call',               // CRM reader/writer invocations
  'no_repetition',           // L2/L3 decisions
  'handoff',                 // human takeover
  'timer_signal',            // scheduled fires
  'comprehension',           // intent detection result
  'media_gate',              // passthrough / handoff / notify_host / ignore
  'pre_send_check',          // last-mile validation
  'interruption_handling',   // mid-turn interruption branches
  'retake',                  // retoma_* decisions
  'ofi_inter',               // office-hour / international routing
  'pending_pool',            // deferred action queue
  // 'disambiguation' and 'silence_timer' intentionally start EXCLUDED.
  // Add back if users say they're useful.
])

export interface CondensedTimelineItem {
  kind: 'event' | 'ai'
  sequence: number
  recordedAt: string
  category?: string
  label?: string | null
  summary: string          // short human-readable line (renderer uses directly)
  raw: TurnDetailEvent | { purpose: string; durationMs: number; inputTokens: number; outputTokens: number }
}

export function condenseTimeline(
  detail: TurnDetail,
  respondingAgentId: string | null,
): CondensedTimelineItem[] {
  const items: CondensedTimelineItem[] = []

  for (const e of detail.events) {
    if (!CORE_CATEGORIES.has(e.category)) continue
    items.push({
      kind: 'event',
      sequence: e.sequence,
      recordedAt: e.recordedAt,
      category: e.category,
      label: e.label,
      summary: summarizeEvent(e),
      raw: e,
    })
  }

  for (const a of detail.aiCalls) {
    // Keep only "mechanism" AI calls — skip low-signal ones.
    if (!isMechanismAiCall(a.purpose)) continue
    items.push({
      kind: 'ai',
      sequence: a.sequence,
      recordedAt: a.recordedAt,
      summary: `AI · ${a.purpose} · ${a.model} · ${a.inputTokens}+${a.outputTokens}tok · ${a.durationMs}ms`,
      raw: {
        purpose: a.purpose,
        durationMs: a.durationMs,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
      },
    })
  }

  return items.sort((a, b) => a.sequence - b.sequence)
}

function isMechanismAiCall(purpose: string): boolean {
  return [
    'comprehension',
    'classifier',
    'orchestrator',
    'no_rep_l2',
    'no_rep_l3',
    'minifrase',
    'paraphrase',
    'sticker_vision',
  ].includes(purpose)
}

function summarizeEvent(e: TurnDetailEvent): string {
  const p = (e.payload ?? {}) as Record<string, unknown>
  switch (e.category) {
    case 'pipeline_decision':
      return `${e.label ?? '?'} · ${JSON.stringify(slim(p, ['action', 'agentId', 'agent', 'reason', 'intent', 'toAction']))}`
    case 'template_selection':
      return `${e.label ?? '?'} · intents=[${(p.intents as string[] || []).join(', ')}]`
    case 'guard':
      return `${e.label ?? '?'} · reason=${p.reason ?? '—'}`
    case 'mode_transition':
      return `${p.from ?? '—'} → ${p.to ?? '—'} · ${p.reason ?? ''}`
    case 'comprehension':
      return `intent=${p.intent ?? '—'} · confidence=${p.confidence ?? '—'}`
    case 'tool_call':
      return `${p.tool ?? e.label ?? '?'} · ${p.status ?? ''}`
    case 'session_lifecycle':
      return e.label ?? 'lifecycle'
    default:
      return `${e.label ?? ''} ${JSON.stringify(slim(p, Object.keys(p).slice(0, 3)))}`
  }
}

function slim(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) if (k in obj) out[k] = obj[k]
  return out
}
```

### Example: Load agent spec file

```typescript
// src/lib/agent-forensics/load-agent-spec.ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Load a bot's behavior spec from disk. Files live at
 * `src/lib/agent-specs/{id}.md` and are included in the build via
 * `next.config.ts` `outputFileTracingIncludes`.
 *
 * NOTE: do NOT cache at module scope — Vercel lambdas are cold-started
 * per invocation and a cache wouldn't help. The spec is small (<10KB).
 */
const SPEC_IDS = new Set([
  'somnio-sales-v3',
  'somnio-recompra-v1',
  'godentist',
])

export async function loadAgentSpec(agentId: string): Promise<string> {
  if (!SPEC_IDS.has(agentId)) {
    throw new Error(`Unknown agent spec: ${agentId}`)
  }
  const filePath = path.join(process.cwd(), 'src/lib/agent-specs', `${agentId}.md`)
  return readFile(filePath, 'utf-8')
}
```

### Example: Auditor prompt assembly

```typescript
// src/lib/agent-forensics/auditor-prompt.ts
import type { TurnSummary } from '@/lib/observability/repository'
import type { CondensedTimelineItem } from './condense-timeline'

export function buildAuditorPrompt(args: {
  spec: string
  condensed: CondensedTimelineItem[]
  snapshot: unknown
  turn: TurnSummary
}): { systemPrompt: string; userMessage: string } {
  const systemPrompt = `Eres un auditor técnico de agentes conversacionales. Tu trabajo es analizar el comportamiento de un bot en un turno específico y diagnosticar si respondió como debería, con base en su spec.

SIEMPRE respondes en markdown con la siguiente estructura:

# Diagnóstico: {nombre del bot}

## Resumen
Un párrafo (máximo 3 líneas) con el veredicto: ¿el comportamiento está dentro o fuera de lo esperado?

## Evidencia del timeline
Lista de hechos observados, citando eventos específicos con formato: \`event · label · payload\`.

## Discrepancias con la spec
Por cada discrepancia:
- **Descripción:** qué esperaba la spec vs. qué ocurrió.
- **Pointer:** archivo:línea donde está el código implicado (ej. \`src/lib/agents/somnio-recompra/response-track.ts:36\`).
- **Hipótesis:** causa probable.

## Próximos pasos
Bullet list de acciones concretas pegables a Claude Code para investigar/arreglar. Usa formato imperativo.

REGLAS:
- NUNCA inventes events/queries que no estén en el timeline dado.
- NUNCA inventes archivos/líneas — usa SOLO los pointers que aparecen en la spec.
- Si no hay discrepancias, dilo explícitamente en la sección "Discrepancias" ("Ninguna detectada.").
- El output debe ser pegable directamente a Claude Code sin edición humana.`

  const userMessage = `## Spec del bot (fuente de verdad de comportamiento esperado)

${args.spec}

---

## Turn analizado

- **ID:** ${args.turn.id}
- **Conversation:** ${args.turn.conversationId}
- **Entry agent (routing):** ${args.turn.agentId}
- **Responding agent:** ${(args.turn as any).respondingAgentId ?? args.turn.agentId}
- **Trigger:** ${args.turn.triggerKind}
- **Duration:** ${args.turn.durationMs ?? '—'}ms
- **Error:** ${args.turn.hasError ? 'SÍ (ver event-timeline)' : 'No'}

## Timeline condensado (orden de secuencia)

\`\`\`json
${JSON.stringify(args.condensed, null, 2)}
\`\`\`

## Snapshot completo del session_state

\`\`\`json
${JSON.stringify(args.snapshot, null, 2)}
\`\`\`

---

Analiza este turno contra la spec. Emite tu diagnóstico en markdown siguiendo la estructura indicada en el system prompt.`

  return { systemPrompt, userMessage }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `agent_id` column on `agent_observability_turns` | Split into `agent_id` (entry) + `responding_agent_id` (actual responder) | Plan 01 of this phase | Preserves routing audit trail (you know entry → responding). Backward-compatible: `responding_agent_id ?? agent_id` pattern. |
| Raw dump of 19 events + 22 queries in one scroll | Tabbed view: Forensics (condensed) / Raw (existing view) / Auditor (AI) | Plan 02 of this phase | 90% less visual noise on the 80/20 diagnostic path, with full data one toggle away. |
| Bot behavior docs fragmented across `CLAUDE.md`, `.claude/rules/agent-scope.md`, `somnio_recompra_template_catalog.md`, response-track.ts comments | Consolidated `src/lib/agent-specs/{id}.md` per bot | Plan 03 of this phase | Single source of truth, user-editable, also consumable by the auditor. |
| No programmatic diagnosis — manual reading | Claude Sonnet 4.6 auditor with context window containing spec + timeline + snapshot | Plan 04 of this phase | First-pass diagnosis generated in seconds; pointer-rich output pastes straight into Claude Code. |

**Deprecated / outdated:**
- Reading `turn.agentId` and assuming it's the "responding" agent. Post-Plan-01, always prefer `turn.respondingAgentId ?? turn.agentId`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ALTER TABLE <parent> ADD COLUMN` on a PG 12+ partitioned table cascades to all partitions in a single DDL statement. | Pattern 1 + Plan 01 | **Low risk.** Verified by reading PG 12+ docs and by the fact that the existing `agent_observability_*_202604/5/6` partitions all share the same schema from their parent. If wrong (unlikely), workaround is a one-line per-partition `ALTER TABLE`. `[ASSUMED]` |
| A2 | The backfill criterion (match on `pipeline_decision.recompra_routed` / `webhook_agent_routed` + payload.agentId) covers >95% of historical turns. | Plan 01 / Open Items §4 | **Medium risk.** If an older commit emitted different event labels for routing, those rows fall through to the "agent_id fallback" (safe but imprecise). Verified by greppinf current codebase, but historical commits may have emitted different labels. Mitigation: post-migration sanity query `SELECT responding_agent_id, COUNT(*) GROUP BY 1` — if any cell looks off, fix the UPDATE and re-run. `[VERIFIED: grep webhook_agent_routed + recompra_routed in src]` |
| A3 | Next.js 15 App Router `outputFileTracingIncludes` correctly bundles `.md` files referenced via `fs.readFile(process.cwd(), …)` into Vercel deployments. | Pitfall 3 | **Medium risk.** If wrong, fallback is compile-time static import via a Webpack raw-loader. Either way, the fix is straightforward and caught in staging. `[CITED: Next.js 15 docs on outputFileTracingIncludes]` |
| A4 | `claude-sonnet-4-6` model ID is stable and supported by `@ai-sdk/anthropic@3.0.43`. | D-08 / Standard Stack | **Low risk.** Already in use at `src/lib/agents/media/sticker-interpreter.ts:80` and `src/lib/ocr/extract-guide-data.ts:72` with the raw Anthropic SDK. `[VERIFIED: grep claude-sonnet-4-6 in src]` + `[CITED: Anthropic docs — claude-sonnet-4-6 released Feb 17 2026]` |
| A5 | `react-markdown@10.1.0` is stable, has no React 19 peer-dep issues. | Standard Stack / Pitfall 4 | **Low risk.** `[VERIFIED: npm view react-markdown version`]. React-markdown has supported React 19 since v9.x. Double-check peer-deps on install. |
| A6 | The condensed event whitelist (16 categories) gives a good signal-to-noise ratio for the 3 pilot bots. | Open Items §2 | **Medium risk.** Subjective. Mitigation: raw view toggle + central config file. Iterate based on user feedback. `[ASSUMED]` |
| A7 | `loadSessionSnapshot` via `createRawAdminClient()` reading `session_state` joined on `agent_sessions.conversation_id = ?` returns the FRESHEST state for that conversation. | load-session-snapshot | **Medium risk.** `session_state` is mutated by the agent during turn processing. The "snapshot at the time of the turn" is not perfectly reconstructable — we get "current state", which may have been mutated by LATER turns. For turns being analyzed right now (recent), this is accurate; for historical turns, it's the current state. Document this limitation in the UI ("snapshot actual, no histórico"). `[VERIFIED: session_state has no turn_id / historical table]` |
| A8 | The auditor's paste-back format (markdown with `file:line`) is correctly parsed by Claude Code as pointers. | D-13 | **Low risk.** Claude Code accepts any plain text with file paths; no machine format required. `[ASSUMED]` |

**Six of eight assumptions are low-risk; the two medium-risk ones (A2, A6, A7) have clear mitigation strategies.** No high-risk assumptions remain.

## Open Items Resolution

### 1. Path and template of per-bot spec file (D-07)

**Resolution: `src/lib/agent-specs/{agent-id}.md`.**

**Rationale:** (a) Lives with the code it describes (proximity). (b) Can be `git log --follow`-ed. (c) Next.js build includes it via `outputFileTracingIncludes`. (d) The existing `.claude/rules/` directory is semantically for Claude Code project rules, not runtime consumption — we want the auditor to load them on server, so they need to be bundled.

**Naming:** match the observability AgentId (`somnio-sales-v3`, `somnio-recompra-v1`, `godentist`) — this is the ID the auditor receives from the panel.

**Template (Plan 03 creates one per bot):**

```markdown
# {Bot Display Name}

**Agent ID:** `{observability-agent-id}`
**Runtime module:** `src/lib/agents/{module}/`
**Last updated:** 2026-04-XX

## Scope

### PUEDE
- [list from agent-scope.md]

### NO PUEDE
- [list from agent-scope.md]

## Arquitectura

### Pipeline (orden esperado en un turn)
1. Comprehension (Claude Haiku) → intent + confidence
2. Guards (R0 low-confidence, R1 escape intents)
3. Sales Track (state machine) → decides ACCIÓN
4. Response Track (template engine) → decides QUÉ DECIR
5. Block composition → mensaje final

### Archivos clave
- `src/lib/agents/{module}/comprehension.ts` — intent detection.
- `src/lib/agents/{module}/sales-track.ts` — acción.
- `src/lib/agents/{module}/response-track.ts` — templates (TEMPLATE_LOOKUP_AGENT_ID).
- `src/lib/agents/{module}/transitions.ts` — transiciones válidas.
- `src/lib/agents/{module}/constants.ts` — INFORMATIONAL_INTENTS, ACTION_TEMPLATE_MAP.
- `src/lib/agents/{module}/__tests__/` — contratos codificados en tests.

## Intents habilitados

### Informational
`saludo`, `precio`, `promociones`, `pago`, `envio`, `ubicacion`, [...]

### Acciones (sales)
`ofrecer_promos`, `preguntar_direccion_recompra`, `resumen_compra`, [...]

## Comportamiento esperado por intent

### `saludo`
- Cuándo se dispara: primer mensaje del cliente.
- Qué responde: template `saludo` (texto + imagen COMPLEMENTARIA).
- NO dispara promos automáticamente (D-05 recompra). Archivo: `response-track.ts:{line}`.

### `precio`
[...]

## Transiciones clave

| Desde intent | Acción | A intent | Condición |
|--------------|--------|----------|-----------|
| saludo | ofrecer_promos | promociones | cliente dice "quiero comprar" |

Archivo: `transitions.ts`.

## Contratos con otros módulos

- **CRM Reader:** [si aplica] — expects `session_state.datos_capturados._v3:crm_context` to be populated by Inngest function `recompra-preload-context`.
- **Templates:** todas las llamadas pasan por `TEMPLATE_LOOKUP_AGENT_ID = '{agent-id}'` en `response-track.ts:{line}`. Mutar esta constante = apuntar a otro catálogo.

## Observability events emitidos

El pipeline emite los siguientes eventos vía `getCollector()?.recordEvent(...)`:

| Categoría | Label | Cuándo | Archivo |
|-----------|-------|--------|---------|
| `comprehension` | `result` | Tras Haiku | comprehension.ts:90 |
| `guard` | `blocked` / `passed` | Tras R0/R1 | {agent}-agent.ts:197/239 |
| `pipeline_decision` | `sales_track_result` | Tras sales track | {agent}-agent.ts:259 |
| `template_selection` | `block_composed` | Tras response track | response-track.ts:188 |

Estos son los eventos que el auditor usa para razonar sobre el comportamiento real.

## Tests que codifican el contrato

`src/lib/agents/{module}/__tests__/`:
- `transitions.test.ts` — [N tests de D-XX]
- `response-track.test.ts` — [N tests de D-XX]

## Cambios recientes

- **2026-04-XX:** [qué cambió, commit hash]

## Rebuild notes para el auditor

Cuando el auditor diagnostique este bot, debe:
1. Usar los archivos:líneas citados arriba como pointers válidos.
2. NO inventar archivos/líneas.
3. Si un comportamiento no está documentado aquí, decir "no hay spec" en vez de inventar.
```

**Plan 03** consolidates these three files from the existing fragmented sources (`agent-scope.md` + `somnio_recompra_template_catalog/*.md` + `somnio-recompra-crm-reader/*.md` + response-track.ts comments + __tests__/).

### 2. Concrete event whitelist per bot for condensed timeline (D-04)

**Resolution:** Single shared whitelist (16 categories) with **per-bot label boosts**. Start wide, prune on feedback.

**Shared core (applies to all 3 bots):**

| Category | Kept in condensed view? | Rationale |
|----------|-------------------------|-----------|
| `session_lifecycle` | ✓ | Turn start/end markers |
| `pipeline_decision` | ✓ | The primary "what decided what" event |
| `mode_transition` | ✓ | Mode changes are high-signal |
| `guard` | ✓ | Why a turn was blocked |
| `template_selection` | ✓ | Which template block was sent |
| `comprehension` | ✓ | Intent detection result |
| `tool_call` | ✓ | CRM reader/writer invocations |
| `no_repetition` | ✓ | L2/L3 decisions |
| `handoff` | ✓ | Human takeover events |
| `timer_signal` | ✓ | Scheduled fires |
| `media_gate` | ✓ | Passthrough / handoff / notify_host / ignore |
| `pre_send_check` | ✓ | Last-mile validation |
| `interruption_handling` | ✓ | Mid-turn interruption branches |
| `retake` | ✓ | retoma_* decisions (somnio-v3 specific) |
| `ofi_inter` | ✓ | Office-hour / international routing (somnio-v3 specific) |
| `pending_pool` | ✓ | Deferred action queue |
| `classifier` | ✓ (keep) | Text vs media classifier branch |
| `char_delay` | ✗ (hide) | Pure rendering detail, very noisy |
| `disambiguation` | ✗ (hide) | Rarely fires; hide unless it does |
| `silence_timer` | ✗ (hide) | Timer plumbing, rarely load-bearing |
| `block_composition` | ✗ (hide) | Already implied by template_selection |
| `intent` | ✗ (hide, legacy) | Superseded by `comprehension`; kept only in old turns |
| `error` | ✓ | Always show errors |

**Per-bot emphasis in the auditor prompt (spec file) — not in the filter:**

| Bot | Categories most load-bearing for diagnosis |
|-----|--------------------------------------------|
| `somnio-sales-v3` | `comprehension`, `pipeline_decision · sales_track_result`, `retake`, `ofi_inter`, `template_selection`, `no_repetition` |
| `somnio-recompra-v1` | `pipeline_decision · recompra_routed`, `pipeline_decision · crm_context_used` / `crm_context_missing_after_wait`, `comprehension`, `template_selection`, `pipeline_decision · order_decision` |
| `godentist` | `comprehension`, `pipeline_decision · sales_track_result`, `pipeline_decision · appointment_decision`, `pipeline_decision · availability_lookup`, `template_selection` |

**AI calls shown (labeled differently from events):** `comprehension`, `classifier`, `orchestrator`, `no_rep_l2`, `no_rep_l3`, `minifrase`, `paraphrase`, `sticker_vision`. Filter out AI internal housekeeping (`prompt_versioning`, etc.).

**Queries:** ALL hidden by default (D-05). Toggle "Ver timeline completo" → existing `TurnDetailView` shows them.

### 3. Column spec for `responding_agent_id` migration (D-10)

**Resolution:**

```sql
-- Column on agent_observability_turns
-- Name:        responding_agent_id
-- Type:        TEXT
-- Nullability: NULL (historical rows start NULL; UI falls back to agent_id)
-- Default:     (no default — explicitly set by runtime / backfill)
-- Constraint:  (no CHECK — values are free-form agent IDs, matching existing
--              agent_id column's precedent which is also TEXT without CHECK)
-- Index:       idx_turns_responding_agent — partial, ordered by started_at DESC
```

Why `TEXT`, not an enum: the existing `agent_id` column is TEXT (line 49 of `20260408000000_observability_schema.sql`). Keeping types consistent allows `UNION` / `COALESCE(responding_agent_id, agent_id)` without casting.

Why NULL-able: historical rows. Post-backfill most are populated; the fallback clause handles edge cases.

Why no default: an UPDATE in the backfill step is clearer than a DEFAULT that applies retroactively. Runtime code (collector) sets it explicitly.

Why partial index: the main query (listTurnsForConversation) filters by `conversation_id, started_at DESC` — existing `idx_turns_conversation` already covers it. The new partial index serves only the RARE cross-conversation auditor queries ("show all turns where responding_agent_id = X in workspace Y"). Partial keeps index size small (most recent rows carry the value; older rows may be NULL).

### 4. Backfill detection criterion (D-11)

**Resolution: cascading OR with fallback — THREE criteria + safety net.**

```sql
-- Criterion A (highest confidence): explicit routing events
-- Recompra-routed event is ONLY emitted by the recompra branch (webhook-processor.ts:192).
-- Covers: every turn that went through the recompra path since the event was added.
UPDATE agent_observability_turns AS t
SET responding_agent_id = 'somnio-recompra-v1'
WHERE EXISTS (
  SELECT 1 FROM agent_observability_events e
  WHERE e.turn_id = t.id
    AND e.category = 'pipeline_decision'
    AND e.label = 'recompra_routed'
);

-- Criterion B: godentist routing
-- webhook_agent_routed event with payload.agentId = 'godentist' (webhook-processor.ts:476)
UPDATE agent_observability_turns AS t
SET responding_agent_id = 'godentist'
WHERE responding_agent_id IS NULL
  AND EXISTS (
    SELECT 1 FROM agent_observability_events e
    WHERE e.turn_id = t.id
      AND e.category = 'pipeline_decision'
      AND e.label = 'webhook_agent_routed'
      AND e.payload->>'agentId' = 'godentist'
  );

-- Criterion C: v3 routing
-- webhook_agent_routed event with payload.agentId = 'somnio-sales-v3' (webhook-processor.ts:453)
UPDATE agent_observability_turns AS t
SET responding_agent_id = 'somnio-v3'
WHERE responding_agent_id IS NULL
  AND EXISTS (
    SELECT 1 FROM agent_observability_events e
    WHERE e.turn_id = t.id
      AND e.category = 'pipeline_decision'
      AND e.label = 'webhook_agent_routed'
      AND e.payload->>'agentId' = 'somnio-sales-v3'
  );

-- Criterion D (fallback): no routing event found → use entry agent_id
-- Rationale: if nothing specialized ran, the entry agent is the best guess.
-- Handles: media-gate-ignored turns, early-return handoffs, pre-Phase-42.1 turns.
UPDATE agent_observability_turns
SET responding_agent_id = agent_id
WHERE responding_agent_id IS NULL;
```

**Verification query (Plan 01 must run post-backfill):**

```sql
-- Sanity check: how many rows per (entry_agent_id, responding_agent_id) pair?
SELECT agent_id, responding_agent_id, COUNT(*)
FROM agent_observability_turns
GROUP BY 1, 2
ORDER BY 1, 2;

-- Expected patterns:
--   ('somnio-v3',        'somnio-v3')            -- non-client conversations
--   ('somnio-v3',        'somnio-recompra-v1')   -- client conversations (THE BUG WE'RE FIXING)
--   ('somnio-v2',        'somnio-v2')            -- v1/v2 workspaces
--   ('godentist',        'godentist')            -- godentist workspace
-- Any other pattern = investigate.
```

### 5. Auditor invocation architecture (D-03 + D-13)

**Resolution:**

- **Endpoint:** `POST /api/agent-forensics/audit`
- **Request body:** `{ turnId, startedAt, respondingAgentId, conversationId }` — NO messages array (the auditor prompt is server-assembled).
- **Response:** SSE stream via `streamText().toUIMessageStreamResponse()`.
- **Client:** `useChat({ transport: new DefaultChatTransport({ api: '/api/agent-forensics/audit' }) })`. Button "Auditar sesión" calls `sendMessage('Auditar', { body: {...} })`.
- **Context assembly (server-side, parallel):**
  - `getTurnDetail(turnId, startedAt)` → existing.
  - `loadAgentSpec(respondingAgentId)` → new, reads `src/lib/agent-specs/{id}.md` via `fs.readFile`.
  - `loadSessionSnapshot(conversationId)` → new, queries `session_state` via `createRawAdminClient()`.
  - `condenseTimeline(detail, respondingAgentId)` → new, in-memory filter.
- **Prompt:** assembled in `src/lib/agent-forensics/auditor-prompt.ts` (see Code Examples). System prompt dictates markdown structure; user message includes spec + condensed timeline + snapshot + turn metadata.
- **Model:** `claude-sonnet-4-6` (D-08), `temperature: 0.3`, `maxOutputTokens: 4096`.
- **Auth:** `assertSuperUser()` at the top of `POST`. 403 for anyone else.
- **Rate limit:** none built in (called manually). User awareness via costUsd rendering in panel metadata. Future: reuse Phase 42.1 `pricing.ts` to show cost pre-invocation.
- **No persistence of auditor output** (yet). User copy-pastes to Claude Code. Future enhancement: store to `agent_forensics_audits` table.

**Rendering:**
- Client collects streamed text via `useChat`.
- Render with `<ReactMarkdown remarkPlugins={[remarkGfm]}>{assistantText}</ReactMarkdown>`.
- Wrap in Tailwind `prose prose-sm dark:prose-invert` class for typography.
- "Copiar al portapapeles" button with sonner toast confirmation.

### 6. Structure of parallel new module (D-02)

**Resolution:** NO new top-level route. Everything lives as sub-components of the existing debug panel, with the logic/helpers in `src/lib/agent-forensics/`.

**Rationale:** The user already navigates to a conversation and clicks "Debug bot" to open the panel. Adding a second URL (`/debug/forensics/:sessionId`) fragments the mental model — user would have to copy the conversation ID and go somewhere else. D-02 explicitly says "same route + parallel module"; "parallel module" = parallel code organization, not parallel URL.

**Module structure:**
```
src/lib/agent-forensics/          # business logic (pure, testable)
├── condense-timeline.ts
├── load-agent-spec.ts
├── load-session-snapshot.ts
└── auditor-prompt.ts

src/app/(dashboard)/whatsapp/components/debug-panel-production/
├── index.tsx                     # MODIFY — wrap with Tabs
├── tabs.tsx                      # NEW — 3-tab container
├── forensics-tab.tsx             # NEW — condensed timeline + snapshot + "Auditar" button
├── condensed-timeline.tsx        # NEW — renders CondensedTimelineItem[]
├── session-snapshot.tsx          # NEW — @uiw/react-json-view wrapper
├── auditor-tab.tsx               # NEW — useChat + ReactMarkdown
├── turn-detail.tsx               # UNCHANGED — becomes "Raw" tab
├── turn-list.tsx                 # MODIFY — show respondingAgentId ?? agentId
├── event-row.tsx                 # unchanged
├── ai-call-view.tsx              # unchanged
└── query-view.tsx                # unchanged
```

**Tab order:** `Forensics (default) | Raw | Auditor`. Forensics is default because it's the new 80/20 path. Raw is one click away (preserves existing debugging flow). Auditor is explicit action, last.

### 7. Existing patterns in codebase for markdown + file:line linkification + streaming AI

**Research findings:**

- **Markdown rendering in dashboard:** ABSENT. `grep -rln "react-markdown\|remark\|rehype\|marked\|@uiw/react-md" src` returns EMPTY. `[VERIFIED]` Everything built so far uses plain `<pre>`, `<code>`, or JSX. This phase introduces react-markdown for the first time.
- **file:line linkification:** ABSENT. No existing codebase pattern converts `src/file.ts:42` to clickable link. **Recommendation: do NOT implement clickable links in this phase.** The user pastes to Claude Code (which treats them as searchable paths anyway). Future phase can add VS Code URI deep-linking (`vscode://file/path:line`) if demand arises.
- **Streaming AI responses in dashboard:** PRESENT. Two exemplars:
  - `src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx` + `src/app/api/builder/chat/route.ts`
  - `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx` + `src/app/api/config-builder/templates/chat/route.ts`
  Both use `useChat` + `DefaultChatTransport` + `streamText` + `anthropic('claude-sonnet-4-20250514')`. Auditor follows the SAME pattern, swapping model to `claude-sonnet-4-6` and adding custom body fields.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `react-markdown` npm package | Auditor UI | To install | `^10.1.0` | — |
| `remark-gfm` npm package | Auditor UI | To install | `^4.0.1` | — |
| `@ai-sdk/anthropic` | Auditor API route | ✓ | `^3.0.43` | — |
| `ai` (AI SDK v6) | Auditor API route | ✓ | `^6.0.86` | — |
| `@ai-sdk/react` useChat | Auditor tab | ✓ | `^3.0.88` | — |
| `@uiw/react-json-view` | Session snapshot UI | ✓ | `^2.0.0-alpha.41` | — |
| `ANTHROPIC_API_KEY` env var | Auditor invocation | ✓ (prod) | — | — |
| `MORFX_OWNER_USER_ID` env var | Super-user gate | ✓ (prod) | — | — |
| Node.js runtime for API route | Auditor API route (fs.readFile) | ✓ (Vercel Node) | — | — (Edge runtime would break fs) |
| PostgreSQL 12+ with partition DDL cascading | Plan 01 migration | ✓ (Supabase) | 15 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** react-markdown + remark-gfm (install as part of Plan 04 setup task).

## Validation Architecture

> Included because `.planning/config.json` workflow.nyquist_validation is enabled (default).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 1.6.1 `[VERIFIED: package.json]` |
| Config file | `vitest.config.ts` at project root |
| Quick run command | `npx vitest run <path>` |
| Full suite command | `npm test` (= `vitest run`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-10 | `responding_agent_id` column added + backfill completes | integration (SQL) | Manual SQL verification post-apply (see §4 query) | — |
| D-10 | Collector exposes `setRespondingAgentId` setter | unit | `npx vitest run src/lib/observability/__tests__/collector.responding.test.ts` | ❌ Wave 0 |
| D-10 | `flush.ts` includes `responding_agent_id` in INSERT shape | unit | `npx vitest run src/lib/observability/__tests__/flush.responding.test.ts` | ❌ Wave 0 |
| D-10 | `TurnSummary` type exposes `respondingAgentId` | typecheck | `npx tsc --noEmit` | ✅ (passes) |
| D-10 | `turn-list.tsx` renders `responding_agent_id ?? agent_id` | unit (RTL) | `npx vitest run src/.../debug-panel-production/__tests__/turn-list.test.tsx` | ❌ Wave 0 |
| D-04 | Condensed timeline filter includes the 16 core categories | unit | `npx vitest run src/lib/agent-forensics/__tests__/condense-timeline.test.ts` | ❌ Wave 0 |
| D-04 | Filter excludes queries entirely (D-05) | unit | same as above | ❌ Wave 0 |
| D-06 | `loadSessionSnapshot` returns full `session_state` JSON (no projection) | integration | `npx vitest run src/lib/agent-forensics/__tests__/load-session-snapshot.test.ts` | ❌ Wave 0 |
| D-07 | `loadAgentSpec` resolves all 3 bot IDs, throws for unknown | unit | `npx vitest run src/lib/agent-forensics/__tests__/load-agent-spec.test.ts` | ❌ Wave 0 |
| D-08 | Auditor API route uses `claude-sonnet-4-6` | unit (mock AI SDK) | `npx vitest run src/app/api/agent-forensics/audit/__tests__/route.test.ts` | ❌ Wave 0 |
| D-08 | Auditor API route requires super-user | integration | same as above (403 path) | ❌ Wave 0 |
| D-09 | Auditor response is markdown (no JSON parsing) | smoke | Manual QA post-deploy | — |
| D-13 | Auditor prompt builder includes spec + condensed + snapshot | unit | `npx vitest run src/lib/agent-forensics/__tests__/auditor-prompt.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run <touched-files>` (Vitest picks up related tests via file-path heuristics).
- **Per wave merge:** `npm test` (full suite).
- **Phase gate (`/gsd-verify-work`):** Full suite green + manual smoke test (click "Auditar sesión" on a real recompra turn, verify markdown renders).

### Wave 0 Gaps

Create these test files / fixtures during Plan 01 (unit tests for collector/flush) and Plan 02-04 (tests for new modules). Specifically:

- [ ] `src/lib/observability/__tests__/collector.responding.test.ts` — covers D-10 setter idempotency + second-value-ignore.
- [ ] `src/lib/observability/__tests__/flush.responding.test.ts` — covers D-10 INSERT shape includes `responding_agent_id`.
- [ ] `src/lib/agent-forensics/__tests__/condense-timeline.test.ts` — covers D-04 whitelist + D-05 query exclusion.
- [ ] `src/lib/agent-forensics/__tests__/load-agent-spec.test.ts` — covers D-07 path resolution + unknown throws.
- [ ] `src/lib/agent-forensics/__tests__/load-session-snapshot.test.ts` — covers D-06 no-projection shape.
- [ ] `src/lib/agent-forensics/__tests__/auditor-prompt.test.ts` — covers D-13 prompt assembly.
- [ ] `src/app/api/agent-forensics/audit/__tests__/route.test.ts` — covers D-08 model ID + auth gate.
- [ ] `src/app/(dashboard)/whatsapp/components/debug-panel-production/__tests__/turn-list.test.tsx` — covers `responding_agent_id ?? agent_id` rendering.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth (existing) + super-user gate (`assertSuperUser`) |
| V3 Session Management | yes | Supabase SSR session cookies (existing) |
| V4 Access Control | yes | `MORFX_OWNER_USER_ID` env var check on every server action / API route |
| V5 Input Validation | yes | Zod schemas on auditor API request body (or manual type guards — only 4 fields, all IDs) |
| V6 Cryptography | no (no crypto primitives introduced) | N/A |

### Known Threat Patterns for Next.js 15 + Supabase + AI streaming

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Leaked `ANTHROPIC_API_KEY` to client | Information Disclosure | Server-only usage in API route; never imported from client bundle. Verified pattern in `builder/chat/route.ts`. |
| Non-super-user accesses forensics | Elevation of Privilege | `assertSuperUser()` at top of every server action + API route. Throws 'FORBIDDEN' (403). |
| XSS via auditor markdown output | Tampering | `react-markdown` safe-by-default — no `rehype-raw`, no `dangerouslySetInnerHTML`. |
| Prompt injection via user message triggering unexpected behavior | Tampering | User has no input into auditor prompt (server assembles from spec + telemetry). Only the button "Auditar" triggers — message content ignored. |
| SQL injection via conversationId parameter | Tampering | Supabase client uses parameterized queries always; IDs are UUIDs validated by type. |
| Over-shared PII in auditor context (phone, address, name) | Information Disclosure | Same Anthropic account already processes this data in production agents; no new vector. Documented in README. |
| Unrate-limited Claude calls → cost blowup | Denial of Service (financial) | Manual invocation (D-03); user sees cost per turn in panel metadata. Future: add daily budget cap. |
| Cross-workspace data leak via forged conversationId | Information Disclosure | Super-user already has access to ALL workspaces by design (only one user, the platform owner). No per-workspace tenancy concern. |

## Sources

### Primary (HIGH confidence)

- `src/lib/observability/collector.ts` — class signature, recordEvent API, mergeFrom pattern.
- `src/lib/observability/flush.ts` — INSERT shape (line 110-133), anti-recursion rationale.
- `src/lib/observability/repository.ts` — read API, TurnSummary / TurnDetail types, `createRawAdminClient()` pattern.
- `src/lib/observability/types.ts` — EventCategory union (21 categories), AgentId union.
- `src/lib/agents/production/webhook-processor.ts` — routing branches (recompra at 174-398, v3 at 436-458, godentist at 459-481).
- `src/inngest/functions/agent-production.ts` — collector instantiation (106-115), `__obs` step-boundary merge pattern (300-366).
- `src/lib/agents/somnio-v3/`, `src/lib/agents/somnio-recompra/`, `src/lib/agents/godentist/` — event instrumentation patterns.
- `src/app/(dashboard)/whatsapp/components/debug-panel-production/` — existing UI structure, Server Action pattern, Tailwind class conventions.
- `src/app/actions/observability.ts` — Server Action pattern with `assertSuperUser()`.
- `src/app/api/builder/chat/route.ts` — `streamText` + `toUIMessageStreamResponse` + useChat reference.
- `src/lib/agents/media/sticker-interpreter.ts:80` — `claude-sonnet-4-6` usage confirmation.
- `supabase/migrations/20260408000000_observability_schema.sql` — partitioned-table schema + GRANT pattern.
- `supabase/migrations/20260423142420_recompra_template_catalog_gaps.sql` — recent migration pattern (DO $$ BEGIN IF NOT EXISTS idempotency).
- `package.json` — dependency versions verified.
- `.claude/rules/agent-scope.md` — per-bot scope definitions (primary source for spec consolidation).

### Secondary (MEDIUM confidence)

- [Anthropic Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview) — `claude-sonnet-4-6` confirmed as current Sonnet (Feb 17 2026 release).
- [Claude Sonnet 4.6](https://www.anthropic.com/claude/sonnet) — model identifier and capabilities.
- [Model deprecations - Claude API Docs](https://platform.claude.com/docs/en/about-claude/model-deprecations) — confirms Sonnet 4.6 is not deprecated.
- Next.js 15 docs on `outputFileTracingIncludes` — for including `.md` files in serverless bundle.
- `npm view react-markdown version` → 10.1.0 (verified 2026-04-23).
- `npm view remark-gfm version` → 4.0.1 (verified 2026-04-23).

### Tertiary (LOW confidence)

None — all claims traced to either codebase files or official docs / npm registry.

## Metadata

**Confidence breakdown:**

- **Standard Stack:** HIGH — all versions verified via `npm view` or `package.json`. `claude-sonnet-4-6` in production use already.
- **Architecture Patterns:** HIGH — all patterns mirror existing, shipping code in the codebase (builder/chat streaming, observability read path, super-user auth, partitioned table DDL).
- **Pitfalls:** HIGH — derived from Phase 42.1 RESEARCH.md (same codebase, recent, well-documented) plus fresh inspection of webhook-processor.ts routing branches.
- **Bug fix (D-10 column + backfill):** HIGH on column spec, MEDIUM on backfill criterion completeness (A2). Safety net handles the uncertain cases.
- **Spec file structure (D-07):** MEDIUM — template is proposed; Plan 03 may iterate based on what the auditor actually needs. Intentionally editable.
- **Condensed timeline filter (D-04):** MEDIUM — starting whitelist is educated guess based on event category usage in codebase; expected to iterate.
- **Auditor architecture (D-03 + D-08):** HIGH — mirrors builder/chat + config-builder patterns exactly.
- **Model choice (claude-sonnet-4-6):** HIGH — verified in codebase + Anthropic docs.

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (30 days — stable domain; react-markdown v11 release could shift but 10.x line is stable)

Sources:
- [Models overview - Claude API Docs](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Claude Sonnet 4.6 release page](https://www.anthropic.com/claude/sonnet)
- [Model deprecations - Claude API Docs](https://platform.claude.com/docs/en/about-claude/model-deprecations)
