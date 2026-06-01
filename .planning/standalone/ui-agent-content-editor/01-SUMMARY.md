---
phase: ui-agent-content-editor
plan: 01
subsystem: somnio-v4 knowledge-base / domain test scaffolding
tags: [serializer, embeddings, vitest, wave-0, scaffolding]
requires: []
provides:
  - "buildContentToEmbed — canonical KB embedding serializer (single source of the embedding text form)"
  - "RED test targets for Waves 3/4/5 (templates domain, KB domain, sync guard)"
affects:
  - "Plan 02 (migration re-embed pass) — imports buildContentToEmbed"
  - "Plan 04 (src/lib/domain/agent-knowledge-base.ts UI re-embed) — imports buildContentToEmbed"
tech-stack:
  added: []
  patterns:
    - "Pure deterministic serializer extracted from sync.ts:42-44 + parser.ts:151-161 header strings"
    - "Exact-output toBe() lock test to prevent silent string drift (Threat T-UICE01-01)"
    - "it.todo RED stubs that pass as todo without importing not-yet-existing modules"
key-files:
  created:
    - src/lib/agents/somnio-v4/knowledge-base/serialize.ts
    - src/lib/agents/somnio-v4/knowledge-base/__tests__/serialize.test.ts
    - src/lib/domain/__tests__/agent-templates.test.ts
    - src/lib/domain/__tests__/agent-knowledge-base.test.ts
    - scripts/__tests__/knowledge-sync-guard.test.ts
  modified: []
decisions:
  - "Serializer string form locked verbatim per plan (headers WITH tildes, scope_summary omitted when null/empty, trailing section has no trailing newline)"
  - "Empty-section rendering: bare header + empty body; two consecutive empty sections => 3 newlines between headers (header\\n + \\n\\n separator)"
metrics:
  duration: ~4m
  completed: 2026-06-01
---

# Phase ui-agent-content-editor Plan 01: Canonical KB Serializer + Wave 0 Scaffolding Summary

Locked the canonical KB embedding serializer (`buildContentToEmbed`) as the single source of the embedding text form — pure, no-I/O, string-exact-tested — and created the Wave 0 vitest RED scaffolding (templates domain, KB domain, sync guard) so every later wave has an automated RED→GREEN target.

## What Was Built

- **`serialize.ts`** — `buildContentToEmbed(row: KbContentColumns): string`. A pure function that assembles the deterministic embedding text from DB columns (never from `.md`/parser). Form: optional `scope_summary` block, then five `## ` sections (Hechos del producto, Posición del negocio, Debe contener la respuesta, NUNCA decir, Cuándo escalar a humano), bullets rendered as `- {item}`, sections joined by `\n\n`, no trailing newline. Header strings mirror `parser.ts:151-161` verbatim (with tildes). This is RESEARCH Pitfall 1 / A1: byte-equivalence with legacy `.md` embeddings is impossible (parser is lossy), so ONE serializer re-embeds all 18 topics once and produces every future embedding.
- **`serialize.test.ts`** — exact-output `toBe` lock (4 `toBe` assertions). Fixture A: full row with `scope_summary` + bullets. Fixture B: null `scope_summary` + empty arrays (bare empty-section headers). Pins the byte form so the migration re-embed (Plan 02) and UI re-embed (Plan 04) can never silently diverge (Threat T-UICE01-01).
- **3 RED stub test files** (`it.todo`, pass as todo): `agent-templates.test.ts` (5 todos — D-02/D-08/Regla 3 → Plan 03), `agent-knowledge-base.test.ts` (7 todos — D-09/D-06/D-01b/D-10/D-02/Pitfall 2 → Plan 04), `knowledge-sync-guard.test.ts` (2 todos — D-01/Pitfall 4 → Plan 05). Each header comment names the implementing plan and instructs un-skipping.

## Tasks & Commits

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Canonical serializer with locked string form | `175d18d4` | src/lib/agents/somnio-v4/knowledge-base/serialize.ts |
| 2 | Exact-output unit test (locks A1) | `04701590` | src/lib/agents/somnio-v4/knowledge-base/__tests__/serialize.test.ts |
| 3 | Three RED stub test files | `f843c3b2` | agent-templates.test.ts, agent-knowledge-base.test.ts, knowledge-sync-guard.test.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected Fixture B's loose `includes` hint from `\n\n` to `\n\n\n`**
- **Found during:** Task 2
- **Issue:** The plan's Task 2 spec suggested asserting `result.includes('## NUNCA decir\n\n## Cuándo escalar')` (two newlines) for the empty-array edge case. The serializer's actual deterministic output between two empty sections is three newlines: the empty body leaves the header as `## NUNCA decir\n`, then the `\n\n` section separator joins to the next header.
- **Fix:** Asserted `## NUNCA decir\n\n\n## Cuándo escalar` (three newlines), matching the serializer's real output, which the exact `toBe` for Fixture B independently confirms. The serializer itself (Task 1, locked + committed first) was correct and unchanged; only the loose hint in the test was a plan-spec arithmetic slip.
- **Files modified:** src/lib/agents/somnio-v4/knowledge-base/__tests__/serialize.test.ts
- **Commit:** `04701590`

No other deviations. No authentication gates. No checkpoints (autonomous:true).

## Verification

- `npx vitest run .../serialize.test.ts` → 2 passed.
- `npx vitest run` on the three stub files → exits 0 (14 todo, 0 failed).
- `grep -E "createAdminClient|node:fs|generateEmbedding" serialize.ts` → 0 matches (pure function, no I/O).
- `grep -c "export function buildContentToEmbed"` → 1; all five header strings present (with tildes).
- No accidental file deletions across the three task commits.

## Notes for Later Waves

- **Plan 02 (migration re-embed)** and **Plan 04 (`agent-knowledge-base.ts` UI re-embed)** MUST import `buildContentToEmbed` from `src/lib/agents/somnio-v4/knowledge-base/serialize.ts` — do not re-implement the string form. The exact-output test guards drift.
- The three stub files use `it.todo` and intentionally do NOT import the not-yet-existing domain modules (importing them would break the Wave 0 suite). Plans 03/04/05 replace the todos with real assertions using the S-4 mock harness from `resolve-or-create-contact.test.ts` (+ a mocked `generateEmbedding` for the KB tests).

## Self-Check: PASSED

All created files verified present on disk; all three task commit hashes verified in `git log`.
