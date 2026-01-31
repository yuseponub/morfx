# Phase 8: WhatsApp Extended - Research

**Researched:** 2026-01-31
**Domain:** WhatsApp template management, agent assignment systems, quick replies, usage tracking
**Confidence:** MEDIUM (360dialog templates verified, assignment patterns from multiple helpdesk sources, RLS patterns verified)

## Summary

This phase extends the WhatsApp foundation from Phase 7 with four major capabilities: (1) template management with Meta approval flow, (2) team-based agent assignment with availability tracking, (3) quick replies with slash-command UI, and (4) usage/cost tracking per workspace. Additionally, a Super Admin panel provides platform-wide configuration and visibility.

The standard approach leverages 360dialog's Template Management API for creating, listing, and tracking approval status of WhatsApp templates. Agent assignment uses a team-based round-robin pattern with manual availability toggle, storing assignment state in the existing `conversations.assigned_to` column plus new team/agent tables. Quick replies use a slash-command pattern (typing `/` triggers autocomplete) implemented with `@webscopeio/react-textarea-autocomplete`. Cost tracking captures pricing data from 360dialog webhook payloads and aggregates by workspace/category.

**Primary recommendation:** Build template builder with variable mapping UI, implement team-based assignment with RLS policies for role visibility (agent vs manager), use existing textarea with `/` trigger for quick replies, and track costs from webhook pricing field.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| 360dialog Template API | v2 | Template CRUD and status | Official API, same as messaging |
| @webscopeio/react-textarea-autocomplete | ^2.x | Slash-command input | GitHub-like autocomplete, 100k+ downloads |
| Supabase RLS | native | Role-based visibility | Already in stack, proven pattern |
| shadcn/ui | latest | Template builder forms | Already in stack, form components |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^3.x (already installed) | Period selectors, date ranges | Usage dashboard date filters |
| recharts | ^2.x | Cost dashboard charts | Already in shadcn/ui charts |
| Fuse.js | ^7.x (already installed) | Quick reply search | Filter replies on typing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-textarea-autocomplete | Custom implementation | Custom requires handling keyboard nav, positioning |
| round-robin assignment | AI-based routing | AI requires training data, round-robin is deterministic |
| Supabase for cost tracking | External billing service | External adds complexity, Supabase sufficient for MVP |

**Installation:**
```bash
npm install @webscopeio/react-textarea-autocomplete
# Note: date-fns, recharts already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── whatsapp/
│   │   │   └── components/
│   │   │       ├── message-input.tsx         # Enhanced with quick reply trigger
│   │   │       ├── template-button.tsx       # Send template modal
│   │   │       └── assign-dropdown.tsx       # Agent assignment UI
│   │   └── configuracion/
│   │       └── whatsapp/
│   │           ├── page.tsx                  # Settings hub
│   │           ├── templates/
│   │           │   ├── page.tsx              # Template list
│   │           │   ├── [id]/page.tsx         # Template detail/edit
│   │           │   └── components/
│   │           │       ├── template-builder.tsx
│   │           │       ├── variable-mapper.tsx
│   │           │       └── template-preview.tsx
│   │           ├── equipos/
│   │           │   ├── page.tsx              # Team management
│   │           │   └── components/
│   │           │       └── team-members.tsx
│   │           ├── quick-replies/
│   │           │   └── page.tsx              # Quick reply CRUD
│   │           └── costos/
│   │               └── page.tsx              # Usage dashboard
│   └── super-admin/                          # Super admin only
│       ├── layout.tsx                        # Guard: check is_morfx_owner
│       ├── workspaces/
│       │   └── [id]/
│       │       └── settings/page.tsx         # Per-workspace config
│       └── costos/
│           └── page.tsx                      # All workspaces costs
├── app/actions/
│   ├── templates.ts                          # Template CRUD
│   ├── quick-replies.ts                      # Quick reply CRUD
│   ├── teams.ts                              # Team/agent management
│   └── usage.ts                              # Cost tracking
└── lib/
    └── whatsapp/
        └── templates-api.ts                  # 360dialog template endpoints
```

