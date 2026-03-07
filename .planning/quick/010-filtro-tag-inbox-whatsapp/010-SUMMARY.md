---
phase: quick-010
plan: 01
subsystem: whatsapp-inbox
tags: [tag-filter, inbox, whatsapp, client-side-filtering]
dependency-graph:
  requires: [tags-system, conversation-tags]
  provides: [tag-filter-inbox]
  affects: []
tech-stack:
  added: []
  patterns: [popover-filter, client-side-memo-filter]
key-files:
  created: []
  modified:
    - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
    - src/app/(dashboard)/whatsapp/components/filters/search-input.tsx
metrics:
  duration: ~10min
  completed: 2026-03-07
---

# Quick 010: Filtro por Etiqueta en Inbox WhatsApp

Tag filter button in WhatsApp inbox conversation list with popover selection and client-side filtering via useMemo, combinable with all existing filters.

## What Was Done

### Task 1: Add tag filter to conversation list

- Added Tag icon button next to sort and bot buttons in filter toolbar
- Popover loads whatsapp-scope tags on open via `getTagsForScope('whatsapp')`
- Client-side filtering in `filteredConversations` useMemo: `c.tags?.some(t => t.id === tagFilter)`
- Active filter shows button with `variant="default"` visual indicator
- "Quitar filtro" option in popover to clear active filter
- Tag filter combines with agent filter, search query, and inbox tabs
- Empty state message handles tag filter case: "No hay conversaciones con esta etiqueta"
- Results count shown when tag filter is active
- Search placeholder shortened from "Buscar conversaciones..." to "Buscar..."

## Commits

| Hash | Message |
|------|---------|
| e45c03f | feat(quick-010): filtro por etiqueta en inbox WhatsApp |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes (no errors in modified files)
- `npm run build` succeeds
- All success criteria met
