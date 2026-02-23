# Phase 27 Learnings: Robot OCR de Guias

## Bugs Found & Fixed

### 1. Claude Vision URL access failure → hallucination
**Problem**: Passing Supabase Storage URLs directly to Claude Vision resulted in completely fabricated data (wrong names, cities, phone numbers) with HIGH confidence (95%).
**Root cause**: Claude cannot always fetch external URLs. When it can't load the image, it generates plausible-looking data instead of returning an error.
**Fix**: Fetch image server-side, convert to base64, pass as `source: { type: 'base64' }`.
**Rule**: NEVER trust Claude Vision URL access. Always use base64 for server-to-server OCR.

### 2. Sonnet 4 vs Sonnet 4.6 vision accuracy
**Problem**: `claude-sonnet-4-20250514` hallucinated guide data even with base64 (wrong destinatario, wrong city, wrong phone).
**Fix**: Upgraded to `claude-sonnet-4-6` — reads correctly with 92-95% confidence.
**Rule**: For OCR tasks on Colombian shipping guides, use Sonnet 4.6 minimum.

### 3. Drag-and-drop zone scope
**Problem**: Drag-and-drop handlers on CommandInput (bottom bar only) meant dragging files over the chat messages area didn't work.
**Fix**: Moved drag-and-drop to CommandPanel (wraps entire panel: messages + progress + input).
**Rule**: Drop zones should cover the full interaction area, not just the input component.

### 4. OCR stage != Dispatch stage
**Problem**: Plan assumed OCR would reuse Coordinadora dispatch stage config. User clarified OCR is for EXTERNAL carriers (Envia, Inter) — orders in a different stage (e.g., "ESPERANDO GUIAS").
**Fix**: Added separate `ocr_pipeline_id/ocr_stage_id` columns, `getOcrStage()`, and settings UI section.
**Rule**: Different robot operations need independent stage configs. Don't couple unrelated features.

### 5. tracking_number vs carrier_guide_number for external carriers
**Problem**: OCR wrote to `carrier_guide_number`. For external carriers, the guide number IS the tracking number (no separate pedido concept like Coordinadora).
**Fix**: OCR orchestrator writes to `trackingNumber` + sets `carrier` (uppercase).
**Rule**: `tracking_number` = primary shipment identifier. `carrier_guide_number` = secondary (Coordinadora-specific).

### 6. Stale query filter after field change
**Problem**: `getOrdersForOcrMatching` filtered `carrier_guide_number IS NULL` but OCR now writes to `tracking_number`. Orders were invisible to matching.
**Fix**: Removed the filter entirely — all orders in the OCR stage are eligible (allows re-assignment).
**Rule**: When changing which field a feature writes to, audit ALL queries that read/filter that field.

### 7. Carrier field should be free text
**Problem**: Carrier was a hardcoded dropdown (Coordinadora, Envia, etc.) but users work with many carriers not in the list.
**Fix**: Changed to free text `<Input>` field. OCR sets carrier uppercase (ENVIA, INTER).
**Rule**: Don't hardcode options for fields that are inherently open-ended.

## Patterns Established

### OCR prompt engineering for Colombian guides
- Explicitly describe remitente vs destinatario sections
- Emphasize "NEVER invent data — only extract what you can READ"
- Specify which fields belong to destinatario (phone, city, address) vs remitente
- Confidence score should reflect legibility, not model certainty

### Base64 image pipeline
```
User uploads → base64 in browser → server action → Supabase Storage →
Inngest event (URL) → orchestrator fetches → base64 → Claude Vision
```
The double-conversion (base64 → storage → URL → base64) is necessary because:
- Inngest events have payload size limits (can't pass raw base64)
- Claude Vision needs base64 (URL access unreliable)

### Separate config per robot operation
Each robot type (dispatch, guide lookup, OCR) gets its own pipeline/stage config in `carrier_configs`. Don't share configs between fundamentally different operations.

## Decisions Made

- OCR eligible orders = all orders in configured OCR stage (no tracking_number filter)
- Carrier stored uppercase, displayed with CSS `capitalize`
- OCR writes to tracking_number (not carrier_guide_number) for external carriers
- Auto-assign threshold: confidence >= 70% (phone=95, name=80 → auto; city=55, address=50 → low confidence)
- Model: claude-sonnet-4-6 for all OCR extraction
