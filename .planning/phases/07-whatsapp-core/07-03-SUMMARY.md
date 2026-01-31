---
phase: 07-whatsapp-core
plan: 03
subsystem: whatsapp
tags: ["whatsapp", "chat-view", "virtualization", "emoji-picker", "messages"]
dependency-graph:
  requires: ["07-01"]
  provides: ["chat-view", "message-input", "message-actions"]
  affects: ["08-whatsapp-advanced"]
tech-stack:
  added: ["@tanstack/react-virtual", "frimousse"]
  patterns: ["virtualized-list", "realtime-messages", "24h-window-enforcement"]
key-files:
  created:
    - src/app/actions/messages.ts
    - src/app/(dashboard)/whatsapp/components/chat-view.tsx
    - src/app/(dashboard)/whatsapp/components/message-bubble.tsx
    - src/app/(dashboard)/whatsapp/components/chat-header.tsx
    - src/app/(dashboard)/whatsapp/components/media-preview.tsx
    - src/app/(dashboard)/whatsapp/components/message-input.tsx
    - src/app/(dashboard)/whatsapp/components/emoji-picker.tsx
  modified:
    - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
    - src/app/actions/whatsapp.ts
decisions:
  - id: "07-03-01"
    summary: "TanStack Virtual for message list performance"
    rationale: "Virtualization enables smooth scrolling with thousands of messages"
  - id: "07-03-02"
    summary: "frimousse for emoji picker"
    rationale: "Lightweight (2kb), React 19 compatible, shadcn theme compatible"
  - id: "07-03-03"
    summary: "Base64 encoding for file upload"
    rationale: "Server Action limitation - cannot pass File objects directly"
  - id: "07-03-04"
    summary: "Subtle geometric SVG pattern for chat background"
    rationale: "Per brand guidelines - math/geometric theme without overwhelming"
metrics:
  duration: "~14 minutes"
  completed: "2026-01-30"
---

# Phase 7 Plan 03: Chat View and Message Sending Summary

**One-liner:** Virtualized chat view with message bubbles, emoji picker, file attachments, and 24h window enforcement for WhatsApp messaging.

## What Was Built

### Message Server Actions (src/app/actions/messages.ts)

- **getMessages(conversationId, limit, before):** Fetch messages with cursor pagination
- **sendMessage(conversationId, text):** Send text message within 24h window
- **sendMediaMessage(conversationId, fileData, fileName, mimeType, caption):** Upload to Supabase Storage and send via 360dialog
- **markMessageAsRead(messageId):** Send read receipt to WhatsApp

Key features:
- 24h window check using differenceInHours from date-fns
- Base64 file encoding for server action compatibility
- Workspace API key lookup from settings or env fallback
- Conversation last_message update on send

### Chat View Component (src/app/(dashboard)/whatsapp/components/chat-view.tsx)

- TanStack Virtual setup for message list virtualization
- Auto-scroll to bottom on new messages
- Scroll position tracking to prevent unwanted jumps
- Empty state when no conversation selected
- Geometric SVG pattern background (subtle math/geometry theme)
- Integration with ChatHeader and MessageInput

### Message Bubble (src/app/(dashboard)/whatsapp/components/message-bubble.tsx)

- Own messages: bg-primary, right-aligned, rounded-br-none
- Received messages: bg-muted, left-aligned, rounded-bl-none
- Content rendering by type:
  - text: whitespace-pre-wrap for formatting
  - image/video/audio/document: MediaPreview component
  - location: Google Maps static image preview
  - contacts/template/interactive: Simplified display
  - reaction: Large emoji display
- Timestamp below bubble (HH:mm format)
- Status indicators: Check (sent), Double check (delivered), Blue double check (read)

### Chat Header (src/app/(dashboard)/whatsapp/components/chat-header.tsx)

- Contact avatar placeholder with first letter
- Contact name (or phone if no linked contact)
- Phone number secondary text
- Action buttons:
  - Mark as read (conditionally shown)
  - Archive conversation
  - Open in CRM (link to contact detail)
  - Toggle right panel
- WindowIndicator integration at bottom

### Media Preview (src/app/(dashboard)/whatsapp/components/media-preview.tsx)

- **Image:** Click to expand in fullscreen modal
- **Video:** HTML5 video player with controls
- **Audio:** HTML5 audio player
- **Document:** File icon + name + download link
- **Sticker:** Small inline image (24px)
- Loading and error states handled

### Message Input (src/app/(dashboard)/whatsapp/components/message-input.tsx)

- Auto-expanding textarea (max 5 lines)
- Enter sends, Shift+Enter for newline
- Attach file button with hidden input
- Emoji picker in popover
- Send button (disabled when empty)
- **Disabled state when window closed:**
  - Lock icon with "Ventana de 24h cerrada" text
  - "Usar template" button (placeholder for Phase 8)
- File upload via base64 encoding (max 16MB)

### Emoji Picker (src/app/(dashboard)/whatsapp/components/emoji-picker.tsx)

- frimousse library (lightweight, React 19 compatible)
- Spanish locale
- 8 columns grid layout
- Search functionality
- Styled to match shadcn theme (bg-popover, borders)

### InboxLayout Update

- Replaced placeholder chat with ChatView component
- Pass selectedConversation and onTogglePanel props

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 07-03-01 | TanStack Virtual for messages | Handles thousands of messages smoothly |
| 07-03-02 | frimousse for emoji picker | 2kb, React 19 compatible, easy theming |
| 07-03-03 | Base64 file encoding | Server Actions cannot receive File objects |
| 07-03-04 | Geometric SVG background | Brand-aligned subtle pattern |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing type error in whatsapp.ts**
- **Found during:** Task 1 verification
- **Issue:** Supabase join return type confusion for stage relation
- **Fix:** Added proper type assertion with Array.isArray check
- **Files modified:** src/app/actions/whatsapp.ts
- **Commit:** 1387974

## Commits

| Hash | Message |
|------|---------|
| 1387974 | feat(07-03): create message Server Actions |
| 136edaf | feat(07-03): create chat view with virtualized messages |
| 3284944 | feat(07-03): create message input with emoji picker |

## Files Created

```
src/app/actions/messages.ts (318 lines)
src/app/(dashboard)/whatsapp/components/chat-view.tsx (178 lines)
src/app/(dashboard)/whatsapp/components/message-bubble.tsx (202 lines)
src/app/(dashboard)/whatsapp/components/chat-header.tsx (122 lines)
src/app/(dashboard)/whatsapp/components/media-preview.tsx (188 lines)
src/app/(dashboard)/whatsapp/components/message-input.tsx (241 lines)
src/app/(dashboard)/whatsapp/components/emoji-picker.tsx (59 lines)
```

## Files Modified

```
src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
src/app/actions/whatsapp.ts
```

## Next Phase Readiness

**Ready for 08-whatsapp-advanced:**
- [x] Message sending infrastructure complete
- [x] Chat view renders messages with status
- [x] Media handling implemented
- [x] 24h window enforcement in place

**Phase 8 will add:**
- Template management (for closed window)
- Quick replies
- Conversation assignment rules
- Usage/cost tracking

**Testing Notes:**
- Requires 360dialog API key configured
- Requires Supabase Storage bucket "whatsapp-media"
- Real-time updates depend on Supabase Realtime subscription
