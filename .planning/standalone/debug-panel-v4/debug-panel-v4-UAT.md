---
status: complete
phase: standalone/debug-panel-v4
source: dp4-01-SUMMARY.md, dp4-02-SUMMARY.md, dp4-03-SUMMARY.md, dp4-04-SUMMARY.md, dp4-05-SUMMARY.md
started: 2026-02-26T14:00:00Z
updated: 2026-02-26T15:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Tab bar shows 8 tabs with new Pipeline, Classify, Bloques
expected: Open the sandbox (/sandbox). The debug panel tab bar should show 8 tabs. The new tabs Pipeline, Classify, and Bloques should be visible by default. The old "Intent" tab should NOT appear.
result: pass

### 2. Classify tab shows intent detection and message category
expected: Send a message in sandbox. Click the Classify tab. It should show: detected intent name, confidence %, category (RESPONDIBLE/SILENCIOSO/HANDOFF), and a 2x2 rules grid with check/X icons showing which classifier rules triggered.
result: pass

### 3. Pipeline tab shows turn chip navigation
expected: Send 2-3 messages in sandbox. Click the Pipeline tab. It should show horizontal turn chips (one per message), color-coded by category (green=RESPONDIBLE, yellow=SILENCIOSO, red=HANDOFF). Clicking a chip should select that turn and show its pipeline details below.
result: pass

### 4. Pipeline tab shows expandable pipeline steps
expected: With a turn selected in Pipeline tab, you should see ~11 pipeline steps listed (Ingest, Implicit Yes, Ofi Inter, Intent Detection, Message Category, Orchestrate, Block Composition, No-Repetition, Send Loop, Timer Signals, Order Creation). Steps that executed show as active; steps that didn't run show as skipped (with -- prefix). Clicking an active step should expand it to show details.
result: pass

### 5. Bloques tab shows template and block info
expected: After sending a message that triggers templates, click the Bloques tab. It should show up to 4 sections: Template Selection (which templates were chosen), Block Composition (how the block was formed), No-Repetition Filter (surviving vs filtered templates with level badges P/F/E/N/~), and Send Loop (pre-send check results).
result: pass

### 6. Timer controls migrated to Config tab
expected: Open the Config tab. Timer configuration controls should be there: timer toggle, speed presets, and 5 sliders. The Ingest tab should still show timer display (countdown, pause) but NOT the timer configuration controls.
result: pass

### 7. Ingest tab shows extraction details
expected: Send a message that provides customer data (e.g., a name or city). Click the Ingest tab. It should show extraction details for the current turn, and sections for implicit yes detection and ofi inter ruta 2 (if applicable).
result: pass

### 8. Estado tab shows legible intents and templates
expected: After a few messages in sandbox, click the Estado tab. Above the JSON editor, you should see a legible intents timeline (intents connected by arrows showing the conversation flow) and a templates list showing sent templates with a count badge.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
