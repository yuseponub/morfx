# Phase 9: CRM-WhatsApp Sync - Research

**Researched:** 2026-02-03
**Domain:** Bidirectional data sync, tag systems, Supabase Realtime
**Confidence:** HIGH

## Summary

This phase implements bidirectional synchronization between CRM and WhatsApp modules - the core value proposition of the product. The research investigated three main areas: (1) the tag system architecture with three distinct tag types (contact, conversation, order), (2) order status indicators in the WhatsApp conversation list, and (3) realtime synchronization patterns using Supabase.

The established approach leverages Supabase Realtime's `postgres_changes` feature (already in use for messages and conversations) with careful attention to subscription channel naming to avoid conflicts. For the tag system, a new `conversation_tags` junction table will mirror the existing `contact_tags` and `order_tags` patterns. The `tags` table will be extended with an `applies_to` field to control visibility scope.

**Primary recommendation:** Use the existing realtime subscription patterns from `useConversations` and `useMessages` hooks, extend the tag schema with scope configuration, and implement order status indicators as computed properties from existing order data rather than duplicating state.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | 2.x | Realtime subscriptions, database operations | Already in use, official Supabase client |
| Supabase Realtime | Built-in | postgres_changes for live updates | Native feature, proven in codebase |
| React 19 | 19.x | Client-side state management | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | 3.x | Date comparisons for 24h window | Already in use for time formatting |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| postgres_changes | Broadcast | Broadcast requires manual trigger setup, postgres_changes works automatically on table changes |
| Multiple channel subscriptions | Single channel with filters | Multiple channels cleaner separation but more connections |
| RxDB Supabase plugin | Native Realtime | RxDB adds offline-first but unnecessary complexity for this use case |

**Installation:**
```bash
# No new packages needed - all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── hooks/
│   ├── use-conversations.ts    # Existing - extend with order data
│   ├── use-contact-tags.ts     # NEW - manage contact tags with realtime
│   └── use-conversation-tags.ts # NEW - manage conversation-specific tags
├── app/actions/
│   ├── tags.ts                 # Extend with applies_to field
│   ├── contacts.ts             # Existing tag operations
│   ├── conversations.ts        # Add conversation tag operations
│   └── orders.ts               # Existing - add auto-tag trigger logic
├── lib/
│   └── orders/
│       └── stage-phases.ts     # NEW - map stages to display phases
└── app/(dashboard)/whatsapp/components/
    ├── conversation-item.tsx   # Add order status indicator
    └── contact-panel.tsx       # Add order status display
```

### Pattern 1: Realtime Subscription per Entity
**What:** Subscribe to table changes using unique channel names per entity type and workspace
**When to use:** When you need live updates for a specific data type
**Example:**
```typescript
// Source: Existing pattern in use-conversations.ts
const channel = supabase
  .channel(`conversations:${workspaceId}`)
  .on(
    'postgres_changes',
    {
      event: '*', // INSERT, UPDATE, DELETE
      schema: 'public',
      table: 'conversations',
      filter: `workspace_id=eq.${workspaceId}`,
    },
    async (payload) => {
      console.log('Change received:', payload.eventType)
      await fetchData() // Refetch to get complete state
    }
  )
  .subscribe()
```

### Pattern 2: Tag Junction Tables (Existing Pattern)
**What:** Separate junction tables for each entity type (contact_tags, order_tags, conversation_tags)
**When to use:** For many-to-many relationships with workspace isolation
**Example:**
```sql
-- Source: Existing supabase/migrations/20260129000001_contacts_and_tags.sql
CREATE TABLE conversation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(conversation_id, tag_id)
);
```

