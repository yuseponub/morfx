# WhatsApp Template AI Builder — Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 17 new/modified
**Analogs found:** 16 exact matches / 17 total (1 shared-pattern-only, no direct analog: `whatsapp-bubble.tsx`)

> All file paths below are absolute under `/mnt/c/Users/Usuario/Proyectos/morfx-new`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/(dashboard)/configuracion/whatsapp/templates/builder/page.tsx` | UI-server (Next RSC entry) | request-response | `src/app/(dashboard)/automatizaciones/builder/page.tsx` | exact (1:1 clone, 1 line of JSX) |
| `.../builder/components/template-builder-layout.tsx` | UI-client (layout shell) | event-driven | `src/app/(dashboard)/automatizaciones/builder/components/builder-layout.tsx` | exact |
| `.../builder/components/chat-pane.tsx` | UI-client (chat transport) | streaming (SSE) | `src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx` | exact |
| `.../builder/components/chat-message.tsx` | UI-client (message render) | event-driven | `src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx` | exact (tool labels differ) |
| `.../builder/components/preview-pane.tsx` | UI-client (editable form + bubble) | event-driven (context) | `src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx` | role-match (form fields), new pattern (live preview) |
| `.../builder/components/whatsapp-bubble.tsx` | UI-client (pure render) | stateless render | — (no analog) | **no analog — use Tailwind primitives per RESEARCH.md "Don't Hand-Roll"** |
| `.../builder/components/template-draft-context.tsx` | UI-client (React context + reducer) | event-driven | — (no direct analog) | **pattern-level: standard React Context + useReducer, no project analog needed** |
| `.../builder/components/image-uploader.tsx` | UI-client (file input + fetch) | file-I/O | `src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx` (only partial, no current image upload); fall back to Storage upload pattern in `src/app/actions/quick-replies.ts:360-376` | role-match |
| `src/lib/config-builder/templates/tools.ts` | service (AI SDK tool factory) | request-response | `src/lib/builder/tools.ts` (especially lines 179-220 for `listPipelines`) | exact |
| `src/lib/config-builder/templates/system-prompt.ts` | service (prompt builder) | stateless | `src/lib/builder/system-prompt.ts:114-347` (`buildSystemPrompt`) | exact |
| `src/lib/config-builder/templates/validation.ts` | utility | stateless | `src/lib/builder/validation.ts` (referenced from `tools.ts:12-15`) + `src/app/actions/templates.ts:149-167` (existing name-cleanup logic) | role-match |
| `src/lib/config-builder/templates/types.ts` | types | — | `src/lib/builder/types.ts` (`BuilderToolContext`, `BuilderSession`) | exact |
| `src/lib/domain/whatsapp-templates.ts` | domain (single source of truth) | CRUD | `src/lib/domain/tags.ts:61-130` (`assignTag`) | exact |
| `src/app/api/config-builder/templates/chat/route.ts` | API (Next route, streaming) | streaming | `src/app/api/builder/chat/route.ts:42-163` | exact (verbatim clone with 3 swaps) |
| `src/app/api/config-builder/templates/upload/route.ts` | API (multipart upload) | file-I/O | `src/app/actions/quick-replies.ts:340-385` (buffer → Storage upload) | role-match (action → route conversion) |
| `src/app/api/config-builder/sessions/route.ts` OR reuse `/api/builder/sessions` | API | CRUD | `src/app/api/builder/sessions/route.ts` | exact (recommend REUSE + add `kind` column per Open Q1) |
| `src/lib/whatsapp/templates-api.ts` (EXTEND) | API-helper (external transport) | file-I/O (binary out) | Same file: existing `createTemplate360()` at `:47-75` | exact (same helper style, new endpoint) |
| `src/app/actions/templates.ts` (REFACTOR) | service (server action) | CRUD | `src/app/actions/templates.ts:129-210` (current `createTemplate`, target for refactor) + `src/lib/domain/tags.ts` (delegation pattern) | exact |
| `src/app/(dashboard)/configuracion/whatsapp/page.tsx` (MODIFY) | UI-server (hub) | request-response | Current file (add CTA card to `settings` array) | self-analog |
| `src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx` (MODIFY) | UI-server (list) | request-response | Current file (add button next to existing "Nuevo Template" Link at `:42-47`) | self-analog |
| `.claude/rules/agent-scope.md` (MODIFY) | config (governance doc) | — | Existing "CRM Reader Bot" / "CRM Writer Bot" sections (append new scope after them) | exact |
| `supabase/migrations/20260421XXXXXX_builder_sessions_kind.sql` (NEW) | migration | DDL | `supabase/migrations/20260214000000_builder_sessions.sql` | role-match (ALTER TABLE pattern instead of CREATE TABLE) |

> **Note on `/configuracion/page.tsx`:** CONTEXT.md D-02 refers to a "hub page" at `/configuracion`. The actual project does NOT have that route — `/configuracion/whatsapp/page.tsx` is the closest hub. The planner should decide whether to (a) add a new `/configuracion/page.tsx` above the existing `whatsapp/page.tsx`, or (b) add the CTA card into `whatsapp/page.tsx` directly. **Flag for planner.**

---

## Pattern Assignments

### `src/app/(dashboard)/configuracion/whatsapp/templates/builder/page.tsx` (UI-server entry)

**Analog:** `src/app/(dashboard)/automatizaciones/builder/page.tsx` (full file, 11 lines)

**Full-file pattern (lines 1-11):**
```tsx
// ============================================================================
// Phase 19: AI Automation Builder - Builder Page
// Server component entry point for /automatizaciones/builder
// ============================================================================

import { BuilderLayout } from './components/builder-layout'

