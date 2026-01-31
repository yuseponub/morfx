# Phase 7: WhatsApp Core - Research

**Researched:** 2026-01-30
**Domain:** WhatsApp Business API integration via 360dialog, real-time messaging inbox UI
**Confidence:** MEDIUM (360dialog patterns verified, UI patterns from multiple sources)

## Summary

This phase integrates WhatsApp Business API through 360dialog to enable receiving and sending messages within the MorfX platform. The implementation consists of three core components: (1) 360dialog API integration for sending messages and receiving webhooks, (2) database schema for storing conversations and messages with real-time updates via Supabase Realtime, and (3) a split-view inbox UI with conversation list, chat view, and contact info panel.

The standard approach uses 360dialog's Cloud API (`waba-v2.360dialog.io`) with webhook-based message reception. Messages are stored in Supabase with RLS, and the UI receives real-time updates through Supabase Realtime subscriptions (not polling). Media files are proxied through our server to avoid exposing 360dialog credentials to the client. The 24-hour window rule is tracked per-conversation with automatic detection.

**Primary recommendation:** Build a webhook-first architecture with async processing (queue + worker pattern), Supabase Realtime for instant UI updates, and TanStack Virtual for performant message rendering.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| 360dialog Cloud API | v2 | WhatsApp Business API access | Official BSP, direct Meta access, clean REST API |
| Supabase Realtime | latest | Real-time message updates | Already in stack, handles WebSocket complexity |
| @tanstack/react-virtual | ^3.x | Virtualized message list | Performance for 1000s of messages, dynamic heights |
| fuse.js | ^7.x | Fuzzy search in inbox | Already used in project for orders, proven pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| frimousse | ^1.x | Emoji picker | Lightweight, unstyled, shadcn-compatible |
| date-fns | ^3.x | Date formatting/diffing | 24h window calculations, "hace X minutos" |
| sonner | (already installed) | Toast notifications | Message sent/failed feedback |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase Realtime | Polling | Polling increases server load and has latency; Realtime is already available |
| TanStack Virtual | react-window | TanStack is more modern, better dynamic height support |
| frimousse | emoji-picker-react | emoji-picker-react larger bundle but more features; frimousse is minimal |
| 360dialog | Direct Meta API | Direct Meta requires more setup, verification; 360dialog simplifies onboarding |

**Installation:**
```bash
npm install @tanstack/react-virtual frimousse date-fns
# Note: fuse.js already installed from Phase 6
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── api/
│   │   └── webhooks/
│   │       └── whatsapp/
│   │           └── route.ts          # 360dialog webhook endpoint
│   ├── (dashboard)/
│   │   └── whatsapp/
│   │       ├── page.tsx              # Inbox main page (Server Component)
│   │       ├── layout.tsx            # WhatsApp section layout
│   │       └── components/
│   │           ├── inbox-layout.tsx       # 3-column split view
│   │           ├── conversation-list.tsx  # Left panel
│   │           ├── conversation-item.tsx  # List item component
│   │           ├── chat-view.tsx          # Center panel - messages
│   │           ├── message-bubble.tsx     # Individual message
│   │           ├── message-input.tsx      # Compose area
│   │           ├── contact-panel.tsx      # Right panel - contact info
│   │           ├── window-indicator.tsx   # 24h window status
│   │           └── filters/
│   │               ├── inbox-filters.tsx   # Filter tabs
│   │               └── search-input.tsx    # Fuzzy search
│   └── actions/
│       ├── whatsapp.ts               # Server Actions for messages
│       └── conversations.ts          # Server Actions for conversations
├── lib/
│   └── whatsapp/
│       ├── api.ts                    # 360dialog API client
│       ├── types.ts                  # WhatsApp-specific types
│       ├── webhook-handler.ts        # Process incoming webhooks
│       └── media.ts                  # Media upload/download helpers
└── hooks/
    ├── use-conversations.ts          # Real-time conversation subscription
    ├── use-messages.ts               # Real-time message subscription
    └── use-24h-window.ts             # Window status hook
```