### Pattern 3: Stage-to-Phase Mapping
**What:** Map individual pipeline stages to display phases (pendiente, confirmado, transito, perdido, ganado)
**When to use:** For showing simplified order status in conversation list
**Example:**
```typescript
// NEW: src/lib/orders/stage-phases.ts
export type OrderPhase = 'pending' | 'confirmed' | 'transit' | 'lost' | 'won'

export const STAGE_TO_PHASE: Record<string, OrderPhase> = {
  // Pendiente info group
  'Falta info': 'pending',
  'Falta confirmar': 'pending',
  'Nuevo': 'pending',

  // Confirmado group
  'Confirmado': 'confirmed',
  'Por despachar': 'confirmed',
  'En Proceso': 'confirmed',

  // En transito group
  'Despachado': 'transit',
  'Enviado': 'transit',
  'En reparto': 'transit',
  'Novedad': 'transit',

  // Terminal stages
  'Perdido': 'lost',
  'Devuelto': 'lost',
  'Ganado': 'won',
}

export const PHASE_INDICATORS: Record<OrderPhase, { emoji: string; label: string }> = {
  pending: { emoji: '', label: 'Pendiente' },  // Claude's discretion: choose emoji
  confirmed: { emoji: '', label: 'Confirmado' },
  transit: { emoji: '', label: 'En transito' },
  lost: { emoji: '', label: 'Perdido' },
  won: { emoji: '', label: '' }, // No indicator when won
}
```

### Pattern 4: Database Trigger for Automatic Tagging
**What:** PostgreSQL trigger to auto-add "Cliente" tag when order reaches "Ganado"
**When to use:** When business logic requires automatic tag assignment on state change
**Example:**
```sql
-- Source: Supabase Docs - PostgreSQL Triggers
CREATE OR REPLACE FUNCTION auto_tag_cliente_on_ganado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ganado_stage_id UUID;
  cliente_tag_id UUID;
  contact UUID;
BEGIN
  -- Only process if stage changed
  IF OLD.stage_id = NEW.stage_id THEN
    RETURN NEW;
  END IF;

  -- Check if new stage is "Ganado"
  SELECT id INTO ganado_stage_id
  FROM pipeline_stages
  WHERE name = 'Ganado' AND is_closed = true
    AND pipeline_id = NEW.pipeline_id;

  IF NEW.stage_id = ganado_stage_id AND NEW.contact_id IS NOT NULL THEN
    -- Find or skip if no "Cliente" tag exists
    SELECT id INTO cliente_tag_id
    FROM tags
    WHERE workspace_id = NEW.workspace_id AND name = 'Cliente';

    IF cliente_tag_id IS NOT NULL THEN
      -- Add tag to contact (ignore if already exists)
      INSERT INTO contact_tags (contact_id, tag_id)
      VALUES (NEW.contact_id, cliente_tag_id)
      ON CONFLICT (contact_id, tag_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
```

### Anti-Patterns to Avoid
- **Duplicate channel names:** Each Realtime channel must have a unique name. Using the same name in multiple hooks causes the server to close the first connection.
- **Filtering DELETE events:** Supabase Realtime cannot filter DELETE events - the full DELETE callback always fires for the table.
- **Storing computed state:** Don't store order phase in the database - compute it from stage name at display time.
- **Direct state mutation:** Always refetch full state on realtime events rather than trying to patch local state (consistency issues).

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Realtime sync | Custom WebSocket handler | Supabase postgres_changes | Already handles reconnection, auth, RLS |
| Tag management | Custom state management | Existing addTagToContact/removeTagFromContact patterns | Consistent with codebase patterns |
| Junction table queries | Manual SQL joins | Supabase nested selects | Already established pattern in getConversations |
| Optimistic updates | Custom rollback logic | React Query / refetch on change | Complexity not worth it for tag operations |
| Stage phase mapping | Dynamic database lookup | Static constant mapping | Stages rarely change, static is faster/simpler |

**Key insight:** The codebase already has well-established patterns for tag management and realtime subscriptions. This phase is about extending those patterns to new entity types (conversation_tags) and adding computed display properties (order phase indicators), not inventing new approaches.

## Common Pitfalls

