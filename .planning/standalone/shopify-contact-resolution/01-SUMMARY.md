---
phase: shopify-contact-resolution
plan: 01
subsystem: shopify-integration
tags: [contact-reviews, phone-distance, levenshtein, domain-layer, migration]
completed: 2026-03-18
duration: ~8min
dependency_graph:
  requires: []
  provides: [contact_reviews_table, contact_reviews_domain, phone_distance_utility]
  affects: [shopify-contact-resolution-02, shopify-contact-resolution-03]
tech_stack:
  added: []
  patterns: [levenshtein-distance, fuse-name-matching, on-delete-set-null-audit]
key_files:
  created:
    - supabase/migrations/20260318000000_contact_reviews.sql
    - src/lib/shopify/phone-distance.ts
    - src/lib/domain/contact-reviews.ts
  modified: []
decisions:
  - id: set-null-audit
    description: "contact_new_id uses ON DELETE SET NULL to preserve review audit trail when merge deletes the new contact"
  - id: phone-last-10
    description: "Phone comparison strips country code and compares last 10 digits via Levenshtein"
  - id: dual-gate
    description: "findClosePhone requires BOTH phone distance <= 2 AND Fuse.js name similarity > 0.7"
---

# Shopify Contact Resolution Plan 01: Foundation Summary

DB migration for contact_reviews table with ON DELETE SET NULL audit preservation, Levenshtein + Fuse.js phone proximity detection, and full domain CRUD with merge/ignore resolution logic.

## Commits

| # | Hash | Description |
|---|------|-------------|
| 1 | bfa011b | DB migration + phone distance utility |
| 2 | 57d1f39 | Domain layer for contact reviews |

## What Was Built

### 1. Database Migration (`contact_reviews` table)
- UUID token for shareable action links
- `contact_new_id` with ON DELETE SET NULL (not CASCADE) — preserves audit trail when merge deletes the temporary contact
- `pending_templates` JSONB column stores skipped template actions for replay after resolution
- Indexes on token, workspace, and workspace+status

### 2. Phone Distance Utility (`findClosePhone`)
- Levenshtein DP algorithm (no external lib) for phone digit comparison
- Strips country code, compares last 10 digits
- Dual gate: phone distance <= 2 AND Fuse.js name score > 0.7
- Returns contactId, contactName, existingPhone, distance, nameScore

### 3. Domain Layer (4 functions)
- `createContactReview` — Insert review, return token for action links
- `getContactReviewByToken` — Fetch with left join for nullable contact_new + contact names
- `resolveContactReview` — Merge (status FIRST, then update phone, reassign order, delete temp contact, remove tag) or ignore (resolve, remove tag)
- `addPendingTemplate` — Append template to JSONB array for later replay

## Key Design Decisions

1. **ON DELETE SET NULL for audit trail**: During merge, review status is updated BEFORE the new contact is deleted. The FK SET NULL ensures the review record survives with `contact_new_id = NULL`.

2. **Dual gate for phone matching**: Requires both phone proximity (Levenshtein <= 2) AND name similarity (Fuse.js > 0.7). This prevents false positives where unrelated contacts happen to have similar phone numbers.

3. **Last 10 digits comparison**: Strips country codes (+57, +1, etc.) before Levenshtein comparison, making it work across different phone format storage.

## Deviations from Plan

None — plan executed exactly as written.

## Next Plan Readiness

Plan 02 depends on:
- [x] `contact_reviews` table migration (ready to apply)
- [x] `findClosePhone` utility exported
- [x] `createContactReview` and `addPendingTemplate` domain functions

**IMPORTANT**: Migration must be applied to production BEFORE deploying Plan 02 code.