### Pattern 1: Webhook Handler with Async Processing
**What:** Immediately acknowledge webhook, queue for async processing
**When to use:** Always for 360dialog webhooks (5-second timeout requirement)
**Example:**
```typescript
// Source: 360dialog documentation - Design a Stable Webhook Endpoint
// app/api/webhooks/whatsapp/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const payload = await request.json()

  // 1. Verify webhook signature (if configured)
  // 2. Store raw payload immediately for async processing
  const supabase = await createClient()
  await supabase.from('webhook_queue').insert({
    source: '360dialog',
    payload: payload,
    status: 'pending'
  })

  // 3. Return 200 within 5 seconds (critical!)
  return NextResponse.json({ received: true }, { status: 200 })
}
```

### Pattern 2: 360dialog API Client
**What:** Typed client for sending messages and managing media
**When to use:** All outbound WhatsApp operations
**Example:**
```typescript
// Source: 360dialog Messaging API docs
// lib/whatsapp/api.ts

const BASE_URL = 'https://waba-v2.360dialog.io'

interface SendMessageParams {
  to: string           // Phone in E.164 format
  type: 'text' | 'image' | 'video' | 'document' | 'audio'
  content: TextContent | MediaContent
}

export async function sendMessage(apiKey: string, params: SendMessageParams) {
  const response = await fetch(`${BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'D360-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: params.type,
      [params.type]: params.content
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`360dialog error: ${error.error?.message || 'Unknown'}`)
  }

  return response.json()
}
```

### Pattern 3: Supabase Realtime for Messages
**What:** Subscribe to Postgres Changes for instant message updates
**When to use:** Chat view to receive new messages without polling
**Example:**
```typescript
// Source: Supabase Realtime documentation
// hooks/use-messages.ts

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/whatsapp/types'