### Pattern 1: 360dialog Template API Client
**What:** API client for template CRUD operations
**When to use:** All template management operations
**Example:**
```typescript
// Source: https://docs.360dialog.com/docs/waba-messaging/template-messaging
// lib/whatsapp/templates-api.ts

const BASE_URL = 'https://waba-v2.360dialog.io'

interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  text?: string
  buttons?: Array<{
    type: 'PHONE_NUMBER' | 'URL' | 'QUICK_REPLY'
    text: string
    phone_number?: string
    url?: string
  }>
}

interface CreateTemplateParams {
  name: string
  language: string  // e.g., 'es', 'en_US'
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  components: TemplateComponent[]
}

export async function createTemplate(
  apiKey: string,
  params: CreateTemplateParams
) {
  const response = await fetch(`${BASE_URL}/v1/configs/templates`, {
    method: 'POST',
    headers: {
      'D360-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Template creation failed')
  }

  return response.json()
}

export async function listTemplates(apiKey: string) {
  const response = await fetch(`${BASE_URL}/v1/configs/templates?limit=250`, {
    headers: { 'D360-API-KEY': apiKey }
  })

  return response.json()  // { waba_templates: [...], count, total }
}

export async function deleteTemplate(apiKey: string, templateName: string) {
  const response = await fetch(
    `${BASE_URL}/v1/configs/templates/${templateName}`,
    {
      method: 'DELETE',
      headers: { 'D360-API-KEY': apiKey }
    }
  )

  return response.ok
}
```

### Pattern 2: Role-Based Conversation Visibility (RLS)
**What:** RLS policies that show different conversations to managers vs agents
**When to use:** Conversation list filtering
**Example:**
```sql
-- Source: Supabase RBAC documentation + project patterns
-- Manager+ sees all workspace conversations
-- Agent sees only assigned to self OR unassigned

-- Helper function: check if user is manager or above
CREATE OR REPLACE FUNCTION is_workspace_manager(workspace_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = workspace_uuid
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')  -- admin = manager in our context
  )
$$;

-- Update conversations SELECT policy for agents
DROP POLICY IF EXISTS "conversations_workspace_isolation_select" ON conversations;

CREATE POLICY "conversations_role_based_select"
  ON conversations FOR SELECT
  USING (
    is_workspace_member(workspace_id)
    AND (
      -- Managers see all
      is_workspace_manager(workspace_id)
      OR
      -- Agents see assigned to them or unassigned
      assigned_to = auth.uid()
      OR
      assigned_to IS NULL
    )
  );
```

### Pattern 3: Slash-Command Quick Replies
**What:** Textarea that shows autocomplete when user types `/`
**When to use:** Message input with quick reply support
**Example:**
```typescript
// Source: @webscopeio/react-textarea-autocomplete
// components/message-input-with-quick-replies.tsx

import ReactTextareaAutocomplete from '@webscopeio/react-textarea-autocomplete'

interface QuickReply {
  id: string
  shortcut: string  // e.g., "saludo"
  content: string   // e.g., "Hola! Como puedo ayudarte?"
}

const QuickReplyItem = ({ entity }: { entity: QuickReply }) => (
  <div className="px-3 py-2 hover:bg-muted cursor-pointer">
    <div className="font-medium">/{entity.shortcut}</div>
    <div className="text-sm text-muted-foreground truncate">
      {entity.content}
    </div>
  </div>
)

export function MessageInputWithQuickReplies({
  quickReplies,
  ...props
}: {
  quickReplies: QuickReply[]
}) {
  return (
    <ReactTextareaAutocomplete
      trigger={{
        '/': {
          dataProvider: (token) => {
            // Filter quick replies by shortcut
            return quickReplies.filter(qr =>
              qr.shortcut.toLowerCase().startsWith(token.toLowerCase())
            ).slice(0, 5)
          },
          component: QuickReplyItem,
          output: (item) => item.content  // Replace with full content
        }
      }}
      loadingComponent={() => <div className="p-2">Cargando...</div>}
      minChar={0}  // Show immediately after /
      {...props}
    />
  )
}
```

