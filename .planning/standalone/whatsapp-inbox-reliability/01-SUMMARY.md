---
phase: standalone-whatsapp-inbox-reliability
plan: 01
subsystem: whatsapp-inbox
tags: [whatsapp, inbox, hydration, initials, grapheme, intl-segmenter, react-418]

# Dependency graph
requires: []
provides:
  - "Grapheme-safe shared util src/lib/utils/initials.ts (firstGrapheme + getInitials)"
  - "9 avatar call sites migrated off UTF-16 indexing (charAt(0)/n[0]) — eliminates the React #418 hydration class"
affects: [whatsapp-inbox-reliability plan 02, whatsapp-inbox-reliability plan 03, any future avatar/initials call site]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Grapheme-safe initials via module-scope Intl.Segmenter('es') singleton + Array.from fallback — never index UTF-16 over names"
    - "Shared util replaces N local getInitials copies (one import away for future modules)"

key-files:
  created:
    - src/lib/utils/initials.ts
    - src/lib/utils/__tests__/initials.test.ts
  modified:
    - src/app/(dashboard)/whatsapp/components/conversation-item.tsx
    - src/app/(dashboard)/whatsapp/components/chat-header.tsx
    - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
    - src/app/(dashboard)/tareas/components/task-card.tsx
    - src/app/(dashboard)/settings/workspace/members/members-content.tsx
    - src/components/layout/sidebar.tsx
    - src/components/layout/user-menu.tsx
    - src/components/workspace/workspace-switcher.tsx
    - src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-members-manager.tsx

key-decisions:
  - "Used verbatim-canonical util from RESEARCH.md Q8 (Intl.Segmenter singleton + Array.from fallback), no default export per phone.ts convention"
  - "members-content email initials: kept local 2-char intent but made grapheme-safe via two firstGrapheme calls (was email.slice(0,2) — also surrogate-unsafe)"
  - "day-separator.tsx charAt(0) left untouched — operates on an es-CO day-of-week LABEL, not a name/avatar; not in D-11 inventory, no surrogate risk"

patterns-established:
  - "Pattern: grapheme-safe text-leading extraction — module-scope Intl.Segmenter singleton + early-return purity"
  - "Pattern: per-site empty-name visual fallback preserved (U/W/A/?) by appending `|| 'X'` after firstGrapheme(...).toUpperCase()"

requirements-completed: [F-2, D-10, D-11, D-12]

# Metrics
duration: 18min
completed: 2026-06-11
---

# Standalone whatsapp-inbox-reliability Plan 01: Grapheme-safe Initials (F-2) Summary

**Killed the React #418 hydration crash class by replacing UTF-16 indexing (charAt(0)/n[0]) in initials/avatar rendering with one shared Intl.Segmenter-based util imported by all 9 D-11 call sites.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-11T10:18Z (approx)
- **Completed:** 2026-06-11T10:36Z (approx)
- **Tasks:** 2 automated (Task 3 is a blocking robot checkpoint — NOT executed by this sequential executor)
- **Files modified:** 9 migrated + 2 created = 11

