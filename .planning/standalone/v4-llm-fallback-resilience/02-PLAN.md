---
phase: v4-llm-fallback-resilience
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/_shared/alerts.ts
  - src/lib/agents/_shared/__tests__/alerts-llm.test.ts
autonomous: true
requirements: [D-03, D-06, D-07]
user_setup:
  - service: resend
    why: "Operator email alerts on Gemini credits depletion (normal) and both-providers-down (critical). Fail-soft: absent key = warning only, turn unaffected."
    env_vars:
      - name: RESEND_API_KEY
        source: "resend.com/api-keys → set in Vercel (Sensitive). Gotcha: Vercel pulls Sensitive vars empty — verify >0 chars; redeploy after set."

must_haves:
  truths:
    - "sendLLMCreditsDepletedAlert sends a NORMAL-severity email naming workspace id + name, deduped GLOBALLY by provider (key llm_credits:gemini)"
    - "sendBothProvidersDownAlert sends a CRITICAL-severity email naming workspace id + name, deduped GLOBALLY (key both_down)"
    - "Both functions are fail-soft: absent RESEND_API_KEY logs a warning and returns without throwing"
    - "Neither function nor email body contains user message content or API keys (T-fb-01)"
    - "Workspace NAME is resolved inside alerts.ts (Regla 3 — domain lookup lives here, not in the fallback)"
  artifacts:
    - path: "src/lib/agents/_shared/alerts.ts"
      provides: "sendLLMCreditsDepletedAlert + sendBothProvidersDownAlert"
      contains: "sendLLMCreditsDepletedAlert"
    - path: "src/lib/agents/_shared/__tests__/alerts-llm.test.ts"
      provides: "dedup + fail-soft + severity coverage"
  key_links:
    - from: "index.ts orchestrator (Plan 03)"
      to: "sendLLMCreditsDepletedAlert / sendBothProvidersDownAlert"
      via: "void import-and-call from the billing branch / double-fail branch"
      pattern: "sendLLMCreditsDepletedAlert"
    - from: "alerts.ts"
      to: "workspace name"
      via: "domain lookup by workspaceId"
      pattern: "getWorkspace|workspaces"
---

<objective>
Add two operator-email functions to the EXISTING `_shared/alerts.ts` (Resend already wired, RECIPIENT already correct, dedup Map + fail-silent already present): `sendLLMCreditsDepletedAlert` (D-07a NORMAL) and `sendBothProvidersDownAlert` (D-07b CRITICAL). Dedup key is GLOBAL by provider, not per-workspace (one email per outage). Workspace name is resolved here via a domain lookup (Regla 3), workspace id+name go in the BODY (D-03).

Purpose: D-03/D-06/D-07 — report Gemini credits depletion + both-providers-down to the operator with two clearly distinct severities, fail-soft so a turn Haiku already saved is never affected.
Output: extended `alerts.ts` + a dedicated test file.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-llm-fallback-resilience/CONTEXT.md
@.planning/standalone/v4-llm-fallback-resilience/RESEARCH.md

<interfaces>
<!-- Existing alerts.ts assets to REUSE verbatim. From src/lib/agents/_shared/alerts.ts. -->
```typescript
const RECIPIENT = 'joseromerorincon041100@gmail.com'   // line 36 — matches D-03 exactly, REUSE
function getResendClient(): Resend | null              // lazy; returns null if RESEND_API_KEY unset (fail-soft)
async function getFromAddress(): Promise<string>       // platform_config.crm_bot_alert_from ?? 'onboarding@resend.dev'
const DEDUPE_MS = 15 * 60 * 1000
const lastSent = new Map<string, number>()             // dedup; key convention `{kind}:{...}`
const logger = createModuleLogger('crm-bot-alerts')
import { getPlatformConfig } from '@/lib/domain/platform-config'  // domain already imported here
export function __resetAlertDedupeForTests(): void     // test-only; clears lastSent
```
Existing send pattern (sendRunawayAlert lines 86-117): check dedup → set timestamp → getResendClient() (null → logger.warn + return) → try client.emails.send({ from, to: RECIPIENT, subject, text }) catch → logger.error fail-silent.
</interfaces>

