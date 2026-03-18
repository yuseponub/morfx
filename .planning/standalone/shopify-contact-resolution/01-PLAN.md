---
phase: shopify-contact-resolution
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260318000000_contact_reviews.sql
  - src/lib/domain/contact-reviews.ts
  - src/lib/shopify/phone-distance.ts
autonomous: true

must_haves:
  truths:
    - "contact_reviews table exists with token, contact IDs, order ID, phones, status, and pending_templates columns"
    - "Levenshtein distance function correctly detects phones 1-2 digits apart"
    - "Domain functions create, resolve (merge/ignore), and query contact reviews"
  artifacts:
    - path: "supabase/migrations/20260318000000_contact_reviews.sql"
      provides: "contact_reviews table with all required columns"
      contains: "CREATE TABLE contact_reviews"
    - path: "src/lib/domain/contact-reviews.ts"
      provides: "Domain CRUD for contact reviews"
      exports: ["createContactReview", "resolveContactReview", "getContactReviewByToken"]
    - path: "src/lib/shopify/phone-distance.ts"
      provides: "Phone proximity detection utility"
      exports: ["findClosePhone"]
  key_links:
    - from: "src/lib/domain/contact-reviews.ts"
      to: "contact_reviews table"
      via: "createAdminClient + workspace_id filter"
      pattern: "createAdminClient.*contact_reviews"
---

<objective>
Create the foundation: DB migration for `contact_reviews` table, domain layer for review CRUD, and phone distance utility.

Purpose: These are the building blocks that Plan 02 (resolveOrCreateContact modification) and Plan 03 (API endpoint) depend on.
Output: Migration SQL, domain module, phone distance utility.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/domain/contacts.ts — Domain pattern to follow (createAdminClient, DomainContext, DomainResult)
@src/lib/domain/types.ts — DomainContext and DomainResult types
@src/lib/domain/tags.ts — Example of domain module with assign/remove pattern
@src/lib/shopify/phone-normalizer.ts — Phone normalization utilities (same directory)
@src/lib/domain/orders.ts — addOrderTag, updateOrder for merge/ignore resolution
</context>

<tasks>

