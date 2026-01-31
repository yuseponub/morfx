---
phase: 05-contacts-extended
plan: 01
subsystem: database-schema
tags: [custom-fields, notes, activity, triggers, jsonb]
completed: 2026-01-29
duration: ~8 minutes

dependency-graph:
  requires:
    - "04-01: contacts table and workspace isolation"
    - "02: workspace_members table and is_workspace_member() function"
  provides:
    - "custom_field_definitions table for workspace-scoped field schemas"
    - "contacts.custom_fields JSONB column with GIN index"
    - "contact_notes table for notes attached to contacts"
    - "contact_activity table for automatic change history"
    - "log_contact_changes() trigger for activity tracking"
  affects:
    - "05-02: Custom Fields API (will use custom_field_definitions)"
    - "05-03: Notes UI (will use contact_notes)"
    - "05-04: Activity Timeline (will use contact_activity)"

tech-stack:
  patterns:
    - "JSONB with GIN index for flexible schema"
    - "PostgreSQL trigger for automatic activity logging"
    - "SECURITY DEFINER for trigger write access"
    - "JSONB diff calculation for field-level changes"

key-files:
  created:
    - "src/lib/custom-fields/types.ts"
    - "supabase/migrations/20260129000002_custom_fields_notes_activity.sql"
  modified:
    - "src/lib/types/database.ts"

decisions:
  - decision: "Activity trigger skips updated_at field"
    rationale: "Avoid noise in activity log from timestamp-only changes"
  - decision: "Activity table is immutable (no UPDATE/DELETE RLS)"
    rationale: "Audit trail integrity - activity log should not be modified"
  - decision: "Notes editable by author OR admin/owner"
    rationale: "Balance between author ownership and admin oversight"
---

# Phase 5 Plan 01: Database Foundation Summary

Database schema for custom fields, notes, and activity tracking with automatic JSONB diff via PostgreSQL trigger.

## One-liner

Custom fields JSONB + GIN index, contact notes with author permissions, activity history with trigger-based diff tracking.

## What was Built

### 1. TypeScript Types (`src/lib/custom-fields/types.ts`)

- **FieldType**: 12 supported types (text, number, date, select, checkbox, url, email, phone, currency, percentage, file, contact_relation)
- **CustomFieldDefinition**: Schema for workspace-scoped custom fields with key, name, type, options, required flag, display order
- **ContactNote**: Notes with author tracking and workspace visibility
- **ContactActivity**: Activity log with action type, JSONB changes, metadata
- **ContactActivityWithUser/ContactNoteWithUser**: Joined types for UI display

### 2. Database Migration (`20260129000002_custom_fields_notes_activity.sql`)

**Tables created:**

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `custom_field_definitions` | Field schemas per workspace | UNIQUE(workspace_id, key) |
| `contact_notes` | Notes on contacts | author tracking, auto updated_at |
| `contact_activity` | Change history | immutable log, JSONB changes |

**Column added:**
- `contacts.custom_fields JSONB DEFAULT '{}'` with GIN index for fast querying

**Trigger function:**
- `log_contact_changes()` captures INSERT/UPDATE/DELETE
- Calculates JSONB diff showing `{ field: { old: ..., new: ... } }`
- Filters out `updated_at` to reduce noise
- Uses SECURITY DEFINER to write to activity table

**RLS policies:**
- `custom_field_definitions`: read by members, modify by admin/owner only
- `contact_notes`: read by members, modify by author OR admin/owner
- `contact_activity`: read-only (trigger-managed, immutable)

## Commits

| Hash | Type | Description |
|------|------|-------------|
| cb85bad | feat | TypeScript types for custom fields system |
| 5348191 | feat | Database migration for custom fields, notes, activity |

## Verification Results

- [x] TypeScript compiles without errors
- [x] Migration contains 3 new tables + ALTER TABLE contacts
- [x] Trigger function log_contact_changes() exists
- [x] GIN index on contacts.custom_fields exists
- [x] RLS policies follow workspace isolation pattern (9 policies)

## Deviations from Plan

None - plan executed exactly as written.

## Next Plan Readiness

Ready for 05-02 (Custom Fields API):
- custom_field_definitions table available for CRUD
- contacts.custom_fields column ready for field values
- TypeScript types ready for Server Actions