export default function BuilderPage() {
  return <BuilderLayout />
}
```

**Key differences for new file:**
- Import `TemplateBuilderLayout` from `'./components/template-builder-layout'` instead of `BuilderLayout`.
- Rename function to `TemplateBuilderPage`.
- Header comment points to this standalone's name, not Phase 19.

---

### `.../components/template-builder-layout.tsx` (UI-client shell)

**Analog:** `src/app/(dashboard)/automatizaciones/builder/components/builder-layout.tsx` (lines 1-156)

**Session-switching pattern (lines 48-81) — copy verbatim:**
```tsx
const handleNewSession = useCallback(() => {
  setSessionId(null)
  setSessionTitle(null)
  setInitialMessages([])
  setChatKey('new-' + Date.now())
  setShowHistory(false)
}, [])

const handleSessionCreated = useCallback((id: string) => {
  setSessionId(id)
}, [])

const handleSelectSession = useCallback(async (selectedSessionId: string) => {
  const res = await fetch(`/api/builder/sessions?sessionId=${selectedSessionId}`)
  if (!res.ok) return
  const session = await res.json()
  if (session) {
    setSessionId(session.id)
    setSessionTitle(session.title)
    setInitialMessages((session.messages as UIMessage[]) || [])
    setChatKey(session.id + '-' + Date.now())
  }
  setShowHistory(false)
}, [])
```

**Chat-area mount pattern (lines 144-152):**
```tsx
<div className="flex-1 min-h-0">
  <BuilderChat
    key={chatKey}
    sessionId={sessionId}
    onSessionCreated={handleSessionCreated}
    initialMessages={initialMessages}
  />