<task type="auto">
  <name>Task 1: DB migration + phone distance utility</name>
  <files>
    supabase/migrations/20260318000000_contact_reviews.sql
    src/lib/shopify/phone-distance.ts
  </files>
  <action>
    **Migration** — Create table `contact_reviews`:
    ```sql
    CREATE TABLE contact_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      contact_new_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      contact_existing_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      shopify_phone TEXT NOT NULL,
      existing_phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'ignored')),
      pending_templates JSONB NOT NULL DEFAULT '[]',
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
    );
    CREATE INDEX idx_contact_reviews_token ON contact_reviews(token);
    CREATE INDEX idx_contact_reviews_workspace ON contact_reviews(workspace_id);
    ```

    The `pending_templates` column stores an array of template actions that were skipped during the automation run. Each entry has shape: `{ templateName: string, variables: Record<string, string>, language: string, headerMediaUrl?: string }`. This data is used by Plan 03's API endpoint to replay templates after the host resolves the review.

    **Phone distance utility** — `src/lib/shopify/phone-distance.ts`:
    - Export `findClosePhone(targetPhone: string, contacts: Array<{id, name, phone}>, customerName: string): ClosePhoneMatch | null`
    - Strip country code prefix, compare last 10 digits using Levenshtein distance
    - Levenshtein implementation: simple DP algorithm (no external lib needed — it's ~15 lines)
    - Only return match if: Levenshtein distance <= 2 AND Fuse.js fuzzy name score > 0.7 (70%)
    - Import Fuse from 'fuse.js' (already in package.json — used by contact-matcher.ts)
    - Return type: `{ contactId: string, contactName: string, existingPhone: string, distance: number, nameScore: number } | null`
    - For Levenshtein: compare last 10 chars of both phones (stripping +57 or other country codes)
    - For name matching: use Fuse.js with threshold 0.3 (inverted: 1-score > 0.7 means good match) on the contact name array, searching for customerName
  </action>
  <verify>
    - `npx tsc --noEmit` passes (type check)
    - Migration file exists with correct SQL syntax
    - phone-distance.ts exports findClosePhone
  </verify>
  <done>
    - Migration ready to apply (user will apply before deploy)
    - findClosePhone correctly returns null for distant phones, match for 1-2 digit differences with similar names
  </done>
</task>

<task type="auto">
  <name>Task 2: Domain layer for contact reviews</name>
  <files>
    src/lib/domain/contact-reviews.ts
  </files>
  <action>
    Create `src/lib/domain/contact-reviews.ts` following the existing domain pattern (see contacts.ts, tags.ts).

    **Functions:**

    1. `createContactReview(ctx: DomainContext, params: CreateContactReviewParams): Promise<DomainResult<CreateContactReviewResult>>`
       - Params: `{ contactNewId, contactExistingId, orderId, shopifyPhone, existingPhone }`
       - Insert into contact_reviews with workspace_id from ctx
       - Return `{ reviewId, token }` (the generated token for the action link)

    2. `getContactReviewByToken(token: string): Promise<DomainResult<ContactReview>>`
       - NOTE: No workspace_id filter — token is globally unique (UUID)
       - Select review with all fields + contact names (join contacts for both contact_new_id and contact_existing_id)
       - Also select `pending_templates` JSONB column
       - Return full review data including workspace_id (needed for downstream operations)

    3. `resolveContactReview(token: string, action: 'merge' | 'ignore'): Promise<DomainResult<ResolveResult>>`
       - Validate: review exists and status is 'pending'
       - If action is 'merge':
         a. Update existing contact's phone to shopify_phone (via domain updateContact)
         b. Update order's contact_id to contact_existing_id (via domain updateOrder)
         c. Delete the new contact (via domain deleteContact) — it was temporary
         d. Update review status to 'merged', set resolved_at
         e. Remove tag REVISAR-CONTACTO from order (via domain removeOrderTag)
         f. Return `{ contactId: existingContactId, phone: shopifyPhone, sendTemplates: true }`
       - If action is 'ignore':
         a. Keep new contact (already has shopify phone)
         b. Update review status to 'ignored', set resolved_at
         c. Remove tag REVISAR-CONTACTO from order (via domain removeOrderTag)
         d. Return `{ contactId: newContactId, phone: shopifyPhone, sendTemplates: true }`

    4. `addPendingTemplate(token: string, templateData: PendingTemplate): Promise<DomainResult<void>>`
       - Appends a template entry to the `pending_templates` JSONB array
       - Used by Plan 02 when template actions are skipped
       - PendingTemplate type: `{ templateName: string, variables: Record<string, string>, language: string, headerMediaUrl?: string }`

    Import domain functions: updateContact, deleteContact from contacts.ts, updateOrder, removeOrderTag from orders.ts.
    Use createAdminClient for direct DB access where domain functions don't apply (contact_reviews table itself).
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - All four functions exported
    - resolveContactReview handles both merge and ignore paths
  </verify>
  <done>
    - Domain module follows project patterns (createAdminClient, DomainContext, DomainResult)
    - createContactReview returns token for action links
    - resolveContactReview handles merge (update phone + reassign order) and ignore (keep new contact)
    - addPendingTemplate appends template info for later replay
    - Both paths remove REVISAR-CONTACTO tag
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- Migration file has correct table structure including pending_templates JSONB column
- phone-distance.ts Levenshtein implementation handles edge cases (same phone = 0, completely different = high)
- Domain module exports all 4 functions with correct types
</verification>

<success_criteria>
- contact_reviews migration ready to apply (includes pending_templates column)
- findClosePhone detects 1-2 digit phone differences with name similarity check
- Domain CRUD for contact reviews complete with merge/ignore resolution logic and pending template storage
- All code compiles without errors
</success_criteria>

<output>
After completion, create `.planning/standalone/shopify-contact-resolution/01-SUMMARY.md`
</output>
