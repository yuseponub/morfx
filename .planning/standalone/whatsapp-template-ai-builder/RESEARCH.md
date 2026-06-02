# WhatsApp Template AI Builder — Research

**Researched:** 2026-04-20
**Domain:** WhatsApp Business templates (360 Dialog Cloud API) + AI-assisted config builder
**Confidence:** HIGH for upload flow + Meta constraints + reuse pattern (all verified against official docs and existing code); MEDIUM for recommended architecture decisions (several reasonable alternatives)

## Summary

This standalone is the CREATE counterpart to the already-shipped SEND fix for image-header templates (commit `acffa6e`). The SEND path reads `components[].example.header_handle[0]` as a URL and passes it to 360 Dialog; the CREATE path must put a **permanent Meta file handle** (not a URL) into that same field at template submission time. That handle is obtained via 360 Dialog's **Resumable Upload API** (`POST /uploads` then `POST /{session_id}`), which is a distinct endpoint from the `/media` endpoint used for message sending. Both endpoints authenticate with `D360-API-KEY` (NOT `Authorization: OAuth ...` like Meta's direct API).

On the UX side, the existing Automation Builder (`src/app/(dashboard)/automatizaciones/builder/`) already provides the exact pattern we want: AI SDK v6 `useChat` + `DefaultChatTransport` wired to `POST /api/builder/chat`, with session persistence in `builder_sessions`, inline tool-result rendering (including a React-Flow preview), and a confirm-before-mutate flow. Cloning this pattern with template-specific tools (`generateTemplatePreview`, `uploadHeaderImage`, `submitTemplate`) and a right-side WhatsApp bubble preview is a lower-risk path than inventing a new UI paradigm.

**Primary recommendation:** Use 360 Dialog's `/uploads` (resumable) endpoint for header images, persist the intermediate file to Supabase Storage `whatsapp-media` bucket for preview + retry durability, clone the automation-builder architecture verbatim at `/api/config-builder/templates/chat`, and route all `whatsapp_templates` mutations through a new `src/lib/domain/whatsapp-templates.ts` module. Do NOT hand-roll Meta's resumable upload — wrap it in a typed helper in `src/lib/whatsapp/templates-api.ts` next to the existing `createTemplate360`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Chat UI (messages, input, streaming) | Browser / Client | — | AI SDK v6 `useChat` is client-only; streams SSE from Next route |
| Chat API streaming + tool execution | Frontend Server (Next route) | — | `POST /api/config-builder/templates/chat` runs on Next server, calls Anthropic, exposes tools |
| Tool handlers (listTemplates, uploadImage, submitTemplate) | Frontend Server | Domain layer | Tools live server-side; mutations pass through `src/lib/domain/whatsapp-templates.ts` (Regla 3) |
| Template mutations (INSERT/UPDATE `whatsapp_templates`) | Domain layer (`src/lib/domain/whatsapp-templates.ts`) | — | Regla 3 mandates domain layer for all DB mutations |
| 360 Dialog API calls (upload, createTemplate360) | Domain layer | `src/lib/whatsapp/templates-api.ts` (API client) | Domain orchestrates; API client is thin transport helper |
| Image staging | Supabase Storage (`whatsapp-media` bucket) | — | Durable intermediate for preview + retry, already provisioned |
| Session persistence | Database (`builder_sessions` table, new or shared) | — | Mirrors automation builder pattern |
| WhatsApp bubble preview | Browser / Client | — | Pure render from shared state; no server round-trip per keystroke |

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Layout híbrido dos paneles (chat izquierda, preview+campos editables derecha) con preview tipo burbuja WhatsApp en tiempo real.
- **D-02:** Punto de entrada en `/configuracion` (CTA superior) + botón "Crear con IA" en `/configuracion/whatsapp/templates`. Coexiste con form manual.
- **D-03:** IA acepta lenguaje natural y normaliza a `{{N}}`. No se pide al usuario escribir `{{}}`.
- **D-04:** `variable_mapping` se captura dentro del builder (JSONB `whatsapp_templates.variable_mapping`).
- **D-05:** Header: TEXT e IMAGE. VIDEO y DOCUMENT fuera de scope.
- **D-06:** Body obligatorio; Footer opcional.
- **D-07:** Sin botones en este standalone.
- **D-08:** 3 categorías (MARKETING/UTILITY/AUTHENTICATION); IA recomienda, usuario sobrescribe.
- **D-09:** Idiomas: `es`, `en_US`, **`es_CO`** nuevo. IA recomienda.
- **D-10:** Upload endpoint = `/uploads` resumable (hipótesis CONFIRMADA en research — ver sección A).
- **D-11:** Flujo: archivo → Supabase Storage (staging) → al submit re-upload a 360 Dialog `/uploads` → handle → `components[].example.header_handle[0]` → `createTemplate360()`.
- **D-12:** Validaciones: jpg/png, 5 MB máximo (confirmado), dimensiones mínimas recomendadas.
- **D-13:** Reutilizar Automation Builder como base. Endpoint `/api/config-builder/templates/chat`. Tools específicas.
- **D-14:** Nuevo `src/lib/domain/whatsapp-templates.ts`. Refactor de `src/app/actions/templates.ts:129` para pasar por domain.
- **D-15:** Registrar agente `config-builder-whatsapp-templates` en `.claude/rules/agent-scope.md`.
- **D-16 / D-17:** SEND ya funciona (no tocar). CREATE nunca se implementó — este standalone lo cierra.

### Claude's Discretion

- Ruta final del builder (sugerencia: `/configuracion/whatsapp/templates/builder`)
- Nombre final del endpoint chat (sugerencia: `/api/config-builder/templates/chat`)
- Nombres de tools
- Obligatoriedad de Supabase Storage como intermedio
- Estrategia de errores/retries con 360 Dialog
- Orden de commits durante execute
- Implementación concreta de validaciones de límites por componente

### Deferred Ideas (OUT OF SCOPE)

- Botones (QUICK_REPLY / URL / PHONE_NUMBER)
- Headers VIDEO / DOCUMENT
- Otras configuraciones del workspace (tags, pipelines, etapas) — endpoint se deja preparado pero no se implementa
- Migración de templates legacy creados manualmente en portal
- Edición post-submit
- Deprecación del form manual actual

## Standard Stack

### Core (already in project — no new deps)

| Library | Version (current project) | Latest on npm (2026-04) | Purpose | Why Standard |
|---------|--------------------------|-------------------------|---------|--------------|
| `ai` | `^6.0.86` | `6.0.168` [VERIFIED: npm view] | AI SDK v6 — `streamText`, `convertToModelMessages`, `DefaultChatTransport`, `tool`, `UIMessage`, `stepCountIs` | Already powers Automation Builder. Same API major → clone pattern verbatim. |
| `@ai-sdk/react` | `^3.0.88` | `3.0.170` [VERIFIED: npm view] | `useChat` hook | Client-side streaming chat primitive. |
| `@ai-sdk/anthropic` | `^3.0.43` | `3.0.71` [VERIFIED: npm view] | `anthropic()` model provider | Already used with `claude-sonnet-4-20250514` in builder. |
| `zod` | `^4.3.6` | — | Tool `inputSchema` validation | Required by AI SDK `tool()` factory. |
| `@supabase/ssr` + `@supabase/supabase-js` | `^0.8.0` / `^2.93.1` | — | DB + Storage + Auth | Already the project's data plane. |
| `sonner` | `^2.0.7` | — | Toast notifications | Already standard in templates/automations UI. |
| `lucide-react` | `^0.563.0` | — | Icons | Project standard. |
| Tailwind CSS + shadcn/ui primitives | v4 | — | Styling + components | Project standard. |

**Zero new npm dependencies required.** The entire standalone is composable from what's already installed.

### Supporting (already in project)

| Library | Purpose | When to Use |
|---------|---------|-------------|
| `browser-image-compression` `^2.0.2` | Client-side JPG/PNG compression before upload | Pre-upload if image > 2-3 MB to stay well under the 5 MB Meta cap |
| `next/dynamic` | Client-only component mounting (if we ever need it — WhatsApp bubble is pure JSX so probably not) | Only if a preview sub-component needs browser-only APIs |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Resumable `/uploads` | `/media` endpoint (single POST) | `/media` returns a media ID valid only for SEND messages, NOT accepted by template creation. Docs confirm: "example.header_handle accepts a handle string from the Resumable Upload API" [CITED: docs.360dialog.com/docs/resources/templates/template-elements]. `/media` is the wrong flow. |
| Public URL in `header_handle[0]` | Pass the Supabase Storage public URL directly (like legacy templates in the DB today) | The 360 Dialog docs show both a handle example (`"4::aW..."`) and a URL example (`"https://www.gstatic.com/..."`) inside `header_handle`. URLs have historically worked for some integrators, BUT [ASSUMED] this is discouraged — Meta prefers handles for review-time image verification, and URL-based templates are flagged for stricter review. See Open Question Q1. |
| Custom chat UI | Use a third-party chat component library | Automation Builder is already custom and polished. Consistency wins. |
| Separate sessions table | Reuse `builder_sessions` | Reusing would mix domains; cleaner to either (a) add a `kind` column to `builder_sessions` with values `automation` / `template` or (b) create `config_builder_sessions` — see Open Question Q2. |

