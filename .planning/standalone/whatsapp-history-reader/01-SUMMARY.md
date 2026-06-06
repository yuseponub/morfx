---
phase: whatsapp-history-reader
plan: 01
subsystem: robot-whatsapp-reader (isolated Node + Playwright CLI)
tags: [scaffolding, schema, config, pii-isolation, regla-6]
requires: []
provides:
  - "robot-whatsapp-reader/ isolated project (npm, NodeNext strict)"
  - "ChatBackup/BackupMessage/Manifest output schema (frozen contract)"
  - "config.ts single source of truth for D-06 gate + D-13 anti-ban knobs"
affects: []
tech-stack:
  added:
    - "@wppconnect/wa-js ^4.3.0 (read-only Store abstraction)"
    - "playwright ^1.60.0"
    - "date-fns-tz ^3.2.0 (Regla 2 timezone normalization)"
  patterns:
    - "Isolated robot project mirroring robot-godentist/ (own npm lockfile, outside Next.js build)"
    - "NodeNext strict — relative imports must carry .js extension downstream"
key-files:
  created:
    - "robot-whatsapp-reader/package.json"
    - "robot-whatsapp-reader/tsconfig.json"
    - "robot-whatsapp-reader/.gitignore"
    - "robot-whatsapp-reader/src/types.ts"
    - "robot-whatsapp-reader/src/config.ts"
    - "robot-whatsapp-reader/package-lock.json"
  modified: []
decisions:
  - "D-06 null-rate gate threshold locked at 0.08 (8%), minSample 10, pilotChatCount 5"
  - "D-13 anti-ban knobs: interChatDelayMs [4000,9000], postOpenDelayMs [1200,2600], caps 150/400, jitter +-20%"
  - "D-07/D-08/D-09/D-10/D-11 schema frozen verbatim from RESEARCH §Schema"
  - "Isolated npm lockfile (package-lock.json committed) — root repo stays pnpm-only (Regla 6)"
metrics:
  duration: ~6m
  completed: 2026-06-06
  tasks: 3
  files: 6
---

# Phase whatsapp-history-reader Plan 01: Scaffold + Schema + Config Summary

Established the isolated `robot-whatsapp-reader/` Node + Playwright CLI skeleton at repo root with frozen output schema (`types.ts`) and config single-source-of-truth (`config.ts`); compiles under NodeNext strict, PII isolation enforced via `.gitignore`.

## What Was Built

**Task 1 — Isolated project scaffold** (`192c7aca`)
- `package.json`: name `robot-whatsapp-reader`, exact `build`/`start`/`dev` script trio copied from robot-godentist. Deps `@wppconnect/wa-js@^4.3.0` + `playwright@^1.60.0` + `date-fns-tz@^3.2.0`. **No express** (this is a CLI, not a server). devDeps `@types/node@^22` + `tsx@^4.22` + `typescript@~5.7`.
- `tsconfig.json`: copied verbatim from robot-godentist — `target ES2022`, `module/moduleResolution NodeNext`, `strict true`, plus declaration/sourcemap flags.
- `.gitignore`: `node_modules/`, `dist/`, `output/` (scraped chat JSON = client PII), `profiles/` (Chrome userDataDir = live WA session tokens, D-14), `.env`, `*.tmp-*`.

**Task 2 — Output schema** (`f1c987a0`)
- `src/types.ts` exports `ChatBackup`, `BackupMessage`, `Manifest` verbatim per RESEARCH §Schema.
- Decision-bearing fields present: `ChatBackup.business:{number,name|null}` (D-08 "who is me"), `number|null` + `numberMissing` (D-05), `archived` (D-02), `schemaVersion:1`. `BackupMessage.fromMe` (D-09 business-vs-client), Bogota `timestamp` (D-09), `text|null` (D-10), `note?` placeholder (D-10). `Manifest.threshold` (D-06) + `chats` record with `status:'pending'|'done'|'failed'` (D-11 three-state resume).

**Task 3 — Config defaults + tsc gate** (`476406f2`)
- `src/config.ts` exports `config as const` + `randDelay(range)`, verbatim from RESEARCH §Code Examples.
- D-06 gate: `nullRateThreshold: 0.08`, `nullRateMinSample: 10`, `pilotChatCount: 5`.
- D-13 knobs: `interChatDelayMs [4000,9000]`, `postOpenDelayMs [1200,2600]`, `perSessionChatCap 150`, `perDayChatCap 400`, `jitter` +-20%.
- `npm install` ran (11 packages); `npx tsc --noEmit` exits 0 over types.ts + config.ts.
- `package-lock.json` committed (isolated npm lockfile, mirrors robot-godentist).

## Deviations from Plan

None - plan executed exactly as written.

(Note: the plan files_modified list named the 5 source artifacts; `package-lock.json` was additionally committed because `npm install` generates it and it is the isolated lockfile this robot depends on — consistent with robot-godentist shipping its own lockfile. `node_modules/` and `dist/` remain gitignored.)

## Verification Results

- `cd robot-whatsapp-reader && npx tsc --noEmit` exits 0 (NodeNext strict foundation compiles).
- Root `package.json` contains 0 references to wa-js / date-fns-tz / robot-whatsapp-reader — no dep leaked into the pnpm root manifest (Regla 6 / threat T-WHR01-03 mitigated).
- No imports from `src/` or `@/` in robot source — hard isolation from MorfX app.
- `.gitignore` confirmed ignoring `output/` and `profiles/` content via `git check-ignore` (threats T-WHR01-01 / T-WHR01-02 mitigated).
- All Task 1/2/3 acceptance-criteria greps returned expected counts.

## Threat Surface

No new send capability introduced (T-WHR01-04 zero-send invariant seeded; full grep gate enforced in Plans 03/04/05). Foundation files define schema + config only.

## Self-Check: PASSED

- Files: package.json, tsconfig.json, .gitignore, src/types.ts, src/config.ts — all FOUND.
- Commits: 192c7aca, f1c987a0, 476406f2 — all FOUND in git log.