### Pitfall 1: Channel Name Collisions
**What goes wrong:** Multiple hooks subscribing with the same channel name causes silent disconnection of earlier subscriptions
**Why it happens:** Supabase Realtime requires globally unique channel names per client
**How to avoid:** Use entity-specific prefixes: `conversations:${id}`, `contact_tags:${contactId}`, `orders:${contactId}`
**Warning signs:** Realtime events stop arriving after navigating between views, console shows "SUBSCRIBED" then "CLOSED"

### Pitfall 2: Over-subscribing to Tables
**What goes wrong:** Performance degrades with many users because every INSERT triggers RLS checks for each subscriber
**Why it happens:** postgres_changes checks RLS for every subscriber on every event
**How to avoid:** Subscribe at workspace level (already done), not per-row; limit subscription to needed tables
**Warning signs:** Slow UI updates, high database CPU usage, timeout errors

### Pitfall 3: Stale Tag State After Realtime Update
**What goes wrong:** Tags appear/disappear inconsistently between CRM and WhatsApp views
**Why it happens:** Subscribing to junction table changes but not refetching the full tag objects
**How to avoid:** On contact_tags change, refetch the full contact/conversation with tags joined
**Warning signs:** Tag badge shows but clicking reveals no tag name, or tag removed but badge remains

### Pitfall 4: Missing Tag Scope Validation
**What goes wrong:** User adds a tag meant only for orders to a conversation
**Why it happens:** No validation of `applies_to` field when adding tags
**How to avoid:** Filter available tags by scope in the UI, validate in server action
**Warning signs:** Tags appearing in wrong contexts, user confusion about tag purpose

### Pitfall 5: Race Condition on Auto-Tagging
**What goes wrong:** "Cliente" tag added twice or not at all when order moves to Ganado
**Why it happens:** Multiple triggers or realtime handlers competing
**How to avoid:** Use ON CONFLICT DO NOTHING in trigger, idempotent operations
**Warning signs:** Duplicate tags, constraint violation errors in logs

## Code Examples

Verified patterns from official sources and existing codebase:

### Subscribe to Contact Tags Changes (for CRM-WhatsApp sync)
```typescript
// Source: Pattern from use-conversations.ts, adapted for tags
useEffect(() => {
  if (!contactId) return

  const supabase = createClient()

  const channel = supabase
    .channel(`contact_tags:${contactId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'contact_tags',
        filter: `contact_id=eq.${contactId}`,
      },
      async () => {
        // Refetch full contact with tags on any change
        await refetchContact()
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [contactId, refetchContact])
```

### Add Tag to Conversation (new server action)
```typescript
// Source: Pattern from src/app/actions/contacts.ts addTagToContact
export async function addTagToConversation(
  conversationId: string,
  tagId: string
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Validate tag applies to whatsapp
  const { data: tag } = await supabase
    .from('tags')
    .select('applies_to')
    .eq('id', tagId)
    .single()

  if (tag?.applies_to === 'orders') {
    return { error: 'Esta etiqueta solo aplica a pedidos' }
  }

  const { error } = await supabase
    .from('conversation_tags')
    .insert({ conversation_id: conversationId, tag_id: tagId })

  if (error) {
    if (error.code === '23505') {
      return { success: true, data: undefined } // Already exists
    }
    return { error: 'Error al agregar la etiqueta' }
  }

  revalidatePath('/whatsapp')
  return { success: true, data: undefined }
}
```

### Extend Conversation Query to Include Own Tags
```typescript
// Source: Pattern from src/app/actions/conversations.ts
const { data, error } = await supabase
  .from('conversations')
  .select(`
    *,
    contact:contacts(
      id, name, phone, address, city,
      tags:contact_tags(tag:tags(*))
    ),
    conversation_tags:conversation_tags(tag:tags(*))
  `)
  .eq('workspace_id', workspaceId)
  .order('last_message_at', { ascending: false, nullsFirst: false })

