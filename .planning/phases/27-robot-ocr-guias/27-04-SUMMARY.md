---
phase: 27-robot-ocr-guias
plan: 04
subsystem: comandos-ui
tags: [ocr, ui, server-action, file-upload, drag-and-drop, settings]
---

# Plan 04 Summary: Chat UI Integration

## What Was Built

- `executeLeerGuias` server action: auth, file upload to Supabase Storage, OCR job creation, Inngest dispatch
- File upload in Chat de Comandos: drag-and-drop on entire panel + file picker button
- `leer guias` command handler with staged file management
- OCR result renderer with categorized summary (auto-assigned, low-confidence, no-match, OCR failed)
- Separate OCR stage config in Settings > Logistica (independent from Coordinadora dispatch)
- `updateOcrConfig` server action + `getOcrStage` domain function

## Commits

- fffcc21 — feat(27-04): add executeLeerGuias server action + nullable order_id fix
- fa975e3 — feat(27-04): add file upload, leer guias command, and OCR result display
- 334739d — fix(27-04): move drag-and-drop zone to cover entire command panel
- bb2d839 — fix(27-04): separate OCR stage config from Coordinadora dispatch stage
- 13517a5 — fix(27-04): use base64 for Claude Vision + improve OCR prompt
- c7d6fd3 — fix(27-04): upgrade OCR model to claude-sonnet-4-6 for better vision
- f993664 — fix(27-04): OCR writes tracking_number instead of carrier_guide_number
- ed54fb7 — fix(27-04): change carrier field from dropdown to free text input
- 17e6348 — fix(27-04): remove stale carrier_guide_number filter from OCR matching

## Deviations

1. **Drag-and-drop zone moved to CommandPanel** — Original plan had handlers on CommandInput only. User testing revealed dropping on chat area didn't work. Moved handlers to CommandPanel (wraps entire panel).
2. **OCR stage config separated from dispatch** — Plan used `getDispatchStage` for OCR. User clarified OCR is for external carriers (Envia, Inter), needs its own stage config. Added `ocr_pipeline_id/ocr_stage_id` columns, `getOcrStage`, `updateOcrConfig`, and settings UI section.
3. **Base64 instead of URL for Claude Vision** — Sonnet 4 hallucinated guide data when given Supabase Storage URLs. Fixed by fetching image server-side and passing as base64.
4. **Upgraded model to claude-sonnet-4-6** — Sonnet 4 still hallucinated after base64 fix. Sonnet 4.6 reads guides correctly (95% confidence).
5. **tracking_number instead of carrier_guide_number** — For external carriers, the guide number IS the tracking number. Updated orchestrator to write `trackingNumber` + uppercase `carrier`.
6. **Carrier field changed to free text** — Was a hardcoded dropdown (coordinadora, envia, etc.). Changed to text input for flexibility.
7. **Removed carrier_guide_number IS NULL filter** — Stale filter from when OCR wrote to carrier_guide_number. Removed to allow all orders in stage + guide re-assignment.

## Duration

~45 min (including user testing and 7 bug fixes)
