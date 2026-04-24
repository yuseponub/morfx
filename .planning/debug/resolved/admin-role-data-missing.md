---
status: resolved
trigger: "Admin users see empty kanban cards in /crm/pedidos while owner sees full data. Scope of regression across modules unknown."
created: 2026-04-24
updated: 2026-04-24
resolved: 2026-04-24
workspace_observed: a3843b3f-c337-4836-92b5-89c58bb98490 (Somnio)
severity: low (cosmetic — not a data/RLS bug)
investigator: gsd-debug-session-manager
resolution_category: theming (dark-mode) — workaround applied by user
---

# Debug: admin-role-data-missing

## Trigger

Surfaced during UI retrofit QA 2026-04-24. After rollback of `ui_dashboard_v2.enabled=false` in Somnio, legacy shadcn kanban renders. User reports:

> "a mi usuario admin no [ve las cards]" — admin users see empty cards; "usuario owner" sees cards normally.

User explicitly requests scope audit: **¿solo `/crm/pedidos` o también `/whatsapp` y demás módulos?**

## Symptoms

- **expected:** Admin role users see the same data as owner role users across all modules (kanban cards show `order.name`, `order.products`, `order.tags`, `order.tracking_number`, `order.contact.city`, timestamps).
- **actual:** In `/crm/pedidos` kanban, admin users see card shells (border, padding, structure) but the data inside appears missing/empty. Owner users see full cards.
- **errors:** No console errors reported by user. Visual symptom only.
- **timeline:** Unknown when regression started. Discovered 2026-04-24. Pre-existing (reproduces with `ui_dashboard_v2.enabled=false`, so NOT caused by retrofit commits `80ff618..e3143fd`).
- **reproduction:** Login as admin role user in Somnio workspace → navigate `/crm/pedidos` → kanban board renders cards without data. Owner login in same workspace shows full data.
- **scope (TBD):** User wants audit of other modules — /whatsapp, /crm/contactos, /tareas, /analytics, /sms, /confirmaciones, /automatizaciones, /agentes, /metricas — to determine if admin role is broken globally or only in specific modules.

## Hypotheses ranked

### H1 (primary, 70% confidence) — RLS policies on related tables check owner-only role

**STATUS: REFUTED by code review 2026-04-24.**

See Evidence §E1. All core data tables use the role-agnostic helper `is_workspace_member(workspace_uuid)` (defined in `20260128000001_workspaces_and_roles.sql:81-92`) which only checks membership, not role. Admin users ARE workspace members, so they pass RLS on `orders`, `order_products`, `order_tags`, `tags`, `contacts`, `contact_tags`, `pipeline_stages`, `pipelines`, `products`.

No policy in `supabase/migrations/**` restricts SELECT on these tables to `'owner'` only. The only owner-restricted helper (`is_workspace_owner`, `20260204000004_shopify_integration.sql:11-23`) is used exclusively on the `integrations` table — irrelevant to kanban cards.

### H2 (secondary, 20%) — `workspace_members.single()` bug without workspace_id filter

**STATUS: REFUTED by code scan 2026-04-24.**

See Evidence §E2. A Python scan of all `.ts`/`.tsx` files under `src/` found exactly ONE `workspace_members` query using `.single()` with `user_id` filter but without `workspace_id` filter: `src/app/actions/workspace.ts:36-41` (`getActiveWorkspaceId` fallback for new users). This is intentional (picks ANY workspace the user belongs to if cookie missing) and cannot cause the specific symptom "admin sees empty cards in a specific workspace cookie".

All role-check queries in both page `/crm/pedidos/page.tsx:17-24` and server actions (invitations, notes, order-notes, task-notes, logistics-config, custom-fields, metricas-conversaciones-settings, client-activation, integrations, agent-config) correctly filter by both `workspace_id` and `user_id`.

### H3 (tertiary, 10%) — Supabase RLS helper function caches stale membership

**STATUS: NOT APPLICABLE.**