</div>
```

**Key differences for new file:**
- Two-column shell instead of single chat column. **Wrap the existing pattern** so the `BuilderChat` equivalent (`ChatPane`) lives in a left column (~40-50% width) and a new `PreviewPane` occupies the right.
- `<TemplateDraftProvider>` must wrap BOTH panes so tool calls and form edits share state (see `template-draft-context.tsx`).
- Back link goes to `/configuracion/whatsapp/templates` instead of `/automatizaciones`.
- Session fetch URL: `/api/builder/sessions?...&kind=template` (if we reuse and filter by `kind`) OR `/api/config-builder/sessions?...`.

---

### `.../components/chat-pane.tsx` (UI-client streaming chat)

**Analog:** `src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx` (lines 1-157)

**Transport wiring (lines 35-55) — clone verbatim, change URL:**
```tsx
const [transport] = useState(
  () =>
    new DefaultChatTransport({
      api: '/api/builder/chat',
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

const { messages, sendMessage, status, error, setMessages } =
  useChat({ transport, messages: initialMessages })
```

**Confirm-preview callback pattern (lines 89-99):**
```tsx
const handleConfirmPreview = useCallback(
  (_previewData: AutomationPreviewData) => {
    sendMessage({ text: 'Confirmo. Crea la automatizacion.' })
  },
  [sendMessage]
)
```

**Key differences for new file:**
- Change `api: '/api/builder/chat'` → `'/api/config-builder/templates/chat'`.
- Remove `AutomationPreviewData` import; replace with `TemplateDraft` from `template-draft-context.tsx`.
- `handleConfirmPreview` sends `"Confirmo. Envia el template a Meta."` (or similar phrase the system prompt recognises as submit trigger).
- Empty-state copy: "Describe el template que quieres crear. Por ejemplo: 'Quiero un mensaje para confirmar pedidos que diga...'"
- Component reads/writes `TemplateDraft` from context instead of passing preview data via message props.

---

### `.../components/chat-message.tsx` (UI-client message render)

**Analog:** `src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx` (lines 180-240)

**Legacy-fallback + parts-rendering pattern (lines 186-206) — copy verbatim (Pitfall 9):**
```tsx
{(!message.parts || !Array.isArray(message.parts)) ? (
  // Fallback for corrupted/legacy messages without .parts
  <div className="text-sm whitespace-pre-wrap break-words">
    {typeof (message as unknown as { content: string }).content === 'string'
      ? (message as unknown as { content: string }).content
      : ''}
  </div>
) : message.parts.map((part, i) => {
  switch (part.type) {
    case 'text':
      return (
        <div key={i} className={cn('text-sm whitespace-pre-wrap break-words', !isUser && 'prose prose-sm dark:prose-invert max-w-none')}>
          {part.text}
        </div>
      )
    case 'dynamic-tool': {
      const { toolName, state } = part
      if (state === 'input-streaming' || state === 'input-available') {
        return <ToolLoading key={i} toolName={toolName} />
      }
      if (state === 'output-available') {
        // ... tool-specific result rendering ...
      }
    }
  }
})}
```

**Key differences for new file:**
- Tool labels (in `ToolLoading` / `ToolResult`): `generateTemplatePreview`, `suggestCategory`, `suggestLanguage`, `captureVariableMapping`, `validateTemplateDraft`, `uploadHeaderImage`, `submitTemplate`, `listExistingTemplates`.
- Remove the React-Flow `generatePreview` branch; replace with a draft-patch dispatch that updates `TemplateDraftContext` (the preview pane re-renders automatically — no inline diagram).
- `submitTemplate` success branch: show a "Template enviado a Meta" badge + link to `/configuracion/whatsapp/templates/{id}`.

---

### `.../components/preview-pane.tsx` (UI-client editable form + bubble)

**Analog (form fields):** `src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx` (lines 50-80 — state vars + category info)

**State shape pattern (lines 52-63):**
```tsx
const [name, setName] = useState('')
const [category, setCategory] = useState<TemplateCategory>('UTILITY')
const [language, setLanguage] = useState('es')
const [headerText, setHeaderText] = useState('')
const [bodyText, setBodyText] = useState('')
const [footerText, setFooterText] = useState('')
const [variableMapping, setVariableMapping] = useState<Record<string, string>>({})
const [bodyExamples, setBodyExamples] = useState<Record<string, string>>({})
const [headerExamples, setHeaderExamples] = useState<Record<string, string>>({})
```

**Key differences for new file:**
- Replace `useState` with `useTemplateDraft()` context hook (see `template-draft-context.tsx`) so edits propagate to the AI.
- Add `headerFormat: 'NONE' | 'TEXT' | 'IMAGE'` to the draft shape.
- Add `headerImageStoragePath: string | null` and `headerImageLocalUrl: string | null` for IMAGE headers.
- Render `<WhatsAppBubble />` below the form, showing current draft with `{{N}}` substituted by example values.
- Each field change dispatches `{ type: 'UPDATE_FIELD', field, value }` into the reducer.
- Re-use `categoryInfo` dict verbatim from `template-form.tsx:29-48`.

---

### `.../components/whatsapp-bubble.tsx` (UI-client pure render)

**Analog:** None — per RESEARCH.md "Don't Hand-Roll" table: _"WhatsApp bubble preview styling → Plain Tailwind — it's just rounded corners, a green-ish background, and text wrapping"_.

**Recommended structure (invent):**
```tsx
interface WhatsAppBubbleProps {
  header?: { format: 'TEXT' | 'IMAGE'; text?: string; imageUrl?: string }
  body: string  // already interpolated with examples
  footer?: string
}

export function WhatsAppBubble({ header, body, footer }: WhatsAppBubbleProps) {
  return (
    <div className="max-w-sm rounded-lg bg-[#d9fdd3] px-3 py-2 shadow-sm">
      {header?.format === 'IMAGE' && header.imageUrl && (
        <img src={header.imageUrl} alt="" className="mb-2 rounded aspect-video object-cover" />
      )}
      {header?.format === 'TEXT' && header.text && (
        <div className="font-semibold text-sm mb-1 whitespace-pre-wrap">{header.text}</div>
      )}
      <div className="text-sm whitespace-pre-wrap break-words">{body}</div>
      {footer && <div className="text-xs text-muted-foreground mt-1">{footer}</div>}
    </div>
  )
}
```

**Key differences:** No analog to copy — invent per research guidance. Use `resolveVariables()` from `src/lib/automations/variable-resolver.ts:50` on the caller side to substitute `{{N}}` with example values before passing `body` into this component.

---

### `.../components/template-draft-context.tsx` (shared state)

**Analog:** No direct analog in project. Standard React Context + `useReducer` pattern.

**Recommended shape (invent):**
```tsx
type TemplateDraft = {
  name: string
  language: 'es' | 'es_CO' | 'en_US'
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  headerFormat: 'NONE' | 'TEXT' | 'IMAGE'
  headerText: string
  headerImageStoragePath: string | null
  headerImageLocalUrl: string | null
  bodyText: string
  footerText: string
  variableMapping: Record<string, string>  // {"1": "contacto.nombre"}
  bodyExamples: Record<string, string>
  headerExamples: Record<string, string>
}

type Action =
  | { type: 'UPDATE_FIELD'; field: keyof TemplateDraft; value: unknown }
  | { type: 'APPLY_AI_PATCH'; patch: Partial<TemplateDraft> }
  | { type: 'RESET' }
```

**Key rule (from research Q2):** React Context + reducer — **not** Zustand, **not** AI SDK data-stream-parts. Zero new deps.

---

### `.../components/image-uploader.tsx` (UI-client file input)

**Analog (server side storage flow):** `src/app/actions/quick-replies.ts:340-385` (wrapped in a server action today)

**Storage-upload pattern (lines 360-385) — copy the server logic into `/api/config-builder/templates/upload/route.ts` (see below). Client component only needs:**
```tsx
async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return

  // Client-side validation (Pitfall 8: 5 MB cap)
  if (file.size > 5 * 1024 * 1024) {
    toast.error(`Archivo muy grande: ${(file.size / 1024 / 1024).toFixed(1)} MB. Máximo 5 MB.`)
    return
  }
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    toast.error('Solo JPG o PNG')
    return
  }

  // Instant preview via object URL (no network)
  const localUrl = URL.createObjectURL(file)
  dispatch({ type: 'UPDATE_FIELD', field: 'headerImageLocalUrl', value: localUrl })

  // Upload to Supabase Storage
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/config-builder/templates/upload', { method: 'POST', body: formData })
  const { storagePath } = await res.json()
  dispatch({ type: 'UPDATE_FIELD', field: 'headerImageStoragePath', value: storagePath })
}
```

**Key differences:** No project analog for client-side file uploader that feeds a storage-path into an AI tool. The pattern combines the `<input type="file">` primitive with the Storage-upload API described below.

---

### `src/lib/config-builder/templates/tools.ts` (AI SDK tool factory)

**Analog:** `src/lib/builder/tools.ts` (lines 179-220 — `createBuilderTools` + `listPipelines` tool as structural template)

**Factory signature + first tool (lines 179-220):**
```typescript
export function createBuilderTools(ctx: BuilderToolContext) {
  return {
    listPipelines: tool({
      description:
        'Lista todos los pipelines del workspace con sus etapas. Usar cuando el usuario mencione pipelines, etapas, o stages.',
      inputSchema: z.object({}),
      execute: async (): Promise<{ pipelines: PipelineWithStages[] } | { error: string }> => {
        try {
          const supabase = createAdminClient()
          const { data: pipelines, error: pError } = await supabase
            .from('pipelines')
            .select('id, name')
            .eq('workspace_id', ctx.workspaceId)
            .order('created_at')
          if (pError) return { error: `Error consultando pipelines: ${pError.message}` }
          return { pipelines: (pipelines || []) as PipelineWithStages[] }
        } catch (err) {
          return { error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}` }
        }
      },
    }),
    // ... more tools ...
  }
}
```

**Key differences for new file:**
- Export `createTemplateBuilderTools(ctx: TemplateBuilderToolContext)` — context has only `{ workspaceId, userId }`, no pipeline/stage data.
- Tool set (per RESEARCH.md A.B): `listExistingTemplates`, `suggestCategory`, `suggestLanguage`, `captureVariableMapping`, `validateTemplateDraft`, `submitTemplate` (see RESEARCH.md Example 3 at lines 730-842 for concrete `submitTemplate` zod schema).
- **MANDATORY (Regla 3):** `submitTemplate.execute` MUST call `createTemplate(ctx, params)` from `src/lib/domain/whatsapp-templates.ts`. It MUST NOT call `createTemplate360()` or `supabase.from('whatsapp_templates').insert()` directly.
- All tools return discriminated unions `{ success: ... } | { error: string }` — never throw.
- `submitTemplate` only runs AFTER explicit user confirmation (mirror automation builder's confirm-before-mutate flow).

---

### `src/lib/config-builder/templates/system-prompt.ts` (prompt builder)

**Analog:** `src/lib/builder/system-prompt.ts` (lines 100-180 for structure; lines 114-160 for `buildSystemPrompt()` shape)

**Builder-function signature + opening (lines 114-130):**
```typescript
export function buildSystemPrompt(_workspaceId: string): string {
  const triggerSection = formatTriggerCatalog()
  const actionSection = formatActionCatalog()
  const variableSection = formatVariableCatalog()

  return `# Asistente de Automatizaciones CRM

## Rol
Eres un asistente experto en automatizaciones de CRM. Tu trabajo es ayudar al usuario a crear, modificar, y entender automatizaciones. Respondes en espanol siempre.

## Reglas de Comportamiento
...`
}
```

**Prohibitions pattern (lines 156-161) — copy structure:**
```typescript
### Prohibiciones
- **NUNCA** crees recursos (tags, etapas, pipelines, etc.) automaticamente. Si un recurso no existe, ADVIERTE al usuario y pidele que lo cree primero desde el CRM.
- **NUNCA** actives o desactives automatizaciones...
```

**Key differences for new file:**
- Export `buildTemplatesSystemPrompt(workspaceId: string): string`.
- Role: "Eres un asistente experto en templates de WhatsApp Business. Ayudas al usuario a crear plantillas que Meta aprobara."
- Inject `VARIABLE_CATALOG` from `src/lib/automations/constants.ts:354+` as a cheat sheet of valid `variable_mapping` paths (`contacto.*`, `orden.*`, etc. — see RESEARCH.md F).
- Inject Meta limits (HEADER 60, BODY 1024, FOOTER 60), language list (`es` / `es_CO` / `en_US`), category explanations (MARKETING / UTILITY / AUTHENTICATION).
- Inject red-flag patterns from RESEARCH.md C: short URLs, all-caps sales copy, payment/PII requests, non-sequential variables.
- **Prohibitions (Regla de scope-de-agentes D-15):** "NUNCA crees tags, pipelines, etapas, templates fuera del flujo guiado, contactos, pedidos, tareas, usuarios. Solo puedes crear TEMPLATES via la tool `submitTemplate` despues de que el usuario confirme el preview. NUNCA envies mensajes de WhatsApp."
- Copy the shipping-address rule verbatim from `builder/system-prompt.ts:335` (contacto.* = profile address; orden.direccion_envio = shipping — do not mix).
- Flag Meta's April 2025 auto-reclassification (Pitfall 3) explicitly.

---

### `src/lib/config-builder/templates/validation.ts` (draft validator)

**Analog (structural):** `src/lib/builder/validation.ts` (import site `src/lib/builder/tools.ts:12-15`)
**Analog (name cleanup):** `src/app/actions/templates.ts:149-167`

**Name cleanup pattern (lines 149-162):**
```typescript
if (!params.name.trim()) {
  return { error: 'El nombre es requerido', field: 'name' }
}
const cleanName = params.name
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9_]/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_|_$/g, '')

if (cleanName.length < 1) {
  return { error: 'El nombre debe contener letras o numeros', field: 'name' }
}
```

**Key differences / additions for new file:**
- Export `validateDraft(draft: TemplateDraft): { ok: true } | { ok: false; errors: string[] }`.
- Checks: (1) name regex `/^[a-z0-9_]+$/`, max 512 chars; (2) body 1-1024 chars; (3) header TEXT 1-60; (4) footer 1-60; (5) variables sequential starting at `{{1}}` (Pitfall 4); (6) header has max 1 variable; (7) `example.body_text` count matches variable count; (8) language in `['es', 'es_CO', 'en_US']`; (9) category in 3-enum.
- Also used by the refactored `createTemplate` server action (shared validation between AI path and manual-form path).

---

### `src/lib/config-builder/templates/types.ts`

**Analog:** `src/lib/builder/types.ts` (`BuilderToolContext`, `BuilderSession`)

**Minimum exports:**
```typescript
export interface TemplateBuilderToolContext {
  workspaceId: string
  userId: string
}

export interface TemplateDraft { /* see template-draft-context.tsx above */ }

export type TemplateBuilderKind = 'template'  // future-proofing for other config builders
```

---

### `src/lib/domain/whatsapp-templates.ts` (NEW domain — THE mutation pipeline)

**Analog:** `src/lib/domain/tags.ts` (lines 1-130 — full `assignTag` orchestration)

**Domain-function signature + orchestration pattern (lines 14-95):**
```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'

export async function assignTag(
  ctx: DomainContext,
  params: AssignTagParams
): Promise<DomainResult<AssignTagResult>> {
  const supabase = createAdminClient()

  try {
    // Step 1: Find tag by name in workspace
    const { data: tag, error: tagError } = await supabase
      .from('tags')
      .select('id, color')
      .eq('workspace_id', ctx.workspaceId)   // ALWAYS filter by workspace_id
      .eq('name', params.tagName)
      .single()

    if (tagError || !tag) {
      return { success: false, error: `Etiqueta "${params.tagName}" no encontrada` }
    }

    // Step 3: Insert (handle 23505 = duplicate as success)
    const { error: linkError } = await supabase.from(junctionTable).insert({ ... })
    if (linkError && linkError.code !== '23505') {
      return { success: false, error: `Error al asignar etiqueta: ${linkError.message}` }
    }

    // ... more steps ...
    return { success: true, data: { tagId: tag.id } }
  } catch (err) {
    return { success: false, error: ... }
  }
}
```

**Context type (from `src/lib/domain/types.ts:15-21`):**
```typescript
export interface DomainContext {
  workspaceId: string
  source: string  // 'server-action' | 'tool-handler' | 'automation' | 'webhook' | 'adapter'
  cascadeDepth?: number
}
```

**Key differences for new file:**
- Export `createTemplate(ctx: DomainContext, params: CreateTemplateParams): Promise<DomainResult<Template>>` — see RESEARCH.md Example 2 (lines 601-711) for concrete signature.
- Orchestration steps: (1) name uniqueness check by `workspace_id + name`; (2) if `headerImage`, `supabase.storage.from('whatsapp-media').download(storagePath)` → `uploadHeaderImage360()` → patch `components[HEADER].example.header_handle = [handle]`; (3) INSERT row with `status='PENDING'`; (4) call `createTemplate360()`; (5) on success, UPDATE `submitted_at`; (6) on 360 error, UPDATE `status='REJECTED'` + `rejected_reason`.
- **`source` convention:** `'tool-handler'` when called from AI tool, `'server-action'` when called from refactored `createTemplate` action.
- `createAdminClient()` only — never `createClient()` in domain (matches tags.ts line 65).
- No automation-trigger emission (unlike tags.ts) — templates don't fire triggers.

---

### `src/app/api/config-builder/templates/chat/route.ts` (NEW API — streaming)

**Analog:** `src/app/api/builder/chat/route.ts` (lines 1-163, full file)

**Full auth + workspace check (lines 42-76):**
```typescript
export async function POST(request: Request) {
  try {
    // 1. Auth
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response('Unauthorized', { status: 401 })

    // 2. Workspace
    const cookieStore = await cookies()
    const workspaceId = cookieStore.get('morfx_workspace')?.value
    if (!workspaceId) return new Response('No workspace selected', { status: 400 })

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single()
    if (!membership) return new Response('Forbidden', { status: 403 })
```

**streamText + session persist (lines 125-155):**
```typescript
const ctx = { workspaceId, userId: user.id }
const tools = createBuilderTools(ctx)
const systemPrompt = buildSystemPrompt(workspaceId)

const result = streamText({
  model: anthropic('claude-sonnet-4-20250514'),
  system: systemPrompt,
  messages: modelMessages,
  tools,
  stopWhen: stepCountIs(5),
  onFinish: async () => {
    await updateSession(sessionId!, workspaceId, { messages: messages as unknown[] })
  },
})

const response = result.toUIMessageStreamResponse()
response.headers.set('X-Session-Id', sessionId!)
return response
```

**Key differences for new file (exactly 3 swaps per research):**
1. `buildSystemPrompt` → `buildTemplatesSystemPrompt`.
2. `createBuilderTools` → `createTemplateBuilderTools`.
3. `stepCountIs(5)` → `stepCountIs(6)` (list → draft → preview → validate → upload → submit).
4. If reusing `builder_sessions` with `kind` column (recommended), pass `kind: 'template'` into `createSession` and filter in `getSession`. Otherwise import from a new `config-builder/session-store.ts` mirror.

---

### `src/app/api/config-builder/templates/upload/route.ts` (NEW API — multipart)

**Analog:** `src/app/actions/quick-replies.ts:340-385` (server-action, convert to route handler)

**Storage-upload core (lines 360-385):**
```typescript
const timestamp = Date.now()
const safeFileName = fileName.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]/g, '_')
const filePath = `quick-replies/${workspaceId}/${timestamp}_${safeFileName}`

const { error: uploadError } = await supabase.storage
  .from('whatsapp-media')
  .upload(filePath, buffer, { contentType: mimeType, upsert: false })

if (uploadError) {
  return { error: `Error al subir: ${uploadError.message}` }
}

const { data: { publicUrl } } = supabase.storage
  .from('whatsapp-media')
  .getPublicUrl(filePath)

return { success: true, data: { url: publicUrl, type: mediaType } }
```

**Key differences for new file:**
- Route handler (not server action) — accepts `multipart/form-data` via `request.formData()` (see RESEARCH.md Example 5, lines 951-993).
- Storage path: `templates/${workspaceId}/${timestamp}_${safeName}` (different sub-folder from quick-replies).
- Enforce server-side: size ≤ 5 MB (Pitfall 8), mime ∈ `{image/jpeg, image/png}` (Pitfall 10 requires download step later).
- Return `{ storagePath, publicUrl, mimeType }` — publicUrl for preview only, storagePath is what gets persisted into the tool's `submitTemplate` params.
- Bucket remains `whatsapp-media` (already public, already provisioned by migration `20260131000000_storage_bucket.sql`).

---

### `src/app/api/config-builder/sessions/route.ts` (NEW) OR reuse `/api/builder/sessions`

**Analog:** `src/app/api/builder/sessions/route.ts` (full file, lines 1-113)

**Auth helper + GET handler (lines 21-72):**
```typescript
async function getAuthCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return null
  return { userId: user.id, workspaceId }
}

export async function GET(request: Request) {
  const ctx = await getAuthCtx()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')

  if (sessionId) {
    const session = await getSession(sessionId, ctx.workspaceId)
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    return NextResponse.json(session)
  }

  const sessions = await getSessions(ctx.workspaceId, ctx.userId, 20)
  return NextResponse.json(sessions)
}
```

**Recommended approach (per Open Q1):** **REUSE `/api/builder/sessions`** and add `?kind=template` filter support. The `session-store.ts` CRUD functions pass `kind` through to the DB filter. No new route file — just extend `getSessions(...)` and `createSession(...)` signatures.

**Alternative:** If chosen, the new file is a verbatim copy of `builder/sessions/route.ts` with imports pointing to a new `config-builder/session-store.ts` that re-uses `builder_sessions` with `WHERE kind = 'template'` pre-filter.

---

### `src/lib/whatsapp/templates-api.ts` (EXTEND — add `uploadHeaderImage360`)

**Analog (same-file style reference):** `src/lib/whatsapp/templates-api.ts:47-75` (existing `createTemplate360`)

**Existing helper pattern (lines 47-75):**
```typescript
export async function createTemplate360(
  apiKey: string,
  params: CreateTemplateParams
): Promise<CreateTemplateResponse> {
  const response = await fetch(`${BASE_URL}/v1/configs/templates`, {
    method: 'POST',
    headers: {
      'D360-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: params.name,
      language: params.language,
      category: params.category,
      components: params.components,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      error.error?.message ||
        error.meta?.developer_message ||
        `Template creation failed: ${response.status}`
    )
  }

  return response.json()
}
```

**Key differences for new helper (per RESEARCH.md Example 1, lines 511-567):**
- Export `uploadHeaderImage360(apiKey, bytes, mimeType, fileName): Promise<{ handle: string }>`.
- 2-step resumable flow (NOT a single fetch like `createTemplate360`):
  - Step 1: `POST ${BASE_URL}/uploads?file_length=X&file_type=image/jpeg` → parse `{id: 'upload:...'}`.
  - Step 2: `POST ${BASE_URL}/${sessionId}` (prefix `upload:` intact) with `D360-API-KEY`, `file_offset: '0'`, `Content-Type: ${mimeType}`, raw binary body → parse `{h: '4::aW...'}`.
- **Same auth header style** (`D360-API-KEY`) — do NOT use `Authorization: OAuth ...` (Pitfall 2).
- **Same error pattern:** `throw new Error(err.error?.message || 'fallback')` — matches existing helper so domain `catch` block works the same way.
- Keep `BASE_URL` constant at top of file (`https://waba-v2.360dialog.io`) — already exists at line 17.

---

### `src/app/actions/templates.ts` (REFACTOR — delegate to domain)

**Analog:** Self-analog at `:129-210` (current `createTemplate` action) + delegation pattern from `src/lib/domain/tags.ts`.

**Current action (lines 129-210) — to be refactored:**
```typescript
export async function createTemplate(params: {
  name: string
  language?: string
  category: TemplateCategory
  components: TemplateComponent[]
  variable_mapping?: Record<string, string>
}): Promise<ActionResult<Template>> {
  // ... name clean-up (lines 149-167) — MOVE to validation.ts ...
  // ... INSERT whatsapp_templates (lines 172-184) — DELETE, domain does this ...
  // ... createTemplate360() (lines 202-218) — DELETE, domain does this ...
}
```

**Refactor shape (target):**
```typescript
export async function createTemplate(params: {
  name: string
  language?: string
  category: TemplateCategory
  components: TemplateComponent[]
  variable_mapping?: Record<string, string>
  headerImage?: { storagePath: string; mimeType: 'image/jpeg' | 'image/png' }  // NEW optional
}): Promise<ActionResult<Template>> {
  // 1. Auth + workspace (UNCHANGED, lines 136-147)
  // 2. Validate via validateDraft() (moved from inline logic)
  // 3. Fetch workspace API key (UNCHANGED, lines 195-200)
  // 4. Delegate to domain:
  const result = await createTemplate(
    { workspaceId, source: 'server-action' },
    { ...params, apiKey }
  )
  // 5. Translate DomainResult<Template> → ActionResult<Template>
  if (!result.success) return { error: result.error || 'Error desconocido' }
  revalidatePath('/configuracion/whatsapp/templates')
  return { success: true, data: result.data! }
}
```

**Key differences:**
- Action becomes a thin auth+delegate wrapper (matches Regla 3 "Server Action → valida auth → llama domain → revalidatePath").
- `headerImage` is optional — legacy TEXT-only calls from `template-form.tsx` keep working unchanged.
- The existing manual form (`template-form.tsx`) continues to work because it never sets `headerImage`, and the domain's IMAGE branch is a no-op when `params.headerImage` is undefined.
- Name-regex: `name` import collision — rename the domain export to avoid confusion, OR import with alias: `import { createTemplate as createTemplateDomain } from '@/lib/domain/whatsapp-templates'`.

---

### `src/app/(dashboard)/configuracion/whatsapp/page.tsx` (MODIFY — add CTA)

**Analog:** Self-analog (lines 5-30, existing `settings` array)

**Current pattern (lines 5-30):**
```tsx
const settings = [
  {
    title: 'Templates',
    description: 'Gestionar plantillas de mensajes para WhatsApp',
    href: '/configuracion/whatsapp/templates',
    icon: FileText,
  },
  // ... 3 more ...
]
```

**Modification:** Add a card (or a highlighted CTA above the grid) linking to `/configuracion/whatsapp/templates/builder`. Suggested copy: "Crea plantillas con IA — Describe lo que necesitas en lenguaje natural y la IA te guía." Icon: `Sparkles` from lucide-react.

**D-02 nuance:** CONTEXT.md says "botón/CTA en la parte superior de `/configuracion`". Since the project does NOT have `/configuracion/page.tsx`, the planner must decide: (a) create a new hub page, or (b) put the CTA in `/configuracion/whatsapp/page.tsx`. **Flag for planner.**

---

### `src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx` (MODIFY — add "Crear con IA" button)

**Analog:** Self-analog (lines 42-47, existing "Nuevo Template" Link)

**Current pattern (lines 35-49):**
```tsx
<div className="flex gap-2">
  <form action={handleSync}>
    <Button variant="outline" size="sm">
      <RefreshCw className="h-4 w-4 mr-2" />
      Sincronizar
    </Button>
  </form>
  <Link href="/configuracion/whatsapp/templates/nuevo">
    <Button>
      <Plus className="h-4 w-4 mr-2" />
      Nuevo Template
    </Button>
  </Link>
</div>
```

**Modification:** Add a second `<Link href="/configuracion/whatsapp/templates/builder">` button BEFORE the existing "Nuevo Template" link with label "Crear con IA" and `Sparkles` icon. Keep the existing manual link intact (D-02: coexist with manual form).

---

### `.claude/rules/agent-scope.md` (MODIFY — register new agent scope)

**Analog:** Existing "CRM Reader Bot" section (lines 27-41) and "CRM Writer Bot" section (lines 43-61) — both already define scopes with PUEDE / NO PUEDE / Validacion structure.

**CRM Reader Bot pattern (lines 27-41) — copy structure:**
```markdown
### CRM Reader Bot (`crm-reader` — API `/api/v1/crm-bots/reader`)
- **PUEDE (solo lectura):**
  - `contacts_search` / `contacts_get` — ...
  - ...
- **NO PUEDE:**
  - Mutar NADA ...
  - ...
- **Validacion:**
  - Tool handlers importan EXCLUSIVAMENTE desde `@/lib/domain/*` — cero `createAdminClient` en `src/lib/agents/crm-reader/tools/**`
  - Todas las queries pasan por domain layer que filtra por `workspace_id`
  - Agent ID registrado: `'crm-reader'`
```

**New scope entry (to append under "Scopes por Agente"):**
```markdown
### Config Builder: WhatsApp Templates (`config-builder-whatsapp-templates` — UI `/configuracion/whatsapp/templates/builder`)
- **PUEDE:**
  - Crear templates (solo via domain `createTemplate` en `src/lib/domain/whatsapp-templates.ts`)
  - Subir imagenes de header al bucket `whatsapp-media` path `templates/{ws}/...`
  - Consultar templates existentes (solo lectura, para detectar duplicados y cooldown de 30 dias)
  - Sugerir categoria / idioma / mapping de variables
- **NO PUEDE:**
  - Editar o eliminar templates ya creados
  - Crear/editar tags, pipelines, etapas, contactos, pedidos, tareas, usuarios
  - Enviar mensajes de WhatsApp directamente
  - Ejecutar `createTemplate360()` sin pasar por domain (Regla 3)
  - Acceder a otros workspaces (workspace_id viene del cookie `morfx_workspace` validado por route handler)
- **Validacion:**
  - Tool `submitTemplate.execute` llama EXCLUSIVAMENTE a `createTemplate` del domain; CERO `createAdminClient` + `insert` directo en `src/lib/config-builder/templates/tools.ts`
  - System prompt `buildTemplatesSystemPrompt` incluye lista de PUEDE/NO PUEDE textual y flag explicito contra crear recursos fuera del scope
  - Agent ID registrado: `'config-builder-whatsapp-templates'`
  - stopWhen: `stepCountIs(6)` — ciclo maximo list → draft → preview → validate → upload → submit
```

---

### `supabase/migrations/20260421XXXXXX_builder_sessions_kind.sql` (NEW migration — if reusing table)

**Analog:** `supabase/migrations/20260214000000_builder_sessions.sql` (full file — source of the table being altered)

**Current CREATE pattern (lines 11-20):**
```sql
CREATE TABLE builder_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  automations_created UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);
```

**Key differences for new migration (Open Q1 recommendation — Option A):**
```sql
-- Add kind column for multi-builder support (automation / template / ...)
ALTER TABLE builder_sessions
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'automation'
    CHECK (kind IN ('automation', 'template'));

CREATE INDEX idx_builder_sessions_workspace_kind
  ON builder_sessions(workspace_id, kind, updated_at DESC);
```

**CRITICAL (CLAUDE.md Regla 5):** This migration MUST be applied in production BEFORE any code that references `kind` is pushed. Planner must pause and request manual application.

---

## Shared Patterns

### Authentication (client-facing routes)
**Source:** `src/app/api/builder/chat/route.ts:42-76`
**Apply to:** `chat/route.ts`, `upload/route.ts`, any new session routes
**Three-step gate:**
1. `supabase.auth.getUser()` → 401 if null
2. `cookies().get('morfx_workspace')` → 400 if missing
3. `workspace_members.select().eq('workspace_id', ws).eq('user_id', user.id).single()` → 403 if not member
```typescript
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return new Response('Unauthorized', { status: 401 })

const cookieStore = await cookies()
const workspaceId = cookieStore.get('morfx_workspace')?.value
if (!workspaceId) return new Response('No workspace selected', { status: 400 })

const { data: membership } = await supabase
  .from('workspace_members')
  .select('id')
  .eq('workspace_id', workspaceId)
  .eq('user_id', user.id)
  .single()
if (!membership) return new Response('Forbidden', { status: 403 })
```

### Domain Mutation (Regla 3)
**Source:** `src/lib/domain/tags.ts:61-95` (orchestration shape) + `src/lib/domain/types.ts:15-34` (context + result types)
**Apply to:** `src/lib/domain/whatsapp-templates.ts` — every INSERT/UPDATE to `whatsapp_templates`
**Rules:**
- `createAdminClient()` only (never `createClient()`).
- Every query filters by `ctx.workspaceId`.
- Return `DomainResult<T>` — never throw for domain errors (only catch unexpected).
- Callers pass `DomainContext` with `source: 'server-action' | 'tool-handler' | ...`.

### Error Handling (AI SDK tools)
**Source:** `src/lib/builder/tools.ts:188-217` (listPipelines structure)
**Apply to:** every tool in `src/lib/config-builder/templates/tools.ts`
**Rule:** Return `{ success: ... } | { error: string }` — NEVER throw inside `execute`. AI SDK streams the error back to the model as a tool-result, the model explains it to the user.
```typescript
execute: async (params): Promise<Result | { error: string }> => {
  try {
    // ... work ...
    return { success: true, /* payload */ }
  } catch (err) {
    return { error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}` }
  }
}
```

### UIMessage Parts Rendering (AI SDK v6)
**Source:** `src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx:186-240`
**Apply to:** `chat-message.tsx`
**Rules:**
- `{(!message.parts || !Array.isArray(message.parts)) ? /* fallback to .content */ : /* map parts */}`.
- Switch on `part.type`: `'text'` → render text; `'dynamic-tool'` → switch on `state` (`input-streaming` / `input-available` → loading; `output-available` → tool-specific render; `output-error` → error).
- Always include the legacy-fallback branch (Pitfall 9 — sessions persisted before v6 adoption may have `content` string instead of `parts[]`).

### Storage Upload (binary to Supabase)
**Source:** `src/app/actions/quick-replies.ts:360-385`
**Apply to:** `/api/config-builder/templates/upload/route.ts`
```typescript
const buffer = Buffer.from(await file.arrayBuffer())
const { error: uploadError } = await supabase.storage
  .from('whatsapp-media')
  .upload(filePath, buffer, { contentType: file.type, upsert: false })

if (uploadError) {
  return Response.json({ error: `Error subiendo a storage: ${uploadError.message}` }, { status: 500 })
}

const { data: { publicUrl } } = supabase.storage
  .from('whatsapp-media')
  .getPublicUrl(filePath)
```

### 360 Dialog API Client Style
**Source:** `src/lib/whatsapp/templates-api.ts:47-75` (`createTemplate360`)
**Apply to:** `uploadHeaderImage360` in the same file
**Rules:**
- `BASE_URL = 'https://waba-v2.360dialog.io'` (already at line 17).
- Header `'D360-API-KEY': apiKey` (NEVER `Authorization: OAuth ...` — Pitfall 2).
- Parse error via `await response.json().catch(() => ({}))`, then `throw new Error(err.error?.message || fallback)`.
- Binary body: pass `bytes as BodyInit` with `Content-Type: ${mimeType}` explicit.

### Session Persistence (multi-builder)
**Source:** `src/lib/builder/session-store.ts:22-52` (createSession) + `:143-182` (updateSession)
**Apply to:** Reuse as-is if we extend `builder_sessions` with `kind` column (recommended).
**Open Q1 decision:** planner must choose (a) reuse + `kind`, or (b) new `config_builder_sessions` table + new `config-builder/session-store.ts`. **Recommendation: (a)** — one migration, preserves existing code, zero duplication.

---

## No Analog Found

| File | Role | Data Flow | Reason / Strategy |
|------|------|-----------|-------------------|
| `whatsapp-bubble.tsx` | UI-client pure render | stateless | No WhatsApp-bubble component exists in project. RESEARCH.md explicitly says "Plain Tailwind — it's just rounded corners, a green-ish background, and text wrapping." Invent per sketch above. |
| `template-draft-context.tsx` | state container | event-driven | No comparable cross-pane context in project. Standard React Context + useReducer; zero new deps per Open Q2. |
| `tools.ts`'s `uploadHeaderImage` tool | AI SDK tool wrapping Storage fetch | file-I/O | No existing tool performs binary upload. Model: combine `listPipelines` structure (tool shape) with Storage-upload server-action pattern inside the `execute`. |

---

## Metadata

**Analog search scope:**
- `/src/app/api/builder/**` (chat, sessions, tools API)
- `/src/app/(dashboard)/automatizaciones/builder/components/**` (UI patterns)
- `/src/app/(dashboard)/configuracion/whatsapp/**` (co-located module)
- `/src/lib/builder/**` (session store, system prompt, tools, validation, types)
- `/src/lib/domain/**` (mutation pattern — tags.ts as reference)
- `/src/lib/whatsapp/templates-api.ts` (360 Dialog client)
- `/src/app/actions/templates.ts`, `quick-replies.ts`, `messages.ts` (server actions, Storage upload, SEND path)
- `/src/lib/automations/constants.ts`, `variable-resolver.ts` (variable catalog + resolver)
- `/supabase/migrations/*` (schema + storage bucket)
- `/.claude/rules/agent-scope.md` (governance registration)

**Files scanned:** 20+
**Pattern extraction date:** 2026-04-20
**Confidence:** HIGH — every analog was read and verified to exist at the cited line ranges; only `whatsapp-bubble.tsx` has no project analog (by design, per research).
