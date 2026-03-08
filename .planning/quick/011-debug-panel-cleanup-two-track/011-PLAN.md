---
phase: quick-011
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
autonomous: true

must_haves:
  truths:
    - "Pipeline section badge shows sales track result instead of classification category"
    - "Intent section shows only intent + category, no Decision/Orchestration block"
    - "Ingest section has no action badge (silent/respond), keeps systemEvent + captura + timers"
    - "Contexto Raw _lastTurn includes salesTrack and responseTrack, excludes orchestration"
    - "Older sessions without salesTrack/responseTrack render without errors"
  artifacts:
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx"
      provides: "Cleaned debug panel reflecting two-track architecture"
  key_links: []
---

<objective>
Clean up the v3 debug panel to reflect the two-track architecture (Sales Track + Response Track) after the tt-01/tt-02 refactor.

Purpose: Remove obsolete orchestration/decision UI, update Pipeline badge, clean ingest badge, and add salesTrack/responseTrack to raw context.
Output: Updated debug-v3.tsx with 4 targeted changes.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update Pipeline badge, clean Intent section, remove ingest action badge</name>
  <files>src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx</files>
  <action>
  Four changes in one file:

  **1. Pipeline section header badge (main component, ~line 748-761):**
  Replace the classification.category badge with sales track result logic:
  - If `salesTrack?.accion` exists: show green badge with the accion name
  - Else if `responseTrack?.totalMessages > 0`: show blue badge "info"
  - Else: show yellow badge "silencio"
  - Fallback for old sessions (no salesTrack/responseTrack): show classification.category as before

  **2. IntentDecisionSection (~lines 346-429):**
  - Remove the "Decision / Orchestration" block (lines 406-426, the `{orchestration && ...}` JSX)
  - Remove the `orchestration` variable declaration (line 351)
  - Keep intent block and classification block as-is

  **3. Rename section title** in main component (~line 767):
  - Change `title="Intent & Decision"` to `title="Intent"`

  **4. IngestTimersSection (~lines 542-553):**
  - Remove the `ingest.action` badge (the Badge inside `{ingest && (...)}` that shows silent/respond with colors)
  - Keep the captura badge (line 539-541)
  - Keep the systemEvent badge (lines 554-558)
  - Restructure: remove the `{ingest && (...)}` wrapper around the action badge only; the systemEvent badge needs its own `{ingest?.systemEvent && ...}` guard (which it already has)

  **5. ContextoRawSection _lastTurn (~lines 673-681):**
  - Add `salesTrack: turn.salesTrack` and `responseTrack: turn.responseTrack` to the _lastTurn object
  - Remove `orchestration: turn.orchestration` from the _lastTurn object

  All changes must gracefully handle undefined salesTrack/responseTrack (older sessions).
  </action>
  <verify>
  ```bash
  cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit --pretty 2>&1 | head -30
  ```
  - No TypeScript errors in debug-v3.tsx
  - Grep confirms no remaining references to `orchestration` in IntentDecisionSection
  - Grep confirms `salesTrack` appears in ContextoRawSection _lastTurn
  </verify>
  <done>
  - Pipeline badge shows salesTrack result (accion/info/silencio) instead of classification category
  - Intent section shows only intent + category, no Decision block
  - Ingest section has no action badge, keeps systemEvent + captura + timers
  - Contexto Raw _lastTurn includes salesTrack/responseTrack, excludes orchestration
  - Older sessions without two-track data render gracefully
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors on debug-v3.tsx
- File still exports DebugV3 component
- No references to `orchestration` in IntentDecisionSection function
- salesTrack and responseTrack in ContextoRawSection _lastTurn object
- Section title reads "Intent" not "Intent & Decision"
</verification>

<success_criteria>
Debug panel reflects two-track architecture: Pipeline badge shows ST result, Intent section is clean (no decision block), ingest has no redundant action badge, and raw context exposes salesTrack/responseTrack.
</success_criteria>

<output>
After completion, create `.planning/quick/011-debug-panel-cleanup-two-track/011-SUMMARY.md`
</output>