### Pattern 4: Cost Tracking from Webhook
**What:** Extract and store pricing info from 360dialog status webhooks
**When to use:** Every outbound message status webhook
**Example:**
```typescript
// Source: 360dialog webhook documentation
// lib/whatsapp/webhook-handler.ts (extend existing)

interface PricingInfo {
  billable: boolean
  pricing_model: 'CBP' | 'PMP'  // CBP = conversation, PMP = per-message
  category: 'marketing' | 'utility' | 'authentication' | 'service'
}

interface StatusWebhook {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  pricing?: PricingInfo
}

async function processStatusUpdate(status: StatusWebhook) {
  // Existing status update logic...

  // NEW: Track cost if billable
  if (status.pricing?.billable && status.status === 'sent') {
    await supabase.from('message_costs').insert({
      workspace_id: workspaceId,
      wamid: status.id,
      category: status.pricing.category,
      pricing_model: status.pricing.model,
      // Actual cost lookup from Meta rate card
      cost_usd: getCostForCategory(status.pricing.category, recipientCountry),
      recorded_at: new Date().toISOString()
    })
  }
}
```

### Pattern 5: Team-Based Assignment
**What:** Organize agents into teams with round-robin within team
**When to use:** New conversation arrives or manual reassignment
**Example:**
```typescript
// Source: HappyFox/Freshdesk round-robin patterns
// app/actions/assignment.ts

interface AssignmentResult {
  agentId: string
  teamId: string
}

export async function assignToNextAvailable(
  workspaceId: string,
  teamId: string
): Promise<AssignmentResult | null> {
  const supabase = await createClient()

  // Get online agents in team, ordered by last assignment
  const { data: agents } = await supabase
    .from('team_members')
    .select('user_id, last_assigned_at')
    .eq('team_id', teamId)
    .eq('is_online', true)
    .order('last_assigned_at', { ascending: true, nullsFirst: true })

  if (!agents || agents.length === 0) return null

  // Round-robin: pick agent with oldest last_assigned_at
  const nextAgent = agents[0]

  // Update last_assigned_at
  await supabase
    .from('team_members')
    .update({ last_assigned_at: new Date().toISOString() })
    .eq('team_id', teamId)
    .eq('user_id', nextAgent.user_id)

  return { agentId: nextAgent.user_id, teamId }
}
```

### Anti-Patterns to Avoid
- **Template name reuse:** Don't reuse deleted template names for 30 days (Meta restriction)
- **Hardcoded variable positions:** Don't assume {{1}} always maps to same field - use flexible mapping
- **Sync template submission:** Don't wait for Meta approval in UI - show pending status, poll for updates
- **Agent visibility without RLS:** Don't filter in application code - use RLS for security
- **Storing costs in messages table:** Don't bloat messages - separate cost tracking table

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slash-command autocomplete | Custom keyboard/position logic | @webscopeio/react-textarea-autocomplete | Handles positioning, keyboard navigation, edge cases |
| Template variable extraction | Regex for {{n}} | Template builder UI with explicit mapping | Variables can have different meanings per template |
| Round-robin assignment | Random selection | Tracked last_assigned_at with order by | True round-robin needs state |
| Cost aggregation | Application-level sums | PostgreSQL GROUP BY with date_trunc | Database optimized for aggregation |
| Role-based filtering | Application-side if/else | Supabase RLS policies | Security at data layer, not UI |

**Key insight:** WhatsApp template system has many restrictions (naming, categories, approval timing). Build UI that guides users through constraints rather than letting them hit API errors.

## Common Pitfalls

### Pitfall 1: Template Category Rejection
**What goes wrong:** Template created but immediately rejected with TAG_CONTENT_MISMATCH
**Why it happens:** Selecting wrong category (e.g., UTILITY for promotional content)
**How to avoid:** Show category guidelines in UI, examples per category, warn if content looks mismatched
**Warning signs:** High rejection rate, templates stuck in PENDING then REJECTED

