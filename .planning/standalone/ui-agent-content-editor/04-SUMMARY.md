---
phase: ui-agent-content-editor
plan: 04
subsystem: domain-layer
tags: [knowledge-base, embeddings, versioning, regla-3, somnio-v4]
requires:
  - "serialize.ts buildContentToEmbed (Plan 01)"
  - "embed.ts generateEmbedding"
  - "agent_knowledge_base.scope_summary column + agent_knowledge_base_versions table (Plan 02, applied to prod)"
  - "agent-templates.ts assertEditable v4-gate pattern (Plan 03)"
provides:
  - "src/lib/domain/agent-knowledge-base.ts — KB CRUD + DB versioning + synchronous re-embed"
affects:
  - "future UI (server actions) for the v4 KB editor"
tech-stack:
  added: []
  patterns:
    - "embed-before-write (D-06): generateEmbedding throws → return error, no DB write"
    - "snapshot-on-save versioning (D-01b): current row copied into versions table before overwrite"
    - "hash-skip re-embed (mirror sync.ts:58): unchanged body_hash keeps existing embedding"
    - "v4-gate assertEditable (D-02): mutations reject agent_id !== somnio-sales-v4"
    - "no-RLS mandatory scoping (Pitfall 2): every query .eq(workspace_id).eq(agent_id)"
    - "synthetic NOT-NULL values (Pitfall 5): source_md_path ui://, last_reviewed_at Bogota, reviewed_by"
key-files:
  created:
    - "src/lib/domain/agent-knowledge-base.ts"
  modified:
    - "src/lib/domain/__tests__/agent-knowledge-base.test.ts"
decisions:
  - "getKbTopic takes (ctx, kbId, agentId) — added agentId param vs plan's 2-arg signature to satisfy Pitfall 2 mandatory agent scoping (Rule 2 correctness)."
metrics:
  duration: "~25min"
  completed: "2026-06-01"
  tasks: 4
  files: 2
---

# Phase ui-agent-content-editor Plan 04: Agent Knowledge Base Domain Layer Summary

DB-column-driven KB domain (Regla 3) with synchronous canonical re-embed, snapshot-on-save versioning, and v4-only mutations — re-targets the legacy `.md`-driven sync stack onto the editable DB columns locked in Plan 01.

## What Was Built

`src/lib/domain/agent-knowledge-base.ts` (672 lines, 8 exported functions):

**Reads (D-04 — any agent):**
- `listKbByAgent(ctx, agentId)` — all rows for (workspace, agent), ordered category→topic, embedding vector excluded from payload.
- `getKbTopic(ctx, kbId, agentId)` — one row, workspace+agent scoped.

**Mutations (D-02 — v4 only, gated by `assertEditable`):**
- `createKbTopic` (D-09) — dup check → build contentToEmbed via canonical serializer → embed → INSERT with synthetic NOT-NULL values (`source_md_path: ui://somnio-v4/{topic}`, `last_reviewed_at` America/Bogota, `reviewed_by`) → version_num=1 baseline snapshot.
- `updateKbTopic` (D-01b + D-06 + D-10) — snapshot CURRENT row into versions BEFORE overwrite → recompute body_hash from new values → hash-skip keeps embedding else re-embed → UPDATE scoped by id+workspace+agent.
- `deleteKbTopic` — delete (versions cascade via FK).
- `listKbVersions` / `searchKbVersions` — version_num DESC / topic ILIKE, scoped.
- `restoreKbVersion` (D-01b restore + D-06) — load version + current → snapshot current as new version (restore is reversible) → re-embed from version's content → UPDATE live row.

**Internal helpers:** `assertEditable` (v4-gate, message verbatim from Plan 03), `todayBogota` (Regla 2), `buildEmbedInput` (serializer + sha256), `snapshotVersion` (version_num = max+1).

## How Each Truth Is Honored

| Truth | Where |
|-------|-------|
| Pitfall 2 — every query `.eq(workspace_id).eq(agent_id)` | All reads + mutations + version queries; unit-tested via recorded eq args. |
| D-06 — embed before write, nothing on OpenAI failure | `generateEmbedding` awaited in try/catch returning BEFORE insert/update; tested for both create + update (insert/update builder never called on throw). |
| D-01b — snapshot before overwrite | `snapshotVersion` runs before UPDATE in both update + restore; create writes a v1 baseline. |
| D-02 — reject non-v4 | `assertEditable` first line of every mutation; tested rejects `godentist` with no DB access. |
| Pitfall 5 — synthetic NOT-NULL | `source_md_path: ui://somnio-v4/{topic}`, `last_reviewed_at: todayBogota()`, `reviewed_by`. |

## Deviations from Plan

**1. [Rule 2 — Missing critical scoping] `getKbTopic` signature widened to `(ctx, kbId, agentId)`**
- **Found during:** Task 1 / used by Task 2-3.
- **Issue:** The plan's Task 1 sketch shows `getKbTopic(ctx, kbId)` with no `agent_id` filter, but Pitfall 2 (truth #1) requires EVERY query to carry `.eq('agent_id')` since the table has no RLS. A 2-arg signature would leave the single-row read unscoped by agent.
- **Fix:** Added `agentId` parameter; the query now filters `.eq('id').eq('workspace_id').eq('agent_id')`. update/restore pass their `params.agentId` through.
- **Files modified:** `src/lib/domain/agent-knowledge-base.ts`.
- **Commit:** 9f06cd5f (Task 1).

No other deviations — plan executed as written.

## Verification

- `npx vitest run src/lib/domain/__tests__/agent-knowledge-base.test.ts` → 9/9 pass, 0 it.todo.
- `grep -c "buildContentToEmbed" src/lib/domain/agent-knowledge-base.ts` → 3 (>=3).
- All 8 success-criteria functions exported.
- `npx tsc --noEmit` clean for both files.
- No file deletions across the 4 task commits.

## Commits

- 9f06cd5f — feat: KB read functions con filtro workspace+agent (Task 1)
- 74130ccd — feat: createKbTopic + updateKbTopic re-embed + versioning (Task 2)
- 76058820 — feat: delete + listKbVersions + searchKbVersions + restoreKbVersion (Task 3)
- 4725c5d2 — test: KB domain tests GREEN (Task 4)

## Known Stubs

None. The domain functions are fully wired to the serializer + embed module + live tables (migrations applied in Plan 02). No UI consumer exists yet — that is the next plan's work, not a stub in this layer.

## Self-Check: PASSED

- FOUND: src/lib/domain/agent-knowledge-base.ts
- FOUND: src/lib/domain/__tests__/agent-knowledge-base.test.ts
- FOUND commit: 9f06cd5f, 74130ccd, 76058820, 4725c5d2