## Accomplishments
- Created `src/lib/utils/initials.ts` — `firstGrapheme` + `getInitials`, module-scope `Intl.Segmenter('es', { granularity: 'grapheme' })` singleton with `Array.from` fallback, no default export (matches `phone.ts` sibling convention).
- 15-test vitest suite green: emoji (😎), astral (𝙴), ZWJ family (👨‍👩‍👧), empty/null/undefined/whitespace, single/two/multi-word.
- Migrated all 9 D-11 avatar call sites off UTF-16 indexing; deleted 2 local `getInitials` copies (conversation-item — the #418-active site — and task-card).
- Each migrated site preserves its existing empty-name visual fallback (`U` / `W` / `A` / `?`).
- `npx tsc --noEmit` → 0 errors (no NEW errors introduced).

## Task Commits

Each task was committed atomically (only my files staged — concurrent session active in repo):

1. **Task 1: Grapheme-safe initials util + vitest suite** — `8df31cc3` (feat)
2. **Task 2: Migrate 9 D-11 call sites to the shared util** — `240a546a` (feat)

**Plan metadata:** (this SUMMARY commit follows)

_Task 3 (robot probe418 ×3 + grep gate + push) is `type: checkpoint:human-verify`, gate="blocking" — NOT executed here. See "Checkpoint Reached" below. The Wave 1 push is owned by plan 03, after plans 01+02+03 automated tasks pass their gates._

## Files Created/Modified
- `src/lib/utils/initials.ts` — Grapheme-safe `firstGrapheme` (first user-perceived grapheme) + `getInitials` (up to 2 word-initials, uppercased).
- `src/lib/utils/__tests__/initials.test.ts` — 15 edge-case tests.
- `conversation-item.tsx` — deleted local `getInitials` (used `n[0]||''`, the #418 source); imports shared `getInitials`.
- `chat-header.tsx` — 2 single-char avatar sites: `displayName.charAt(0).toUpperCase()` → `firstGrapheme(displayName).toUpperCase()`.
- `contact-panel.tsx` — inline `.split(' ').slice(0,2).map(n=>n[0]||'')` → `getInitials(fichaName)`.
- `task-card.tsx` — deleted local `getInitials` (used `parts[0]![0]!`); imports shared `getInitials` (call site already passes `?? '?'` fallback).
- `members-content.tsx` — `email.slice(0,2)` → two `firstGrapheme` calls (grapheme-safe 2-char email initials).
- `sidebar.tsx` — 3 sites: `user.email?.charAt(0).toUpperCase() || 'U'` → `firstGrapheme(user.email ?? '').toUpperCase() || 'U'`.
- `user-menu.tsx` — `user.email.charAt(0).toUpperCase()` → `firstGrapheme(user.email).toUpperCase() || 'U'`.
- `workspace-switcher.tsx` — `displayWorkspace.name?.charAt(0).toUpperCase() || 'W'` → `firstGrapheme(...).toUpperCase() || 'W'`.
- `team-members-manager.tsx` — `(name||email||'A').charAt(0).toUpperCase()` → `firstGrapheme(name||email||'A').toUpperCase() || 'A'`.

## Decisions Made
- **Verbatim util:** Used the RESEARCH.md Q8 canonical implementation byte-for-byte (no paraphrase), per plan instruction.
- **members-content:** Plan text described `email.split('@')[0][0]` but the actual code was `email.slice(0, 2)`. Preserved the real intent (2 leading chars of email) while making it grapheme-safe via `firstGrapheme(email) + firstGrapheme(email.slice(first.length))`. Net behavior identical for ASCII emails, now surrogate-safe.
- **day-separator.tsx:** Two `charAt(0)` matches remain in this file. They capitalize an es-CO day-of-week LABEL (e.g. "lunes" → "Lunes"), not a user-controlled name, and the file is NOT in the D-11 avatar inventory. No surrogate/hydration risk → deliberately left untouched (out of scope, matches the plan's avatar-component-scoped grep gate).

## Deviations from Plan

None requiring deviation rules — all changes were planned migrations. One clarification (members-content code differed from the plan's line description) was resolved by preserving the real behavior grapheme-safely; documented above under Decisions.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None — plan executed as written; the members-content nuance preserves existing behavior.

## Issues Encountered
- The repo has a concurrent Claude session committing in parallel. A `contacts-table.tsx` change from that session interleaved between my two commits; verified my own commits contain ONLY my staged files (`git show --name-only` per commit). No `git add -A`/`.` used.

## Verification Status
- `npx vitest run src/lib/utils/__tests__/initials.test.ts` → **15/15 pass**.
- `grep charAt(0)` in avatar components (whatsapp / tareas/task-card / layout / workspace) → **0** (excluding day-separator date-label, out of scope).
- `grep "function getInitials"` in conversation-item + task-card → **0** (local copies deleted).
- All 9 files import `from '@/lib/utils/initials'` → **OK**.
- `npx tsc --noEmit` → **0 errors** (no NEW errors).
- robot `probe418` ×3 (D-12) → **PENDING** — this is Task 3's blocking checkpoint, run by the orchestrator's Wave 1 robot gate.

## Checkpoint Reached

**Task 3** (`checkpoint:human-verify`, gate="blocking") is the F-2 verification gate: start dev server on :3020, run `probe418` ×3 expecting 0 hydration pageerrors, run the grep gate, run vitest. This sequential executor does NOT run the robot or push — per the orchestrator's instruction, the Wave 1 robot gate runs after plans 01+02+03 automated tasks complete, and the Wave 1 push lives in plan 03. Automated tasks (T1, T2) are committed and green.

## Next Phase Readiness
- Shared util is in place; plans 02/03 (Wave 1) can proceed independently.
- The #418 root cause is structurally removed (no UTF-16 name indexing in avatar SSR output). Robot `probe418` ×3 must confirm 0 hydration errors before the Wave 1 push (plan 03).

## Self-Check: PASSED
- `src/lib/utils/initials.ts` — FOUND
- `src/lib/utils/__tests__/initials.test.ts` — FOUND
- `01-SUMMARY.md` — FOUND
- Commit `8df31cc3` (Task 1) — FOUND
- Commit `240a546a` (Task 2) — FOUND

---
*Phase: standalone-whatsapp-inbox-reliability*
*Completed: 2026-06-11*
