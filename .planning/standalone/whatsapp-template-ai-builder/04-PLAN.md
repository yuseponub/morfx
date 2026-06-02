---
phase: whatsapp-template-ai-builder
plan: 04
type: execute
wave: 4
depends_on: [01, 02, 03]
files_modified:
  - src/app/(dashboard)/configuracion/whatsapp/templates/builder/page.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-draft-context.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/preview-pane.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/whatsapp-bubble.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/image-uploader.tsx
autonomous: false  # Ends with human-verify checkpoint for visual UI
requirements: [D-01, D-02, D-03, D-04, D-05, D-06, D-09, D-10, D-11, D-12, D-13]
user_setup: []

must_haves:
  truths:
    - "Navigating to /configuracion/whatsapp/templates/builder renders a two-pane layout: chat left, preview right (D-01)"
    - "User can type in natural language in the left pane and see streaming AI responses (AI SDK v6 useChat + DefaultChatTransport, D-13)"
    - "As the AI patches the draft, the right pane's WhatsApp bubble updates in real-time (D-01)"
    - "User can edit preview fields directly (name, category, language, body, footer) and the bubble reflects edits (D-01)"
    - "User can upload an image in the preview pane; it uploads to Supabase Storage and shows in the bubble instantly (D-10, D-11, D-12)"
    - "Confirming the preview sends a 'Confirmo' message that the system prompt triggers submitTemplate on"
    - "Session switcher works (new session / select past session) — scoped to kind='template' (D-13)"
    - "The page does NOT interfere with /automatizaciones/builder (Regla 6)"
  artifacts:
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/page.tsx"
      provides: "Next RSC entry for the builder"
      contains: "TemplateBuilderLayout"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx"
      provides: "Two-pane shell + context provider + session switcher"
      contains: "TemplateDraftProvider"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-draft-context.tsx"
      provides: "React Context + useReducer for shared draft state"
      contains: "useReducer"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx"
      provides: "Streaming chat UI with DefaultChatTransport"
      contains: "DefaultChatTransport"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx"
      provides: "UIMessage parts renderer with tool-state branches"
      contains: "part.type"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/preview-pane.tsx"
      provides: "Editable fields + WhatsApp bubble mount"
      contains: "useTemplateDraft"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/whatsapp-bubble.tsx"
      provides: "Pure-render WhatsApp-style message bubble"
      contains: "rounded-lg bg-"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/image-uploader.tsx"
      provides: "File input + Storage upload + preview wiring"
      contains: "/api/config-builder/templates/upload"
  key_links:
    - from: "chat-pane.tsx"
      to: "/api/config-builder/templates/chat"
      via: "DefaultChatTransport api prop"
      pattern: "/api/config-builder/templates/chat"
    - from: "image-uploader.tsx"
      to: "/api/config-builder/templates/upload"
      via: "fetch POST multipart"
      pattern: "/api/config-builder/templates/upload"
    - from: "template-builder-layout.tsx"
      to: "template-draft-context.tsx"
      via: "<TemplateDraftProvider> wrap"
      pattern: "TemplateDraftProvider"
    - from: "preview-pane.tsx"
      to: "whatsapp-bubble.tsx"
      via: "direct render with resolved body"
      pattern: "WhatsAppBubble"
---