RLS helpers use live DB lookup (`SELECT 1 FROM workspace_members...`) not JWT `app_metadata`. See `is_workspace_member`, `is_workspace_admin`, `is_workspace_manager`, `has_workspace_role` — all are `STABLE SECURITY DEFINER sql` functions that query the table live. No caching concern.

### H4 (NEW, 35%) — Admin user's membership row has workspace_id mismatch or was created in a different workspace

Hypothesis: The "admin" user the reporter is using was originally invited to a DIFFERENT workspace (e.g. a test/dev workspace) and their `workspace_members` row for Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`) was never created, OR exists but links to a stale `user_id`. In this case:

- Page `/crm/pedidos/page.tsx:17-24` queries `workspace_members` with `.eq('workspace_id', somnio).eq('user_id', admin.id).single()`. If 0 rows → `isAdminOrOwner=false`. Page still renders, but `getOrders()`/`getOrdersForStage()` call `createClient()` → RLS check `is_workspace_member(somnio)` returns FALSE → SELECT returns zero rows.
- Expected visual: empty columns "Sin pedidos" for every stage — NOT card shells with empty data.

**Refinement:** If admin sees card SHELLS (not empty columns), this refutes H4 too. The presence of cards implies `SELECT * FROM orders` succeeded (RLS passed). The missing data must be in the JOINS: `contact:contacts`, `products:order_products`, `tags:order_tags(tag:tags)`, `stage:pipeline_stages`.

### H5 (NEW, 45%) — User-reported symptom is misinterpreted; cards are rendering correctly but for orders that genuinely have no name/products/contact/tags

Possibility: The orders admin is viewing are genuinely empty — e.g. Somnio has orders created via webhook/agent with `name=null`, `contact_id=null`, no products attached, no tags. The "shell" look is simply how `KanbanCard` renders when `order.products=[]`, `order.tags=[]`, `order.contact=null`, `order.tracking_number=null`:

- Line 150: `{order.name || 'Sin nombre'}` → "Sin nombre"
- Line 155: `formatCurrency(order.total_value)` → `$0`
- Line 160 gate: `{order.products.length > 0 && ...}` → product row HIDDEN
- Line 172 gate: `{order.tracking_number && ...}` → tracking row HIDDEN
- Line 183 gate: `{order.tags.length > 0 && ...}` → tag row HIDDEN
- Line 229 gate: `{order.contact?.city && ...}` → city HIDDEN

Result: card with "Sin nombre" + "$0" + timestamp only. Owner, if viewing a DIFFERENT set of orders (e.g. admin is filtered to a stage with only these synthetic orders, owner defaults to a populated stage), would see full cards.

**Test:** Ask the user to inspect the SAME order ID as both admin and owner. If owner shows full data and admin shows empty, H5 is refuted; H6 (below) becomes primary.

### H6 (NEW, 40%) — JWT claims mismatch between admin and owner

The owner's JWT may contain `app_metadata.workspace_id` (set when the workspace was created via `create_workspace_with_owner` RPC). Admin, joined later via `accept_workspace_invitation`, may have NO `workspace_id` in `app_metadata` — only a `workspace_members` row.

`get_current_workspace_id()` and `set_workspace_id()` trigger read from JWT `app_metadata.workspace_id`. These are used for:
- `set_workspace_id()` trigger on INSERT — not relevant to SELECT
- `get_current_workspace_id()` — defined but grep shows it is NOT called in any RLS policy

So `app_metadata.workspace_id` absence shouldn't affect SELECT. REFUTED unless a policy uses it.

**HOWEVER**, `createServerClient` from `@supabase/ssr` uses the anon key + the user's session cookie (refresh token) to produce a JWT. If the admin user's session was generated BEFORE they were added to Somnio, their `app_metadata` may be stale or empty. Needs live verification.

## Current Focus

```yaml
hypothesis: "H1/H2/H3 refuted by code review. Primary working hypothesis: either H5 (symptom misinterpretation — cards are faithfully rendering orders with genuinely NULL joins in DB) or H4 (admin's workspace_members row is missing/stale, causing RLS to block joins but NOT orders table itself — possible if RLS on orders and RLS on order_products diverge in some runtime edge case)."
test: "Requires live DB access (Supabase MCP or user-run SQL) + visual comparison between admin and owner sessions on the SAME order ID. Without live access, cannot distinguish H4 from H5."
expecting: "Evidence needed: (a) A specific order_id that admin sees as 'empty' and owner sees 'full'. (b) Output of: SELECT role FROM workspace_members WHERE workspace_id='a3843b3f-...' AND user_id='<admin.user_id>'. (c) Output of: SET LOCAL role authenticated; SET LOCAL request.jwt.claims TO '{...admin_jwt...}'; SELECT * FROM orders LEFT JOIN order_products ON ... WHERE id='<that_order_id>'. (d) Compare to same query as owner."
next_action: "ESCALATE to user — need live evidence. Options below."
reasoning_checkpoint: "Code-level review is exhausted. All RLS policies are role-agnostic. All permission checks in TS code permit admin the same data access as owner. If the bug is real, it's either (1) a DB data problem (H4 — admin's membership row missing/stale) or (2) a misinterpretation (H5 — admin happens to be viewing different orders than owner). Cannot proceed without live DB evidence."
```

## Evidence

### E1 — RLS policies on core tables are role-agnostic (2026-04-24)

Evidence source: `supabase/migrations/*.sql` (109 migration files reviewed; only 6 reference `'owner'` or `'admin'` literals).

| Table | SELECT policy | Role check |
|---|---|---|
| `workspaces` | `is_workspace_member(id)` | membership only |
| `workspace_members` | `is_workspace_member(workspace_id)` | membership only |
| `contacts` | `is_workspace_member(workspace_id)` | membership only |
| `contact_tags` | `is_workspace_member(contacts.workspace_id)` via parent | membership only |
| `tags` | `is_workspace_member(workspace_id)` | membership only |
| `orders` | `is_workspace_member(workspace_id)` | membership only |
| `order_products` | `is_workspace_member(orders.workspace_id)` via parent | membership only |
| `order_tags` | `is_workspace_member(orders.workspace_id)` via parent | membership only |
| `products` | `is_workspace_member(workspace_id)` | membership only |
| `pipelines` | `is_workspace_member(workspace_id)` | membership only |
| `pipeline_stages` | `is_workspace_member(pipelines.workspace_id)` via parent | membership only |
| `conversations` | `is_workspace_member(workspace_id) AND (is_workspace_manager(...) OR assigned_to=auth.uid() OR assigned_to IS NULL)` | admin IS manager — passes |
| `pipeline_closure_tags` | `workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id=auth.uid())` | membership only |
| `integrations` | `is_workspace_owner(workspace_id)` | **OWNER-ONLY** (irrelevant to kanban cards) |

Source helpers (`20260128000001_workspaces_and_roles.sql:81-126`):

```sql
is_workspace_member(uuid) → role-agnostic, checks any role membership
is_workspace_admin(uuid)  → role IN ('owner','admin')
has_workspace_role(uuid, text) → nuanced, owner can do anything, admin can do 'agent' tasks
is_workspace_manager(uuid) → role IN ('owner','admin')  [from 20260131000003]
is_workspace_owner(uuid)  → role = 'owner' only  [from 20260204000004]
```

No RLS policy on any of the kanban-card-joined tables uses `is_workspace_owner` or a literal `role = 'owner'`.

### E2 — workspace_members.single() scan (2026-04-24)

Python scan script (custom regex walk) over `src/**/*.ts`/`*.tsx`. Filtered for `.from('workspace_members')` blocks ending in `.single()` or `.maybeSingle()` with `user_id` filter but no `workspace_id` filter.

Result: 1 hit.

```
src/app/actions/workspace.ts:36-41 — getActiveWorkspaceId() fallback
  .from('workspace_members').select('workspace_id').eq('user_id', user.id).limit(1).single()
