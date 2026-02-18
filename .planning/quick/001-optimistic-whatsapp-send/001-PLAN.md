---
phase: quick
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  - src/hooks/use-messages.ts
  - src/app/(dashboard)/whatsapp/components/message-input.tsx
  - src/app/(dashboard)/whatsapp/components/message-bubble.tsx
  - src/app/(dashboard)/whatsapp/components/chat-view.tsx
autonomous: true

must_haves:
  truths:
    - "Al enviar texto, el input se limpia inmediatamente y el mensaje aparece en el chat al instante con estado 'enviando'"
    - "El usuario puede seguir escribiendo sin esperar respuesta del servidor"
    - "Cuando llega el mensaje real via Realtime INSERT, el optimista se reemplaza sin duplicar"
    - "Si el envio falla, se muestra toast de error con opcion de reintentar"
    - "Para archivos/media, el comportamiento con isLoading se mantiene igual (bloquea input)"
  artifacts:
    - path: "src/hooks/use-messages.ts"
      provides: "addOptimisticMessage function + optimistic replacement logic in Realtime INSERT handler"
      exports: ["addOptimisticMessage"]
    - path: "src/app/(dashboard)/whatsapp/components/message-bubble.tsx"
      provides: "Visual indicator for status='sending' (opacity + clock icon)"
    - path: "src/app/(dashboard)/whatsapp/components/message-input.tsx"
      provides: "Non-blocking text send with immediate input clear"
    - path: "src/app/(dashboard)/whatsapp/components/chat-view.tsx"
      provides: "Wiring addOptimisticMessage from hook to MessageInput"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/chat-view.tsx"
      to: "src/hooks/use-messages.ts"
      via: "destructure addOptimisticMessage from useMessages return"
      pattern: "addOptimisticMessage"
    - from: "src/app/(dashboard)/whatsapp/components/chat-view.tsx"
      to: "src/app/(dashboard)/whatsapp/components/message-input.tsx"
      via: "prop addOptimisticMessage passed to MessageInput"
      pattern: "addOptimisticMessage="
    - from: "src/app/(dashboard)/whatsapp/components/message-input.tsx"
      to: "src/hooks/use-messages.ts"
      via: "calls addOptimisticMessage(text) before firing server action"
      pattern: "addOptimisticMessage\\("
    - from: "src/hooks/use-messages.ts Realtime INSERT handler"
      to: "optimistic message array"
      via: "replaces optimistic message with real one on INSERT of outbound"
      pattern: "optimistic-"
---

<objective>
Implement optimistic message sending for WhatsApp text messages.

Purpose: Eliminate perceived latency when sending text messages. Currently the input blocks with isLoading while the server action runs. With optimistic sending, the message appears instantly in the chat, the input clears immediately, and the user can keep typing. Media/file sends retain the existing blocking behavior.

Output: Modified 4 files — hook exposes addOptimisticMessage, input sends text non-blocking, bubble shows "sending" state, chat-view wires them together.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/hooks/use-messages.ts
@src/app/(dashboard)/whatsapp/components/message-input.tsx
@src/app/(dashboard)/whatsapp/components/message-bubble.tsx
@src/app/(dashboard)/whatsapp/components/chat-view.tsx
@src/lib/whatsapp/types.ts (Message interface, MessageStatus type)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add addOptimisticMessage to useMessages hook + optimistic replacement in Realtime handler</name>
  <files>src/hooks/use-messages.ts</files>
  <action>
    1. Add `addOptimisticMessage` function to the hook:
       - Signature: `addOptimisticMessage(text: string): void`
       - Creates a temporary Message object with:
         - `id`: `'optimistic-' + Date.now()`
         - `conversation_id`: the current conversationId
         - `workspace_id`: '' (not needed for display)
         - `wamid`: null
         - `direction`: 'outbound'
         - `type`: 'text'
         - `content`: `{ body: text }`
         - `status`: 'sending' as any (note: 'sending' is NOT in MessageStatus type, but we use it as a client-only sentinel value; cast with `as Message['status']` — the type will accept it at runtime and MessageBubble will handle it)
         - `status_timestamp`: null
         - `error_code`: null, `error_message`: null
         - `media_url`: null, `media_mime_type`: null, `media_filename`: null
         - `template_name`: null
         - `sent_by_agent`: false
         - `timestamp`: `new Date().toISOString()`
         - `created_at`: `new Date().toISOString()`
       - Appends to messages array via `setMessages(prev => [...prev, optimisticMsg])`

    2. Modify the Realtime INSERT handler (line ~125-130):
       - When a new outbound message arrives (newMessage.direction === 'outbound'), check if there's an optimistic message to replace.
       - Replacement logic: find the first message in the array where `id.startsWith('optimistic-')` AND the content body matches the new message's content body (type === 'text' ? (content as TextContent).body : null).
       - If found, replace that optimistic message with the real one using `.map()`.
       - If NOT found (no matching optimistic), append as before (spread + newMessage).
       - For inbound messages, always append as before (no optimistic check needed).

    3. Update the return type interface `UseMessagesReturn`:
       - Add `addOptimisticMessage: (text: string) => void`

    4. Return `addOptimisticMessage` from the hook.

    IMPORTANT: Import `TextContent` from `@/lib/whatsapp/types` (already imported `Message` from there).
    IMPORTANT: Do NOT add 'sending' to the MessageStatus type union — it's a client-only concept. Use type assertion.
  </action>
  <verify>
    `npx tsc --noEmit` passes (or at least no NEW errors in these files).
    The hook returns addOptimisticMessage in its return object.
  </verify>
  <done>
    useMessages exposes addOptimisticMessage(text). Realtime INSERT handler replaces optimistic messages with real ones for outbound text. Return type updated.
  </done>
