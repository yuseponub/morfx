# Plan: Multi-Workspace WhatsApp Routing + GoDentist Workspace

<metadata>
phase: standalone/multi-workspace-onboarding
plan: mwo-01
depends_on: none
estimated_tasks: 5
risk: LOW (additive change with fallback — Somnio untouched if lookup fails)
</metadata>

<objective>
Enable multi-workspace WhatsApp by routing inbound webhooks via phone_number_id lookup
instead of hardcoded env var. Create GoDentist workspace ready for 360dialog connection.
Somnio continues working exactly as before via env var fallback.
</objective>

## Safety Guarantee

The ONLY production-critical code change is in `route.ts` lines 125-130.
The new logic is:
1. Try to find workspace by phone_number_id in DB
2. If found → use it (multi-workspace path)
3. If NOT found → fall back to WHATSAPP_DEFAULT_WORKSPACE_ID (existing behavior)

**Somnio is NEVER broken** because the fallback is identical to the current code.

---

## Task 1: DB Migration — Formalize `settings` Column

**File:** `supabase/migrations/20260306000000_workspace_settings_column.sql`

The `settings JSONB` column already exists in production (added manually) but has no
migration file. This migration formalizes it with `IF NOT EXISTS` for safe re-run.

```sql
-- Formalize the settings JSONB column on workspaces table
-- This column already exists in production (added manually).
-- Using ADD COLUMN IF NOT EXISTS for idempotent re-run safety.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Index for webhook routing: lookup workspace by phone_number_id in settings
-- This enables O(log n) lookup instead of full table scan
CREATE INDEX IF NOT EXISTS idx_workspaces_phone_number_id
  ON workspaces ((settings->>'whatsapp_phone_number_id'))
  WHERE settings->>'whatsapp_phone_number_id' IS NOT NULL;

COMMENT ON COLUMN workspaces.settings IS 'Per-workspace configuration. Keys: whatsapp_api_key, whatsapp_phone_number_id';
```

**Verification:** Column exists, index exists, no data lost.

---

## Task 2: Update TypeScript Type

**File:** `src/lib/types/database.ts`

Add `settings` to the `Workspace` interface:

```typescript
export interface Workspace {
  id: string
  name: string
  slug: string
  business_type: string | null
  owner_id: string
  created_at: string
  updated_at: string
  settings: Record<string, unknown> | null  // ADD THIS
}
```

**Verification:** TypeScript compiles, no `as any` needed for settings access.

---

## Task 3: Webhook Route — Multi-Workspace Lookup with Fallback

**File:** `src/app/api/webhooks/whatsapp/route.ts`

Replace lines 125-130 (the hardcoded workspace ID) with a lookup function.

**New helper function** (top of file, after imports):

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Resolve workspace ID from phone_number_id.
 * Falls back to WHATSAPP_DEFAULT_WORKSPACE_ID env var if no match found.
 * This guarantees backward compatibility — Somnio keeps working even without
 * settings.whatsapp_phone_number_id populated.
 */
async function resolveWorkspaceId(phoneNumberId: string): Promise<string | null> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('workspaces')
      .select('id')
      .eq('settings->>whatsapp_phone_number_id', phoneNumberId)
      .single()

    if (data?.id) {
      return data.id
    }
  } catch {
    // Lookup failed — fall through to env var fallback
  }

  // Fallback: existing behavior (hardcoded env var)
  return process.env.WHATSAPP_DEFAULT_WORKSPACE_ID || null
}
```

**Replace lines 125-130 with:**

```typescript
  // Resolve workspace: try DB lookup by phone_number_id, fallback to env var
  const workspaceId = await resolveWorkspaceId(phoneNumberId)
  if (!workspaceId) {
    console.error('No workspace found for phone_number_id:', phoneNumberId)
    return NextResponse.json({ received: true }, { status: 200 })
  }
```

**What changes:**
- DB lookup by phone_number_id (indexed, <10ms)
- On failure: falls back to WHATSAPP_DEFAULT_WORKSPACE_ID (current behavior)
- Error log includes phone_number_id for debugging

**What does NOT change:**
- HMAC verification (unchanged)
- GET verification handler (unchanged)
- processWebhook call signature (unchanged)
- Everything after workspace resolution (unchanged)

---

## Task 4: Create GoDentist Workspace via SQL

**This is a manual SQL step the user runs in Supabase Dashboard.**

Since the owner hasn't registered yet, we create the workspace with the platform owner (jose)
as temporary owner. Ownership transfers when the real owner signs up.

```sql
-- Create GoDentist workspace (jose as temp owner)
INSERT INTO workspaces (id, name, slug, business_type, owner_id, settings)
VALUES (
  gen_random_uuid(),
  'GoDentist',
  'godentist',
  'odontologia',
  (SELECT id FROM auth.users WHERE email = '<jose-email>'),  -- temp owner
  '{}'::jsonb  -- 360dialog credentials added when connecting
);

-- Add jose as owner member
INSERT INTO workspace_members (workspace_id, user_id, role, permissions)
VALUES (
  (SELECT id FROM workspaces WHERE slug = 'godentist'),
  (SELECT id FROM auth.users WHERE email = '<jose-email>'),
  'owner',
  '{"all": true}'
);
```

When 360dialog is connected later:
```sql
UPDATE workspaces
SET settings = jsonb_build_object(
  'whatsapp_api_key', '<360dialog-D360-API-KEY>',
  'whatsapp_phone_number_id', '<phone-number-id>'
)
WHERE slug = 'godentist';
```

---

## Task 5: Verification

1. **Build check:** `npm run build` passes
2. **Somnio unaffected:** If lookup returns nothing (Somnio may not have phone_number_id in settings), env var fallback kicks in → identical to current behavior
3. **New workspace visible:** After SQL, GoDentist appears in workspace switcher when jose logs in
4. **Webhook routing test:** After 360dialog credentials are added, a test message from GoDentist's number routes to the GoDentist workspace (not Somnio)

---

## Files Changed

| File | Change | Risk |
|------|--------|------|
| `supabase/migrations/20260306000000_workspace_settings_column.sql` | NEW — formalize settings column + index | NONE (IF NOT EXISTS) |
| `src/lib/types/database.ts` | ADD settings field to Workspace interface | NONE (additive) |
| `src/app/api/webhooks/whatsapp/route.ts` | ADD resolveWorkspaceId + replace hardcoded env var | LOW (fallback preserves current behavior) |

## Files NOT Changed

- `webhook-handler.ts` — untouched
- `messages.ts` — untouched (already reads per-workspace settings)
- `conversations.ts` — untouched
- `action-executor.ts` — untouched
- `agent-timers.ts` — untouched
- `templates.ts` — NOT touched (hardcoded to env var, fix deferred)
- ALL Somnio agent code — untouched