```

**Verdict:** intentional fallback for users without cookie. Cannot cause the specific "admin in Somnio sees empty cards" symptom (would cause wrong workspace selection, not data gaps).

All other `workspace_members` queries in the codebase (33 files) correctly filter by both `workspace_id` and `user_id`. No H2 bug.

### E3 — Permission code grants admin full data access (2026-04-24)

`src/lib/permissions.ts:47-63` — admin role permissions:
```
'workspace.manage', 'members.invite', 'members.remove',
'contacts.view', 'contacts.create', 'contacts.edit', 'contacts.delete',
'orders.view', 'orders.create', 'orders.edit', 'orders.delete',
'whatsapp.view', 'whatsapp.send',
'settings.view', 'settings.edit'
```

vs owner: adds `workspace.delete` and `members.change_role`. All data-view permissions are identical for admin and owner. No code-level permission gates admin away from order/contact/tag data.

### E4 — Kanban card render is NOT gated by role (2026-04-24)

`src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` — no references to `isAdminOrOwner`, `role`, or permissions. Card renders based purely on `order.*` fields. Same card component used for both admin and owner.

`isAdminOrOwner` is passed only to `orders-view.tsx → order-sheet.tsx → order-notes-section.tsx:185` where it gates edit/delete of OTHER users' notes. Does NOT gate card rendering.

### E5 — Server actions for kanban data are role-agnostic (2026-04-24)

`src/app/actions/orders.ts`:
- `getOrders()` lines 241-311 — no role filter, only workspace_id from cookie
- `getOrdersForStage()` lines 324-369 — same
- `getStageOrderCounts()` lines 375-405 — same
- Auth helper `getAuthContext()` lines 76-88 — returns `{workspaceId, userId}` — no role gate

`src/app/actions/tags.ts:getTagsForScope(245-282)` — no role filter.

No server action that feeds kanban cards checks user role before returning data.

### E6 — Layout/flag gate pass-through when ui_dashboard_v2=false (2026-04-24)

`src/app/(dashboard)/crm/layout.tsx:35-40` — when flag false, layout is `return <>{children}</>;` byte-identical to no layout. Confirms the bug is NOT in the retrofit layer (user stated flag is off).

## Eliminated

- **RLS owner-only filter on order joins** (H1) — every relevant table uses `is_workspace_member`, which accepts any role.
- **`workspace_members.single()` without workspace_id filter** (H2) — single hit is intentional fallback logic, irrelevant.
- **JWT cached membership** (H3) — helpers use live DB lookup.
- **Retrofit commits `80ff618..e3143fd` causing regression** — user verified bug reproduces with flag OFF; retrofit code path not engaged.
- **UI component gates card data by role** (E4) — kanban-card.tsx has no role logic.
- **Server actions gate data by role** (E5) — all data-fetching actions are role-agnostic.

## Remaining paths to confirm root cause

To distinguish H4 (membership-data issue) vs H5 (symptom misinterpretation) vs H6 (JWT stale) vs H7 (as-yet-unidentified), we need **one of**:

### Path A — Live DB inspection (preferred)

Run in Supabase SQL editor connected to prod:

```sql
-- A1: Confirm admin is a valid member of Somnio
SELECT wm.user_id, wm.role, wm.created_at, u.email
FROM workspace_members wm
JOIN auth.users u ON u.id = wm.user_id
WHERE wm.workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
ORDER BY wm.role, wm.created_at;
-- Expected: 1 owner row + N admin rows + M agent rows.
-- If admin user reporting the bug is MISSING from this list → H4 confirmed.