**Installation:** None. Every dependency is already in `package.json`.

**Version verification** (2026-04-20 npm view):
- `ai@6.0.168` latest; project on `6.0.86` — same major, compatible.
- `@ai-sdk/react@3.0.170` latest; project on `3.0.88` — same major, compatible.
- `@ai-sdk/anthropic@3.0.71` latest; project on `3.0.43` — same major, compatible.

No version bumps required for this standalone.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BROWSER (client)                              │
│                                                                         │
│  ┌───────────────────────────────┐   ┌──────────────────────────────┐  │
│  │  ChatPane (left, 40-50%)      │   │  PreviewPane (right)          │  │
│  │  - useChat() + Transport      │   │  - Editable fields form       │  │
│  │  - Renders UIMessage.parts[]  │   │  - WhatsApp bubble mock       │  │
│  │  - Tool invocation loading/   │   │  - Image upload input         │  │
│  │    result states              │   │  - Category/language pickers  │  │
│  └────────────┬──────────────────┘   └──────────┬───────────────────┘  │
│               │  sendMessage({text})            │                       │
│               │                                 │                       │
│               └───────┬─────────────────────────┘                       │
│                       │   shared state (React context or Zustand —      │
│                       │   recommend simple context + reducer, see below)│
│                       ▼                                                  │
│               TemplateDraftStore                                         │
│               { name, category, language, bodyText,                      │
│                 headerFormat, headerText, headerImageLocalUrl,           │
│                 headerImageStoragePath, footerText,                      │
│                 variableMapping: {"1": "contact.name", ...},             │
│                 bodyExamples: {"1": "Juan", ...} }                       │
│                                                                          │
│  Tool results from the model mutate this store via a "data stream         │
│  part" pattern — model emits { type: 'draftPatch', patch: {...} } → UI   │
│  merges into draft. Alternatively (simpler), tools return the full       │
│  updated draft snapshot and UI replaces state.                           │
└───────────────┬──────────────────────────────────┬──────────────────────┘
                │  POST /api/config-builder/       │  POST /api/config-builder/
                │       templates/chat             │       templates/upload
                │       (SSE stream)               │       (multipart, image)
                ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     NEXT.JS SERVER (App Router)                         │
│                                                                         │
│  /api/config-builder/templates/chat/route.ts                            │
│    ├─ auth (supabase.auth.getUser)                                      │
│    ├─ workspace membership check                                        │
│    ├─ load/create session (config_builder_sessions or builder_sessions) │
│    ├─ streamText({ model: claude-sonnet-4, tools, system })             │
│    └─ onFinish → updateSession(messages)                                │
│                                                                         │
│  Tools defined in src/lib/config-builder/templates/tools.ts:            │
│    • listExistingTemplates    (read-only, catalog check)                │
│    • suggestCategory          (pure reasoning, no DB)                   │
│    • suggestLanguage          (pure reasoning, no DB)                   │
│    • captureVariableMapping   (pure — validates mapping against         │
│                                VARIABLE_CATALOG, returns normalized)    │
│    • validateTemplateDraft    (char limits, sequential vars, name)      │
│    • submitTemplate           (THE mutation — calls domain)             │
│                                                                         │
│  /api/config-builder/templates/upload/route.ts (separate — NOT a tool)  │
│    ├─ receives multipart file from PreviewPane                          │
│    ├─ validates mime (jpg/png) + size (5 MB)                            │
│    ├─ uploads to Supabase Storage 'whatsapp-media/templates/{ws}/...'   │
│    └─ returns { storagePath, publicUrl } — used in preview + later       │
│       by submitTemplate tool as source for the 360 Dialog upload        │
│                                                                         │
│  src/lib/domain/whatsapp-templates.ts (NEW)                             │
│    createTemplate(ctx, params):                                         │
│      1. validate name uniqueness (workspace_id, name)                   │
│      2. if headerFormat === 'IMAGE':                                    │
│         a. fetch image bytes from Supabase Storage                      │
│         b. call uploadHeaderImage360(apiKey, bytes, mime) →             │
│            returns handle "4::aW..." via /uploads resumable flow        │
│         c. set components[HEADER].example.header_handle = [handle]      │
│      3. INSERT whatsapp_templates (status=PENDING, submitted_at=NOW)    │
│      4. createTemplate360(apiKey, params) — existing helper             │
│      5. on 360 error: UPDATE status=REJECTED + rejected_reason           │
│      6. return DomainResult<Template>                                   │
│                                                                         │
│  src/lib/whatsapp/templates-api.ts (EXTEND)                             │
│    Add new helper: uploadHeaderImage360(apiKey, bytes, mime, filename)  │
│      → does 2-step resumable upload → returns { h: string }             │
└─────────────────────┬───────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL / SUPABASE                                │
│                                                                         │
│  360 Dialog (waba-v2.360dialog.io)                                      │
│    POST /uploads?file_length=X&file_type=image/jpeg  (D360-API-KEY)     │
│      → { "id": "upload:MTphd..." }                                      │
│    POST /{session_id}    headers D360-API-KEY, file_offset: 0           │
│                          body: raw binary                               │
│      → { "h": "4::aW..." }                                              │
│    POST /v1/configs/templates  (createTemplate360 existing)             │
│      body includes example.header_handle = ["4::aW..."]                 │
│                                                                         │
│  Supabase                                                               │
│    Storage: whatsapp-media/templates/{workspace_id}/{ts}_{name}.jpg     │
│    DB:      whatsapp_templates (INSERT by domain layer)                 │
│    DB:      config_builder_sessions (new) or builder_sessions (reused)  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| File | Responsibility |
|------|---------------|
| `src/app/(dashboard)/configuracion/whatsapp/templates/builder/page.tsx` | Server component entry point — renders `<TemplateBuilderLayout />` |
| `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx` | Two-pane shell; holds `TemplateDraft` state via context; wires ChatPane + PreviewPane |
| `.../components/chat-pane.tsx` | Clones `builder-chat.tsx` — `useChat` + `DefaultChatTransport` pointing at `/api/config-builder/templates/chat` |
| `.../components/chat-message.tsx` | Clones `builder-message.tsx` — renders `UIMessage.parts[]` with tool-invocation states |
| `.../components/preview-pane.tsx` | Right-side column with: editable fields (name, category, language, body textarea, footer input, header format selector), image upload input, and the WhatsApp bubble |
| `.../components/whatsapp-bubble.tsx` | Pure render of `{ header, body, footer, mediaPreviewUrl }` as a WhatsApp-style message bubble. Accepts the interpolated text with `{{N}}` substituted by example values for readability |
| `.../components/template-draft-context.tsx` | React Context + reducer. Centralizes `TemplateDraft` so chat tool calls and preview edits both read/write the same state |
| `src/lib/config-builder/templates/system-prompt.ts` | `buildTemplatesSystemPrompt()` — dynamic prompt with Meta rules, categories, languages, variable catalog, WhatsApp limits |
| `src/lib/config-builder/templates/tools.ts` | `createTemplateBuilderTools(ctx)` — returns tool set for AI SDK `streamText({ tools })` |
| `src/lib/config-builder/templates/types.ts` | `TemplateDraft`, `TemplateBuilderToolContext`, response shapes |
| `src/lib/config-builder/templates/validation.ts` | `validateDraft(draft)` — char limits, sequential vars, name rules. Called by both tool and server action before submit |
| `src/lib/whatsapp/templates-api.ts` (EXTEND) | Add `uploadHeaderImage360(apiKey, bytes, mimeType, filename)` — full resumable 2-step flow |
| `src/lib/domain/whatsapp-templates.ts` (NEW) | `createTemplate(ctx, params)` — orchestrates image upload + DB insert + 360 submit |
| `src/app/actions/templates.ts` (REFACTOR) | `createTemplate` action delegates to `src/lib/domain/whatsapp-templates.ts` — existing form keeps working |
| `src/app/api/config-builder/templates/chat/route.ts` (NEW) | `POST` — AI SDK streamText endpoint |
| `src/app/api/config-builder/templates/upload/route.ts` (NEW) | `POST` — client-to-Supabase-Storage image upload |
| `src/app/api/config-builder/sessions/route.ts` (NEW or extend builder/sessions) | Session CRUD for the builder UI |
| `supabase/migrations/20260421XXXXXX_config_builder_sessions.sql` (NEW) | Either create new table OR `ALTER TABLE builder_sessions ADD COLUMN kind text DEFAULT 'automation'` — see Q2 |

### Recommended Project Structure

