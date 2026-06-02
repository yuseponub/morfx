---
phase: 43-mobile-app
plan: 03
type: execute
wave: 2
depends_on: [1, 2]
files_modified:
  - src/app/api/mobile/_lib/auth.ts
  - src/app/api/mobile/_lib/errors.ts
  - src/app/api/mobile/_lib/rate-limit.ts
  - src/app/api/mobile/health/route.ts
  - src/app/api/mobile/me/route.ts
  - src/app/api/mobile/workspaces/route.ts
  - shared/mobile-api/schemas.ts
autonomous: true
must_haves:
  truths:
    - "Every mobile API route lives under src/app/api/mobile/ and authenticates via Supabase JWT in Authorization: Bearer header"
    - "Unauthenticated requests receive 401 with JSON { error: 'unauthorized' }"
    - "All write routes call into src/lib/domain/ — NEVER write directly to Supabase from the route handler (CLAUDE.md Regla 3)"
    - "Zod schemas for request/response are centralized in shared/mobile-api/schemas.ts and can be imported by both the Next.js route handlers and the mobile app"
    - "A GET /api/mobile/health endpoint returns 200 with { ok: true } and can be called from the mobile app on cold start"
    - "A GET /api/mobile/me endpoint returns the authenticated user + their workspace memberships"
    - "A GET /api/mobile/workspaces endpoint returns the list of workspaces the user belongs to"
  artifacts:
    - src/app/api/mobile/_lib/auth.ts
    - src/app/api/mobile/health/route.ts
    - src/app/api/mobile/me/route.ts
    - src/app/api/mobile/workspaces/route.ts
    - shared/mobile-api/schemas.ts
  key_links:
    - "Every future mobile API route (send message, toggle bot, create order, etc.) goes through the auth helper in _lib/auth.ts"
    - "shared/mobile-api/schemas.ts is the contract between web Next.js routes and the mobile app"
---

<objective>
Establish the mobile-facing HTTP API layer inside the existing Next.js app. All mobile requests go through `src/app/api/mobile/*` route handlers that authenticate via Supabase JWT, validate input/output with Zod schemas shared with the mobile client, and delegate all mutations to `src/lib/domain/` per CLAUDE.md Regla 3. This plan ships only the skeleton (auth helper, error helper, health + me + workspaces routes) so the mobile app can prove the wire end-to-end. Feature-specific routes come in later plans.

Decision (documented per critical constraint): we choose **Next.js Route Handlers under `src/app/api/mobile/`** over "server actions exposed as HTTP" because route handlers have an unambiguous HTTP contract, work with Bearer tokens cleanly, and don't depend on server action internal conventions. The mobile app will call these routes via `fetch` with an `Authorization: Bearer <supabase-jwt>` header.

Output: auth helper, error helper, rate-limit stub, three working endpoints, and a shared Zod schema module that both the web and mobile can import.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
@CLAUDE.md
@src/lib/domain/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create auth + error + rate-limit helpers under src/app/api/mobile/_lib/</name>
  <files>
    src/app/api/mobile/_lib/auth.ts
    src/app/api/mobile/_lib/errors.ts
    src/app/api/mobile/_lib/rate-limit.ts
  </files>
  <action>Create `auth.ts`: export `requireMobileAuth(req: Request)` that:
  1. Reads `Authorization: Bearer <token>` header.
  2. Calls `createAdminClient().auth.getUser(token)` to validate the JWT and get the user.
  3. Loads the user's workspace memberships from `workspace_members` filtered by `user_id` AND requires an explicit `x-workspace-id` header on every authenticated request (the mobile app sends the currently-selected workspace). Validates the user is a member of that workspace. MEMORY note: `workspace_members .single() MUST filter by workspace_id` — respect this.
  4. Returns `{ user, workspaceId, membership }` or throws a `MobileAuthError`.

  Create `errors.ts`: export `MobileAuthError`, `MobileValidationError`, `MobileNotFoundError`, and a helper `toMobileErrorResponse(err)` that maps them to `NextResponse.json({ error }, { status })`.

  Create `rate-limit.ts`: export a no-op stub `rateLimitMobile(req, key)` that returns `{ ok: true }` for now. A comment explains this will be replaced with the existing web rate limiter in a later phase — stub for now to unblock endpoints.

  Use existing `createAdminClient()` from wherever it lives in the codebase (`src/lib/supabase/admin.ts` — verify path with Grep).</action>
  <verify>`npx tsc --noEmit` in repo root passes. Grep for `createAdminClient` confirms the import path used matches the real file.</verify>
  <done>All three helpers exist, type-check, and `requireMobileAuth` validates the JWT + workspace membership correctly.</done>