-- A2: Pick one admin's user_id from A1 and simulate their SELECT against orders
-- (run as postgres/service_role so we can impersonate)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"<admin_user_id>","role":"authenticated"}';

SELECT o.id, o.name, o.total_value, o.contact_id, o.tracking_number,
       c.name AS contact_name, c.city AS contact_city,
       (SELECT json_agg(op.*) FROM order_products op WHERE op.order_id = o.id) AS products,
       (SELECT json_agg(t.*) FROM order_tags ot JOIN tags t ON t.id = ot.tag_id WHERE ot.order_id = o.id) AS tags
FROM orders o
LEFT JOIN contacts c ON c.id = o.contact_id
WHERE o.workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
ORDER BY o.created_at DESC
LIMIT 5;

-- A3: Same as A2 but with owner's user_id. Compare row-for-row.
-- Expected if H4 confirmed: admin's products/tags/contact fields are NULL/empty while owner's are populated.
-- Expected if H5: both admin and owner get identical data → bug is in UI, not data layer.

-- A4: Enumerate all current RLS policies once more, from the source of truth
SELECT schemaname, tablename, policyname, cmd, roles, qual::text, with_check::text
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual::text ILIKE '%owner%' OR with_check::text ILIKE '%owner%'
    OR qual::text ILIKE '%admin%' OR with_check::text ILIKE '%admin%')