```
src/app/(dashboard)/configuracion/whatsapp/templates/
├── page.tsx                               # EXISTING list page — add "Crear con IA" CTA
├── nuevo/                                 # EXISTING manual form — COEXISTS
├── builder/                               # NEW
│   ├── page.tsx
│   └── components/
│       ├── template-builder-layout.tsx
│       ├── chat-pane.tsx
│       ├── chat-message.tsx
│       ├── preview-pane.tsx
│       ├── whatsapp-bubble.tsx
│       ├── template-draft-context.tsx
│       └── image-uploader.tsx
├── components/                            # EXISTING shared
└── [id]/                                  # EXISTING detail

src/app/(dashboard)/configuracion/
└── page.tsx                               # EXISTING hub — add CTA card

src/lib/config-builder/
└── templates/
    ├── tools.ts
    ├── system-prompt.ts
    ├── validation.ts
    └── types.ts

src/lib/domain/
└── whatsapp-templates.ts                  # NEW

src/lib/whatsapp/
└── templates-api.ts                       # EXTEND with uploadHeaderImage360

src/app/api/config-builder/
└── templates/
    ├── chat/route.ts
    └── upload/route.ts
```

### Pattern 1: AI SDK v6 Chat with Inline Tool Previews

**What:** Server streams with `streamText`, exposes `tools`, and the client-side `useChat` renders each tool invocation's state (loading / result / error) as structured message parts. Tool results can render arbitrary JSX (e.g., the automation builder renders React-Flow diagrams inline).

**When to use:** Any conversational flow where the agent needs to call tools and show rich, actionable results without leaving the chat.

**Example** — verbatim pattern from existing code (`src/app/api/builder/chat/route.ts:129`):

```typescript
// Source: src/app/api/builder/chat/route.ts (existing, working)
const result = streamText({
  model: anthropic('claude-sonnet-4-20250514'),
  system: systemPrompt,
  messages: modelMessages,
  tools,                          // { toolName: tool({ description, inputSchema, execute }) }
  stopWhen: stepCountIs(5),       // allow multi-turn tool calls
  onFinish: async () => {
    await updateSession(sessionId!, workspaceId, {
      messages: messages as unknown[],
    })
  },
})

const response = result.toUIMessageStreamResponse()
response.headers.set('X-Session-Id', sessionId!)
return response
```

Client side (`src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx:38`):

```typescript
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
const { messages, sendMessage, status, error } = useChat({ transport, messages: initialMessages })
```

**Cloning rule for templates:** change `api: '/api/builder/chat'` → `'/api/config-builder/templates/chat'`. Everything else — `useChat`, `DefaultChatTransport`, `UIMessage` rendering with `message.parts.map(...)` and `part.type === 'dynamic-tool'` with `state` = `'input-streaming' | 'input-available' | 'output-available' | 'output-error'` — is identical.

### Pattern 2: Tool Definition with Zod Schema

**What:** Each tool is `tool({ description, inputSchema: z.object({...}), execute: async (params) => result })`. The AI SDK wires it into `streamText` and handles JSON-schema translation for Claude.

**Example** (existing, `src/lib/builder/tools.ts:184`):

```typescript
listTags: tool({
  description: 'Lista todos los tags del workspace...',
  inputSchema: z.object({}),
  execute: async (): Promise<{ tags: TagInfo[] } | { error: string }> => {
    try {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('tags')
        .select('id, name, color')
        .eq('workspace_id', ctx.workspaceId)
        .order('name')
      if (error) return { error: `Error: ${error.message}` }
      return { tags: (data || []) as TagInfo[] }
    } catch (err) {
      return { error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}),
```

**Rule:** Tools return `{ success: ... } | { error: string }` discriminated unions. Never throw; always return an error object so the model can explain the failure to the user.

### Pattern 3: Domain Layer Mutation

**What:** Every DB mutation goes through `src/lib/domain/*.ts`, which uses `createAdminClient()` (bypassing RLS) and filters by `workspace_id`. Callers (server actions, tools, webhooks, action executor) must pass a `DomainContext`.

**Example** (existing, `src/lib/domain/tags.ts:61`):

```typescript
export async function assignTag(
  ctx: DomainContext,
  params: AssignTagParams
): Promise<DomainResult<AssignTagResult>> {
  const supabase = createAdminClient()
  // ... lookup by workspace_id + name ...
  // ... insert into junction ...
  // ... emit trigger ...
  return { success: true, data: { tagId: tag.id } }
}
```

**Rule for this standalone:** `src/lib/domain/whatsapp-templates.ts` follows this exact shape. The new `createTemplate(ctx, params)` function is callable from (a) the refactored server action and (b) the `submitTemplate` tool in the AI builder. Both paths share the same validation + upload + insert logic.

### Anti-Patterns to Avoid

- **Calling `createTemplate360()` directly from a server action or tool.** Route through domain. The one existing direct call in `src/app/actions/templates.ts:203` is the pattern to refactor away.
- **Storing the binary image in `whatsapp_templates` or in messages.** Always go through Supabase Storage; DB stores only the handle/URL string.
- **Skipping Supabase Storage and uploading the browser `File` straight to 360 Dialog.** Breaks retry-on-failure: if 360 rejects the template, we can re-submit without re-asking the user for the file. Also simplifies preview rendering (client needs a stable URL while chatting).
- **Building a separate "variables mapper" dialog after submission.** Decision D-04 says capture during the chat; the IA already understood the semantic — redundant UI step.
- **Hand-rolling a Meta resumable upload client.** Wrap as a single typed helper next to `createTemplate360`. See `## Don't Hand-Roll`.
- **Using `Authorization: OAuth <token>` for 360 Dialog upload.** 360 Dialog's `/uploads` uses `D360-API-KEY` header — NOT Meta's direct OAuth. This is a critical divergence from all Meta-direct Stack Overflow answers.
- **Using `/v1/media` (single POST) to get a handle for templates.** `/media` returns an ID valid only for message SEND. Template creation requires the resumable `/uploads` flow. [CITED: docs.360dialog.com]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Streaming chat with tool calls | Custom SSE + message state machine | AI SDK v6 `streamText` + `useChat` | Already in project + already battle-tested in automation builder. Zero new work. |
| Meta's resumable upload protocol | Custom multipart client with `file_offset` tracking, 502 retries, etc. | Wrap in `uploadHeaderImage360()` helper — ~40 lines using native `fetch` | Protocol is simple for small images (single-chunk) but easy to get wrong (headers, byte encoding, auth). One helper, one place to fix bugs. |
| Image validation (size, mime, dimensions) | Manual `if (size > 5*1024*1024) ...` | Native `File` API + optional `browser-image-compression` for automatic JPG re-encoding | Compression library already in project (used elsewhere) and handles EXIF orientation. |
| WhatsApp bubble preview styling | Hand-drawn SVG or complex CSS | Plain Tailwind — it's just rounded corners, a green-ish background, and text wrapping | WhatsApp bubbles are visually simple; do not reach for a library. |
| Session persistence (messages, session list, title) | New table + CRUD | Reuse `builder_sessions` table (add `kind` column) OR create parallel `config_builder_sessions` mirroring the same schema — see Q2 | `session-store.ts` logic is already proven; duplicating the schema is cheap. |
| Supabase Storage upload from browser | Signed URLs + presigned POST | Server action wraps `supabase.storage.from('whatsapp-media').upload(...)` — exact pattern from `src/app/actions/quick-replies.ts:366` | Bucket is public + already configured with policies. |
| Variable catalog for mapping suggestions | Ad-hoc list | `VARIABLE_CATALOG` from `src/lib/automations/constants.ts:354` | Already exists with paths like `contacto.nombre`, `orden.id`, `orden.valor`. System prompt injects it. |
| Variable interpolation for preview | Custom regex | `resolveVariables(body, context)` from `src/lib/automations/variable-resolver.ts:50` | Already battle-tested mustache-style resolver. Reuse for showing the preview with example values substituted. |
| Template delete cooldown handling | Custom error parsing | Surface 360's error message directly to user in toast | 30-day name-reuse cooldown is a Meta policy — we can't work around it; just warn the user. |

**Key insight:** Every concern in this standalone has an existing primitive in the codebase. The work is wiring, not invention. The ONLY new external integration is the `/uploads` resumable flow — one helper function.

## Runtime State Inventory

> This is a greenfield standalone (new feature, no rename/migration). Only relevant items:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `whatsapp_templates.components[HEADER].example.header_handle[0]` currently holds URLs (from manually-portal-created IMAGE templates). After this standalone, new IMAGE templates will store Meta handles (e.g., `"4::aW..."`). **Both must be supported at SEND time.** | SEND path already tolerates both (commit `acffa6e` — the field is treated as a URL and passed as `{link: ...}` in `src/app/actions/messages.ts:465`, which works because 360 Dialog accepts both URL and handle in that field at send-time too). No migration needed. |
| Live service config | None new. | None. |
| OS-registered state | None. | None. |
| Secrets / env vars | `WHATSAPP_API_KEY` (already exists, workspace-level override in `workspaces.settings.whatsapp_api_key`) | None — reuse existing key path. |
| Build artifacts | None. | None. |

## Common Pitfalls

### Pitfall 1: Using `/media` endpoint to get a handle for templates
**What goes wrong:** Template creation succeeds but Meta rejects during review because the "handle" is actually a short-lived media ID, not a resumable-upload file handle.
**Why it happens:** Training data + older tutorials blur the distinction — both endpoints "upload an image and return an ID", but only one produces an ID that Meta's template review can fetch.
**How to avoid:** Always use `POST /uploads` (resumable, returns `{ h: "4::aW..." }`), never `POST /media`.
**Warning signs:** Template status flips to REJECTED within seconds of submission with reason mentioning media/example.