<objective>
Build the client-side UI for the template builder. Two-pane layout: left = streaming AI chat (cloned from automation builder's AI SDK v6 pattern — D-13), right = editable preview with live WhatsApp-style bubble + image uploader (D-01, D-10, D-11). All panes share a `TemplateDraft` via React Context + useReducer (D-13 Open Q2 decision). The human-verify checkpoint at the end confirms the visual outcome.

Purpose: This is where every locked decision about the user experience manifests. D-01 (two-pane), D-03 (natural language → {{N}}), D-04 (variable mapping capture), D-10/D-11 (image upload flow), D-13 (AI SDK v6 pattern reuse). The route coexists with the manual form (D-02).

Output: 8 new client components + 1 server entry page. All under `src/app/(dashboard)/configuracion/whatsapp/templates/builder/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/whatsapp-template-ai-builder/CONTEXT.md
@.planning/standalone/whatsapp-template-ai-builder/RESEARCH.md
@.planning/standalone/whatsapp-template-ai-builder/PATTERNS.md
@.planning/standalone/whatsapp-template-ai-builder/03-SUMMARY.md

<interfaces>
From src/lib/config-builder/templates/types.ts (Plan 03):
```typescript
export interface TemplateDraft {
  name: string
  language: 'es' | 'es_CO' | 'en_US'
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  headerFormat: 'NONE' | 'TEXT' | 'IMAGE'
  headerText: string
  headerImageStoragePath: string | null
  headerImageLocalUrl: string | null
  bodyText: string
  footerText: string
  variableMapping: Record<string, string>
  bodyExamples: Record<string, string>
  headerExamples: Record<string, string>
}
```

From src/lib/automations/variable-resolver.ts (existing — use to substitute {{N}} with example values in bubble):
```typescript
export function resolveVariables(text: string, context: Record<string, string>): string
```
(Read the file to confirm exact signature before using.)

From automation builder clones (read these for pattern):
- src/app/(dashboard)/automatizaciones/builder/components/builder-layout.tsx (session switcher, two-pane shell — adapt for left+right not single column)
- src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx (DefaultChatTransport, useChat, sendMessage)
- src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx (UIMessage parts rendering, legacy fallback)

Upload endpoint response shape (from Plan 03):
```typescript
{ storagePath: string; publicUrl: string; mimeType: 'image/jpeg' | 'image/png' }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 4.1: Create server entry page + layout shell + draft context</name>
  <files>src/app/(dashboard)/configuracion/whatsapp/templates/builder/page.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-draft-context.tsx</files>
  <read_first>
    - src/app/(dashboard)/automatizaciones/builder/page.tsx (11-line analog; clone)
    - src/app/(dashboard)/automatizaciones/builder/components/builder-layout.tsx (full file — session switcher pattern lines 48-152)
    - src/lib/config-builder/templates/types.ts (the `TemplateDraft` shape to match in reducer)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (sections: `page.tsx`, `template-builder-layout.tsx`, `template-draft-context.tsx`)
    - .planning/standalone/whatsapp-template-ai-builder/CONTEXT.md (D-01, D-13)
  </read_first>
  <action>
    **File A — `src/app/(dashboard)/configuracion/whatsapp/templates/builder/page.tsx`:**

    ```tsx
    // ============================================================================
    // Standalone: whatsapp-template-ai-builder
    // Server component entry for /configuracion/whatsapp/templates/builder
    // ============================================================================

    import { TemplateBuilderLayout } from './components/template-builder-layout'

    export default function TemplateBuilderPage() {
      return <TemplateBuilderLayout />
    }
    ```

    **File B — `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-draft-context.tsx`:**

    ```tsx
    'use client'

    import { createContext, useContext, useReducer, type ReactNode } from 'react'
    import type { TemplateDraft } from '@/lib/config-builder/templates/types'

    type Action =
      | { type: 'UPDATE_FIELD'; field: keyof TemplateDraft; value: unknown }
      | { type: 'APPLY_AI_PATCH'; patch: Partial<TemplateDraft> }
      | { type: 'RESET' }

    const initialDraft: TemplateDraft = {
      name: '',
      language: 'es',
      category: 'UTILITY',
      headerFormat: 'NONE',
      headerText: '',
      headerImageStoragePath: null,
      headerImageLocalUrl: null,
      bodyText: '',
      footerText: '',
      variableMapping: {},
      bodyExamples: {},
      headerExamples: {},
    }

    function draftReducer(state: TemplateDraft, action: Action): TemplateDraft {
      switch (action.type) {
        case 'UPDATE_FIELD':
          return { ...state, [action.field]: action.value }
        case 'APPLY_AI_PATCH':
          return { ...state, ...action.patch }
        case 'RESET':
          return initialDraft
        default:
          return state
      }
    }

    interface TemplateDraftContextValue {
      draft: TemplateDraft
      dispatch: React.Dispatch<Action>
    }

    const TemplateDraftContext = createContext<TemplateDraftContextValue | null>(null)

    export function TemplateDraftProvider({ children }: { children: ReactNode }) {
      const [draft, dispatch] = useReducer(draftReducer, initialDraft)
      return (
        <TemplateDraftContext.Provider value={{ draft, dispatch }}>
          {children}
        </TemplateDraftContext.Provider>
      )
    }

    export function useTemplateDraft(): TemplateDraftContextValue {
      const ctx = useContext(TemplateDraftContext)
      if (!ctx) {
        throw new Error('useTemplateDraft must be used within <TemplateDraftProvider>')
      }
      return ctx
    }
    ```

    **File C — `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx`:**

    Clone `src/app/(dashboard)/automatizaciones/builder/components/builder-layout.tsx` but:
    1. Wrap with `<TemplateDraftProvider>` (import from `./template-draft-context`)
    2. Two-column grid instead of single column — `grid-cols-1 md:grid-cols-2` (or `lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`)
    3. Left column renders `<ChatPane>` (created Task 4.2); right column renders `<PreviewPane>` (Task 4.3)
    4. Session fetch URL: use `/api/builder/sessions?sessionId=...&kind=template` IF the session route supports the filter — otherwise `/api/builder/sessions?sessionId=...` and client-side filter by `session.kind === 'template'` after the fetch
    5. Back link target: `/configuracion/whatsapp/templates` (not `/automatizaciones`)
    6. Page heading: "Crear template con IA"
    7. Preserve session-switching pattern verbatim (lines 48-81 of analog):
       - `handleNewSession` → resets `sessionId`, `sessionTitle`, `initialMessages`, `chatKey`, `dispatch({ type: 'RESET' })` on the draft context
       - `handleSessionCreated(id)` → setSessionId(id)
       - `handleSelectSession(selectedId)` → fetches session, sets state, triggers re-render via `chatKey`

    Key skeleton (adapt from analog):
    ```tsx
    'use client'

    import { useCallback, useState } from 'react'
    import Link from 'next/link'
    import { TemplateDraftProvider, useTemplateDraft } from './template-draft-context'
    import { ChatPane } from './chat-pane'
    import { PreviewPane } from './preview-pane'
    import type { UIMessage } from 'ai'

    export function TemplateBuilderLayout() {
      const [sessionId, setSessionId] = useState<string | null>(null)
      const [sessionTitle, setSessionTitle] = useState<string | null>(null)
      const [initialMessages, setInitialMessages] = useState<UIMessage[]>([])
      const [chatKey, setChatKey] = useState<string>('new')

      // ... handlers from analog ...

      return (
        <TemplateDraftProvider>
          <div className="flex flex-col h-screen">
            <header className="border-b px-6 py-3 flex items-center justify-between">
              <div>
                <Link href="/configuracion/whatsapp/templates" className="text-sm text-muted-foreground">
                  ← Volver a templates
                </Link>
                <h1 className="text-lg font-semibold">
                  {sessionTitle || 'Crear template con IA'}
                </h1>
              </div>
              <button onClick={handleNewSession} className="text-sm">Nuevo</button>
            </header>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 min-h-0">
              <div className="border-r flex flex-col min-h-0">
                <ChatPane
                  key={chatKey}
                  sessionId={sessionId}
                  onSessionCreated={handleSessionCreated}
                  initialMessages={initialMessages}
                />
              </div>
              <div className="flex flex-col min-h-0 overflow-y-auto">
                <PreviewPane />
              </div>
            </div>
          </div>
        </TemplateDraftProvider>
      )
    }
    ```

    If the automation builder's layout has additional props or session-history sidebar, clone those too — adapt, don't simplify.
  </action>
  <verify>
    <automated>test -f src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/page.tsx &amp;&amp; test -f src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx &amp;&amp; test -f src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/template-draft-context.tsx &amp;&amp; grep -q "TemplateBuilderLayout" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/page.tsx &amp;&amp; grep -q "TemplateDraftProvider" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx &amp;&amp; grep -q "useReducer" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/template-draft-context.tsx &amp;&amp; grep -q "useTemplateDraft" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/template-draft-context.tsx &amp;&amp; cd /mnt/c/Users/Usuario/Proyectos/morfx-new &amp;&amp; npx tsc --noEmit -p . 2>&amp;1 | grep "builder" | head -10</automated>
  </verify>
  <acceptance_criteria>
    - `page.tsx` exists and is a server component rendering `<TemplateBuilderLayout />`
    - `template-draft-context.tsx` has `'use client'` directive, exports `TemplateDraftProvider` and `useTemplateDraft`, uses `useReducer`
    - Reducer handles `UPDATE_FIELD`, `APPLY_AI_PATCH`, `RESET` actions
    - `template-builder-layout.tsx` has `'use client'`, wraps children in `<TemplateDraftProvider>`, renders two columns
    - Layout back-link points to `/configuracion/whatsapp/templates`
    - Reducer's `APPLY_AI_PATCH` accepts `Partial<TemplateDraft>`
    - `npx tsc --noEmit` reports zero errors in these 3 files (even though ChatPane/PreviewPane are not yet created — use dummy placeholders or expect TS errors to resolve in Tasks 4.2+4.3)
  </acceptance_criteria>
  <done>Shell, context, and server entry are in place. Two panes are empty scaffolds until Task 4.2-4.4 populate them.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4.2: Create ChatPane + ChatMessage (streaming AI chat)</name>
  <files>src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx</files>
  <read_first>
    - src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx (full file — DefaultChatTransport + useChat + session header capture)
    - src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx (full file — parts rendering, legacy fallback, tool state branches lines 180-240)
    - ./template-draft-context.tsx (you will call `dispatch({ type: 'APPLY_AI_PATCH', ... })` when tool outputs arrive)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (sections: `chat-pane.tsx`, `chat-message.tsx`)
    - .planning/standalone/whatsapp-template-ai-builder/CONTEXT.md (D-03 — user writes naturally, D-04 — mapping captured inline)
  </read_first>
  <action>
    **File A — `chat-pane.tsx`:** Clone `builder-chat.tsx` with these changes:

    1. Change transport URL from `/api/builder/chat` to `/api/config-builder/templates/chat`
    2. Import `ChatMessage` from `./chat-message` (instead of `BuilderMessage`)
    3. Remove any reference to `AutomationPreviewData` / automation-specific types
    4. `handleConfirmPreview` sends: `sendMessage({ text: 'Confirmo. Envia el template a Meta.' })`
    5. Empty-state copy: `"Describe el template que quieres crear. Por ejemplo: 'Un mensaje para confirmar pedidos que diga hola, tu pedido llega manana'."`
    6. Pass `onToolOutput` or similar callback from `useChat` that dispatches into `TemplateDraftContext` when tools return successful patches (see Task 4.2 wiring note below)

    Key fragment:
    ```tsx
    'use client'

    import { DefaultChatTransport } from 'ai'
    import { useChat } from '@ai-sdk/react'
    import { useState, useRef, useEffect, useCallback } from 'react'
    import { useTemplateDraft } from './template-draft-context'
    import { ChatMessage } from './chat-message'
    import type { UIMessage } from 'ai'

    interface Props {
      sessionId: string | null
      onSessionCreated: (id: string) => void
      initialMessages: UIMessage[]
    }

    export function ChatPane({ sessionId, onSessionCreated, initialMessages }: Props) {
      const sessionIdRef = useRef<string | null>(sessionId)
      useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])

      const { dispatch } = useTemplateDraft()

      const [transport] = useState(
        () =>
          new DefaultChatTransport({
            api: '/api/config-builder/templates/chat',
            body: () => ({ sessionId: sessionIdRef.current }),
            fetch: async (input, init) => {
              const response = await fetch(input, init)
              const newSessionId = response.headers.get('X-Session-Id')
              if (newSessionId && !sessionIdRef.current) {
                onSessionCreated(newSessionId)
              }
              return response
            },
          })
      )

      const { messages, sendMessage, status, error } = useChat({
        transport,
        messages: initialMessages,
      })

      // Input state + send
      const [inputValue, setInputValue] = useState('')
      const handleSend = useCallback(() => {
        if (!inputValue.trim()) return
        sendMessage({ text: inputValue })
        setInputValue('')
      }, [inputValue, sendMessage])

      return (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground p-4">
                Describe el template que quieres crear. Por ejemplo: &quot;Un mensaje para confirmar pedidos que diga hola, tu pedido llega manana&quot;.
              </div>
            )}
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} onDraftPatch={(patch) => dispatch({ type: 'APPLY_AI_PATCH', patch })} />
            ))}
            {error && <div className="text-sm text-destructive p-2">{error.message}</div>}
          </div>

          <div className="border-t p-3 flex gap-2">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              rows={2}
              placeholder="Escribe lo que necesitas..."
              className="flex-1 resize-none border rounded px-3 py-2 text-sm"
              disabled={status === 'streaming'}
            />
            <button
              onClick={handleSend}
              disabled={status === 'streaming' || !inputValue.trim()}
              className="px-4 bg-primary text-primary-foreground rounded disabled:opacity-50"
            >
              {status === 'streaming' ? '...' : 'Enviar'}
            </button>
          </div>
        </>
      )
    }
    ```

    **File B — `chat-message.tsx`:** Clone `builder-message.tsx`'s parts-rendering shape (lines 180-240). Rename tool-state labels for template builder:

    - `listExistingTemplates` → "Consultando templates existentes..."
    - `suggestCategory` → "Analizando categoria..."
    - `suggestLanguage` → "Detectando idioma..."
    - `captureVariableMapping` → "Mapeando variable {{N}}..."
    - `validateTemplateDraft` → "Validando..."
    - `submitTemplate` → "Enviando a Meta..."

    Include the legacy-fallback branch (Pitfall 9) verbatim. When a tool returns `output-available` with a successful result containing partial draft fields (e.g., `suggestCategory` returns `{ category }`), call `onDraftPatch({ category })` to propagate to the context.

    Key shape (abbreviated):
    ```tsx
    'use client'

    import { cn } from '@/lib/utils'
    import type { UIMessage } from 'ai'
    import type { TemplateDraft } from '@/lib/config-builder/templates/types'

    interface Props {
      message: UIMessage
      onDraftPatch: (patch: Partial<TemplateDraft>) => void
    }

    const TOOL_LABELS: Record<string, string> = {
      listExistingTemplates: 'Consultando templates existentes...',
      suggestCategory: 'Analizando categoria...',
      suggestLanguage: 'Detectando idioma...',
      captureVariableMapping: 'Mapeando variable...',
      validateTemplateDraft: 'Validando...',
      submitTemplate: 'Enviando a Meta...',
    }

    export function ChatMessage({ message, onDraftPatch }: Props) {
      const isUser = message.role === 'user'

      return (
        <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
          <div className={cn('max-w-[80%] rounded-lg px-3 py-2', isUser ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
            {(!message.parts || !Array.isArray(message.parts)) ? (
              <div className="text-sm whitespace-pre-wrap break-words">
                {typeof (message as unknown as { content: string }).content === 'string'
                  ? (message as unknown as { content: string }).content
                  : ''}
              </div>
            ) : (
              message.parts.map((part, i) => {
                switch (part.type) {
                  case 'text':
                    return <div key={i} className="text-sm whitespace-pre-wrap break-words">{part.text}</div>
                  case 'dynamic-tool': {
                    const { toolName, state } = part
                    const label = TOOL_LABELS[toolName] || toolName
                    if (state === 'input-streaming' || state === 'input-available') {
                      return <div key={i} className="text-xs text-muted-foreground italic">{label}</div>
                    }
                    if (state === 'output-available') {
                      const out = part.output as unknown
                      // Dispatch patches based on tool outputs
                      if (toolName === 'suggestCategory' && out && typeof out === 'object' && 'category' in out) {
                        // intentionally side-effect in render is bad; move to useEffect via a keyed deps array, or do it once:
                        // For simplicity, rely on tool-result arrival triggering re-render; the patch is dispatched via a one-time effect pattern.
                        // We'll use a helper below.
                      }
                      return <ToolOutput key={i} toolName={toolName} output={out} onDraftPatch={onDraftPatch} />
                    }
                    if (state === 'output-error') {
                      return <div key={i} className="text-xs text-destructive">{label}: error</div>
                    }
                    return null
                  }
                  default:
                    return null
                }
              })
            )}
          </div>
        </div>
      )
    }

    function ToolOutput({ toolName, output, onDraftPatch }: { toolName: string; output: unknown; onDraftPatch: Props['onDraftPatch'] }) {
      // Dispatch one-time on mount per tool call
      React.useEffect(() => {
        if (!output || typeof output !== 'object') return
        const o = output as Record<string, unknown>
        if (toolName === 'suggestCategory' && 'category' in o) {
          onDraftPatch({ category: o.category as TemplateDraft['category'] })
        }
        if (toolName === 'suggestLanguage' && 'language' in o) {
          onDraftPatch({ language: o.language as TemplateDraft['language'] })
        }
        if (toolName === 'captureVariableMapping' && 'varIndex' in o && 'path' in o) {
          onDraftPatch({
            variableMapping: {
              // merge — parent reducer uses APPLY_AI_PATCH which shallow-merges, so caller must pass the full dict
              [String(o.varIndex)]: String(o.path),
            },
          })
        }
        if (toolName === 'submitTemplate' && 'success' in o && o.success && 'templateId' in o) {
          // Show success banner; UI handles the rest
        }
      }, [toolName, output, onDraftPatch])

      // Tool-specific success rendering
      if (!output || typeof output !== 'object') return null
      const o = output as Record<string, unknown>
      if (toolName === 'submitTemplate' && o.success) {
        return (
          <div className="text-sm bg-green-100 dark:bg-green-900 px-2 py-1 rounded">
            Template enviado a Meta. ID: {String(o.templateId)}
          </div>
        )
      }
      return <div className="text-xs text-muted-foreground">[{toolName}] OK</div>
    }
    ```

    Important: add `import * as React from 'react'` or `import { useEffect } from 'react'` at the top for the `ToolOutput` effect hook.

    Note on merge semantics: when `captureVariableMapping` returns a mapping, the naive `APPLY_AI_PATCH` shallow-merges, which would REPLACE the whole `variableMapping` dict. To avoid that, read current `variableMapping` from context before dispatching, OR dispatch an `UPDATE_FIELD` with the merged dict. Implement this correctly — the simplest way is to read `draft.variableMapping` via `useTemplateDraft()` inside `ToolOutput` and dispatch `UPDATE_FIELD` with the merged object.
  </action>
  <verify>
    <automated>test -f src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx &amp;&amp; test -f src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/chat-message.tsx &amp;&amp; grep -q "DefaultChatTransport" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx &amp;&amp; grep -q "'/api/config-builder/templates/chat'" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx &amp;&amp; grep -q "X-Session-Id" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx &amp;&amp; grep -q "part.type" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/chat-message.tsx &amp;&amp; grep -q "dynamic-tool" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/chat-message.tsx &amp;&amp; grep -q "message.parts" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/chat-message.tsx &amp;&amp; cd /mnt/c/Users/Usuario/Proyectos/morfx-new &amp;&amp; npx tsc --noEmit -p . 2>&amp;1 | grep "chat-pane\|chat-message" | head -10</automated>
  </verify>
  <acceptance_criteria>
    - Both files exist with `'use client'` directive
    - `chat-pane.tsx` imports `DefaultChatTransport` and targets `/api/config-builder/templates/chat`
    - `chat-pane.tsx` captures `X-Session-Id` header and calls `onSessionCreated`
    - `chat-message.tsx` renders `message.parts` with switch on `part.type`
    - Legacy fallback branch present (checks `!message.parts || !Array.isArray(message.parts)`)
    - Tool labels include all 6 tool names
    - `ToolOutput` dispatches draft patches for `suggestCategory`, `suggestLanguage`, `captureVariableMapping`
    - `submitTemplate` success surfaces a green banner
    - `npx tsc --noEmit` reports zero errors
  </acceptance_criteria>
  <done>Chat streams against the template route, tool outputs patch the draft context, message parts render with correct tool-state branches.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4.3: Create PreviewPane + WhatsAppBubble + ImageUploader</name>
  <files>src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/preview-pane.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/whatsapp-bubble.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/image-uploader.tsx</files>
  <read_first>
    - src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx (analog for form field layout + categoryInfo dict at lines 29-48)
    - src/lib/automations/variable-resolver.ts (existing — read to confirm resolveVariables signature)
    - ./template-draft-context.tsx (the `useTemplateDraft` hook created in Task 4.1)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (sections: `preview-pane.tsx`, `whatsapp-bubble.tsx`, `image-uploader.tsx`)
    - .planning/standalone/whatsapp-template-ai-builder/CONTEXT.md (D-01, D-05, D-06, D-09, D-12)
  </read_first>
  <action>
    **File A — `whatsapp-bubble.tsx`:**

    ```tsx
    'use client'

    interface Props {
      header?: { format: 'TEXT' | 'IMAGE'; text?: string; imageUrl?: string | null }
      body: string       // already interpolated with examples
      footer?: string
    }

    export function WhatsAppBubble({ header, body, footer }: Props) {
      return (
        <div className="max-w-sm rounded-lg bg-[#d9fdd3] dark:bg-[#005c4b] px-3 py-2 shadow-sm text-black dark:text-white">
          {header?.format === 'IMAGE' && header.imageUrl && (
            <img
              src={header.imageUrl}
              alt=""
              className="mb-2 rounded w-full aspect-video object-cover"
            />
          )}
          {header?.format === 'TEXT' && header.text && (
            <div className="font-semibold text-sm mb-1 whitespace-pre-wrap break-words">
              {header.text}
            </div>
          )}
          <div className="text-sm whitespace-pre-wrap break-words">{body}</div>
          {footer && (
            <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{footer}</div>
          )}
        </div>
      )
    }
    ```

    **File B — `image-uploader.tsx`:**

    ```tsx
    'use client'

    import { useState } from 'react'
    import { useTemplateDraft } from './template-draft-context'
    import { toast } from 'sonner'

    export function ImageUploader() {
      const { draft, dispatch } = useTemplateDraft()
      const [uploading, setUploading] = useState(false)

      async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        // Client-side validation (defense in depth; server also enforces)
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`Archivo muy grande: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximo 5 MB.`)
          return
        }
        if (!['image/jpeg', 'image/png'].includes(file.type)) {
          toast.error('Solo se aceptan imagenes JPG o PNG')
          return
        }

        // Instant local preview (no network)
        const localUrl = URL.createObjectURL(file)
        dispatch({ type: 'UPDATE_FIELD', field: 'headerImageLocalUrl', value: localUrl })
        dispatch({ type: 'UPDATE_FIELD', field: 'headerFormat', value: 'IMAGE' })

        // Upload to Storage
        setUploading(true)
        try {
          const formData = new FormData()
          formData.append('file', file)
          const res = await fetch('/api/config-builder/templates/upload', {
            method: 'POST',
            body: formData,
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
            toast.error(err.error || 'Error subiendo imagen')
            dispatch({ type: 'UPDATE_FIELD', field: 'headerImageLocalUrl', value: null })
            dispatch({ type: 'UPDATE_FIELD', field: 'headerFormat', value: 'NONE' })
            return
          }
          const { storagePath } = (await res.json()) as { storagePath: string; publicUrl: string; mimeType: string }
          dispatch({ type: 'UPDATE_FIELD', field: 'headerImageStoragePath', value: storagePath })
          toast.success('Imagen lista')
        } finally {
          setUploading(false)
        }
      }

      function handleRemove() {
        if (draft.headerImageLocalUrl) URL.revokeObjectURL(draft.headerImageLocalUrl)
        dispatch({ type: 'UPDATE_FIELD', field: 'headerImageLocalUrl', value: null })
        dispatch({ type: 'UPDATE_FIELD', field: 'headerImageStoragePath', value: null })
        dispatch({ type: 'UPDATE_FIELD', field: 'headerFormat', value: 'NONE' })
      }

      return (
        <div className="space-y-2">
          <label className="text-sm font-medium">Imagen del header (opcional)</label>
          {draft.headerImageLocalUrl ? (
            <div className="space-y-2">
              <img src={draft.headerImageLocalUrl} alt="Preview" className="rounded max-w-xs" />
              <button onClick={handleRemove} className="text-xs text-destructive">Quitar imagen</button>
            </div>
          ) : (
            <input
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleFileChange}
              disabled={uploading}
              className="text-sm"
            />
          )}
          {uploading && <div className="text-xs text-muted-foreground">Subiendo...</div>}
          <div className="text-xs text-muted-foreground">JPG o PNG, maximo 5 MB</div>
        </div>
      )
    }
    ```

    If `sonner` is not already a project dep (check package.json), replace `toast.*` calls with the project's existing toast helper or a simple alert. Do NOT add new dependencies.

    **File C — `preview-pane.tsx`:**

    ```tsx
    'use client'

    import { useTemplateDraft } from './template-draft-context'
    import { WhatsAppBubble } from './whatsapp-bubble'
    import { ImageUploader } from './image-uploader'

    const CATEGORY_OPTIONS: Array<{ value: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'; label: string; desc: string }> = [
      { value: 'UTILITY', label: 'UTILITY', desc: 'Transaccional / informativo' },
      { value: 'MARKETING', label: 'MARKETING', desc: 'Promociones / anuncios' },
      { value: 'AUTHENTICATION', label: 'AUTHENTICATION', desc: 'OTP / codigos' },
    ]

    const LANGUAGE_OPTIONS: Array<{ value: 'es' | 'es_CO' | 'en_US'; label: string }> = [
      { value: 'es', label: 'Espanol (es)' },
      { value: 'es_CO', label: 'Espanol Colombia (es_CO)' },
      { value: 'en_US', label: 'Ingles US (en_US)' },
    ]

    /**
     * Interpolate {{N}} in the template text with the provided example values.
     * Falls back to "{{N}}" placeholder visible if no example is supplied.
     */
    function interpolate(text: string, examples: Record<string, string>): string {
      return text.replace(/\{\{(\d+)\}\}/g, (_match, idx) => examples[idx] || `{{${idx}}}`)
    }

    export function PreviewPane() {
      const { draft, dispatch } = useTemplateDraft()
      const bodyPreview = interpolate(draft.bodyText, draft.bodyExamples)
      const headerPreview = draft.headerFormat === 'TEXT'
        ? interpolate(draft.headerText, draft.headerExamples)
        : undefined

      return (
        <div className="p-6 space-y-6">
          <h2 className="text-lg font-semibold">Preview</h2>

          <section className="space-y-3 border-b pb-6">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <input
                value={draft.name}
                onChange={(e) => dispatch({ type: 'UPDATE_FIELD', field: 'name', value: e.target.value })}
                placeholder="mi_template"
                className="w-full border rounded px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Categoria</label>
              <select
                value={draft.category}
                onChange={(e) => dispatch({ type: 'UPDATE_FIELD', field: 'category', value: e.target.value })}
                className="w-full border rounded px-3 py-1.5 text-sm"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Idioma</label>
              <select
                value={draft.language}
                onChange={(e) => dispatch({ type: 'UPDATE_FIELD', field: 'language', value: e.target.value })}
                className="w-full border rounded px-3 py-1.5 text-sm"
              >
                {LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </section>

          <section className="space-y-3 border-b pb-6">
            <div>
              <label className="text-sm font-medium">Header</label>
              <select
                value={draft.headerFormat}
                onChange={(e) => dispatch({ type: 'UPDATE_FIELD', field: 'headerFormat', value: e.target.value })}
                className="w-full border rounded px-3 py-1.5 text-sm"
              >
                <option value="NONE">Sin header</option>
                <option value="TEXT">Texto</option>
                <option value="IMAGE">Imagen</option>
              </select>
            </div>

            {draft.headerFormat === 'TEXT' && (
              <div>
                <label className="text-sm font-medium">Texto del header (max 60)</label>
                <input
                  value={draft.headerText}
                  onChange={(e) => dispatch({ type: 'UPDATE_FIELD', field: 'headerText', value: e.target.value })}
                  maxLength={60}
                  className="w-full border rounded px-3 py-1.5 text-sm"
                />
                <div className="text-xs text-muted-foreground">{draft.headerText.length}/60</div>
              </div>
            )}

            {draft.headerFormat === 'IMAGE' && <ImageUploader />}
          </section>

          <section className="space-y-3 border-b pb-6">
            <div>
              <label className="text-sm font-medium">Body (max 1024, obligatorio)</label>
              <textarea
                value={draft.bodyText}
                onChange={(e) => dispatch({ type: 'UPDATE_FIELD', field: 'bodyText', value: e.target.value })}
                maxLength={1024}
                rows={4}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <div className="text-xs text-muted-foreground">{draft.bodyText.length}/1024</div>
            </div>

            <div>
              <label className="text-sm font-medium">Footer (max 60, opcional)</label>
              <input
                value={draft.footerText}
                onChange={(e) => dispatch({ type: 'UPDATE_FIELD', field: 'footerText', value: e.target.value })}
                maxLength={60}
                className="w-full border rounded px-3 py-1.5 text-sm"
              />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-3">Vista previa del mensaje</h3>
            <WhatsAppBubble
              header={
                draft.headerFormat === 'IMAGE'
                  ? { format: 'IMAGE', imageUrl: draft.headerImageLocalUrl }
                  : draft.headerFormat === 'TEXT'
                  ? { format: 'TEXT', text: headerPreview }
                  : undefined
              }
              body={bodyPreview}
              footer={draft.footerText || undefined}
            />
          </section>
        </div>
      )
    }
    ```
  </action>
  <verify>
    <automated>test -f src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/preview-pane.tsx &amp;&amp; test -f src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/whatsapp-bubble.tsx &amp;&amp; test -f src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/image-uploader.tsx &amp;&amp; grep -q "useTemplateDraft" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/preview-pane.tsx &amp;&amp; grep -q "WhatsAppBubble" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/preview-pane.tsx &amp;&amp; grep -q "/api/config-builder/templates/upload" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/image-uploader.tsx &amp;&amp; grep -q "es_CO" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/preview-pane.tsx &amp;&amp; grep -q "MARKETING" src/app/\(dashboard\)/configuracion/whatsapp/templates/builder/components/preview-pane.tsx &amp;&amp; cd /mnt/c/Users/Usuario/Proyectos/morfx-new &amp;&amp; npx tsc --noEmit -p . 2>&amp;1 | grep "preview-pane\|whatsapp-bubble\|image-uploader" | head -10</automated>
  </verify>
  <acceptance_criteria>
    - All 3 files exist with `'use client'`
    - `whatsapp-bubble.tsx` exports `WhatsAppBubble` with props `{ header?, body, footer? }`
    - `image-uploader.tsx` POSTs to `/api/config-builder/templates/upload`
    - `image-uploader.tsx` validates size ≤ 5 MB and MIME ∈ {jpeg, png} client-side
    - `preview-pane.tsx` uses `useTemplateDraft` and dispatches `UPDATE_FIELD` actions
    - `preview-pane.tsx` offers all three languages (`es`, `es_CO`, `en_US`) and all three categories
    - `preview-pane.tsx` conditionally renders `<ImageUploader />` when `draft.headerFormat === 'IMAGE'`
    - Body textarea has `maxLength={1024}`; footer `maxLength={60}`; header text `maxLength={60}`
    - `WhatsAppBubble` is rendered at the bottom of `PreviewPane`
    - `npx tsc --noEmit` reports zero errors
  </acceptance_criteria>
  <done>Preview pane is editable and propagates changes; bubble re-renders in real-time; image uploads flow end-to-end.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4.4: [CHECKPOINT] Visual + functional UI verification</name>
  <what-built>
    The full template builder UI:
    - Server entry at `/configuracion/whatsapp/templates/builder`
    - Two-pane layout (chat left, preview right)
    - Shared draft context via React Context + useReducer
    - Streaming chat against `/api/config-builder/templates/chat` (D-13 AI SDK v6)
    - Editable preview with live WhatsApp-style bubble
    - Image upload flow to Supabase Storage (D-10, D-11)

    The automation builder at `/automatizaciones/builder` should be UNAFFECTED (Regla 6 test).

    Push to Vercel before testing (Regla 1).
  </what-built>
  <how-to-verify>
    Open a browser authenticated as a user with a workspace. Perform these checks sequentially; if ANY fails, report the failure and do NOT proceed.

    **1. Automation builder regression check (Regla 6)**
       - Visit `https://<deployed-url>/automatizaciones/builder`
       - Confirm: the page loads, chat streams, creating a new automation still works
       - Expected: NO change in behavior from before this standalone
       - If broken: STOP and report. Plan 02/03 changes to `session-store.ts` must be reverted or fixed.

    **2. Template builder loads**
       - Visit `https://<deployed-url>/configuracion/whatsapp/templates/builder`
       - Expected: two-pane layout (left chat, right preview with editable fields + empty WhatsApp bubble)

    **3. Chat streams**
       - In the left pane, type: "Quiero un template para confirmar pedidos que diga hola [nombre], tu pedido [numero] llega manana"
       - Send. Expected: AI responds in Spanish, streaming text in real-time, and calls tools (you'll see "Analizando categoria...", "Detectando idioma...", etc.)

    **4. Right pane updates in real-time**
       - After the AI's response, the right pane should have: `category: UTILITY`, `language: es` (or `es_CO` if the AI inferred), and a body text with `{{1}}`/`{{2}}` placeholders
       - The WhatsApp bubble at the bottom renders the body with `{{1}}`/`{{2}}` visible (or substituted by example values if the AI captured them)

    **5. Edit preview directly**
       - Change `name` field on the right to `confirmacion_pedido_test`
       - Change body manually to add a footer
       - Bubble should update live

    **6. Upload an image**
       - Change `Header` dropdown to `Imagen`
       - Upload a small JPG (< 5 MB)
       - Expected: image shows in bubble within ~1 second, storage path saved behind the scenes
       - Try uploading a 10 MB file — expect clear error toast "Archivo muy grande: 10.0 MB. Maximo 5 MB."
       - Try uploading a `.gif` — expect "Solo se aceptan imagenes JPG o PNG"

    **7. Submit flow (smoke — do NOT commit a real template if you're on prod unless you want one submitted to Meta)**
       - If you're on staging/dev, type "Confirmo. Envia el template." in chat
       - Expected: AI calls `validateTemplateDraft` (you see loading state), then `submitTemplate`, then a green "Template enviado a Meta" banner appears
       - Expected side effect: a new row in `whatsapp_templates` with `status='PENDING'` and `submitted_at` populated
       - If on prod: skip actual submit; instead confirm the AI states it's about to submit and shows the validation tool passing

    **8. Session switcher**
       - Click "Nuevo" in the header. Expected: chat clears, draft resets to initial values.
       - If there's a history sidebar (from the analog), click a past session. Expected: messages rehydrate; only sessions with `kind='template'` appear.

    Reply with:
    - "approved" if all checks pass
    - A specific failure description if any check fails (e.g., "Step 4 failed: preview did not update after AI response")
  </how-to-verify>
  <resume-signal>Type "approved" or describe the failure. Do not proceed to Plan 05 until approval.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → /api/config-builder/templates/chat | Streaming SSE from cookie-authenticated session |
| browser → /api/config-builder/templates/upload | Authenticated multipart POST |
| AI tool output → draft context | Trusted intra-app dispatch; model decides shape but zod validates inputs on server |
| preview-pane fields → draft context | User types directly; no XSS risk (React escapes by default) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-01 | Tampering | ImageUploader client validation | mitigate | Server-side re-validation in upload route (Plan 03); client is defense-in-depth only |
| T-04-02 | Information Disclosure | localUrl via URL.createObjectURL | mitigate | `URL.revokeObjectURL` called on image removal; no cross-origin leak |
| T-04-03 | XSS | WhatsAppBubble body render | mitigate | React escapes by default; `whitespace-pre-wrap` is style-only, not innerHTML; no `dangerouslySetInnerHTML` anywhere |
| T-04-04 | Spoofing | session reuse across builders | mitigate | `existing.kind !== 'template'` guard in chat route (Plan 03); client also filters session history list by kind |
| T-04-05 | Denial of Service | streaming stuck | accept | status='streaming' disables send button; network retry is browser-native; stepCountIs(6) caps server loop |
| T-04-06 | Elevation of Privilege | crossing into automation builder | mitigate | Routes are physically separate paths; components don't share state or types across the two builders |
</threat_model>

<verification>
End-of-plan checks (covered by Task 4.4 checkpoint, but also automated-verifiable):

1. `npx tsc --noEmit -p .` — zero new errors
2. `npm run build` completes without error (if project has the script)
3. Deployment to Vercel succeeds (Regla 1: push before asking user to test)
4. Visiting the new route returns 200 (auth permitting) — smoke test from Task 4.4
5. Automation builder path untouched — confirmed by visual regression in Task 4.4 step 1
</verification>

<success_criteria>
- 8 new client files + 1 server entry compile and deploy
- Route `/configuracion/whatsapp/templates/builder` renders and is interactive
- Chat + preview sync via context in real-time
- Image upload flow works end-to-end (local preview + Storage save)
- Automation builder is NOT regressed (Regla 6)
- Checkpoint 4.4 signed off by user
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-template-ai-builder/04-SUMMARY.md` documenting:
- Vercel deployment URL
- User's "approved" signal + any observed rough edges
- Any deviations in component structure vs the plan (e.g., if `sonner` wasn't available and you used `react-hot-toast` or a console fallback)
- Merge semantics used for `variableMapping` partial updates (did you use APPLY_AI_PATCH-with-merge or UPDATE_FIELD-with-merged-object?)
- Git commit SHAs
</output>