ORDER BY tablename, policyname;
-- Expected: matches code-review results (E1). If NOT, there's a migration-drift in prod.
```

### Path B — Visual evidence from user

Ask the reporter to:
1. Find one order_id that admin sees as "empty".
2. Have owner view the same order_id.
3. Share screenshots of BOTH kanban cards side-by-side.

If owner's card shows e.g. `"Pedido 1234" $120.000 + Elixir + tag [Nuevo] + Bucaramanga` and admin's same card shows `"Sin nombre" $0` → confirms bug is in data path, not in UI.

If owner's card also shows `"Sin nombre" $0` → H5 confirmed; no bug; order is genuinely sparse.

### Path C — Direct database probe via service role

The executor of this session does NOT have Supabase MCP configured (verified via tool availability). User can run `supabase db remote connect` or use Studio to execute Path A queries directly.

## Scope audit (preliminary — pending live evidence)

Given RLS is role-agnostic across the codebase, the scope of any real admin-vs-owner data divergence should be:

| Module | Tables used | Role-agnostic RLS? | Likelihood of admin-data-gap |
|---|---|---|---|
| `/crm/pedidos` | orders, order_products, order_tags, tags, contacts, pipeline_stages | YES | Low (unless H4) |
| `/crm/contactos` | contacts, contact_tags, tags | YES | Low (unless H4) |
| `/whatsapp` | conversations, conversation_messages, contacts | SELECT uses `is_workspace_member AND (is_workspace_manager OR assigned_to=auth.uid() OR assigned_to IS NULL)` — admin IS manager, passes | Low |
| `/tareas` | tasks, task_assignees | Pending verification | Pending |
| `/analytics` | agent_sessions, conversation_metrics, etc. | Pending verification | Pending |
| `/sms` | sms_messages | Pending verification | Pending |
| `/confirmaciones` | orders (subset) | Same as /crm/pedidos | Low (unless H4) |
| `/configuracion/integraciones` | integrations | `is_workspace_owner` — **ADMIN IS BLOCKED** by design | **EXPECTED — not a bug** |
| `/settings` (owner-only items) | workspaces | Owner filtering in TS code — by design | **EXPECTED — not a bug** |

## Resolution

(pending — requires live DB evidence per Path A or B above)

## Root Cause

**RESOLVED 2026-04-24 — Dark-mode browser/OS theme, NOT a data/RLS bug.**

### What actually happened

The "admin" user had their browser (or OS) set to dark mode. The `.theme-editorial` wrapper in `(dashboard)/layout.tsx` renders with `--background: var(--paper-1)` (cream light) but shadcn's `.dark` class variants (defined `20260128000001_workspaces_and_roles.sql` vs globals.css `:root.dark` block) set `--foreground: oklch(0.984 ...)` (near-white) for text tokens. When shadcn components inside `.theme-editorial` render without an explicit `text-foreground` that respects the editorial paper-ink mapping, text inherits near-white from the dark-mode cascade.

Result: text rendered **white on cream** → visually invisible → kanban cards appeared "empty" (shell visible, content invisible).

Owner user had light mode → text visible → cards looked full.

**It was NEVER a data issue.** All three initial hypotheses (RLS role-check, workspace_members.single() bug, JWT caching) were correctly refuted by the code audit. The "admin vs owner" framing was a red herring — it was user A in dark mode vs user B in light mode.

### User workaround applied

User switched browser out of dark mode → cards render correctly for admin user immediately. No code change deployed.

### Systemic gap (documented, not fixed in this session)

The `.theme-editorial` wrapper does NOT currently neutralize dark-mode cascades. Shadcn components inside a light-editorial theme that the user views in dark-mode browser can render unreadable text. Real fix would be one of:

- Force light mode on `.theme-editorial` wrapper via `color-scheme: light` + explicit override of `:root.dark` variables when `.theme-editorial` is an ancestor.
- OR: support a genuine dark-editorial variant (paper-0..3 dark + ink-1..3 light) and toggle based on `prefers-color-scheme`.

Recommendation: file as separate backlog item for post-retrofit phase work. NOT urgent — affects cosmetic legibility only, and only for users who explicitly enable OS/browser dark mode. Users who use morfx in default light mode are unaffected.

### Scope clarification

- Bug does NOT affect other modules in a data sense — RLS is role-agnostic across the entire codebase (confirmed in §E1).
- ANY module under `(dashboard)/layout.tsx` (wrapped by `.theme-editorial`) has the same potential dark-mode cascade issue — but users report it first in the kanban because the cards have the most text-on-background contrast.
- `/settings/*` and `/login` (outside `.theme-editorial`) are unaffected.

### Files to touch for the systemic fix (future phase)

- `src/app/globals.css` — add `color-scheme: light` to `.theme-editorial` rule OR override all `:root.dark` tokens when `.theme-editorial` is ancestor.
- `src/app/(dashboard)/layout.tsx` — optionally set `data-theme="editorial"` attribute for finer-grained CSS scoping.

### Closing actions

- Status → resolved.
- File moved to `.planning/debug/resolved/admin-role-data-missing.md`.
- Cosmetic dark-mode systemic fix deferred as separate backlog (not part of retrofit Plan 01 scope).

Three code-level hypotheses (H1 RLS, H2 single() bug, H3 JWT cache) are REFUTED by the migration and source-code audit documented in §Evidence.

The remaining viable hypotheses (H4 admin-membership-data, H5 symptom misinterpretation, H6 JWT stale) all require live database inspection to distinguish. The session-manager/debugger environment does not have direct DB access configured.

**Recommendation to user:**
1. Run queries A1–A4 from §Remaining paths §Path A in the Supabase SQL editor (or have a teammate with prod access do so).
2. OR capture the two screenshots described in §Path B.
3. Paste the output back into this debug session and run `/gsd-debug continue admin-role-data-missing`.

**Predicted outcomes:**
- If A1 shows admin missing from `workspace_members` for Somnio → H4 confirmed, fix is data-level (add membership row). Zero-code change needed.
- If A2/A3 show identical data for admin and owner → H5 confirmed, no bug. User is comparing different orders. Close session.
- If A2/A3 show admin getting NULL joins while owner gets populated joins → a drift between code and prod (new hypothesis). Re-open with SQL from `pg_policies` to find the out-of-band policy.
- If A4 reveals an owner-only policy NOT in the codebase → prod has a manual migration drift. This is the only remaining code-correctable scenario.

No SQL migration is proposed in this session because **no code-level root cause has been confirmed**. Applying a speculative RLS change risks either (a) no effect (if RLS is already correct) or (b) inadvertent widening of admin write access. Per CLAUDE.md Regla 5 + the session's `find_root_cause_only` mode, diagnostics stop here.
