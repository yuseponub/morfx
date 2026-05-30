---
phase: v4-hybrid-template-rag-turn
plan: 04
type: execute
wave: 3
depends_on: [03]
files_modified:
  - src/lib/agents/somnio-v4/response-track.ts
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/engine/v4-production-runner.ts
  - src/lib/agents/somnio-v4/__tests__/response-track.test.ts
autonomous: true
requirements: [D-03, T-7, T-8]
must_haves:
  truths:
    - "response-track does NOT emit the template of an intent whose slot is LOW (T-8 — fixes the response-track.ts:90-96 bug that stacks the secondary template without measuring coverage)"
    - "The synthetic RAG pseudo-id 'rag:<topic>' never enters templates_enviados in the runner (T-7) — the canonical RAG record is the ledger kb_topic"
    - "The no-repetition filter (flag OFF by default) does not drop a RAG message for lacking an intent (R4-B)"
  artifacts:
    - path: src/lib/agents/somnio-v4/response-track.ts
      provides: "coverage-gated informational template selection (skip LOW intents)"
    - path: src/lib/agents/engine/v4-production-runner.ts
      provides: "filter rag:* pseudo-ids out of actuallySentIds before persisting templates_enviados"
    - path: src/lib/agents/somnio-v4/__tests__/response-track.test.ts
      provides: "tests that a low-coverage intent's template is skipped"
  key_links:
    - from: somnio-v4-agent.ts (Plan 03)
      to: response-track.ts resolveResponseTrack
      via: "passes per-intent coverage so LOW intents are gated"
      pattern: "primaryCoverage|secondaryCoverage"
    - from: v4-production-runner.ts
      to: templates_enviados (session state)
      via: "actuallySentIds filtered of rag:* before persist"
      pattern: "startsWith('rag:')"
---

<objective>
Close the two composition pitfalls that let the deterministic and generative tracks contaminate each other:
1. T-8 — response-track currently stacks the secondary intent's informational template (`response-track.ts:90-96`) WITHOUT measuring coverage. When a secondary (or primary) intent is LOW, its template must NOT be emitted — that intent escalates to RAG (D-03). This is exactly the bug the phase exists to fix.
2. T-7 — the synthetic RAG message carries a pseudo-id `rag:<topic>`. The runner persists actually-sent template ids to `templates_enviados`; a `rag:*` id must be filtered out (it is not a real template — the canonical RAG record is the ledger `atendido:[{kind:'kb_topic'}]`). R4-B: confirm the no-repetition filter (flag OFF default) does not drop the RAG for lacking an intent.

Purpose: Keep the covered track template-only and the low track RAG-only, with no duplication and no pseudo-id leaking into template bookkeeping.
Output: coverage-gated response-track + runner pseudo-id filter + tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-hybrid-template-rag-turn/CONTEXT.md
@.planning/standalone/v4-hybrid-template-rag-turn/RESEARCH.md
@.planning/standalone/v4-hybrid-template-rag-turn/03-PLAN.md

<interfaces>
Current resolveResponseTrack signature (response-track.ts:43-50):
```ts
export async function resolveResponseTrack(input: {
  salesAction?: TipoAccion; secondarySalesAction?: TipoAccion;
  intent?: string; secondaryIntent?: string;
  state: AgentState; workspaceId: string;
}): Promise<ResponseTrackOutput>
```
The bug (lines 80-98): informational templates are added for `intent` AND `secondaryIntent` if they're in INFORMATIONAL_INTENTS, with NO coverage check. The secondary stacking is at lines 90-96.

Runner persist path (v4-production-runner.ts):
- `actuallySentIds.push(...sentIds)` at line 833 collects sent template ids.
- `templatesEnviados: [...inputTemplatesEnviados, ...actuallySentIds]` at lines 724, 892, and 1076 persists them to session state (all three sites consume `actuallySentIds`).
- No-repetition filter block at 759-804 (flag USE_NO_REPETITION_V4, default OFF) — builds blockForFilter with `intent: output.intentInfo?.intent ?? 'unknown'`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Gate informational templates by per-intent coverage (T-8)</name>
  <read_first>
    - src/lib/agents/somnio-v4/response-track.ts lines 43-98 (signature + the informational stacking bug at 80-98)
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts lines 492-501 (the resolveResponseTrack call site — Plan 03 left it; THIS task adds coverage args)
    - src/lib/agents/somnio-v4/__tests__/response-track.test.ts — this test file does NOT exist yet — CREATE it. Use `src/lib/agents/somnio-v4/response-track.ts` as the source-under-test and copy the TemplateManager mock pattern from an existing v4 test file (e.g. `src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts`) as the mock reference.
  </read_first>
  <behavior>
    - When primaryCoverage==='low', resolveResponseTrack does NOT push `intent` into infoTemplateIntents (it escalates to RAG).
    - When secondaryCoverage==='low', resolveResponseTrack does NOT push `secondaryIntent` into infoTemplateIntents (the bug fix).
    - When coverage is 'covered' (or undefined — back-compat default), the existing behavior is preserved (template emitted).
    - Sales-action templates are NOT affected by coverage (only informational intents are gated — coverage applies to KB-answerable info intents, not sales actions).
  </behavior>
  <action>
(A) Extend the resolveResponseTrack input with two optional coverage params (optional for back-compat with any other caller / tests):
```ts
  intentCoverage?: 'covered' | 'low'
  secondaryCoverage?: 'covered' | 'low'
```
Default-undefined means 'covered' behavior (preserve current logic when not passed).