// Transform to merge contact tags and conversation tags
const conversations = (data || []).map((conv) => {
  const contactTags = conv.contact?.tags?.map(t => t.tag) || []
  const convTags = conv.conversation_tags?.map(t => t.tag) || []

  return {
    ...conv,
    contact: conv.contact ? { ...conv.contact, tags: undefined } : null,
    tags: convTags,
    contactTags, // Contact tags shown as "inherited"
  }
})
```

### Order Status Indicator Component
```typescript
// Source: Claude's discretion for emoji selection
import { getOrderPhase, PHASE_INDICATORS } from '@/lib/orders/stage-phases'

interface OrderIndicatorProps {
  orders: Array<{ stage: { name: string; is_closed: boolean } }>
}

export function OrderStatusIndicator({ orders }: OrderIndicatorProps) {
  // Filter out won orders (no indicator needed)
  const activeOrders = orders.filter(o =>
    getOrderPhase(o.stage.name) !== 'won'
  )

  if (activeOrders.length === 0) return null

  // Group by phase and show up to 3 indicators
  const phases = [...new Set(activeOrders.map(o => getOrderPhase(o.stage.name)))]
  const displayed = phases.slice(0, 3)
  const overflow = phases.length - 3

  return (
    <div className="flex items-center gap-0.5">
      {displayed.map(phase => (
        <span
          key={phase}
          className="text-xs"
          title={PHASE_INDICATORS[phase].label}
        >
          {PHASE_INDICATORS[phase].emoji}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-xs text-muted-foreground">+{overflow}</span>
      )}
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling for updates | Supabase Realtime postgres_changes | 2023 | Native realtime without custom WebSockets |
| Single tag table | Scoped tags with applies_to | This phase | Tags can be context-specific |
| Manual sync logic | Database triggers | Standard | Ensures consistency without app code |

**Deprecated/outdated:**
- **supabase auth-helpers-nextjs**: Replaced by @supabase/ssr, already updated in codebase

## Open Questions

Things that couldn't be fully resolved:

1. **Emoji selection for order phases**
   - What we know: Need small, subtle indicators for pending/confirmed/transit/lost
   - What's unclear: Exact emojis that look good at small size in the conversation list
   - Recommendation: Use simple Unicode symbols, test during implementation

2. **Tag creation workflow**
   - What we know: Tags need `applies_to` field
   - What's unclear: Should users set scope when creating tags, or default to 'both'?
   - Recommendation: Default to 'both', allow editing in tag settings

3. **Performance with many active orders**
   - What we know: Need to show order indicators for all conversations
   - What's unclear: How to efficiently fetch order data per conversation
   - Recommendation: Pre-join orders in getConversations query, monitor performance

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/hooks/use-conversations.ts`, `src/hooks/use-messages.ts` - Realtime patterns
- Existing codebase: `supabase/migrations/20260129000001_contacts_and_tags.sql` - Tag schema patterns
- [Supabase Postgres Changes Docs](https://supabase.com/docs/guides/realtime/postgres-changes) - Subscription API
- [Supabase Triggers Docs](https://supabase.com/docs/guides/database/postgres/triggers) - Trigger syntax

### Secondary (MEDIUM confidence)
- [Supabase Realtime Concepts](https://supabase.com/docs/guides/realtime/concepts) - Broadcast vs postgres_changes
- [Polymorphic Database Design](https://patrickkarsh.medium.com/polymorphic-associations-database-design-basics-17faf2eb313) - Tag system patterns

### Tertiary (LOW confidence)
- WebSearch results for Realtime scaling - indicates Broadcast may be better at scale, but not needed for current usage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already in use, no new dependencies
- Architecture: HIGH - Patterns directly extend existing codebase patterns
- Pitfalls: HIGH - Based on official docs and codebase experience

**Research date:** 2026-02-03
**Valid until:** 30 days (stable domain, no major changes expected)