### Pitfall 2: Variable Mapping Mismatch
**What goes wrong:** Template sent with wrong data in variables
**Why it happens:** Admin maps {{1}} to name, but field changed or null
**How to avoid:** Preview with real data before sending, validate all mapped fields exist
**Warning signs:** Customer complaints about wrong info in messages

### Pitfall 3: Agent Assignment Race Condition
**What goes wrong:** Two conversations assigned to same agent simultaneously
**Why it happens:** Concurrent requests, round-robin state read before write completes
**How to avoid:** Use database-level locking or queue assignment operations
**Warning signs:** Uneven distribution despite round-robin, agents overloaded

### Pitfall 4: Cost Tracking Double-Count
**What goes wrong:** Same message cost recorded twice
**Why it happens:** Webhook retries, duplicate status events
**How to avoid:** Use wamid as unique key in costs table, upsert instead of insert
**Warning signs:** Cost totals higher than 360dialog invoice

### Pitfall 5: Quick Reply / Injection
**What goes wrong:** Quick reply content interpreted as command
**Why it happens:** Quick reply starts with / or contains template syntax
**How to avoid:** Escape special characters, don't trigger autocomplete on paste
**Warning signs:** Nested autocomplete, unexpected behavior

### Pitfall 6: Super Admin Access Leak
**What goes wrong:** Non-owner accesses super admin panel
**Why it happens:** Route not protected, relying on UI hiding
**How to avoid:** Server-side check in layout.tsx, verify is_morfx_owner before any data access
**Warning signs:** Unauthorized configuration changes

## Code Examples

Verified patterns from official sources:

### Database Schema: Templates
```sql
-- Source: 360dialog template structure + project patterns

CREATE TABLE whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- 360dialog/Meta identifiers
  name TEXT NOT NULL,  -- Template name (unique per workspace)
  language TEXT NOT NULL DEFAULT 'es',

  -- Category and status
  category TEXT NOT NULL CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED'
  )),
  quality_rating TEXT CHECK (quality_rating IN ('HIGH', 'MEDIUM', 'LOW', 'PENDING')),
  rejected_reason TEXT,

  -- Template content
  components JSONB NOT NULL,  -- Header, body, footer, buttons

  -- Variable mapping: { "1": "contact.name", "2": "order.total" }
  variable_mapping JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  submitted_at TIMESTAMPTZ,  -- When sent to Meta
  approved_at TIMESTAMPTZ,

  UNIQUE(workspace_id, name)
);

-- Index for listing
CREATE INDEX idx_templates_workspace_status ON whatsapp_templates(workspace_id, status);

-- Enable RLS
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Only admins can manage templates
CREATE POLICY "templates_admin_only"
  ON whatsapp_templates FOR ALL
  USING (is_workspace_admin(workspace_id));
```

### Database Schema: Teams and Assignment
```sql
-- Source: Helpdesk patterns + Supabase auth

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,  -- New conversations go here
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  UNIQUE(workspace_id, name)
);

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_online BOOLEAN NOT NULL DEFAULT false,  -- Manual availability toggle
  last_assigned_at TIMESTAMPTZ,  -- For round-robin
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  UNIQUE(team_id, user_id)
);

-- Add team reference to conversations
ALTER TABLE conversations ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX idx_conversations_team ON conversations(team_id) WHERE team_id IS NOT NULL;

-- RLS for teams
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_workspace_access"
  ON teams FOR ALL
  USING (is_workspace_member(workspace_id));

CREATE POLICY "team_members_workspace_access"
  ON team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_members.team_id
      AND is_workspace_member(teams.workspace_id)
    )
  );
```

