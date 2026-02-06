---
phase: 13-agent-engine-core
plan: 03
subsystem: api
tags: [anthropic, claude-sdk, token-budget, streaming, tool-use]

# Dependency graph
requires:
  - phase: 13-01
    provides: Agent types, error classes, TokenUsage interface
  - phase: 12
    provides: Tool registry with registered CRM and WhatsApp handlers
provides:
  - ClaudeClient with detectIntent, orchestrate, streamResponse methods
  - TokenBudgetManager with budget tracking and enforcement
  - Tool name conversion between Action DSL (dots) and Claude (underscores)
affects: [13-04, 13-05, 14-agente-ventas-somnio]

# Tech tracking
tech-stack:
  added: [@anthropic-ai/sdk]
  patterns: [claude-api-wrapper, token-budget-enforcement]

key-files:
  created:
    - src/lib/agents/claude-client.ts
    - src/lib/agents/token-budget.ts
  modified:
    - src/lib/agents/types.ts
    - src/lib/agents/index.ts
    - package.json

key-decisions:
  - "Using claude-sonnet-4-5 for both models until Haiku 4.5 is available"
  - "Tool names converted: dots to underscores for Claude API, underscores to dots for Action DSL"
  - "TokenUsage simplified to totalTokens instead of split input/output"

patterns-established:
  - "ClaudeApiError wrapping: All SDK errors wrapped with status code and error type"
  - "Intent parsing fallback: JSON extraction with unknown intent fallback if parsing fails"
  - "Budget check before execution: checkBudget before Claude calls, recordUsage after"

# Metrics
duration: 15min
completed: 2026-02-06
---

# Phase 13 Plan 03: Claude Client & Token Budget Summary

**Claude API client with intent detection, tool use orchestration, and streaming plus token budget manager enforcing 50K limit per conversation**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-06T02:51:53Z
- **Completed:** 2026-02-06T03:07:18Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- ClaudeClient wrapping @anthropic-ai/sdk with detectIntent, orchestrate, streamResponse methods
- Automatic tool name conversion between Action DSL dot notation and Claude underscore notation
- TokenBudgetManager tracking and enforcing 50K token budget per session
- Intent JSON parsing with graceful fallback to unknown intent

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Anthropic SDK and create Claude Client** - `03c9dae` (feat)
2. **Task 2: Create Token Budget Manager** - `53d2f37` (feat)

## Files Created/Modified
- `src/lib/agents/claude-client.ts` - ClaudeClient class with Claude API integration
- `src/lib/agents/token-budget.ts` - TokenBudgetManager for budget tracking/enforcement
- `src/lib/agents/types.ts` - Updated TokenUsage interface (totalTokens instead of split)
- `src/lib/agents/index.ts` - Added exports for ClaudeClient and TokenBudgetManager
- `package.json` - Added @anthropic-ai/sdk dependency

## Decisions Made
- **Model mapping:** Using claude-sonnet-4-5 for both claude-haiku-4-5 and claude-sonnet-4-5 until Haiku 4.5 becomes available
- **TokenUsage simplification:** Changed from totalInputTokens/totalOutputTokens to single totalTokens field since agent_turns table stores combined tokens_used
- **Tool name conversion:** bidirectional conversion (actionDslToClaudeName and claudeToActionDslName) for compatibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] npm install failing due to package-lock.json corruption**
- **Found during:** Task 1 (Install Anthropic SDK)
- **Issue:** npm install failing with "Cannot read properties of null (reading 'matches')" error
- **Fix:** Used pnpm instead of npm to install @anthropic-ai/sdk
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** Package installed successfully, visible in package.json
- **Committed in:** 03c9dae (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal - used alternative package manager, same end result.

## Issues Encountered
- npm package-lock.json corruption prevented npm install - resolved by using pnpm which already existed in the project

## User Setup Required

**External services require manual configuration.** The Anthropic API key needs to be configured:

- **Environment variable:** `ANTHROPIC_API_KEY`
- **Source:** Anthropic Console -> API Keys -> Create Key
- **Verification:** ClaudeClient will use this key automatically from process.env

## Next Phase Readiness
- ClaudeClient ready for use in Agent Engine (Plan 04)
- TokenBudgetManager ready for integration with session processing
- Tool definitions can be built from registered Action DSL tools

---
*Phase: 13-agent-engine-core*
*Completed: 2026-02-06*