(B) Gate the informational block (lines 80-98). Wrap the primary info push:
```ts
if (intent && INFORMATIONAL_INTENTS.has(intent) && input.intentCoverage !== 'low') { ...existing primary push... }
```
And the secondary info push (the bug at 90-96):
```ts
if (secondaryIntent && INFORMATIONAL_INTENTS.has(secondaryIntent) && input.secondaryCoverage !== 'low') { ...existing secondary push... }
```
Leave sales-action template resolution (lines 56-72) UNCHANGED — coverage gating applies only to informational intents.

(C) In somnio-v4-agent.ts, pass the coverage from the slot plan to the call site (line 493-501):
```ts
intentCoverage: slotPlan.primary.coverage,
secondaryCoverage: slotPlan.secondary?.coverage,
```
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/response-track.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "input.secondaryCoverage !== 'low'" src/lib/agents/somnio-v4/response-track.ts` returns 1
    - `grep -c "input.intentCoverage !== 'low'" src/lib/agents/somnio-v4/response-track.ts` returns 1
    - `grep -c "intentCoverage: slotPlan.primary.coverage" src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns 1
    - `grep -c "secondaryCoverage: slotPlan.secondary?.coverage" src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns 1
    - A response-track test asserts a low secondary intent's template is absent from infoTemplateIntents
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/response-track.test.ts` exits 0
  </acceptance_criteria>
  <done>Informational templates for LOW intents are skipped; covered/undefined behavior unchanged; sales actions unaffected; the call site passes slot coverage.</done>
</task>

<task type="auto">
  <name>Task 2: Filter rag:* pseudo-ids out of templates_enviados in the runner (T-7) + verify no-rep filter (R4-B)</name>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts lines 751-833 (send block + actuallySentIds.push) and 720-735 + 885-905 + 1070-1080 (the three persist sites that write templatesEnviados)
    - RESEARCH.md §R4 Pitfall R4-A (pseudo-id) + R4-B (no-rep filter)
  </read_first>
  <action>
(A) T-7 — prevent `rag:*` pseudo-ids from being persisted to `templates_enviados`. The cleanest single-point fix: where `sentIds` is computed (line 829-832), exclude pseudo-ids:
```ts
const sentIds = templatesToSend
  .slice(0, sendResult.messagesSent)
  .map(t => t.templateId)
  .filter((id): id is string => id != null && id.length > 0 && !id.startsWith('rag:'))  // T-7: rag:* is not a real template; canonical record is ledger kb_topic
actuallySentIds.push(...sentIds)
```
This keeps the RAG message SENT (we slice before filtering ids), but its pseudo-id never reaches `templates_enviados`. All three persist sites (724, 892, 1076) consume `actuallySentIds`; filtering `rag:*` at the single `sentIds` push (~829-833) covers all three — no separate handling needed at each persist site.

(B) R4-B — verify the no-repetition filter does not drop the RAG. The filter is behind `USE_NO_REPETITION_V4 === 'true'` (default OFF, line 759). The blockForFilter maps every template incl. the rag message with `intent: output.intentInfo?.intent ?? 'unknown'` (line 780). A RAG message has unique generative content so it won't collide on content. To be safe when the flag is ON, add a guard so `rag:*` messages bypass the filter entirely (they are unique by construction):
```ts
// R4-B: rag:* messages are unique generative content; never filter them.
const ragPassthrough = templatesToSend.filter(t => t.templateId.startsWith('rag:'))
const filterable = templatesToSend.filter(t => !t.templateId.startsWith('rag:'))
```
Run the existing filter over `filterable`, then `templatesToSend = [...survivors..., ...ragPassthrough]` preserving order — OR, simpler and order-preserving: after computing `survivingIds`, change the survivor filter to `templatesToSend.filter(t => t.templateId.startsWith('rag:') || survivingIds.has(t.templateId))`. Use the order-preserving one-liner to avoid reordering D-11.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "!id.startsWith('rag:')" src/lib/agents/engine/v4-production-runner.ts` returns 1 (T-7 filter at sentIds)
    - `grep -c "t.templateId.startsWith('rag:') || survivingIds.has" src/lib/agents/engine/v4-production-runner.ts` returns 1 (R4-B passthrough, order-preserving)
    - `grep -c "templates_enviados\|templatesEnviados" src/lib/agents/engine/v4-production-runner.ts` shows the persist sites still consume actuallySentIds (unchanged count from baseline)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>rag:* pseudo-ids are excluded from templates_enviados; the RAG message is still sent; no-rep filter (when ON) never drops a rag:* message.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Synthetic pseudo-id → session state persistence | A non-template id could pollute template-dedup state for future turns |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v4hy-07 | Tampering | templates_enviados | mitigate | T-7 filter excludes `rag:*` at the sentIds push; canonical RAG record is ledger kb_topic |
| T-v4hy-08 | Information disclosure | duplicated answer (template+RAG on same intent) | mitigate | T-8 gate: a LOW intent's template is suppressed so only RAG answers it (no duplication) |
</threat_model>

<verification>
- response-track skips LOW intents' templates; covered behavior unchanged.
- rag:* never in templates_enviados; RAG still sent.
- no-rep filter passthrough for rag:*.
- tsc clean.
</verification>

<success_criteria>
- T-8: LOW intent template gated (the response-track.ts:90-96 bug fixed).
- T-7: rag:* excluded from templates_enviados.
- R4-B: no-rep filter preserves rag:* messages.
- response-track tests + tsc green.
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-hybrid-template-rag-turn/04-SUMMARY.md`
</output>