### Database Schema: Quick Replies
```sql
-- Source: Project patterns

CREATE TABLE quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  shortcut TEXT NOT NULL,  -- e.g., "saludo", "precio"
  content TEXT NOT NULL,   -- The reply text
  category TEXT,           -- Optional grouping (future feature)

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  UNIQUE(workspace_id, shortcut)
);

-- RLS
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quick_replies_workspace_access"
  ON quick_replies FOR ALL
  USING (is_workspace_member(workspace_id));
```

### Database Schema: Cost Tracking
```sql
-- Source: 360dialog webhook pricing + Meta rate structure

CREATE TABLE message_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  wamid TEXT NOT NULL,  -- WhatsApp message ID
  category TEXT NOT NULL CHECK (category IN (
    'marketing', 'utility', 'authentication', 'service'
  )),
  pricing_model TEXT NOT NULL DEFAULT 'PMP',  -- Per-message pricing
  recipient_country TEXT,  -- For rate lookup
  cost_usd DECIMAL(10, 6),  -- Actual cost in USD

  recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  UNIQUE(wamid)  -- Prevent duplicates from webhook retries
);

-- Indexes for aggregation queries
CREATE INDEX idx_costs_workspace_date ON message_costs(workspace_id, recorded_at);
CREATE INDEX idx_costs_category ON message_costs(workspace_id, category);

-- RLS: admins only
ALTER TABLE message_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "costs_admin_only"
  ON message_costs FOR SELECT
  USING (is_workspace_admin(workspace_id));
```

### Database Schema: Workspace Limits (Super Admin)
```sql
-- Source: Multi-tenant SaaS patterns

CREATE TABLE workspace_limits (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Template category restrictions
  allowed_categories JSONB DEFAULT '["MARKETING", "UTILITY", "AUTHENTICATION"]',

  -- Quick reply features
  quick_replies_with_variables BOOLEAN DEFAULT false,
  quick_replies_with_categories BOOLEAN DEFAULT false,

  -- Spending limits
  monthly_spend_limit_usd DECIMAL(10, 2),  -- NULL = unlimited
  alert_threshold_percent INTEGER DEFAULT 80,  -- Alert at 80% of limit

  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_by UUID REFERENCES auth.users(id)
);

-- RLS: Super admin only (no normal RLS policy - accessed via admin client)
ALTER TABLE workspace_limits ENABLE ROW LEVEL SECURITY;
-- No policies = no access via normal client (use admin client)
```

### Super Admin Guard
```typescript
// Source: Next.js middleware + Supabase patterns
// app/super-admin/layout.tsx

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function SuperAdminLayout({
  children
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user is MorfX platform owner
  // Option 1: Check specific user ID
  const MORFX_OWNER_ID = process.env.MORFX_OWNER_USER_ID

  // Option 2: Check email domain or specific email
  // const isMorfxOwner = user.email === 'admin@morfx.co'

  if (user.id !== MORFX_OWNER_ID) {
    redirect('/dashboard')  // Unauthorized
  }

  return <>{children}</>
}
```