export function useMessages(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const supabase = createClient()

  useEffect(() => {
    // Initial load
    loadMessages()

    // Subscribe to new messages
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  return { messages, loading }
}
```

### Pattern 4: Virtualized Message List (Chat Style)
**What:** Only render visible messages for performance
**When to use:** Any conversation with 50+ messages
**Example:**
```typescript
// Source: TanStack Virtual documentation
// components/chat-view.tsx

import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

export function ChatView({ messages }: { messages: Message[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,  // Estimate, will measure actual
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 5,
    // IMPORTANT for chat: scroll anchored to bottom
    initialOffset: Number.MAX_SAFE_INTEGER,
  })

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translateY(${virtualItem.start}px)`,
              width: '100%'
            }}
          >
            <MessageBubble message={messages[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Anti-Patterns to Avoid
- **Synchronous webhook processing:** NEVER process webhook payload before returning 200. 360dialog has a 5-second hard limit.
- **Polling for messages:** Use Supabase Realtime subscriptions instead. Polling wastes resources and adds latency.
- **Storing 360dialog API key in client code:** Always proxy API calls through server actions or API routes.
- **Re-creating Fuse instance on every render:** Memoize with useMemo, rebuild only when data changes.
- **Rendering all messages in DOM:** Use TanStack Virtual for any conversation that might have 50+ messages.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Phone number normalization | Custom regex | `lib/utils/phone.ts` (already exists) | E.164 edge cases, international formats |
| Fuzzy search | Custom string matching | Fuse.js | Typo tolerance, weighted fields, performance |
| List virtualization | Intersection Observer DIY | @tanstack/react-virtual | Dynamic heights, scroll position management |
| Emoji picker | Custom grid of emojis | frimousse | Unicode versions, skin tones, search, a11y |
| Real-time updates | WebSocket from scratch | Supabase Realtime | Connection management, reconnection, auth |
| Date formatting | Manual string building | date-fns | Localization, relative time ("hace 5 min") |
| 24h window detection | timestamp comparison | date-fns differenceInHours | Timezone handling, DST edge cases |

**Key insight:** WhatsApp integration has many edge cases (message status, media expiry, rate limits, webhook retries). Use established patterns and libraries to handle complexity.

## Common Pitfalls

### Pitfall 1: Webhook Timeout
**What goes wrong:** Processing takes >5 seconds, 360dialog marks delivery as failed, retries flood your endpoint
**Why it happens:** Developers process webhook payload (DB writes, notifications) before returning 200
**How to avoid:** Queue-and-acknowledge pattern: insert raw payload to queue table, return 200, process async
**Warning signs:** 360dialog dashboard shows high webhook failure rate, duplicate messages in system

### Pitfall 2: Duplicate Message Processing
**What goes wrong:** Same message processed multiple times, appears twice in conversation
**Why it happens:** Webhook retries arrive before first processing completes, no idempotency check
**How to avoid:** Store `wamid` (WhatsApp message ID) with unique constraint, check before processing
**Warning signs:** Users report seeing messages twice, message counts don't match 360dialog

### Pitfall 3: 24h Window Miscalculation
**What goes wrong:** User tries to send message but window is actually closed, or opposite
**Why it happens:** Using server time instead of conversation's last_customer_message_at, timezone issues
**How to avoid:** Store last_customer_message_at in UTC, calculate window on each render with date-fns
**Warning signs:** "Can't send message" errors when user expects to be able to, or vice versa

### Pitfall 4: Media URL Expiry
**What goes wrong:** Images/videos in old messages show as broken
**Why it happens:** 360dialog media URLs expire after 5 minutes, not stored permanently
**How to avoid:** Download media on webhook receive, store in Supabase Storage, serve from our own URLs
**Warning signs:** Images work initially then break after a few minutes

### Pitfall 5: Real-time Subscription Leaks
**What goes wrong:** Memory leaks, multiple subscriptions per conversation, stale data
**Why it happens:** Not cleaning up Supabase channel subscriptions on component unmount
**How to avoid:** Always return cleanup function from useEffect that calls `supabase.removeChannel(channel)`
**Warning signs:** Memory usage grows over time, old messages suddenly appear, console warnings

### Pitfall 6: Contact Linking Edge Cases
**What goes wrong:** Same contact has multiple conversations, or conversation not linked
**Why it happens:** Phone number format mismatch between contact and WhatsApp
**How to avoid:** ALWAYS normalize phone to E.164 (+573001234567) before any lookup or storage
**Warning signs:** "Unknown contact" for known numbers, duplicate contact entries

## Code Examples

Verified patterns from official sources:

### Database Schema
```sql
-- Source: WhatsApp Business API message structure + project patterns

-- Conversations (one per unique phone number)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,  -- E.164 format, unique per workspace
  phone_number_id TEXT NOT NULL,  -- 360dialog phone number ID

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  unread_count INTEGER NOT NULL DEFAULT 0,

  -- 24h window tracking
  last_customer_message_at TIMESTAMPTZ,  -- For 24h window calculation
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,

  -- Assignment (Phase 8, but schema now)
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  UNIQUE(workspace_id, phone)
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- WhatsApp IDs for deduplication
  wamid TEXT,  -- WhatsApp message ID (unique constraint)

  -- Direction
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),

  -- Content
  type TEXT NOT NULL CHECK (type IN ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contacts', 'template', 'interactive', 'reaction')),
  content JSONB NOT NULL,  -- Flexible for different message types

  -- Status (for outbound)
  status TEXT CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  status_timestamp TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,

  -- Media (if applicable)
  media_url TEXT,  -- Our stored URL (not 360dialog's expiring one)
  media_mime_type TEXT,
  media_filename TEXT,

  -- Timestamps
  timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  -- Prevent duplicates
  UNIQUE(wamid) -- WhatsApp message IDs are globally unique
);

-- Indexes for performance
CREATE INDEX idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX idx_conversations_phone ON conversations(workspace_id, phone);
CREATE INDEX idx_conversations_updated ON conversations(workspace_id, last_message_at DESC);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, timestamp DESC);
CREATE INDEX idx_messages_wamid ON messages(wamid) WHERE wamid IS NOT NULL;

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

### Webhook Payload Processing
```typescript
// Source: 360dialog Webhook Events documentation
// lib/whatsapp/webhook-handler.ts

interface WebhookPayload {
  object: 'whatsapp_business_account'
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: 'whatsapp'
        metadata: { display_phone_number: string; phone_number_id: string }
        contacts?: Array<{ profile: { name: string }; wa_id: string }>
        messages?: Array<IncomingMessage>
        statuses?: Array<MessageStatus>
      }
      field: 'messages'
    }>
  }>
}

interface IncomingMessage {
  from: string
  id: string  // wamid
  timestamp: string
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contacts' | 'reaction' | 'interactive' | 'button'
  text?: { body: string }
  image?: { id: string; mime_type: string; sha256: string }
  // ... other types
}

export async function processWebhook(payload: WebhookPayload) {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const { value } = change

      // Process incoming messages
      if (value.messages) {
        for (const msg of value.messages) {
          await processIncomingMessage(msg, value.metadata, value.contacts?.[0])
        }
      }

      // Process status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          await processStatusUpdate(status)
        }
      }
    }
  }
}
```

### Sending Text Message
```typescript
// Source: 360dialog Messaging API
// app/actions/whatsapp.ts

'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { sendMessage } from '@/lib/whatsapp/api'

export async function sendWhatsAppMessage(
  conversationId: string,
  text: string
) {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value

  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  // Get conversation and workspace config
  const { data: conversation } = await supabase
    .from('conversations')
    .select('phone, phone_number_id, last_customer_message_at')
    .eq('id', conversationId)
    .single()

  if (!conversation) {
    return { error: 'Conversacion no encontrada' }
  }

  // Check 24h window
  const windowOpen = is24hWindowOpen(conversation.last_customer_message_at)
  if (!windowOpen) {
    return { error: 'Ventana de 24h cerrada. Usa un template.' }
  }

  // Get API key from workspace settings
  const { data: settings } = await supabase
    .from('workspace_settings')
    .select('whatsapp_api_key')
    .eq('workspace_id', workspaceId)
    .single()

  // Send via 360dialog
  try {
    const result = await sendMessage(settings.whatsapp_api_key, {
      to: conversation.phone,
      type: 'text',
      content: { body: text }
    })

    // Store outbound message
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      workspace_id: workspaceId,
      wamid: result.messages[0].id,
      direction: 'outbound',
      type: 'text',
      content: { text },
      status: 'sent'
    })

    return { success: true, messageId: result.messages[0].id }
  } catch (error) {
    return { error: error.message }
  }
}

function is24hWindowOpen(lastCustomerMessageAt: string | null): boolean {
  if (!lastCustomerMessageAt) return false
  const diff = differenceInHours(new Date(), new Date(lastCustomerMessageAt))
  return diff < 24
}
```

### Conversation Inbox Hook with Fuzzy Search
```typescript
// Source: Project Fuse.js pattern + Supabase Realtime
// hooks/use-conversations.ts

import { useMemo, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Fuse from 'fuse.js'
import type { ConversationWithContact } from '@/lib/whatsapp/types'

const fuseOptions = {
  keys: [
    { name: 'contact.name', weight: 2 },
    { name: 'phone', weight: 1.5 },
    { name: 'last_message_preview', weight: 1 },
    { name: 'contact.tags.name', weight: 0.8 }
  ],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2
}

export function useConversations(workspaceId: string) {
  const [conversations, setConversations] = useState<ConversationWithContact[]>([])
  const [query, setQuery] = useState('')
  const supabase = createClient()

  // Initial load
  useEffect(() => {
    loadConversations()
  }, [workspaceId])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `workspace_id=eq.${workspaceId}`
        },
        () => loadConversations()  // Reload on any change
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [workspaceId])

  // Memoized Fuse instance
  const fuse = useMemo(() => new Fuse(conversations, fuseOptions), [conversations])

  // Filtered results
  const filteredConversations = useMemo(() => {
    if (!query.trim()) return conversations
    return fuse.search(query).map(r => r.item)
  }, [fuse, query, conversations])

  return {
    conversations: filteredConversations,
    query,
    setQuery,
    isSearching: query.trim().length > 0
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 360dialog On-Premise API | 360dialog Cloud API | Oct 2025 (sunset) | Must use Cloud API, simpler but different endpoints |
| WhatsApp conversation billing | Per-message billing | June 2025 | Track per message, not per 24h window |
| Polling for updates | Supabase Realtime | Already standard | Instant updates, less server load |
| react-window | @tanstack/react-virtual | 2024 | Better dynamic sizing, more active maintenance |
| emoji-mart | frimousse | March 2025 | Lighter bundle, shadcn compatible |

**Deprecated/outdated:**
- 360dialog On-Premise API: Sunset October 2025, use Cloud API only
- WhatsApp conversation-based pricing: Now per-message pricing (June 2025)
- WhatsApp-Nodejs-SDK: Archived, recommend direct REST API calls

## Open Questions

Things that couldn't be fully resolved:

1. **Media storage strategy**
   - What we know: 360dialog URLs expire in 5 minutes, need to store permanently
   - What's unclear: Use Supabase Storage or separate S3? File size limits?
   - Recommendation: Use Supabase Storage for MVP (simpler), migrate to S3 if needed

2. **Webhook security**
   - What we know: 360dialog supports custom headers for verification
   - What's unclear: What exact verification method does 360dialog use? HMAC?
   - Recommendation: Implement custom header verification, test with 360dialog sandbox

3. **Background job processing**
   - What we know: Need async webhook processing
   - What's unclear: Use Supabase Queue (if available) or external solution?
   - Recommendation: Start with simple table-based queue, evaluate if performance issues

4. **TanStack Virtual reverse scroll**
   - What we know: Chat needs to scroll from bottom, prepend old messages on scroll up
   - What's unclear: Exact implementation pattern for bidirectional infinite scroll
   - Recommendation: Start with fixed viewport, add infinite scroll if needed

## Sources

### Primary (HIGH confidence)
- [360dialog Client Documentation](https://docs.360dialog.com/docs/) - API endpoints, webhooks, media
- [360dialog Webhook Events](https://docs.360dialog.com/docs/waba-basics/webhook-events-and-notifications) - Payload structures
- [Supabase Realtime Documentation](https://supabase.com/docs/guides/realtime) - Postgres Changes
- [TanStack Virtual](https://tanstack.com/virtual/latest) - Virtualization patterns

### Secondary (MEDIUM confidence)
- [WaChat GitHub Project](https://github.com/hetref/whatsapp-chat) - Next.js 15 + Supabase + WhatsApp architecture reference
- [360dialog Stable Webhook Endpoint Guide](https://docs.360dialog.com/partner/integrations-and-api-development/integration-best-practices/design-a-stable-webhook-receiving-endpoint) - Performance requirements
- [frimousse Emoji Picker](https://frimousse.liveblocks.io/) - shadcn-compatible picker

### Tertiary (LOW confidence)
- Various tutorials on WhatsApp clone UIs - UI patterns only, not API
- Community discussions on TanStack Virtual chat implementations - Need validation

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - 360dialog API verified, libraries proven in project
- Architecture: MEDIUM - Webhook pattern verified, realtime pattern proven
- Pitfalls: HIGH - Documented in 360dialog official best practices
- UI patterns: MEDIUM - TanStack Virtual verified, chat specifics need implementation testing

**Research date:** 2026-01-30
**Valid until:** 2026-02-28 (30 days - stable domain, 360dialog API relatively stable)