</task>

<task type="auto">
  <name>Task 2: Non-blocking text send in MessageInput + sending indicator in MessageBubble + wiring in ChatView</name>
  <files>
    src/app/(dashboard)/whatsapp/components/message-input.tsx
    src/app/(dashboard)/whatsapp/components/message-bubble.tsx
    src/app/(dashboard)/whatsapp/components/chat-view.tsx
  </files>
  <action>
    **message-input.tsx changes:**

    1. Add `addOptimisticMessage` to the props interface:
       ```ts
       addOptimisticMessage?: (text: string) => void
       ```
       Add it to the destructured props.

    2. Modify the text-send branch of `handleSend` (the "Otherwise send text" section, lines ~169-187):
       - Save text to local variable: `const trimmedText = text.trim()` (already exists)
       - Call `addOptimisticMessage?.(trimmedText)` BEFORE clearing
       - Clear input immediately: `setText('')`
       - Call `onSend?.()` immediately (for scroll-to-bottom)
       - Do NOT set `setIsLoading(true)` for text sends
       - Fire the server action in background (no await blocking the function):
         ```ts
         sendMessage(conversationId, trimmedText).then(result => {
           if ('error' in result) {
             toast.error('Error al enviar mensaje', {
               action: {
                 label: 'Reintentar',
                 onClick: () => {
                   sendMessage(conversationId, trimmedText).then(retryResult => {
                     if ('error' in retryResult) {
                       toast.error(retryResult.error)
                     }
                   })
                 },
               },
             })
           }
         }).catch(() => {
           toast.error('Error al enviar mensaje')
         })
         ```
       - Remove the `finally { setIsLoading(false) }` block for text sends (there's no loading state to clear)

    3. Keep the `isLoading` guard at the top (`if (isLoading) return`) — this still protects media/file sends.

    4. The send button disabled condition (line ~421): currently `(!text.trim() && !attachedFile && !pendingQuickReplyMedia) || isLoading`. This is fine — `isLoading` only goes true for media sends now, so text sends won't disable the button.

    5. Add `addOptimisticMessage` to the `useCallback` dependency array of `handleSend`.

    **message-bubble.tsx changes:**

    1. Import `Clock` from lucide-react (add to the existing import).

    2. In the `StatusIcon` component, add a case for `'sending'`:
       ```ts
       // Client-only optimistic status
       if (status === 'sending') {
         return <Clock className="h-3 w-3 text-muted-foreground animate-pulse" />
       }
       ```
       Place this check BEFORE the switch statement (since 'sending' isn't in the MessageStatus union, it won't match any case).

    3. In the `MessageBubble` component, add a subtle opacity to the bubble when the message is optimistic:
       - On the outer bubble `<div>` (the one with `rounded-lg px-3 py-2 shadow-sm`), add conditional opacity:
         ```ts
         message.status === ('sending' as any) && 'opacity-70'
         ```
         Add this to the existing `cn()` call.

    **chat-view.tsx changes:**

    1. Destructure `addOptimisticMessage` from the `useMessages` hook (line ~35):
       ```ts
       const { messages, isLoading, loadMore, hasMore, addOptimisticMessage } = useMessages({...})
       ```

    2. Pass `addOptimisticMessage` to `<MessageInput>` (line ~244):
       ```tsx
       <MessageInput
         conversationId={conversationId}
         isWindowOpen={isWindowOpen}
         contact={...}
         addOptimisticMessage={addOptimisticMessage}
         onSend={() => {
           scrolledToBottomRef.current = true
         }}
       />
       ```
  </action>
  <verify>
    `npx tsc --noEmit` passes (or no NEW errors).
    Visual check: open WhatsApp module, send a text message. Expect:
    - Input clears instantly
    - Message appears in chat with clock icon and slight opacity
    - Once server confirms, clock icon changes to checkmark and opacity becomes full
    - Can type and send another message immediately without waiting
  </verify>
  <done>
    Text messages send optimistically with instant input clear, no blocking.
    Media/file sends retain isLoading blocking behavior.
    Sending state shows clock icon + reduced opacity.
    Failed sends show toast with retry button.
    ChatView wires addOptimisticMessage from hook to input component.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — no new type errors
2. Manual test: send text message in WhatsApp module
   - Input clears instantly (no spinner, no blocking)
   - Optimistic message appears with clock icon + opacity
   - When Realtime INSERT fires, optimistic message is replaced by real one (status changes to 'sent'/'delivered', opacity becomes full)
3. Manual test: send media/file — still shows loading state, blocks input (existing behavior preserved)
4. Manual test: simulate failure (e.g., disconnect network) — toast appears with "Reintentar" button
5. Manual test: send multiple text messages rapidly — all appear optimistically, all resolve correctly without duplicates
</verification>

<success_criteria>
- Text messages appear in chat instantly with 'sending' visual indicator
- Input clears immediately and is ready for next message
- No isLoading blocking for text sends
- Media/file sends retain existing blocking behavior unchanged
- Optimistic messages are replaced by real ones via Realtime without duplicates
- Failed sends show toast with retry option
- TypeScript compiles without new errors
</success_criteria>

<output>
After completion, create `.planning/quick/001-optimistic-whatsapp-send/001-SUMMARY.md`
</output>