### Template Variable Mapper Component
```typescript
// Source: Custom pattern for WhatsApp template variables
// components/variable-mapper.tsx

interface VariableMapping {
  [key: string]: string  // "1" -> "contact.name"
}

interface VariableMapperProps {
  templateBody: string  // "Hola {{1}}, tu pedido {{2}} esta listo"
  mapping: VariableMapping
  onChange: (mapping: VariableMapping) => void
}

const AVAILABLE_FIELDS = [
  { value: 'contact.name', label: 'Nombre del contacto' },
  { value: 'contact.phone', label: 'Telefono del contacto' },
  { value: 'order.id', label: 'ID del pedido' },
  { value: 'order.total', label: 'Total del pedido' },
  { value: 'order.status', label: 'Estado del pedido' },
  { value: 'custom', label: 'Valor personalizado...' }
]

export function VariableMapper({
  templateBody,
  mapping,
  onChange
}: VariableMapperProps) {
  // Extract variables like {{1}}, {{2}} from body
  const variables = templateBody.match(/\{\{(\d+)\}\}/g) || []
  const uniqueVars = [...new Set(variables)]

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Mapeo de Variables</h4>
      {uniqueVars.map((varMatch) => {
        const varNum = varMatch.replace(/[{}]/g, '')
        return (
          <div key={varNum} className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground w-16">
              {`{{${varNum}}}`}
            </span>
            <Select
              value={mapping[varNum] || ''}
              onValueChange={(value) => {
                onChange({ ...mapping, [varNum]: value })
              }}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Seleccionar campo..." />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_FIELDS.map((field) => (
                  <SelectItem key={field.value} value={field.value}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      })}
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Conversation-based pricing | Per-message pricing (PMP) | July 2025 | Track each message cost, not 24h window |
| Manual template category selection | Auto-category (April 2025) | April 2025 | Meta assigns category, appeals available |
| Shared inbox (all see all) | Role-based visibility | Standard practice | Agents only see their conversations |
| Embedded emoji/mention libraries | Specialized autocomplete libs | 2025 | react-textarea-autocomplete for slash commands |

**Deprecated/outdated:**
- `allow_category_change` parameter: No longer supported as of April 2025 - Meta auto-assigns category
- `max_daily_conversation_per_phone`: Removed February 2026
- Conversation-based billing: Replaced by per-message billing July 2025

## Open Questions

Things that couldn't be fully resolved:

1. **Template webhook for status changes**
   - What we know: 360dialog sends `message_template_status_change` webhook
   - What's unclear: Exact payload structure, how to subscribe
   - Recommendation: Poll template list initially, implement webhook when documented

2. **Meta rate card API**
   - What we know: Costs vary by category and recipient country
   - What's unclear: Is there an API for current rates or must be hardcoded?
   - Recommendation: Store rate table locally, update monthly from Meta Business docs

3. **Super Admin authentication pattern**
   - What we know: Need separate access for MorfX owner
   - What's unclear: Use special role in auth, environment variable, or custom claim?
   - Recommendation: Environment variable for owner user ID (simplest for single owner)

4. **Agent online status sync**
   - What we know: Manual toggle for availability
   - What's unclear: Should we detect browser close and auto-offline?
   - Recommendation: Manual only for MVP, add heartbeat detection later

## Sources

### Primary (HIGH confidence)
- [360dialog Template Messaging](https://docs.360dialog.com/docs/waba-messaging/template-messaging) - Create, list, delete API
- [Supabase RBAC Documentation](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) - RLS patterns
- [@webscopeio/react-textarea-autocomplete](https://github.com/webscopeio/react-textarea-autocomplete) - Slash command implementation
- [AWS WhatsApp Template Status](https://docs.aws.amazon.com/social-messaging/latest/userguide/managing-templates_status.html) - Status definitions

### Secondary (MEDIUM confidence)
- [HappyFox Round-Robin](https://support.happyfox.com/kb/article/44-auto-assignment-round-robin-method/) - Assignment patterns
- [Freshdesk Omniroute](https://support.freshdesk.com/support/solutions/articles/196581-automatic-ticket-assignment-in-a-group-round-robin-) - Load-based assignment
- [360dialog Pricing Webhooks](https://docs.360dialog.com/docs/waba-basics/webhook-events-and-notifications) - Pricing field structure
- [WhatsApp API Pricing 2026](https://flowcall.co/blog/whatsapp-business-api-pricing-2026) - Per-message model

### Tertiary (LOW confidence)
- [MakerKit Multi-tenant SaaS](https://makerkit.dev/nextjs-saas-boilerplate) - Super admin panel patterns
- Community discussions on quick reply implementations - Need validation

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - 360dialog API verified, autocomplete library proven
- Architecture: MEDIUM - RLS patterns verified, assignment patterns from multiple helpdesks
- Pitfalls: MEDIUM - Based on documented limitations and common helpdesk issues
- Cost tracking: LOW - Webhook pricing field structure not fully verified in official docs

**Research date:** 2026-01-31
**Valid until:** 2026-02-28 (30 days - WhatsApp API relatively stable, Meta pricing changes quarterly)