</task>

<task type="auto">
  <name>Task 2: Create shared Zod schema module at shared/mobile-api/schemas.ts</name>
  <files>shared/mobile-api/schemas.ts</files>
  <action>Create `shared/mobile-api/schemas.ts` at the repo root. Export:
  - `HealthResponseSchema` = `z.object({ ok: z.literal(true), ts: z.string() })`
  - `MeResponseSchema` = user fields + an array of workspace memberships
  - `WorkspaceSchema` = `z.object({ id: z.string().uuid(), name: z.string(), slug: z.string().nullable() })`
  - `WorkspacesResponseSchema` = `z.object({ workspaces: z.array(WorkspaceSchema) })`
  - `ErrorResponseSchema` = `z.object({ error: z.string() })`

  Add a README comment at the top: "This file is the contract between src/app/api/mobile/* and apps/mobile/. Import via relative path from both sides. Do not add runtime dependencies — pure Zod only."

  Both the web route handlers (Task 3) and the mobile app (future plans) will import from this path. For the mobile app, the import will be a relative path traversal (e.g. `../../shared/mobile-api/schemas`) — document this in the file header.</action>
  <verify>`npx tsc --noEmit` passes. The file has zero imports except `zod`.</verify>
  <done>Schema module exists with the five schemas listed above.</done>
</task>

<task type="auto">
  <name>Task 3: Implement /api/mobile/health, /api/mobile/me, /api/mobile/workspaces</name>
  <files>
    src/app/api/mobile/health/route.ts
    src/app/api/mobile/me/route.ts
    src/app/api/mobile/workspaces/route.ts
  </files>
  <action>Create three Next.js App Router route handlers.

  `health/route.ts`: GET returns `HealthResponseSchema.parse({ ok: true, ts: new Date().toISOString() })`. No auth required. Exists so the mobile app can test connectivity on cold start.

  `me/route.ts`: GET calls `requireMobileAuth(req)`. Returns the user + their workspace memberships (joined query via createAdminClient, filtered by user_id). Validates the response against `MeResponseSchema`.

  `workspaces/route.ts`: GET calls `requireMobileAuth(req)`. Returns `{ workspaces: [...] }` — the list of workspaces the user belongs to. This is what the multi-workspace switcher (Plan 6) will call. Validates against `WorkspacesResponseSchema`.

  All three wrap errors with `toMobileErrorResponse`. All three set `Cache-Control: no-store`. Use `export const dynamic = 'force-dynamic'` to prevent Next.js from trying to pre-render.

  Do NOT call any mutating code — these are read-only routes. If you find yourself writing to Supabase in this plan, stop and move that code into `src/lib/domain/` (Regla 3).</action>
  <verify>`npm run build` in repo root passes. Manually hit `curl http://localhost:3020/api/mobile/health` (if dev server is running) → expect `{"ok":true,"ts":"..."}`. Unauthenticated `curl` to `/api/mobile/me` returns 401.</verify>
  <done>Three routes exist, type-check, build, and behave correctly.</done>
</task>

</tasks>

<verification>
- `curl /api/mobile/health` returns 200 with `{ok:true}`
- `curl /api/mobile/me` with no auth returns 401
- `curl /api/mobile/me` with a valid Supabase JWT + `x-workspace-id` returns the user's profile
- No route handler writes directly to Supabase (all future mutations will go through `src/lib/domain/`)
- `shared/mobile-api/schemas.ts` can be imported with a relative path from `apps/mobile/` without bundling the web code
</verification>

<success_criteria>
Mobile API skeleton is functional, authenticated, and the shared Zod schema contract exists. Future mobile feature plans can add routes under `src/app/api/mobile/*` following the pattern established here.
</success_criteria>

<output>
After completion, create `.planning/phases/43-mobile-app/43-03-SUMMARY.md` with: routing decision (route handlers chosen, rationale), auth header format, how mobile app imports shared schemas, list of the three endpoints shipped.
</output>
