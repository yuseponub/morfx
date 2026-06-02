---
phase: 43-mobile-app
plan: 10a
type: execute
wave: 7
depends_on: [3, 8]
files_modified:
  - src/app/api/mobile/conversations/[id]/contact/route.ts
  - src/app/api/mobile/conversations/[id]/orders/route.ts
  - src/app/api/mobile/contacts/[id]/tags/route.ts
  - src/app/api/mobile/contacts/[id]/name/route.ts
  - src/app/api/mobile/orders/[id]/stage/route.ts
  - src/app/api/mobile/orders/[id]/tags/route.ts
  - src/app/api/mobile/orders/[id]/recompra/route.ts
  - src/app/api/mobile/orders/route.ts
  - src/app/api/mobile/pipeline-stages/route.ts
  - src/app/api/mobile/tags/route.ts
  - shared/mobile-api/schemas.ts
autonomous: true
must_haves:
  truths:
    - "All 12 mobile CRM endpoints exist and route every write through src/lib/domain/ per Regla 3"
    - "GET /api/mobile/conversations/:id/contact returns contact details + tags + 24h window indicator"
    - "GET /api/mobile/conversations/:id/orders returns recent orders for the contact with stage + tags + total"
    - "Write endpoints (move stage, add/remove tag, create order, update name, recompra) each call an existing or newly-created src/lib/domain/ function"
    - "If the web currently writes directly to Supabase for any of these mutations, a domain function is created here to fix the Regla 3 violation"
    - "Zod schemas for contact/order/pipeline-stage/tag/window-indicator are exported from shared/mobile-api/schemas.ts"
  artifacts:
    - src/app/api/mobile/conversations/[id]/contact/route.ts
    - src/app/api/mobile/conversations/[id]/orders/route.ts
    - shared/mobile-api/schemas.ts
  key_links:
    - "Plan 10b UI consumes every endpoint shipped here"
    - "Plan 14 template sending still depends on this plan via 10b"
---

<objective>
Ship the backend-only slice of the in-chat CRM drawer. This is the split of the original Plan 10 into 10a (endpoints) and 10b (UI drawer) per checker guidance — the original scope of 27 files + 12 endpoints + UI was too large for a single plan. Here we ship only the 12 mobile API routes + Zod schemas. The drawer UI + hook + components come in Plan 10b.

Every write route goes through `src/lib/domain/` per Regla 3. Where a domain function does not exist yet, create it (or fix an existing web direct-write). Read routes (contact/orders/pipeline-stages/tags) use `createAdminClient` filtered by `workspace_id`.

Output: 12 endpoints + extended schemas.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
@src/app/(dashboard)/whatsapp/components/contact-panel.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend shared/mobile-api/schemas.ts with CRM drawer schemas</name>
  <files>
    shared/mobile-api/schemas.ts
  </files>
  <action>
  Add the following Zod schemas:
  - `MobileContactSchema` — id, name (nullable), phone, address (nullable), city (nullable), avatar_url (nullable), tags (string[]), created_at
  - `MobileOrderSchema` — id, total (number), currency (literal 'COP'), stage_id, stage_name, stage_color, created_at (ISO), tags (string[])
  - `MobilePipelineStageSchema` — id, name, color, position
  - `MobileTagSchema` — id, name, color
  - `WindowIndicatorSchema` — `{ within_window: boolean, last_customer_message_at: string | null, hours_remaining: number | null }`
  - `MobileContactPanelResponseSchema` — `{ contact: MobileContactSchema, conversation_tags: string[], window: WindowIndicatorSchema }`
  - `MobileRecentOrdersResponseSchema` — `{ orders: MobileOrderSchema[] }`
  - `MobilePipelineStagesResponseSchema` / `MobileTagsResponseSchema`
  - Request schemas: `UpdateContactNameRequest`, `CreateOrderRequest`, `MoveOrderStageRequest`, `AddTagRequest` / `RemoveTagRequest` for both contact and order tag operations.
  </action>
  <verify>`npx tsc --noEmit` passes. Schemas compile.</verify>
  <done>Schemas exported.</done>
</task>

<task type="auto">
  <name>Task 2: Implement all 12 mobile CRM endpoints — every write via src/lib/domain/</name>
  <files>
    src/app/api/mobile/conversations/[id]/contact/route.ts
    src/app/api/mobile/conversations/[id]/orders/route.ts
    src/app/api/mobile/contacts/[id]/tags/route.ts
    src/app/api/mobile/contacts/[id]/name/route.ts
    src/app/api/mobile/orders/[id]/stage/route.ts
    src/app/api/mobile/orders/[id]/tags/route.ts
    src/app/api/mobile/orders/[id]/recompra/route.ts
    src/app/api/mobile/orders/route.ts
    src/app/api/mobile/pipeline-stages/route.ts
    src/app/api/mobile/tags/route.ts
  </files>
  <action>
  Endpoints (every write goes via `src/lib/domain/`):
  - GET /api/mobile/conversations/:id/contact — returns contact details + conversation tags + 24h window indicator. Window = compute from `last_customer_message_at` (within_window = now - last < 24h).
  - POST /api/mobile/contacts/:id/name — calls domain `updateContactName({ workspaceId, contactId, name })`.
  - GET /api/mobile/conversations/:id/orders — recent orders for the conversation's contact (limit 10, ordered by created_at DESC).
  - POST /api/mobile/orders (create) — calls domain `createOrder` with defaults `{ contactId, conversationId, stage_id: (first stage), total: 0 }`.
  - POST /api/mobile/orders/:id/stage — calls domain `moveOrderStage` (Grep for existing web domain function).
  - POST /api/mobile/orders/:id/tags (add) / DELETE /api/mobile/orders/:id/tags (remove) — domain `addOrderTag` / `removeOrderTag`.
  - POST /api/mobile/orders/:id/recompra — calls domain `cloneOrderForRecompra`.
  - POST /api/mobile/contacts/:id/tags (add) / DELETE — domain `addContactTag` / `removeContactTag`.
  - GET /api/mobile/pipeline-stages — all stages for the workspace, ordered by position.
  - GET /api/mobile/tags — all tags for the workspace.

  For EACH write above, if the domain function does not exist, find where the web currently mutates that data (probably already goes through domain per Regla 3) and reuse it. If the web cheats and writes directly, STOP and create the domain function first — that's a Regla 3 violation that must be fixed as part of this plan.

  All routes call `requireMobileAuth(req)` first. All routes use `toMobileErrorResponse` for errors. All routes set `Cache-Control: no-store` + `export const dynamic = 'force-dynamic'`.</action>
  <verify>`npm run build` passes. `curl` each endpoint returns the correct shape or 401 unauthenticated.</verify>
  <done>All 12 endpoints ship + route through domain.</done>
</task>

</tasks>

<verification>
- 12 endpoints exist, type-check, build
- Every write endpoint calls src/lib/domain/ (Regla 3)
- Any Regla 3 violation found in the web path is fixed here (new domain function created)
- Zod schemas export from shared/mobile-api/schemas.ts
</verification>

<success_criteria>
Backend CRM surface is ready for Plan 10b to consume. All mutations are domain-routed.
</success_criteria>

<output>
After completion, create `.planning/phases/43-mobile-app/43-10a-SUMMARY.md` with: list of endpoints shipped, list of domain functions touched (existing reused vs newly created), any Regla 3 violations fixed as a byproduct.
</output>