<!-- Find the workspace-name domain lookup the executor must use (Regla 3): -->
<!-- run: grep -rn "export.*function get.*Workspace\|from('workspaces')" src/lib/domain/ | head -->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Resolve workspace name via domain lookup helper</name>
  <read_first>
    - src/lib/agents/_shared/alerts.ts (top imports + getFromAddress — domain import pattern already present)
    - CLAUDE.md Regla 3 (domain layer — alerts.ts is the right place for the lookup, NOT the fallback)
  </read_first>
  <action>
    First locate the existing workspace-name domain accessor:
    `grep -rn "function get.*Workspace\|from('workspaces')\|workspaces.*name" src/lib/domain/ | head`.
    If a domain function returning a workspace name by id exists, import and use it. If NONE exists, add a small private async helper in alerts.ts using the domain layer (NOT createAdminClient directly inside alerts.ts unless that is the established pattern in this file's neighbors — prefer an existing `@/lib/domain/*` accessor). The helper signature:
    ```typescript
    async function resolveWorkspaceName(workspaceId: string | undefined): Promise<string> {
      if (!workspaceId) return 'unknown'
      try {
        // use the domain accessor found above; return name ?? workspaceId
      } catch { return workspaceId } // fail-soft: never let name resolution break the email
    }
    ```
    Keep it fail-soft (a lookup failure must NOT prevent the alert). Cache is optional (the alert path is rare).
  </action>
  <verify>
    <automated>grep -q "resolveWorkspaceName" src/lib/agents/_shared/alerts.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "resolveWorkspaceName" src/lib/agents/_shared/alerts.ts` exits 0
    - NO direct supabase client in alerts.ts: `grep -c "createAdminClient\|@supabase/supabase-js" src/lib/agents/_shared/alerts.ts` returns 0 (Regla 3 — use domain accessor)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>A fail-soft workspace-name resolver exists in alerts.ts using the domain layer.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: sendLLMCreditsDepletedAlert (NORMAL) + sendBothProvidersDownAlert (CRITICAL)</name>
  <read_first>
    - src/lib/agents/_shared/alerts.ts (sendRunawayAlert as the exact molde to copy)
    - .planning/standalone/v4-llm-fallback-resilience/RESEARCH.md §Q1 / §Q5 (dedup key GLOBAL by provider, NOT per-workspace)
  </read_first>
  <behavior>
    - sendLLMCreditsDepletedAlert called twice within 15min → only ONE email send (global dedup key `llm_credits:gemini`)
    - sendBothProvidersDownAlert uses a SEPARATE dedup key `both_down` → can fire even if a credits alert just fired
    - With RESEND_API_KEY unset → getResendClient() returns null → logger.warn + return, NO throw
    - Email body contains workspace id AND resolved name AND callSite — NEVER user message content or any API key
    - Subjects clearly distinguish severity (NORMAL "bot vivo con Haiku" vs CRÍTICO "ambos proveedores caídos")
  </behavior>
  <action>
    Add two exported async functions to alerts.ts, each copying sendRunawayAlert's structure (dedup check → set → getResendClient null-guard → try send catch fail-silent).

    Context interfaces:
    ```typescript
    export interface LLMCreditsAlertCtx { workspaceId: string | undefined; provider: 'gemini'; callSite: string }
    export interface BothProvidersDownCtx {
      workspaceId: string | undefined; callSite: string; geminiError: string; anthropicError: string
    }
    ```

    `sendLLMCreditsDepletedAlert` (D-07a, NORMAL):
    - Dedup key: `const key = 'llm_credits:gemini'` (GLOBAL — provider-level, NOT including workspaceId; RESEARCH Q1/Q5). One email per outage.
    - Resolve `const wsName = await resolveWorkspaceName(ctx.workspaceId)`.
    - Subject: `[v4 LLM] Gemini sin créditos — bot VIVO con Haiku — ws ${(ctx.workspaceId ?? 'unknown').slice(0, 8)}`
    - Body (text array joined by \n): explain Gemini credits depleted; bot still alive via Haiku; `Workspace: ${wsName} (${ctx.workspaceId ?? 'unknown'})`; `Call-site: ${ctx.callSite}`; recharge action ("recargar créditos de Gemini en la consola — desbloquea sin deploy"); dedup note "próximo aviso en 15 min".
    - errorCode/provider only — NO error message strings beyond err.name passed by caller (caller passes err.name, never the user message — T-fb-01).

    `sendBothProvidersDownAlert` (D-07b, CRITICAL):
    - Dedup key: `const key = 'both_down'` (GLOBAL separate key).
    - Resolve wsName.
    - Subject: `🔴 CRÍTICO [v4 LLM] AMBOS proveedores caídos — bot NO responde — ws ${(ctx.workspaceId ?? 'unknown').slice(0, 8)}`
    - Body: explain Gemini AND Haiku both failed; bot cannot respond; handoff suggested for a human; `Workspace: ${wsName} (${ctx.workspaceId ?? 'unknown'})`; `Call-site: ${ctx.callSite}`; `Gemini error: ${ctx.geminiError}`; `Anthropic error: ${ctx.anthropicError}` (these are err.name values, NOT user content — caller MUST pass err.name only).
    - Same fail-silent try/catch + logger pattern.

    Both functions: fire-and-forget contract (caller uses `void`), NEVER throw (the catch swallows + logs). Add a doc comment on each citing D-03/D-06/D-07 + "fail-soft: turn already saved by Haiku must never be affected (Pitfall #5 RESEARCH)".
  </action>
  <verify>
    <automated>grep -q "sendLLMCreditsDepletedAlert" src/lib/agents/_shared/alerts.ts && grep -q "sendBothProvidersDownAlert" src/lib/agents/_shared/alerts.ts && grep -q "'llm_credits:gemini'" src/lib/agents/_shared/alerts.ts && grep -q "'both_down'" src/lib/agents/_shared/alerts.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - both functions exported: `grep -q "export async function sendLLMCreditsDepletedAlert" src/lib/agents/_shared/alerts.ts && grep -q "export async function sendBothProvidersDownAlert" src/lib/agents/_shared/alerts.ts`
    - GLOBAL dedup keys present (no workspaceId interpolation in either key): `grep -q "= 'llm_credits:gemini'" src/lib/agents/_shared/alerts.ts && grep -q "= 'both_down'" src/lib/agents/_shared/alerts.ts`
    - RECIPIENT reused (not redefined): `grep -c "joseromerorincon041100@gmail.com" src/lib/agents/_shared/alerts.ts` returns exactly 1
    - fail-soft null-guard present in both new funcs (getResendClient null → return): `grep -c "if (!client)" src/lib/agents/_shared/alerts.ts` returns >= 3 (runaway + approaching + 2 new = at least 3; existing 2 + new 2 = 4)
    - T-fb-01: no obvious user-content interpolation — manual grep that bodies use only wsName/workspaceId/callSite/err.name fields (no `ctx.message`, no `body`, no `userMessage`): `grep -E "ctx\.(message|body|userMessage|text)\b" src/lib/agents/_shared/alerts.ts` returns nothing
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Two severity-distinct, globally-deduped, fail-soft alert functions exist reusing the existing Resend infra; T-fb-01 respected.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Tests — dedup, fail-soft, two severities</name>
  <read_first>
    - src/lib/agents/_shared/alerts.ts (the __resetAlertDedupeForTests helper + getResendClient)
    - existing alerts tests if any: run `ls src/lib/agents/_shared/__tests__/ 2>/dev/null`
  </read_first>
  <behavior>
    - With RESEND_API_KEY unset: sendLLMCreditsDepletedAlert resolves without throwing AND no send attempted (mock logger.warn called).
    - With a mocked Resend client: calling sendLLMCreditsDepletedAlert twice in a row → emails.send called ONCE (global dedup).
    - sendBothProvidersDownAlert with a separate key still sends once after a credits alert.
    - The email subject/text for credits is NORMAL wording; for both-down is CRITICAL wording.
  </behavior>
  <action>
    Create `src/lib/agents/_shared/__tests__/alerts-llm.test.ts`. Mock `resend` (vi.mock) so `new Resend(...).emails.send` is a spy, OR mock the module-level getResendClient via dependency on `process.env.RESEND_API_KEY`. Set `process.env.NODE_ENV='test'` and call `__resetAlertDedupeForTests()` in beforeEach. Mock `@/lib/domain/platform-config` getPlatformConfig + the workspace-name domain accessor so no real DB is hit. Assert: (a) fail-soft path (no key → no throw, no send); (b) global dedup (2 calls → 1 send) with key set; (c) both-down sends after credits (separate key); (d) subject strings differ by severity (`expect(sentArgs.subject).toContain('Gemini sin créditos')` vs `toContain('CRÍTICO')`).
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/_shared/__tests__/alerts-llm.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/_shared/__tests__/alerts-llm.test.ts` exits 0
    - test asserts fail-soft (no throw with key unset): `grep -qi "resolves\|not.*throw\|RESEND_API_KEY" src/lib/agents/_shared/__tests__/alerts-llm.test.ts`
    - test asserts global dedup (one send for two calls): `grep -qi "toHaveBeenCalledTimes(1)\|once" src/lib/agents/_shared/__tests__/alerts-llm.test.ts`
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Dedup + fail-soft + severity tests pass; no real DB/Resend hit.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Fallback caller → alerts.ts | Caller passes metadata only; alerts.ts must not log/email secrets or user content |
| alerts.ts → operator inbox | Email is external egress; body must carry ONLY metadata |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fb-01 | Information disclosure | email body | mitigate | Body uses only wsName/workspaceId/callSite/err.name; grep acceptance forbids ctx.message/body/userMessage. Caller (Plan 03) passes err.name only. |
| T-fb-03 | Denial of service (alert storm) | dedup map | mitigate | GLOBAL provider-level dedup key (1 email/outage) + 15min TTL; acceptance grep verifies no per-workspace key. |
| T-fb-04 | Availability (turn break) | fail-soft contract | mitigate | Absent key → warn+return; all sends wrapped in try/catch swallow; functions never throw (fire-and-forget). |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/_shared/__tests__/alerts-llm.test.ts` exits 0
- `npx tsc --noEmit` exits 0
- Regla 6: only `_shared/alerts.ts` + its test touched (shared infra, not another agent's behavior).
</verification>

<success_criteria>
Two severity-distinct, globally-deduped, fail-soft operator-email functions reuse the existing Resend infra; workspace name resolved via domain; T-fb-01 enforced; tests green.
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-llm-fallback-resilience/02-SUMMARY.md`
</output>
