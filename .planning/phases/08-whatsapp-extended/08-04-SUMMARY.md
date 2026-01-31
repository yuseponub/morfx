---
phase: 08-whatsapp-extended
plan: 04
completed: 2026-01-31
duration: ~15 min
subsystem: whatsapp-templates
tags: [whatsapp, templates, modal, preview, 24h-window]

dependency-graph:
  requires: [08-01]
  provides: [template-sending-ui, variable-substitution, window-detection]
  affects: [08-05]

tech-stack:
  added: []
  patterns:
    - Two-step modal flow (select -> preview -> send)
    - Variable auto-fill from contact/order mapping
    - Window detection for template requirement

key-files:
  created:
    - src/app/(dashboard)/whatsapp/components/template-button.tsx
    - src/app/(dashboard)/whatsapp/components/template-send-modal.tsx
    - src/app/(dashboard)/whatsapp/components/template-preview.tsx
  modified:
    - src/app/actions/messages.ts
    - src/app/(dashboard)/whatsapp/components/message-input.tsx
    - src/app/(dashboard)/whatsapp/components/chat-view.tsx

decisions:
  - key: template-modal-flow
    choice: Two-step (select -> preview) instead of single form
    reason: Users need to verify message content before sending

metrics:
  tasks-completed: 3
  tasks-total: 3
---

# Phase 08 Plan 04: Template Sending Summary

**One-liner:** Template sending with selection modal, variable substitution preview, and 24h window detection integration.

## What Was Built

### Template Sending Server Action
Extended `src/app/actions/messages.ts` with `sendTemplateMessage` that:
- Gets template by ID and validates it's APPROVED
- Extracts variables from template body and header
- Builds 360dialog API component parameters
- Sends via existing `sendTemplateMessage` API function
- Stores message in database with `type='template'` and `template_name`
- Updates conversation last_message info

### Template Preview Component
Created `template-preview.tsx`:
- Renders template with substituted variables
- WhatsApp-style outgoing message bubble (green background)
- Supports header, body, and footer components
- Shows placeholder `{{n}}` for empty variables

### Template Send Modal
Created `template-send-modal.tsx` with two-step flow:
1. **Select step:** Radio group list of approved templates with body preview
2. **Preview step:** Variable input fields + live preview

Features:
- Auto-fills variables from contact/order based on `variable_mapping`
- Resolves paths like `contact.name`, `order.total`
- Editable variable values before sending
- Loading and empty states handled

### Template Button and Integration
Created `template-button.tsx`:
- Opens TemplateSendModal on click
- Accepts contact and recentOrder for variable pre-fill

Updated `message-input.tsx`:
- Added `contact` and `recentOrder` props
- When 24h window closed: shows yellow warning banner with TemplateButton
- Warning message: "Ventana de 24h cerrada / Solo puedes enviar templates aprobados"

Updated `chat-view.tsx`:
- Passes contact info from conversation to MessageInput

## Key Technical Decisions

1. **Two-step modal flow**: Users select template first, then see preview with editable variables. This prevents sending wrong content.

2. **Variable resolution from mapping**: Template's `variable_mapping` field maps `{{1}}` -> `contact.name`, which auto-fills from conversation context.

3. **Message type='template'**: Template messages stored with distinct type for analytics and display differentiation.

## Commits

1. `8fb3934` - feat(08-04): add sendTemplateMessage Server Action
2. `3674ad2` - feat(08-04): create template selection modal and preview
3. `fcd0249` - feat(08-04): integrate template button into chat

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Plan 05 (Quick Replies) can proceed. The message input now supports both:
- Regular text/media when 24h window is open
- Template sending when 24h window is closed

The slash-command autocomplete from Plan 07 is already integrated.