### Pitfall 2: Wrong auth header on 360 Dialog `/uploads`
**What goes wrong:** 401 Unauthorized from step 1 (session creation). Most resumable-upload examples online use `Authorization: OAuth <token>` because they're talking directly to Meta's Graph API.
**Why it happens:** 360 Dialog proxies Meta's API but uses its own auth pattern (`D360-API-KEY: <key>`). Their docs confirm this pattern for both steps.
**How to avoid:** Both step 1 (`POST /uploads`) and step 2 (`POST /{session_id}`) must use the `D360-API-KEY` header — NO `Authorization: OAuth ...`.
**Warning signs:** 401 from `waba-v2.360dialog.io/uploads` with message about OAuth/token.

### Pitfall 3: Meta auto-reclassification (April 2025+ change)
**What goes wrong:** User picks UTILITY category with promo-sounding content, expects rejection; instead Meta now APPROVES but **silently reclassifies to MARKETING** — billing per-conversation + marketing caps apply, user confused why their "utility" message cost more.
**Why it happens:** From April 2025 onward, Meta stopped rejecting templates solely for category mismatch; they now approve + reclassify.
**How to avoid:** (a) system prompt warns the IA about this and it flags risky content up-front; (b) after submission, `syncTemplateStatuses()` is already fetching `category` from 360 — show it prominently in the UI so users see if Meta changed it.
**Warning signs:** Template's `category` field in DB differs from what was submitted.

### Pitfall 4: `{{0}}` or non-sequential variables
**What goes wrong:** Instant rejection. "Invalid format" error.
**Why it happens:** Meta enforces sequential variables starting from `{{1}}`. `{{0}}`, `{{3}}` without `{{2}}`, or variables with gaps all fail automated review.
**How to avoid:** `validateDraft()` helper checks: (a) variable indices start at 1, (b) are contiguous, (c) match the count of `example.body_text[0]` or `example.header_text[0]`.
**Warning signs:** Template status flips to REJECTED instantly with format error.

### Pitfall 5: Character limits silently exceeded
**What goes wrong:** Submission fails or is auto-rejected.
**Why it happens:** Meta limits: HEADER TEXT 60 chars, BODY 1024 chars, FOOTER 60 chars, BUTTON label 25 chars [CITED: docs.360dialog.com/docs/resources/templates/template-elements, developers.facebook.com]. AI can generate long copy if user asks for "detailed".
**How to avoid:** `validateDraft()` enforces per-component limits client-side AND the tool's `inputSchema` zod schemas enforce `.max(60)`, `.max(1024)`, `.max(60)`.
**Warning signs:** User sees their body get truncated in the preview, or submit silently fails.

### Pitfall 6: Template name 30-day delete cooldown
**What goes wrong:** User deletes `confirmacion_pedido`, immediately tries to recreate with same name — 360 Dialog returns error "template name in cooldown for 30 days".
**Why it happens:** Meta policy: deleted template names cannot be reused for 30 days. [VERIFIED: multiple sources including Wati, Respond.io]
**How to avoid:** When `createTemplate360()` returns this specific error, surface it clearly: "Este nombre fue usado recientemente. Meta lo bloquea por 30 días tras eliminar. Prueba con una variación."
**Warning signs:** 400 error from create call with message containing "cooldown" or "recently deleted".

### Pitfall 7: Shortened URLs or brand-mismatched URLs in body/buttons
**What goes wrong:** Automatic rejection for phishing-flag.
**Why it happens:** Meta's auto-filters flag `bit.ly`, `tinyurl`, and URLs that don't match the business's verified domain.
**How to avoid:** System prompt tells IA to flag any short-link pattern in user input and suggest they use the full URL. (Not relevant for this standalone since buttons are out of scope per D-07, but belongs in system prompt as "heads up for the future".)
**Warning signs:** User mentions promo codes or click-tracking in the body.

### Pitfall 8: Uploading file > 5 MB
**What goes wrong:** Step 2 of resumable upload returns an error.
**Why it happens:** Meta's hard cap for image uploads. [CITED: docs.360dialog.com/docs/waba-messaging/media]
**How to avoid:** (a) client-side pre-validation in the image uploader, (b) optionally use `browser-image-compression` to auto-compress if the file is > 2 MB, (c) server re-validates before kicking off the resumable flow.
**Warning signs:** Upload step 2 fails with 413 or file-too-large error.

### Pitfall 9: AI SDK v6 `UIMessage` vs `ModelMessage` confusion
**What goes wrong:** Session load crashes because legacy messages stored as `ModelMessage` shape don't have `parts[]`.
**Why it happens:** AI SDK v6 uses `UIMessage.parts` but older versions used `content` (string). Automation builder has a fallback at `builder-message.tsx:188` for corrupted messages — copy this fallback.
**How to avoid:** Store messages in `UIMessage` format (what client sends). On read, guard with `!message.parts || !Array.isArray(message.parts)` and fall back to showing raw `.content` if present. Same pattern as `builder-message.tsx`.
**Warning signs:** Runtime error "Cannot read property 'map' of undefined" when loading an old session.

### Pitfall 10: Supabase Storage public URL NOT readable by 360 Dialog
**What goes wrong:** We pass a Supabase Storage public URL to 360 Dialog's upload helper expecting it to fetch; but we need to upload BINARY to 360's `/uploads` endpoint, not a URL.
**Why it happens:** Confusing Supabase's "public URL" with a source 360 can fetch. The URL is just for the browser preview; the server-side flow must still download bytes from Storage and re-upload to 360.
**How to avoid:** Two distinct steps: (1) browser uploads to Supabase Storage (preview + durability); (2) at submit time, server downloads from Storage via `supabase.storage.from('whatsapp-media').download(path)` then pipes bytes into 360's resumable upload.

## Code Examples

All examples below use the existing project conventions: `createAdminClient()` in domain + tools, `createClient()` in server actions, `DomainContext` / `DomainResult<T>`.

### Example 1: 360 Dialog Resumable Upload Helper

**File:** `src/lib/whatsapp/templates-api.ts` (extend)
**Source for protocol:** [CITED: docs.360dialog.com/docs/resources/phone-numbers/business-profiles], [CITED: developers.facebook.com/docs/graph-api/guides/upload/]

```typescript
// ============================================================================
// Resumable upload for template IMAGE headers
//
// Meta requires a permanent file handle (not URL, not temporary media ID) in
// example.header_handle[0] when creating a template with an IMAGE header.
// 360 Dialog proxies Meta's Resumable Upload API with D360-API-KEY auth.
//
// Two-step flow:
//   1. POST /uploads?file_length=X&file_type=image/jpeg  → { id: "upload:MTphd..." }
//   2. POST /{session_id}   headers file_offset: 0       → { h: "4::aW..." }
// ============================================================================

export interface UploadHeaderImageResult {
  handle: string  // "4::aW..."
}

/**
 * Upload an image to 360 Dialog and obtain a permanent file handle suitable
 * for use in example.header_handle[0] at template creation time.
 *
 * @param apiKey - Workspace D360-API-KEY
 * @param bytes - Raw image bytes (Uint8Array / Buffer / ArrayBuffer)
 * @param mimeType - 'image/jpeg' | 'image/png'
 * @param fileName - Informational only (360 stores it; Meta uses it in the UI)
 * @returns { handle } — the "h" value from Meta
 */
export async function uploadHeaderImage360(
  apiKey: string,
  bytes: ArrayBuffer | Uint8Array,
  mimeType: 'image/jpeg' | 'image/png',
  fileName: string
): Promise<UploadHeaderImageResult> {
  const fileLength =
    bytes instanceof ArrayBuffer ? bytes.byteLength : bytes.length

  // ---- Step 1: create upload session ----
  const sessionUrl = new URL(`${BASE_URL}/uploads`)
  sessionUrl.searchParams.set('file_length', String(fileLength))
  sessionUrl.searchParams.set('file_type', mimeType)
  sessionUrl.searchParams.set('file_name', fileName)

  const sessionRes = await fetch(sessionUrl.toString(), {
    method: 'POST',
    headers: { 'D360-API-KEY': apiKey },
  })

  if (!sessionRes.ok) {
    const err = await sessionRes.json().catch(() => ({}))
    throw new Error(
      err.error?.message || `Upload session failed: ${sessionRes.status}`
    )
  }

  const { id: sessionId } = (await sessionRes.json()) as { id: string }
  if (!sessionId || !sessionId.startsWith('upload:')) {
    throw new Error(`Unexpected session id format: ${sessionId}`)
  }

  // ---- Step 2: upload bytes ----
  // The session id already contains the "upload:" prefix — the endpoint path
  // uses it as-is per docs.360dialog.com's example.
  const uploadRes = await fetch(`${BASE_URL}/${sessionId}`, {
    method: 'POST',
    headers: {
      'D360-API-KEY': apiKey,
      'file_offset': '0',
      'Content-Type': mimeType,
    },
    body: bytes as BodyInit,
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}))
    throw new Error(
      err.error?.message || `Upload bytes failed: ${uploadRes.status}`
    )
  }

  const { h } = (await uploadRes.json()) as { h: string }
  if (!h) throw new Error('Upload response missing handle "h"')

  return { handle: h }
}
```

