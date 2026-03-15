---
phase: quick-024
plan: 01
subsystem: sandbox-v3
tags: [sandbox, message-accumulation, interruption, v3-pipeline]
dependency-graph:
  requires: [quick-023]
  provides: [message-accumulation-sandbox-v3]
  affects: [production-inngest-processing]
tech-stack:
  added: []
  patterns: [two-path-post-interruption]
key-files:
  created: []
  modified:
    - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
decisions:
  - id: q024-d1
    decision: "Path A (interruptedAtIndex===0) combines all messages; Path B (>0) keeps last-only behavior"
    why: "Simulates production behavior where fast messages before agent responds are one input"
metrics:
  duration: "5 min"
  completed: "2026-03-15"
---

# Quick 024: Sandbox Message Accumulation v3 Summary

Two-path post-interruption logic: when no templates sent (index 0), combine original + queued as one turn; when templates already sent, process last queued solo.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Two-path post-interruption logic with accumulation | 7b14a9e | sandbox-layout.tsx |

## What Was Done

### Task 1: Two-path post-interruption logic

Modified the post-loop processing block in `handleSendMessage` to implement two distinct paths:

**Path A (interruptedAtIndex === 0 -- no templates sent):**
- Combines original `content` + all queued messages via `[content, ...queued].join('\n')`
- Adds accumulation system note: `[SANDBOX: Mensajes acumulados - N mensaje(s) combinado(s)]`
- Calls `handleSendMessage(combinedContent, { skipAddUser: true })` for re-processing

**Path B (interruptedAtIndex > 0 -- some templates sent):**
- Takes last queued message only (unchanged behavior from quick-023)
- Processes as independent turn

Also differentiated the for-loop interruption system note:
- Index 0: `[SANDBOX: Secuencia interrumpida antes de enviar - acumulando mensajes]`
- Index > 0: `[SANDBOX: Secuencia interrumpida - N template(s) no enviado(s)]`

Added PROD-TRANSLATE comment documenting production equivalent (sentCount === 0 check in Inngest job).

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **Path A combines ALL queued messages** (not just last): When no templates were sent, all accumulated messages represent user's complete thought before agent responded.

## Verification

- TypeScript compiles without errors (only pre-existing vitest type declarations)
- `interruptedAtIndex === 0` pattern exists in sandbox-layout.tsx
- `Mensajes acumulados` system note exists
- PROD-TRANSLATE comment present near two-path block
