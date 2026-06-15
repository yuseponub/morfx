---
phase: v4-llm-fallback-resilience
plan: "02"
subsystem: shared-alerts
tags: [alerts, resend, llm-fallback, dedup, fail-soft, operator-email]
dependency_graph:
  requires:
    - src/lib/agents/_shared/alerts.ts (existing Resend infra, RECIPIENT, dedup Map)
    - src/lib/domain/workspace-settings.ts (getWorkspaceName — added here)
    - src/lib/domain/platform-config.ts (getFromAddress — existing)
  provides:
    - sendLLMCreditsDepletedAlert (Plan 03 consumer: billing branch in index.ts)
    - sendBothProvidersDownAlert (Plan 03 consumer: double-fail branch in index.ts)
    - getWorkspaceName domain accessor (general purpose workspace name lookup)
  affects:
    - src/lib/agents/somnio-v4/llm-fallback/index.ts (Plan 03 — will call both funcs)
tech_stack:
  added: []
  patterns:
    - Resend fire-and-forget fail-soft pattern (existing in alerts.ts)
    - Global dedup key (per-provider, NOT per-workspace) for alert storms
    - Private resolveWorkspaceName helper (Regla 3: domain accessor only, no createAdminClient in alerts.ts)
key_files:
  created:
    - src/lib/agents/_shared/__tests__/alerts-llm.test.ts
  modified:
    - src/lib/agents/_shared/alerts.ts
    - src/lib/domain/workspace-settings.ts
decisions:
  - "Domain accessor getWorkspaceName added to workspace-settings.ts (Regla 3 — no createAdminClient directly in alerts.ts)"
  - "Dedup key global by provider (llm_credits:gemini / both_down) not per-workspace so 1 email/outage regardless of workspace count (D-03, T-fb-03)"
  - "Tasks 1+2 committed together (implementation cohesive), Task 3 (tests) in separate commit"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-14"
  tasks: 3
  files: 3
---

# Phase v4-llm-fallback-resilience Plan 02: LLM Alert Functions Summary

**One-liner:** Two severity-distinct (NORMAL/CRITICAL), globally-deduped, fail-soft operator-email functions added to `_shared/alerts.ts` using existing Resend infra, with workspace name via `getWorkspaceName` domain accessor.

## What Was Built

### Domain accessor (new)
`src/lib/domain/workspace-settings.ts` — added `getWorkspaceName(workspaceId: string): Promise<string | null>` using `createAdminClient()` + `.from('workspaces').select('name').eq('id', workspaceId).single()`. This is the domain layer chokepoint (Regla 3).

### alerts.ts additions
`src/lib/agents/_shared/alerts.ts` extended with:

1. **Import:** `import { getWorkspaceName } from '@/lib/domain/workspace-settings'`

2. **`resolveWorkspaceName(workspaceId: string | undefined): Promise<string>`** — private fail-soft helper. Falls back to `workspaceId` string or `'unknown'` on any lookup failure.

3. **`sendLLMCreditsDepletedAlert(ctx: LLMCreditsAlertCtx): Promise<void>`** (D-07a, NORMAL):
   - Dedup key: `'llm_credits:gemini'` (global by provider, not per-workspace)
   - Subject: `[v4 LLM] Gemini sin créditos — bot VIVO con Haiku — ws <short_id>`
   - Body: workspace name+id, callSite, recharge instructions, 15-min dedup note

4. **`sendBothProvidersDownAlert(ctx: BothProvidersDownCtx): Promise<void>`** (D-07b, CRITICAL):
   - Dedup key: `'both_down'` (separate from credits — can fire in same 15-min window)
   - Subject: `🔴 CRÍTICO [v4 LLM] AMBOS proveedores caídos — bot NO responde — ws <short_id>`
   - Body: workspace name+id, callSite, err.name for both providers (T-fb-01: no user content), remediation steps

Both functions copy the exact `sendRunawayAlert` pattern: dedup check → set timestamp → `getResendClient()` null-guard (warn+return if key absent) → try/catch fail-silent around `client.emails.send`.

### Test file (new)
`src/lib/agents/_shared/__tests__/alerts-llm.test.ts` — 12 tests / 6 groups:
- (a) fail-soft: RESEND_API_KEY unset → no throw, no send (both functions)
- (b) global dedup: 2 calls → `emails.send` called exactly once (both functions)
- (c) separate keys: `both_down` fires after `llm_credits:gemini` (distinct dedup buckets)
- (d) subject severity: credits = no "CRÍTICO"; both-down = contains "CRÍTICO" + "AMBOS"
- (e) workspace name in body (D-03): mock `getWorkspaceName` returns "Somnio Workspace" → appears in text
- (f) T-fb-01: no `ctx.message/body/userMessage` patterns in email bodies

## Deviations from Plan

None — plan executed exactly as written.

Minor note: `getWorkspaceName` was added to `workspace-settings.ts` (existing domain file) rather than creating a new domain file, since it naturally fits next to other workspace-level read functions. This is within the plan's guidance ("add a small private async helper in alerts.ts using the domain layer") — the domain function is the accessor; the private helper in alerts.ts calls it.

## Self-Check

### Created files exist:
- `src/lib/agents/_shared/__tests__/alerts-llm.test.ts` — FOUND
- `src/lib/domain/workspace-settings.ts` (modified) — FOUND
- `src/lib/agents/_shared/alerts.ts` (modified) — FOUND

### Commits exist:
- `5251912a` — feat: implementation (alerts.ts + workspace-settings.ts)
- `0664d985` — test: 12/12 pass

### Acceptance criteria verified:
- `resolveWorkspaceName` in alerts.ts: PASS
- No `createAdminClient`/`@supabase/supabase-js` in alerts.ts: PASS (count=0, Regla 3)
- Both functions exported: PASS
- Global dedup keys present: `'llm_credits:gemini'` + `'both_down'`: PASS
- RECIPIENT count = 1: PASS
- `if (!client)` count >= 3: PASS (count=4)
- T-fb-01 no `ctx.message/body/userMessage/text`: PASS
- Test fail-soft check: PASS
- Test dedup check (toHaveBeenCalledTimes): PASS
- `npx vitest run`: 12/12 PASS
- `npx tsc --noEmit`: exit 0

## Self-Check: PASSED

All files present, all commits exist, all acceptance criteria pass, tests green, TSC clean.