### Example 2: Domain Layer — createTemplate

**File:** `src/lib/domain/whatsapp-templates.ts` (NEW)

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { createTemplate360, uploadHeaderImage360 } from '@/lib/whatsapp/templates-api'
import type { DomainContext, DomainResult } from './types'
import type {
  Template,
  TemplateCategory,
  TemplateComponent,
} from '@/lib/whatsapp/types'

export interface CreateTemplateParams {
  name: string                                     // already cleaned (lowercase, underscores)
  language: string                                 // 'es' | 'es_CO' | 'en_US' | ...
  category: TemplateCategory
  components: TemplateComponent[]                  // HEADER, BODY, FOOTER (no buttons in this standalone)
  variableMapping: Record<string, string>
  headerImage?: {                                  // only present if HEADER format=IMAGE
    storagePath: string                            // 'templates/{ws}/{ts}_name.jpg'
    mimeType: 'image/jpeg' | 'image/png'
  }
  apiKey: string                                   // workspace D360-API-KEY
}

/**
 * createTemplate — orchestrates IMAGE upload (if any), DB insert, 360 submit.
 * All mutations go through admin client with workspace filtering.
 */
export async function createTemplate(
  ctx: DomainContext,
  params: CreateTemplateParams
): Promise<DomainResult<Template>> {
  const supabase = createAdminClient()

  // ---- 1. Uniqueness check ----
  const { data: existing } = await supabase
    .from('whatsapp_templates')
    .select('id')
    .eq('workspace_id', ctx.workspaceId)
    .eq('name', params.name)
    .maybeSingle()

  if (existing) {
    return { success: false, error: `Ya existe un template con nombre "${params.name}"` }
  }

  // ---- 2. Upload image + patch header component (if IMAGE) ----
  let components = params.components
  if (params.headerImage) {
    const headerIdx = components.findIndex((c) => c.type === 'HEADER')
    if (headerIdx === -1 || components[headerIdx].format !== 'IMAGE') {
      return { success: false, error: 'HEADER IMAGE requiere archivo pero no se encontró componente' }
    }

    // Download bytes from Supabase Storage
    const { data: blob, error: dlErr } = await supabase.storage
      .from('whatsapp-media')
      .download(params.headerImage.storagePath)
    if (dlErr || !blob) {
      return { success: false, error: `No se pudo descargar imagen: ${dlErr?.message || 'unknown'}` }
    }

    // Upload to 360 Dialog resumable API
    let handle: string
    try {
      const bytes = await blob.arrayBuffer()
      const result = await uploadHeaderImage360(
        params.apiKey,
        bytes,
        params.headerImage.mimeType,
        params.headerImage.storagePath.split('/').pop() || 'header.jpg'
      )
      handle = result.handle
    } catch (err) {
      return {
        success: false,
        error: `Error subiendo imagen a 360 Dialog: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    // Patch the HEADER component with the handle
    components = components.map((c, i) =>
      i === headerIdx
        ? { ...c, example: { ...c.example, header_handle: [handle] } }
        : c
    )
  }

  // ---- 3. Insert local row (PENDING) ----
  const { data: inserted, error: insErr } = await supabase
    .from('whatsapp_templates')
    .insert({
      workspace_id: ctx.workspaceId,
      name: params.name,
      language: params.language,
      category: params.category,
      status: 'PENDING',
      components,
      variable_mapping: params.variableMapping,
    })
    .select()
    .single()

  if (insErr || !inserted) {
    if (insErr?.code === '23505') {
      return { success: false, error: 'Nombre duplicado' }
    }
    return { success: false, error: `Error al insertar: ${insErr?.message}` }
  }

  // ---- 4. Submit to 360 Dialog ----
  try {
    await createTemplate360(params.apiKey, {
      name: params.name,
      language: params.language,
      category: params.category,
      components,
    })

    // Mark submitted_at
    await supabase
      .from('whatsapp_templates')
      .update({ submitted_at: new Date().toISOString() })
      .eq('id', inserted.id)
      .eq('workspace_id', ctx.workspaceId)

    return { success: true, data: inserted as Template }
  } catch (apiErr) {
    const msg = apiErr instanceof Error ? apiErr.message : 'Error desconocido'
    // Mark rejected + store reason; keep row for diagnostic
    await supabase
      .from('whatsapp_templates')
      .update({ status: 'REJECTED', rejected_reason: msg })
      .eq('id', inserted.id)
      .eq('workspace_id', ctx.workspaceId)

    return { success: false, error: `360 Dialog rechazó el template: ${msg}` }
  }
}
```

### Example 3: AI SDK Tool — submitTemplate

**File:** `src/lib/config-builder/templates/tools.ts` (NEW)

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTemplate } from '@/lib/domain/whatsapp-templates'
import type { TemplateBuilderToolContext } from './types'

export function createTemplateBuilderTools(ctx: TemplateBuilderToolContext) {
  return {
    // ------------------------------------------------------------------
    // submitTemplate — THE mutation. Runs only after user confirms preview.
    // ------------------------------------------------------------------
    submitTemplate: tool({
      description:
        'Crea el template y lo envía a 360 Dialog para revisión de Meta. SOLO llamar cuando el usuario haya confirmado explícitamente el preview.',
      inputSchema: z.object({
        name: z.string().min(1).max(512).regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guiones bajos'),
        language: z.enum(['es', 'es_CO', 'en_US']),
        category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
        header: z
          .discriminatedUnion('format', [
            z.object({ format: z.literal('NONE') }),
            z.object({
              format: z.literal('TEXT'),
              text: z.string().min(1).max(60),
              exampleValue: z.string().optional(),  // required if text has {{1}}
            }),
            z.object({
              format: z.literal('IMAGE'),
              storagePath: z.string().min(1),
              mimeType: z.enum(['image/jpeg', 'image/png']),
            }),
          ])
          .optional(),
        body: z.object({
          text: z.string().min(1).max(1024),
          exampleValues: z.record(z.string(), z.string()).default({}),  // {"1": "Juan", "2": "12345"}
        }),
        footer: z
          .object({ text: z.string().min(1).max(60) })
          .optional(),
        variableMapping: z.record(z.string(), z.string()).default({}),   // {"1": "contacto.nombre"}
      }),
      execute: async (params): Promise<
        { success: true; templateId: string } | { success: false; error: string }
      > => {
        // ---- Fetch workspace API key ----
        const supabase = createAdminClient()
        const { data: ws } = await supabase
          .from('workspaces')
          .select('settings')
          .eq('id', ctx.workspaceId)
          .single()

        const apiKey =
          ws?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
        if (!apiKey) {
          return { success: false, error: 'API key de WhatsApp no configurada' }
        }

        // ---- Build components array ----
        const components: import('@/lib/whatsapp/types').TemplateComponent[] = []

        if (params.header && params.header.format !== 'NONE') {
          if (params.header.format === 'TEXT') {
            const h: import('@/lib/whatsapp/types').TemplateComponent = {
              type: 'HEADER',
              format: 'TEXT',
              text: params.header.text,
            }
            const vars = [...new Set(
              (params.header.text.match(/\{\{(\d+)\}\}/g) || []).map((v) => v.replace(/[{}]/g, ''))
            )]
            if (vars.length > 0) {
              h.example = { header_text: vars.map((n) => params.header?.format === 'TEXT' ? (params.header.exampleValue || `ejemplo_${n}`) : `ejemplo_${n}`) }
            }
            components.push(h)
          } else {
            // IMAGE — actual handle is set in domain after resumable upload
            components.push({ type: 'HEADER', format: 'IMAGE' })
          }
        }

        const bodyVars = [...new Set(
          (params.body.text.match(/\{\{(\d+)\}\}/g) || []).map((v) => v.replace(/[{}]/g, ''))
        )]
        const bodyComp: import('@/lib/whatsapp/types').TemplateComponent = {
          type: 'BODY',
          text: params.body.text,
        }
        if (bodyVars.length > 0) {
          bodyComp.example = {
            body_text: [bodyVars.map((n) => params.body.exampleValues[n] || `ejemplo_${n}`)],
          }
        }
        components.push(bodyComp)

        if (params.footer) {
          components.push({ type: 'FOOTER', text: params.footer.text })
        }

        // ---- Call domain ----
        const result = await createTemplate(
          { workspaceId: ctx.workspaceId, source: 'tool-handler' },
          {
            name: params.name,
            language: params.language,
            category: params.category,
            components,
            variableMapping: params.variableMapping,
            headerImage:
              params.header?.format === 'IMAGE'
                ? { storagePath: params.header.storagePath, mimeType: params.header.mimeType }
                : undefined,
            apiKey,
          }
        )

        if (!result.success || !result.data) {
          return { success: false, error: result.error || 'Error desconocido' }
        }

        return { success: true, templateId: result.data.id }
      },
    }),

    // Additional tools (sketched):
    //   suggestCategory(bodyText, headerText, footerText)       → pure reasoning; no DB
    //   suggestLanguage(bodyText)                                → pure reasoning
    //   captureVariableMapping(templateText, varIndex, field)    → validates field against VARIABLE_CATALOG
    //   validateTemplateDraft(draft)                             → char limits, sequential vars, name regex
    //   listExistingTemplates()                                  → read whatsapp_templates for dedup check
    //   uploadHeaderImage({ base64Data, mimeType })              → writes to Supabase Storage;
    //                                                             returns { storagePath } for use in submitTemplate
  }
}
```

### Example 4: Chat API Route

**File:** `src/app/api/config-builder/templates/chat/route.ts` (NEW)
Near-verbatim copy of `src/app/api/builder/chat/route.ts` with three changes: (a) different system prompt, (b) different tools, (c) different session store namespace.

```typescript
import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { buildTemplatesSystemPrompt } from '@/lib/config-builder/templates/system-prompt'
import { createTemplateBuilderTools } from '@/lib/config-builder/templates/tools'
import {
  createSession,
  getSession,
  updateSession,
} from '@/lib/builder/session-store'  // REUSE if we share table, or new store if separate
import type { UIMessage } from 'ai'

export async function POST(request: Request) {
  try {
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

    const { messages, sessionId: requestedSessionId } = (await request.json()) as {
      messages: UIMessage[]
      sessionId?: string
    }
    if (!messages || !Array.isArray(messages)) {
      return new Response('Missing messages array', { status: 400 })
    }

    let sessionId = requestedSessionId
    if (sessionId) {
      const existing = await getSession(sessionId, workspaceId)
      if (!existing) return new Response('Session not found', { status: 404 })
    } else {
      const title = (messages.find((m) => m.role === 'user')?.parts?.find((p) => p.type === 'text') as { text?: string } | undefined)?.text?.slice(0, 60) || 'Nuevo template'
      const session = await createSession(workspaceId, user.id, title)
      if (!session) return Response.json({ error: 'Failed to create session' }, { status: 500 })
      sessionId = session.id
    }

    const modelMessages = await convertToModelMessages(messages)
    const tools = createTemplateBuilderTools({ workspaceId, userId: user.id })
    const systemPrompt = buildTemplatesSystemPrompt(workspaceId)

    const result = streamText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(6),  // a touch higher: list → draft → preview → validate → upload → submit
      onFinish: async () => {
        await updateSession(sessionId!, workspaceId, { messages: messages as unknown[] })
      },
    })

    const response = result.toUIMessageStreamResponse()
    response.headers.set('X-Session-Id', sessionId!)
    return response
  } catch (error) {
    console.error('[config-builder/templates/chat] Error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### Example 5: Image Upload Endpoint

**File:** `src/app/api/config-builder/templates/upload/route.ts` (NEW)

```typescript
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

const MAX_BYTES = 5 * 1024 * 1024  // 5 MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png'] as const

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return new Response('No workspace selected', { status: 400 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return Response.json({ error: 'file field required' }, { status: 400 })

  if (!ALLOWED_MIMES.includes(file.type as typeof ALLOWED_MIMES[number])) {
    return Response.json(
      { error: `MIME no soportado: ${file.type}. Solo image/jpeg o image/png.` },
      { status: 400 }
    )
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `Archivo muy grande: ${(file.size / 1024 / 1024).toFixed(1)} MB. Máximo 5 MB.` },
      { status: 400 }
    )
  }

  const timestamp = Date.now()
  const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `templates/${workspaceId}/${timestamp}_${safeName}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await supabase.storage
    .from('whatsapp-media')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (upErr) {
    return Response.json({ error: `Error subiendo a storage: ${upErr.message}` }, { status: 500 })
  }

  const { data: pub } = supabase.storage.from('whatsapp-media').getPublicUrl(storagePath)

  return Response.json({ storagePath, publicUrl: pub.publicUrl, mimeType: file.type })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Reject templates for category mismatch | Approve + silently reclassify to MARKETING | April 2025 | UX must surface the post-submit category so users notice. |
| Manual form with raw `{{1}}` syntax | AI-guided builder with natural-language input | This standalone | Users don't need to learn Meta's variable syntax. |
| `/media` endpoint returning ID for BOTH send and template creation | `/media` for send, `/uploads` (resumable) for template handle | Always was this way, but poorly documented and widely confused | Must use resumable `/uploads` for templates. |
| AI SDK v5 `useChat` with `handleSubmit` + `input` | AI SDK v6 `useChat` with `sendMessage({text})` + `DefaultChatTransport` | AI SDK v6 (late 2025) | Already adopted by project's automation builder — clone pattern. |
| `UIMessage.content` (string) | `UIMessage.parts` (array with `text`, `dynamic-tool`, etc.) | AI SDK v6 | Requires `parts.map(part => ...)` rendering. |
| `stream.toDataStreamResponse()` | `stream.toUIMessageStreamResponse()` | AI SDK v6 | Project already uses the v6 variant. |

**Deprecated / outdated:**
- Any tutorial describing `/media` endpoint for template creation — not wrong for sending, wrong for creating.
- Any example using `Authorization: OAuth ...` against `waba-v2.360dialog.io/*` endpoints — that's Meta-direct, not 360 Dialog.
- `AI SDK v5 useChat` signatures with `input`, `handleInputChange`, `handleSubmit` — project is on v6.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Passing a Supabase Storage public URL (instead of a Meta handle) in `example.header_handle[0]` is "discouraged / stricter review" | Alternatives Considered | If actually fine, we could skip the resumable upload entirely. Medium — the SEND path for legacy URL-based templates proves URLs work for send; it's only CREATE we're uncertain about. Research shows docs accept both formats, but unclear if URLs vs handles get different review treatment. |
| A2 | 360 Dialog's `file_name` query param in step 1 is optional | Example 1 | Low — docs confirm `file_length` and `file_type` are the required params. Passing filename extra is safe. |
| A3 | The session_id from step 1 can be used as-is as the path segment in step 2 (including the `upload:` prefix) | Example 1 | Low — 360 Dialog's docs show `POST /{session_id}` with the prefix intact; Meta's Graph docs use the same pattern. |
| A4 | Claude model `claude-sonnet-4-20250514` is still the right default | Chat route | Low — automation builder uses it and works. If a newer model exists, we can swap, but Sonnet 4 has plenty of headroom for this domain. |
| A5 | Meta's 5 MB image cap applies to the resumable-upload path (not just `/media`) | Pitfall 8 | Low — same Meta backend; 360's upload-retrieve-or-delete-media doc states 5 MB for IMAGE uploads generally. |
| A6 | `browser-image-compression` is safe to use client-side for pre-compression | Don't Hand-Roll | Low — already a dep, used elsewhere. |

## Open Questions

Use these as signals for the planner to decide during `/gsd-plan-phase`. Mark `Claude decides in planning:` for each.

1. **Claude decides in planning: Session storage strategy**
   - **What we know:** `builder_sessions` exists with exactly the fields we need (workspace_id, user_id, title, messages JSONB, automations_created). It's currently typed as "automation builder" sessions.
   - **What's unclear:** Do we (a) add a `kind text DEFAULT 'automation'` column + use `'template'` for this builder and share the table, or (b) create a parallel `config_builder_sessions` table with identical schema, or (c) rename to `builder_sessions` and accept the domain bleed.
   - **Recommendation:** Option (a). Single migration `ALTER TABLE builder_sessions ADD COLUMN kind text NOT NULL DEFAULT 'automation'`. Rename `automations_created` → `artifacts_created` later if we want to generalize, but for this standalone treat it as "not relevant for template sessions" and ignore. Cheapest, preserves history, consistent with the reusable pattern intent.

2. **Claude decides in planning: Draft state sharing between ChatPane and PreviewPane**
   - **What we know:** The chat tool calls need to update the preview in real-time; the preview's editable fields need to be readable by the chat (so the AI understands "current draft state" when the user says "submit").
   - **What's unclear:** React Context + reducer vs Zustand vs AI SDK v6 "data stream parts" (custom parts beyond `text` / `tool-call`).
   - **Recommendation:** React Context + reducer. Zero deps, familiar pattern, testable. Data stream parts are a 2025 AI SDK feature but add complexity; skip unless real-time model→UI push is required (it isn't — tool results already give us that).

3. **Claude decides in planning: Image handle persistence — keep Supabase Storage copy forever or purge after approval?**
   - **What we know:** If we keep the Supabase copy, we can re-upload if the user deletes + recreates the template (within 30-day cooldown) or wants to clone to a new template. If we purge, we save storage $ and reduce PII surface.
   - **What's unclear:** Business preference.
   - **Recommendation:** Keep. Storage is cheap; retry/clone flexibility is valuable. Add a scheduled purge (later standalone) for templates REJECTED > 90 days.

4. **Claude decides in planning: Does the server action `createTemplate` keep supporting IMAGE now that domain handles it, or is it intentionally kept as "TEXT-only path"?**
   - **Recommendation:** Refactor the action to accept an optional `headerImage` field and delegate to domain. Keeps the old form fully functional AND gives the domain one entry path. Null-safe for existing callers.

5. **URL vs handle in `example.header_handle` — which does Meta review treat better?**
   - **What we know:** Docs show both formats; legacy IMAGE templates in the DB use URLs and were approved via the manual 360 portal.
   - **What's unclear:** Whether URL vs handle affects review time or approval rate.
   - **Recommendation:** Use handle (resumable upload). It's what Meta's official template-components doc consistently shows in examples [CITED: developers.facebook.com/documentation/business-messaging/whatsapp/templates/components/]. URLs were probably inserted by 360's portal doing the upload behind the scenes.

6. **Claude decides in planning: Where to register the new agent scope `config-builder-whatsapp-templates` in `.claude/rules/agent-scope.md`?**
   - **Recommendation:** Append under existing "Scopes por Agente" section with scope explicitly listing: PUEDE (crear templates via domain `createTemplate`, subir imágenes a whatsapp-media bucket); NO PUEDE (editar/eliminar templates, crear/modificar tags o pipelines o etapas, enviar mensajes, acceder a otros workspaces).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| 360 Dialog API access | `/uploads`, `/v1/configs/templates` | ✓ (project already integrated) | waba-v2 | — |
| Supabase Storage `whatsapp-media` bucket | Image staging | ✓ | Migration `20260131000000_storage_bucket.sql` | — |
| Anthropic API key | `streamText` calls | ✓ | Used by automation builder | — |
| `whatsapp_templates` table | Template storage | ✓ | Migration `20260131000002_whatsapp_extended_foundation.sql` | — |
| `builder_sessions` table | Chat persistence (if shared) | ✓ (via automation builder) | — | Create `config_builder_sessions` instead |
| Workspace API key | `D360-API-KEY` for each workspace | ✓ | `workspaces.settings.whatsapp_api_key` with `WHATSAPP_API_KEY` env fallback | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

**Zero blockers for execution.**

## Answers to Research Questions

### A. 360 Dialog Media Upload for Template Creation — CONFIRMED

**Hypothesis CONFIRMED.** The `/v1/uploads` (resumable) flow is the correct path for IMAGE template headers. `/v1/media` (single-POST) returns an ID valid for SEND only.

**Exact endpoints** [CITED: docs.360dialog.com/docs/resources/phone-numbers/business-profiles, cross-referenced with developers.facebook.com/docs/graph-api/guides/upload/]:

- **Step 1 (session):** `POST https://waba-v2.360dialog.io/uploads?file_length={bytes}&file_type={mime}`
  - Header: `D360-API-KEY: {apiKey}`
  - Response: `{ "id": "upload:MTphd..." }`

- **Step 2 (bytes):** `POST https://waba-v2.360dialog.io/{session_id}`  (the `session_id` includes the `upload:` prefix, passed as-is into the URL path)
  - Headers: `D360-API-KEY: {apiKey}`, `file_offset: 0`, `Content-Type: {mime}`
  - Body: raw binary
  - Response: `{ "h": "4::aW..." }`  ← this is the handle to put in `example.header_handle[0]`

- **Template create** (existing helper `createTemplate360` at `src/lib/whatsapp/templates-api.ts:47`):
  ```
  POST https://waba-v2.360dialog.io/v1/configs/templates
  Header: D360-API-KEY
  Body: { name, language, category, components: [ { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['4::aW...'] } }, ... ] }
  ```

**Key quirks to surface in the helper / docs:**
- Auth is **`D360-API-KEY`**, NOT `Authorization: OAuth ...`. Every online Meta-resumable-upload tutorial uses OAuth; 360 Dialog differs.
- The session ID returned in step 1 **includes** the `upload:` prefix — pass it through to step 2's URL unchanged.
- Image cap: **5 MB**, `image/jpeg` or `image/png` only, 8-bit RGB or RGBA.
- `/media` (single POST) is the WRONG endpoint for template creation [CITED: docs.360dialog.com/docs/resources/templates/template-elements].

### B. AI SDK v6 Reuse Pattern — READ AND DOCUMENTED

Key file paths + lines from the existing automation builder:

| Aspect | File:Line | Notes |
|--------|-----------|-------|
| `useChat` hook + `DefaultChatTransport` | `src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx:36-63` | Transport receives `sessionId` in body, captures `X-Session-Id` response header |
| System prompt composition | `src/lib/builder/system-prompt.ts:114-347` | Dynamic — injects `TRIGGER_CATALOG`, `ACTION_CATALOG`, `VARIABLE_CATALOG` |
| Tool definitions (9 tools) | `src/lib/builder/tools.ts:179-790` | Pattern: `tool({ description, inputSchema: z.object({...}), execute })` returning `{success,...}\|{error}` |
| Preview pane inline in chat | `src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx:222` | Tool result for `generatePreview` renders React Flow inline via dynamic import |
| Session persistence (CRUD) | `src/lib/builder/session-store.ts:22-218` | `createSession` / `getSession` / `updateSession` / `deleteSession` — all filter by workspace_id |
| Chat API route | `src/app/api/builder/chat/route.ts:42-163` | Template for the new route |
| Model | `claude-sonnet-4-20250514` (`src/app/api/builder/chat/route.ts:130`) | Reuse |
| `stopWhen` | `stepCountIs(5)` | Bump to `stepCountIs(6)` for templates (list → draft → preview → validate → upload → submit = 6 tool rounds) |
| `UIMessage` fallback for legacy | `builder-message.tsx:186-192` | Copy verbatim |

**Prescription for templates — file tree:**
```
src/app/(dashboard)/configuracion/whatsapp/templates/builder/
  page.tsx                         → renders <TemplateBuilderLayout />
  components/
    template-builder-layout.tsx    → two-pane shell, draft context provider
    chat-pane.tsx                  → clone of builder-chat.tsx
    chat-message.tsx               → clone of builder-message.tsx (different tool labels)
    preview-pane.tsx               → right column with editable fields + WhatsApp bubble
    whatsapp-bubble.tsx            → pure JSX render
    template-draft-context.tsx     → shared state between chat (tool calls) and preview (user edits)
    image-uploader.tsx             → file input + Supabase Storage upload via /api/config-builder/templates/upload

src/app/api/config-builder/templates/
  chat/route.ts                    → clone of /api/builder/chat/route.ts
  upload/route.ts                  → new, image upload to Supabase Storage
  sessions/route.ts                → if splitting sessions table; else reuse /api/builder/sessions

src/lib/config-builder/templates/
  tools.ts                         → submitTemplate + helpers
  system-prompt.ts                 → buildTemplatesSystemPrompt
  validation.ts                    → draft validation (char limits, sequential vars)
  types.ts                         → TemplateDraft, TemplateBuilderToolContext
```

**State flow:** ChatPane and PreviewPane both subscribe to `TemplateDraftContext`. User edits in PreviewPane mutate draft; AI tool calls return patches that ChatPane's message-rendering layer applies to the draft. When user says "submit", the AI calls `submitTemplate(draft)` — draft is sent in the tool's input, not implicitly from context.

### C. Meta Template Constraints — CONFIRMED

[CITED: docs.360dialog.com/docs/resources/templates/template-elements, developers.facebook.com/documentation/business-messaging/whatsapp/templates/components/]

| Constraint | Value | Source |
|------------|-------|--------|
| HEADER TEXT max length | 60 chars | 360 Dialog + Meta |
| BODY max length | 1024 chars | 360 Dialog + Meta |
| FOOTER max length | 60 chars | 360 Dialog + Meta |
| BUTTON label max length | 25 chars | 360 Dialog (out of scope for this standalone) |
| HEADER TEXT max variables | 1 | Meta |
| BODY variables | Multiple allowed | Meta; must be sequential starting at `{{1}}`, no `{{0}}` |
| Template name | Only `[a-z0-9_]`, max 512 chars | Meta (confirmed across multiple secondary sources) |
| Language codes | `es`, `es_CO`, `en_US` all supported | [CITED: developers.facebook.com/docs/whatsapp/business-management-api/message-templates/supported-languages/] |
| Delete cooldown | 30 days on name reuse | Meta policy |
| Image MIME | `image/jpeg`, `image/png` | 360 Dialog |
| Image max size | 5 MB | 360 Dialog |
| Image format | 8-bit RGB or RGBA | 360 Dialog |
| `example.body_text` | Required when body has variables — array of arrays (only 1 sample row accepted: `[[val1, val2, ...]]`) | Meta + 360 |
| `example.header_text` | Required when header TEXT has `{{1}}` — array of strings | Meta + 360 |
| `example.header_handle` | Required when header format=IMAGE — array with 1 handle string | Meta + 360 |

**Category rule update (April 2025+):** Meta no longer rejects for category mismatch; it auto-reclassifies. The IA should still flag the mismatch to the user so they know billing implications [CITED: jestycrm.com/blog, spurnow.com/en/blogs — multiple independent sources confirm this change].

**Rejection patterns to inject into system prompt as "red flags":**
- Phrases like "Limited time offer!" / "You won't believe this!" / all-caps sales copy → flag as possible bulk-spam pattern
- Short URLs (`bit.ly`, `tinyurl.com`) → flag as phishing risk
- Requests for payment details / national ID / passwords → auto-reject
- Variables with special chars (`{{1$}}`, `{{#1}}`) → parse error
- Non-sequential variables (`{{1}}` then `{{3}}`) → reject
- Very generic body (`"Hola {{1}}"`) without context → sometimes rejected for low quality

### D. Image Handling Pitfalls — SOLVED

- **Supabase Storage helper pattern:** `src/app/actions/quick-replies.ts:360-376` — exactly the pattern we need. `.storage.from('whatsapp-media').upload(path, buffer, { contentType, upsert: false })`.
- **Local preview URL before upload:** Use `URL.createObjectURL(file)` in the client — instant preview, no network. Revoke in cleanup with `URL.revokeObjectURL`.
- **MIME validation:** Double-gate (client `<input accept="image/jpeg,image/png">` + server file.type check). Never trust extension.
- **Dimensions:** Meta doesn't enforce a min; WhatsApp displays headers as a ~4:3 area. Recommend in UI: at least 640×360, ideally 1200×628 (Open Graph-like). Don't enforce — warn only.
- **Caching:** Supabase Storage public URLs include a CDN token. No extra work needed — they're idempotent and cacheable.

### E. Data Model Alignment — NO MIGRATION NEEDED

The existing `whatsapp_templates` schema is sufficient:

```sql
-- From 20260131000002_whatsapp_extended_foundation.sql
CREATE TABLE whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'es',
  category TEXT NOT NULL CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED')),
  quality_rating TEXT CHECK (quality_rating IN ('HIGH', 'MEDIUM', 'LOW', 'PENDING')),
  rejected_reason TEXT,
  components JSONB NOT NULL,                -- includes example.header_handle for IMAGE
  variable_mapping JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  UNIQUE(workspace_id, name)
);
```

Fields for this standalone:
- `components` JSONB — stores everything including `example.header_handle = [handle]`. No schema change.
- `variable_mapping` JSONB — already present. `{"1": "contacto.nombre", ...}`.
- `submitted_at`, `rejected_reason`, `status` — already there.

**Optional enhancement** (nice to have, Claude decides in planning): Add `header_media_storage_path TEXT` column to remember the Supabase Storage path of the image used, so we can re-submit on retry/clone without re-asking the user for the file. Or store in `components[HEADER].example.header_handle[1]` (non-standard but retained in DB only; stripped before 360 call). **Recommendation:** Don't add a column; store the storage path in a new JSONB field `builder_metadata JSONB DEFAULT '{}'` if we need it — or just drop it (user can re-upload on retry). Keeps the schema clean for the SEND path that already works.

**Session table (Q1):** Either (a) `ALTER TABLE builder_sessions ADD COLUMN kind text NOT NULL DEFAULT 'automation'` OR (b) parallel `config_builder_sessions`. Either way, one migration.

### F. Variable Mapping Sources — CATALOGED

From `src/lib/automations/constants.ts:354+` (`VARIABLE_CATALOG`), the fields the IA can suggest for variable mapping fall into these namespaces:

| Namespace | Common paths |
|-----------|--------------|
| `contacto` | `.id`, `.nombre`, `.telefono`, `.email`, `.ciudad`, `.departamento`, `.direccion` |
| `orden` | `.id`, `.nombre`, `.valor`, `.pipeline`, `.pipeline_id`, `.stage`, `.stage_id`, `.direccion_envio`, `.ciudad_envio`, `.departamento_envio`, `.descripcion`, `.tracking_number`, `.carrier` |
| `tag` | `.nombre`, `.color` |
| `entidad` | `.tipo`, `.id` |
| `campo` | `.nombre`, `.valor_anterior`, `.valor_nuevo` |
| `mensaje` | `.contenido`, `.telefono`, `.keyword_matched` |
| `conversacion` | `.id` |
| `tarea` | `.id`, `.titulo`, `.descripcion` |

The system prompt should inject this as a cheat-sheet and tell the IA to suggest only paths from this catalog. `variable_mapping` JSONB stores the final mapping; at send-time, `resolveVariables()` from `src/lib/automations/variable-resolver.ts:50` already does the interpolation — reuse it for the preview-pane "realistic preview" mode that substitutes example values.

**Shipping-address rule from automation builder's system prompt (line 335):** copy verbatim. `contacto.*` is profile address, `orden.direccion_envio` etc. is shipping address — do NOT mix.

## Project Constraints (from CLAUDE.md)

Extracted actionable directives that affect this standalone:

| Directive | Source | Impact on This Standalone |
|-----------|--------|---------------------------|
| All DB mutations MUST go through `src/lib/domain/*` | CLAUDE.md Regla 3 | `whatsapp_templates` INSERT/UPDATE → `src/lib/domain/whatsapp-templates.ts`. The refactor of `src/app/actions/templates.ts:129` is required. |
| Domain uses `createAdminClient()`, filters by workspace_id | CLAUDE.md Regla 3 | Apply in every domain function. |
| Use `timezone('America/Bogota', NOW())` for DB timestamps; `toLocaleString('es-CO', { timeZone: 'America/Bogota' })` for frontend | CLAUDE.md Regla 2 | `submitted_at`, `approved_at` follow this. Chat UI should display times in es-CO format. |
| Always push to Vercel after changes before asking user to test | CLAUDE.md Regla 1 | Execution procedure — not a design constraint. |
| Migration BEFORE deploy if any | CLAUDE.md Regla 5 | If we add `kind` column to `builder_sessions` OR create new `config_builder_sessions`, migration goes first. Same for any `builder_metadata` JSONB column. |
| No code changes without approved GSD plan | CLAUDE.md Regla 0 | Planning (next phase) and execute phases follow — no autonomous edits. |
| Agent scope registered in `.claude/rules/agent-scope.md` before coding | `.claude/rules/agent-scope.md` | Decision D-15. Must add `config-builder-whatsapp-templates` scope entry before building system prompt + tools. |
| Agent NOT allowed to create resources outside its scope | `.claude/rules/agent-scope.md` | System prompt must explicitly forbid creating tags/pipelines/etapas/users. Can only create templates. |

## Sources

### Primary (HIGH confidence)

- [VERIFIED: docs.360dialog.com/docs/resources/templates/template-elements] — Template IMAGE header structure with `example.header_handle` accepting both resumable handles and URLs
- [VERIFIED: docs.360dialog.com/docs/resources/phone-numbers/business-profiles] — Full 2-step resumable upload flow for 360 Dialog with `D360-API-KEY` auth
- [VERIFIED: docs.360dialog.com/docs/waba-messaging/media/upload-retrieve-or-delete-media] — `/media` endpoint spec (confirms it's for SEND, 5 MB cap, image/jpeg + image/png)
- [VERIFIED: docs.360dialog.com/docs/messaging-api/api-reference/media-uploads] — Confirms `/uploads` (resumable) is a separate workflow returning `h` handle
- [VERIFIED: developers.facebook.com/docs/graph-api/guides/upload/] — Canonical Resumable Upload API spec (Meta direct; 360 proxies this)
- [VERIFIED: developers.facebook.com/docs/whatsapp/business-management-api/message-templates/supported-languages/] — `es`, `es_CO`, `en_US` all supported
- [VERIFIED: developers.facebook.com/documentation/business-messaging/whatsapp/templates/components/] — Character limits per component, variable syntax rules
- [VERIFIED: Existing project code] — `src/app/api/builder/chat/route.ts`, `src/lib/builder/tools.ts`, `src/app/actions/messages.ts:465` (SEND fix), `src/app/actions/quick-replies.ts:360-376` (Storage upload), `src/lib/whatsapp/templates-api.ts:47` (existing createTemplate360), migration `20260131000002_whatsapp_extended_foundation.sql` (template schema), migration `20260131000000_storage_bucket.sql` (whatsapp-media bucket)

### Secondary (MEDIUM confidence — multiple independent sources agree)

- [CITED: jestycrm.com/blog, spurnow.com/en/blogs] — Meta's April 2025 category auto-reclassification change
- [CITED: wati.io, respond.io, multiple others] — 30-day delete cooldown on template names
- [CITED: Medium article by Daniel Eduardo Darritchon on Python resumable upload troubleshooting] — Real-world confirmation that the `file_offset: 0` pattern is the working invocation

### Tertiary (LOW confidence — single source)

- [ASSUMED — A1] Handles get faster/better review than URLs in `example.header_handle` — based on Meta doc examples consistently showing handles and single community source saying URLs face stricter review. **Flag for validation during planning.**

## Metadata

**Confidence breakdown:**
- Standard stack (versions, compatibility): HIGH — verified via `npm view`
- 360 Dialog upload flow: HIGH — confirmed against official 360 Dialog docs + Meta Graph docs
- Template constraints (char limits, variables, languages): HIGH — multiple authoritative sources
- Architecture pattern (AI SDK reuse): HIGH — reading existing working code in the project
- Domain layer shape: HIGH — mirrors established pattern in `src/lib/domain/tags.ts` etc.
- Category auto-reclassification: MEDIUM — secondary sources agree but not Meta-direct confirmation
- URL vs handle preference: LOW — one flag for user confirmation (Open Q5)

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — AI SDK v6 and 360 Dialog API are stable; Meta policy can shift but major changes are rare)
