---
phase: whatsapp-template-ai-builder
plan: 03
type: execute
wave: 3
depends_on: [01, 02]
files_modified:
  - src/lib/config-builder/templates/types.ts
  - src/lib/config-builder/templates/validation.ts
  - src/lib/config-builder/templates/system-prompt.ts
  - src/lib/config-builder/templates/tools.ts
  - src/app/api/config-builder/templates/chat/route.ts
  - src/app/api/config-builder/templates/upload/route.ts
autonomous: true
requirements: [D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14, D-15]
user_setup: []

must_haves:
  truths:
    - "Types file declares TemplateDraft and TemplateBuilderToolContext used across tools + UI (D-13)"
    - "Validation is shared between AI tool path and manual form path (name regex, 60/1024/60 char limits, sequential variables)"
    - "System prompt enforces agent scope, injects VARIABLE_CATALOG, explains MARKETING/UTILITY/AUTHENTICATION, teaches natural-language-to-{{N}} transformation, flags rejection patterns (D-03, D-04, D-08, D-09, D-15)"
    - "Tools are exactly 6: listExistingTemplates, suggestCategory, suggestLanguage, captureVariableMapping, validateTemplateDraft, submitTemplate (matches stepCountIs(6) in agent scope)"
    - "submitTemplate tool calls ONLY createTemplate from src/lib/domain/whatsapp-templates.ts — no createAdminClient.insert, no createTemplate360 direct (Regla 3, D-14)"
    - "Chat route at /api/config-builder/templates/chat does auth → workspace → membership → streamText with stepCountIs(6), using kind='template' for sessions (D-13)"
    - "Upload route at /api/config-builder/templates/upload accepts multipart, validates MIME ∈ {image/jpeg, image/png}, size ≤ 5MB, stores under whatsapp-media/templates/{workspaceId}/... (D-10, D-11, D-12)"
    - "All tool execute functions return discriminated union { success } | { error } — never throw"
  artifacts:
    - path: "src/lib/config-builder/templates/types.ts"
      provides: "TemplateDraft, TemplateBuilderToolContext, shared types"
      contains: "export interface TemplateBuilderToolContext"
    - path: "src/lib/config-builder/templates/validation.ts"
      provides: "validateDraft + name sanitizer shared between AI and manual paths"
      contains: "export function validateDraft"
    - path: "src/lib/config-builder/templates/system-prompt.ts"
      provides: "buildTemplatesSystemPrompt(workspaceId): string"
      contains: "export function buildTemplatesSystemPrompt"
    - path: "src/lib/config-builder/templates/tools.ts"
      provides: "createTemplateBuilderTools(ctx) factory with 6 tools"
      contains: "export function createTemplateBuilderTools"
    - path: "src/app/api/config-builder/templates/chat/route.ts"
      provides: "POST handler using streamText + createTemplateBuilderTools"
      contains: "streamText"
    - path: "src/app/api/config-builder/templates/upload/route.ts"
      provides: "POST handler for header image Storage upload"
      contains: "from('whatsapp-media').upload"
  key_links:
    - from: "src/app/api/config-builder/templates/chat/route.ts"
      to: "src/lib/config-builder/templates/tools.ts:createTemplateBuilderTools"
      via: "factory call in handler"
      pattern: "createTemplateBuilderTools"
    - from: "src/lib/config-builder/templates/tools.ts:submitTemplate"
      to: "src/lib/domain/whatsapp-templates.ts:createTemplate"
      via: "direct import + call inside execute"
      pattern: "from '@/lib/domain/whatsapp-templates'"
    - from: "src/app/api/config-builder/templates/chat/route.ts"
      to: "src/lib/builder/session-store.ts"
      via: "createSession with kind='template'"
      pattern: "kind: 'template'|'template'"
    - from: "src/app/api/config-builder/templates/upload/route.ts"
      to: "supabase.storage.from('whatsapp-media')"
      via: "upload call"
      pattern: "templates/\\${workspaceId}"
---

<objective>
Build the backend surface that powers the AI template builder: types, validation, system prompt, AI SDK tools, streaming chat route, and image upload route. This is the largest plan — it groups all server-side AI scaffolding because the components are tightly coupled (tools import types, chat route imports tools + prompt, validation is shared, etc.). Running them in one wave avoids whipsawing between files and keeps the executor in one mental model.

Purpose: Close the CREATE gap (D-16, D-17) with an AI-guided flow (D-03, D-04). Enforce the agent scope registered in Plan 01 (D-15) at the system-prompt + tool level. Route all mutations through the domain module from Plan 02 (D-14). Reuse the AI SDK v6 pattern from the production automation builder WITHOUT modifying it (D-13, Regla 6).

Output: `src/lib/config-builder/templates/` module (4 files) + `src/app/api/config-builder/templates/` routes (2 files).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.claude/rules/agent-scope.md
@.planning/standalone/whatsapp-template-ai-builder/CONTEXT.md
@.planning/standalone/whatsapp-template-ai-builder/RESEARCH.md
@.planning/standalone/whatsapp-template-ai-builder/PATTERNS.md
@.planning/standalone/whatsapp-template-ai-builder/02-SUMMARY.md

<interfaces>
From src/lib/domain/whatsapp-templates.ts (created Plan 02):
```typescript
export interface CreateTemplateParams {
  name: string
  language: string
  category: TemplateCategory
  components: TemplateComponent[]
  variableMapping: Record<string, string>
  headerImage?: { storagePath: string; mimeType: 'image/jpeg' | 'image/png' }
  apiKey: string
}
export async function createTemplate(ctx: DomainContext, params: CreateTemplateParams): Promise<DomainResult<Template>>
```

From src/lib/builder/session-store.ts (extended Plan 01 — accepts kind param):
```typescript
export async function createSession(workspaceId: string, userId: string, title?: string, kind?: 'automation' | 'template'): Promise<BuilderSession | null>
export async function getSession(sessionId: string, workspaceId: string): Promise<BuilderSession | null>
export async function updateSession(sessionId: string, workspaceId: string, patch: Partial<BuilderSession>): Promise<void>
```

From src/lib/automations/constants.ts (existing — inject as catalog into system prompt):
- VARIABLE_CATALOG is the object listing valid `contacto.*`, `orden.*`, `mensaje.*` paths etc.

From src/lib/builder/system-prompt.ts (existing analog — read for tone + structure, especially lines 114-347):
- buildSystemPrompt(workspaceId): string

From src/lib/builder/tools.ts (existing analog — read for tool structure + error-handling pattern):
- createBuilderTools(ctx): { listPipelines: tool(...), ... }
- All tools return `{ success: ... } | { error: string }` — never throw inside execute

From src/app/api/builder/chat/route.ts (existing analog — near-verbatim clone with 3 swaps):
- Auth gate (lines 42-76)
- Session persistence pattern (lines 125-155)
- streamText with stopWhen: stepCountIs(N), onFinish: updateSession
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 3.1: Create types + validation modules</name>
  <files>src/lib/config-builder/templates/types.ts, src/lib/config-builder/templates/validation.ts</files>
  <read_first>
    - src/lib/builder/types.ts (analog — BuilderToolContext, BuilderSession shape)
    - src/lib/builder/validation.ts (analog — structural reference; see how tools import it at src/lib/builder/tools.ts:12-15)
    - src/app/actions/templates.ts (current name-cleanup logic around lines 149-167 — move/mirror here)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (sections: `src/lib/config-builder/templates/types.ts` and `src/lib/config-builder/templates/validation.ts`)
    - .planning/standalone/whatsapp-template-ai-builder/CONTEXT.md (D-05, D-06, D-09 — component scope + language list)
  </read_first>
  <behavior>
    - validateDraft({ name: '', body: {text: 'x'}, ... }) → { ok: false, errors: ['nombre requerido'] }
    - validateDraft({ body: { text: 'x'.repeat(1025) } }) → { ok: false, errors: ['Body supera 1024 chars'] }
    - validateDraft({ body: { text: 'Hola {{2}}' }, ... }) → { ok: false, errors: ['Variables deben ser secuenciales desde {{1}}'] }
    - validateDraft({ name: 'Valid_Name', language: 'fr', ... }) → { ok: false, errors: ['Idioma no soportado'] }
    - validateDraft(valid draft with TEXT header 60 chars, body 1024 chars, footer 60 chars, sequential {{1}}{{2}}) → { ok: true }
    - sanitizeName('Hola Mundo!!') → 'hola_mundo'
  </behavior>
  <action>
    **File A — `src/lib/config-builder/templates/types.ts`:**

    ```typescript
    // ============================================================================
    // Standalone: whatsapp-template-ai-builder
    // Shared types for the Config Builder > WhatsApp Templates flow.
    // Imported by tools, system-prompt, validation, route handlers, and UI.
    // ============================================================================

    export interface TemplateBuilderToolContext {
      workspaceId: string
      userId: string
    }

    export type TemplateLanguage = 'es' | 'es_CO' | 'en_US'
    export type TemplateCategoryEnum = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
    export type TemplateHeaderFormat = 'NONE' | 'TEXT' | 'IMAGE'

    /**
     * TemplateDraft — the live state of the builder.
     * Consumed by the AI (via tool params) AND the UI (via context reducer).
     */
    export interface TemplateDraft {
      name: string
      language: TemplateLanguage
      category: TemplateCategoryEnum
      headerFormat: TemplateHeaderFormat
      headerText: string
      headerImageStoragePath: string | null
      headerImageLocalUrl: string | null
      bodyText: string
      footerText: string
      variableMapping: Record<string, string>  // {"1": "contacto.nombre"}
      bodyExamples: Record<string, string>     // {"1": "Juan"}
      headerExamples: Record<string, string>
    }

    export type TemplateBuilderKind = 'template'  // future-proofing
    ```

    **File B — `src/lib/config-builder/templates/validation.ts`:**

    ```typescript
    import type { TemplateDraft, TemplateLanguage } from './types'

    const SUPPORTED_LANGUAGES: TemplateLanguage[] = ['es', 'es_CO', 'en_US']
    const NAME_REGEX = /^[a-z0-9_]+$/
    const MAX_NAME = 512
    const MAX_HEADER_TEXT = 60
    const MAX_BODY = 1024
    const MAX_FOOTER = 60

    export function sanitizeName(raw: string): string {
      return raw
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
    }

    export function extractVarIndices(text: string): number[] {
      const matches = text.match(/\{\{(\d+)\}\}/g) || []
      return [...new Set(matches.map((m) => Number(m.replace(/[{}]/g, ''))))].sort((a, b) => a - b)
    }

    export interface ValidateDraftResult {
      ok: boolean
      errors: string[]
    }

    export function validateDraft(draft: TemplateDraft): ValidateDraftResult {
      const errors: string[] = []

      // --- Name ---
      if (!draft.name.trim()) {
        errors.push('El nombre es requerido')
      } else if (!NAME_REGEX.test(draft.name)) {
        errors.push('El nombre solo puede contener minusculas, numeros y guiones bajos')
      } else if (draft.name.length > MAX_NAME) {
        errors.push(`El nombre supera el maximo de ${MAX_NAME} caracteres`)
      }

      // --- Language ---
      if (!SUPPORTED_LANGUAGES.includes(draft.language)) {
        errors.push(`Idioma no soportado: ${draft.language}. Usa es, es_CO, o en_US`)
      }

      // --- Category ---
      if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(draft.category)) {
        errors.push(`Categoria invalida: ${draft.category}`)
      }

      // --- Header (optional) ---
      if (draft.headerFormat === 'TEXT') {
        if (!draft.headerText.trim()) {
          errors.push('Header TEXT requiere texto')
        } else if (draft.headerText.length > MAX_HEADER_TEXT) {
          errors.push(`Header supera ${MAX_HEADER_TEXT} caracteres`)
        }
        const hVars = extractVarIndices(draft.headerText)
        if (hVars.length > 1) {
          errors.push('Header TEXT solo admite 1 variable')
        }
      }
      if (draft.headerFormat === 'IMAGE' && !draft.headerImageStoragePath) {
        errors.push('Header IMAGE requiere una imagen subida')
      }

      // --- Body (required) ---
      if (!draft.bodyText.trim()) {
        errors.push('El cuerpo (body) es obligatorio')
      } else if (draft.bodyText.length > MAX_BODY) {
        errors.push(`Body supera ${MAX_BODY} caracteres`)
      }
      const bodyVars = extractVarIndices(draft.bodyText)
      // Sequential check: must start at 1 and be contiguous
      for (let i = 0; i < bodyVars.length; i++) {
        if (bodyVars[i] !== i + 1) {
          errors.push('Las variables deben ser secuenciales desde {{1}} sin saltos')
          break
        }
      }

      // --- Footer (optional) ---
      if (draft.footerText && draft.footerText.length > MAX_FOOTER) {
        errors.push(`Footer supera ${MAX_FOOTER} caracteres`)
      }

      // --- Variable mapping coverage ---
      for (const idx of bodyVars) {
        if (!draft.variableMapping[String(idx)]) {
          errors.push(`Falta mapping para variable {{${idx}}}`)
        }
      }

      // --- Body examples coverage ---
      for (const idx of bodyVars) {
        if (!draft.bodyExamples[String(idx)]) {
          errors.push(`Falta ejemplo para variable {{${idx}}} en body_text (requerido por Meta)`)
        }
      }

      return { ok: errors.length === 0, errors }
    }
    ```

    Do NOT import Zod here. Zod is for the TOOL input schema (Task 3.3). This module is a pure-function validator used by the tool's `validateTemplateDraft` and potentially by the future refactor of the manual form.
  </action>
  <verify>
    <automated>test -f src/lib/config-builder/templates/types.ts &amp;&amp; test -f src/lib/config-builder/templates/validation.ts &amp;&amp; grep -q "export interface TemplateBuilderToolContext" src/lib/config-builder/templates/types.ts &amp;&amp; grep -q "export interface TemplateDraft" src/lib/config-builder/templates/types.ts &amp;&amp; grep -q "'es' | 'es_CO' | 'en_US'" src/lib/config-builder/templates/types.ts &amp;&amp; grep -q "export function validateDraft" src/lib/config-builder/templates/validation.ts &amp;&amp; grep -q "export function sanitizeName" src/lib/config-builder/templates/validation.ts &amp;&amp; grep -q "extractVarIndices" src/lib/config-builder/templates/validation.ts &amp;&amp; cd /mnt/c/Users/Usuario/Proyectos/morfx-new &amp;&amp; npx tsc --noEmit -p . 2>&amp;1 | grep "config-builder/templates" | head -5</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/config-builder/templates/types.ts` exists and exports `TemplateBuilderToolContext`, `TemplateDraft`, `TemplateLanguage`, `TemplateCategoryEnum`, `TemplateHeaderFormat`
    - `TemplateLanguage` includes `'es_CO'` (D-09)
    - `TemplateHeaderFormat` is exactly `'NONE' | 'TEXT' | 'IMAGE'` — no VIDEO, no DOCUMENT (D-05)
    - `src/lib/config-builder/templates/validation.ts` exports `validateDraft`, `sanitizeName`, `extractVarIndices`
    - `validateDraft` enforces: name regex, language enum, category enum, header TEXT ≤60, body 1..1024, footer ≤60, sequential vars, 1-var-max on header, mapping coverage
    - No Zod import in validation.ts
    - No import of domain or route-handler code (these are pure utilities)
    - `npx tsc --noEmit` reports zero errors in both files
  </acceptance_criteria>
  <done>Types and validation compile standalone; are importable by tools, route handlers, and UI.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.2: Create system-prompt builder</name>
  <files>src/lib/config-builder/templates/system-prompt.ts</files>
  <read_first>
    - src/lib/builder/system-prompt.ts (full file — lines 114-347 in particular; includes VARIABLE_CATALOG usage at line 335)
    - src/lib/automations/constants.ts (lines ~354+ where VARIABLE_CATALOG lives)
    - .planning/standalone/whatsapp-template-ai-builder/RESEARCH.md (search for sections on rejection patterns, flagged language, category reclassification — Common Pitfalls section)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (section: `src/lib/config-builder/templates/system-prompt.ts`)
    - .planning/standalone/whatsapp-template-ai-builder/CONTEXT.md (D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-15 — all encoded in the prompt)
  </read_first>
  <action>
    Create `src/lib/config-builder/templates/system-prompt.ts`:

    ```typescript
    import { VARIABLE_CATALOG } from '@/lib/automations/constants'

    /**
     * buildTemplatesSystemPrompt
     *
     * System prompt for the Config Builder > WhatsApp Templates agent.
     * Encodes:
     *  - Scope (from .claude/rules/agent-scope.md: config-builder-whatsapp-templates)
     *  - Natural-language-to-{{N}} transformation rules (D-03)
     *  - Variable mapping capture during chat (D-04)
     *  - Component scope: TEXT/IMAGE header, BODY required, FOOTER optional, NO buttons (D-05, D-06, D-07)
     *  - Category + language recommendations (D-08, D-09)
     *  - Meta rejection flag patterns (RESEARCH.md C)
     *  - Prohibitions per agent scope (D-15)
     */
    export function buildTemplatesSystemPrompt(_workspaceId: string): string {
      const variableCatalog = formatVariableCatalog()

      return `# Asistente de Plantillas de WhatsApp Business

## Rol
Eres un asistente experto en plantillas de WhatsApp Business. Tu trabajo es ayudar al usuario a crear plantillas que Meta aprobara en su revision. Respondes en espanol siempre.

## Reglas de Comportamiento

### Flujo guiado
1. El usuario describe en lenguaje natural el mensaje que quiere enviar (ej: "quiero un mensaje para confirmar pedidos").
2. Tu propones un primer borrador: name, category, language, header (opcional), body (obligatorio), footer (opcional).
3. Cuando el usuario escribe placeholders de cualquier forma — \`()\`, \`[nombre]\`, \`nombre\`, \`{{1}}\`, "nombre del cliente" — tu los transformas al formato Meta \`{{1}}\`, \`{{2}}\`, ... secuenciales desde 1, SIN saltos.
4. Para cada variable \`{{N}}\`, captura el \`variable_mapping\`: una ruta del catalogo de variables (ej: \`contacto.nombre\`, \`orden.numero\`). Si no hay una ruta exacta, pregunta al usuario o asume una razonable del catalogo y explicala.
5. Antes de \`submitTemplate\`, llama a \`validateTemplateDraft\` y muestra el preview al usuario pidiendo confirmacion explicita.

### Scope (CRITICO)
Tu scope esta registrado en \`.claude/rules/agent-scope.md\` como \`config-builder-whatsapp-templates\`.

**PUEDES:**
- Crear plantillas de WhatsApp (via la tool \`submitTemplate\`, que llama al domain \`createTemplate\`)
- Subir imagenes de header (via la tool que recibe \`storagePath\` del upload endpoint)
- Consultar plantillas existentes (\`listExistingTemplates\`) para detectar duplicados

**NO PUEDES:**
- Editar o eliminar plantillas ya creadas (Meta solo permite eliminar + recrear)
- Crear tags, pipelines, etapas, contactos, pedidos, tareas, usuarios
- Enviar mensajes de WhatsApp
- Crear recursos que no existan en el workspace — si el usuario menciona uno, ADVIERTE y pide que lo cree manualmente

### Componentes Soportados
- **Header:** NONE | TEXT (max 60 chars, max 1 variable) | IMAGE (jpg/png, max 5 MB). NO se soportan VIDEO ni DOCUMENT en este builder.
- **Body:** OBLIGATORIO. Max 1024 chars. Puede tener variables \`{{1}}\`...\`{{N}}\` secuenciales.
- **Footer:** Opcional. Max 60 chars. Sin variables.
- **Botones:** NO soportados en este builder. Si el usuario los pide, explica que estan planeados para un release futuro y ofrece omitirlos.

### Categorias (la IA recomienda, usuario confirma)
- **MARKETING:** Promociones, anuncios, invitaciones a comprar. Ejemplo: "Oferta especial -20% hasta el viernes".
- **UTILITY:** Confirmaciones, actualizaciones de cuenta, recordatorios transaccionales. Ejemplo: "Tu pedido #1234 llega manana".
- **AUTHENTICATION:** OTP, codigos de verificacion. Usa variables numericas. Ejemplo: "Tu codigo es {{1}}".

**IMPORTANTE (April 2025 de Meta):** Si clasificas algo como UTILITY pero Meta detecta contenido promocional, lo reclasifica a MARKETING automaticamente SIN avisar (y el costo cambia). Revisa dos veces que una UTILITY no incluya lenguaje de venta.

### Idiomas Soportados
\`es\` (espanol generico), \`es_CO\` (espanol de Colombia — usa si detectas colombianismos como "parcero", "bacano", "qué chévere", "a la orden", "gonorrea" en un prompt directo, u otros marcadores regionales), \`en_US\` (ingles). Si el usuario escribe en otro idioma, pregunta cual usar.

### Patrones que Meta Rechaza (FLAGGEA ANTES de submit)
- URLs acortadas (bit.ly, t.co, ow.ly, etc.) — usa URL completa
- Texto todo en MAYUSCULAS como grito de venta
- Pedir datos personales sensibles (numeros de tarjeta, CVV, SSN, claves)
- Pedir pagos fuera de canales oficiales
- Variables no secuenciales (ej: \`{{1}} {{3}}\` sin \`{{2}}\`)
- Variables repetidas (\`{{1}} {{1}}\`)
- Header con mas de 1 variable
- Palabras prohibidas por Meta para promociones: "gratis absolutamente sin compromiso", amenazas urgentes, etc.

Si detectas alguno de estos, ADVIERTE al usuario antes de llamar \`submitTemplate\`.

### Sintaxis de Variables (CRITICO)
- Siempre \`{{N}}\` con dobles llaves.
- Secuenciales desde \`{{1}}\`, sin saltos.
- Header: maximo 1 variable.
- El \`example.body_text\` (ejemplos que Meta muestra al revisor) DEBE tener un valor para cada variable — pide al usuario si no lo infieres.

### Catalogo de Variables (rutas validas para variable_mapping)

${variableCatalog}

### Regla de Direcciones (importante, copiada del builder de automatizaciones)
- \`contacto.*\` (p.ej. \`contacto.direccion\`) es la direccion del PERFIL del contacto (donde vive).
- \`orden.direccion_envio\` es la direccion a DONDE va el envio de ese pedido especifico.
- Si el usuario no es explicito, pregunta cual usar. NUNCA los mezcles.

### Flujo de Imagenes (HEADER IMAGE)
1. El usuario sube la imagen en la UI → esta se sube a Supabase Storage → el frontend te envia el \`storagePath\` resultante.
2. Cuando el usuario confirme, incluyes \`header.format='IMAGE'\` + \`storagePath\` + \`mimeType\` en los params de \`submitTemplate\`.
3. El domain descarga la imagen de Storage y la sube a 360 Dialog via resumable upload para obtener el handle permanente que Meta usa en la revision.
4. Formatos validos: image/jpeg, image/png. Tamano maximo: 5 MB.

### Prohibiciones
- **NUNCA** llames \`submitTemplate\` sin confirmacion explicita del usuario ("confirmo", "envialo", "si crealo").
- **NUNCA** crees recursos fuera de plantillas (tags, etapas, etc.).
- **NUNCA** inventes una API key; si no esta configurada en el workspace, la tool devolvera error y el usuario tendra que configurarla.
- **NUNCA** envies un template con variables no secuenciales; llama primero \`validateTemplateDraft\`.
`
    }

    /**
     * Formats VARIABLE_CATALOG from src/lib/automations/constants.ts into a
     * terse cheat sheet the model can reference. Reuses the same catalog as
     * the automation builder to keep mapping semantics consistent.
     */
    function formatVariableCatalog(): string {
      // VARIABLE_CATALOG shape: Record<string, { label: string; example: string }>
      // (verify actual shape when implementing; adapt below)
      const entries = Object.entries(VARIABLE_CATALOG)
      return entries
        .map(([path, meta]: [string, { label?: string; example?: string } | unknown]) => {
          if (typeof meta === 'object' && meta && 'label' in meta) {
            const m = meta as { label?: string; example?: string }
            return `- \`${path}\` — ${m.label || path}${m.example ? ` (ej: ${m.example})` : ''}`
          }
          return `- \`${path}\``
        })
        .join('\n')
    }
    ```

    If the shape of `VARIABLE_CATALOG` in `src/lib/automations/constants.ts` differs from the `{ label, example }` sketch above, adapt `formatVariableCatalog` accordingly — but keep the function signature `formatVariableCatalog(): string` so the prompt template stays intact.

    If `_workspaceId` is unused, prefix with `_` as shown to silence the unused-var lint.
  </action>
  <verify>
    <automated>test -f src/lib/config-builder/templates/system-prompt.ts &amp;&amp; grep -q "export function buildTemplatesSystemPrompt" src/lib/config-builder/templates/system-prompt.ts &amp;&amp; grep -q "VARIABLE_CATALOG" src/lib/config-builder/templates/system-prompt.ts &amp;&amp; grep -q "config-builder-whatsapp-templates" src/lib/config-builder/templates/system-prompt.ts &amp;&amp; grep -q "es_CO" src/lib/config-builder/templates/system-prompt.ts &amp;&amp; grep -q "MARKETING" src/lib/config-builder/templates/system-prompt.ts &amp;&amp; grep -q "UTILITY" src/lib/config-builder/templates/system-prompt.ts &amp;&amp; grep -q "AUTHENTICATION" src/lib/config-builder/templates/system-prompt.ts &amp;&amp; ! grep -q "VIDEO" src/lib/config-builder/templates/system-prompt.ts &amp;&amp; cd /mnt/c/Users/Usuario/Proyectos/morfx-new &amp;&amp; npx tsc --noEmit -p . 2>&amp;1 | grep "system-prompt.ts" | head -5</automated>
  </verify>
  <acceptance_criteria>
    - Exports `buildTemplatesSystemPrompt(workspaceId: string): string`
    - Imports `VARIABLE_CATALOG` from `@/lib/automations/constants`
    - Prompt string mentions the agent scope ID `config-builder-whatsapp-templates`
    - Prompt string contains all three categories and all three languages (including `es_CO`)
    - Prompt string mentions all 6 tools by name (list, suggestCategory, suggestLanguage, captureVariableMapping, validateTemplateDraft, submitTemplate) — verified by checking mentions of at least `submitTemplate` and `validateTemplateDraft`
    - Prompt string does NOT mention VIDEO or DOCUMENT (scope D-05)
    - Prompt string contains rejection flag guidance (URLs acortadas, MAYUSCULAS, etc.)
    - `npx tsc --noEmit` reports zero errors
  </acceptance_criteria>
  <done>System prompt builder compiles; catalog is injected; scope + D-XX decisions are textually encoded.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.3: Create tools factory with 6 AI SDK tools</name>
  <files>src/lib/config-builder/templates/tools.ts</files>
  <read_first>
    - src/lib/builder/tools.ts (full file — especially lines 179-220 for `listPipelines` pattern, plus the error-handling `{ success } | { error }` convention)
    - src/lib/domain/whatsapp-templates.ts (created Plan 02 — `createTemplate` signature)
    - src/lib/config-builder/templates/types.ts (from Task 3.1)
    - src/lib/config-builder/templates/validation.ts (from Task 3.1)
    - .planning/standalone/whatsapp-template-ai-builder/RESEARCH.md (Example 3, lines 714-854 — exact submitTemplate code)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (section: `src/lib/config-builder/templates/tools.ts`)
    - .claude/rules/agent-scope.md (the scope entry added in Plan 01 — mandates zero createAdminClient.insert in this file)
  </read_first>
  <behavior>
    - listExistingTemplates(ctx) → { success: true, templates: [{id, name, category, status}, ...] } — reads via direct supabase query filtered by workspace (acceptable: this is non-mutating and matches the crm-reader pattern via domain path; but since there's no domain getter yet, it's OK to use createAdminClient for READ here; document it)
    - suggestCategory({ bodyText, headerText, footerText }) → { success: true, category: 'MARKETING'|'UTILITY'|'AUTHENTICATION', reason: string } — pure reasoning; no DB
    - suggestLanguage({ bodyText, headerText }) → { success: true, language: 'es'|'es_CO'|'en_US', reason: string } — pure reasoning
    - captureVariableMapping({ varIndex, field }) → validates `field` against VARIABLE_CATALOG; returns { success: true, path: field } or { error: "ruta no existe en catalogo" }
    - validateTemplateDraft(draft) → uses validateDraft() from validation.ts; returns { success: true } or { error: joined errors }
    - submitTemplate(all params) → calls `createTemplate` from domain (NEVER direct createAdminClient.insert or createTemplate360); returns { success: true, templateId } or { error }
  </behavior>
  <action>
    Create `src/lib/config-builder/templates/tools.ts`.

    **CRITICAL INVARIANT (from `.claude/rules/agent-scope.md` entry created in Plan 01):** This file MUST NOT contain `createAdminClient()` followed by `.from('whatsapp_templates').insert(` — all writes must go through the domain. READ operations (listExistingTemplates) CAN use `createAdminClient` directly since they are non-mutating, but ideally they go through a domain getter; since we did not create one in Plan 02, inline READ is acceptable here. The scope governance verifier will grep for `.insert(` — zero matches in this file is the rule.

    Full file content:

    ```typescript
    import { tool } from 'ai'
    import { z } from 'zod'
    import { createAdminClient } from '@/lib/supabase/admin'
    import { createTemplate } from '@/lib/domain/whatsapp-templates'
    import { validateDraft, sanitizeName } from './validation'
    import { VARIABLE_CATALOG } from '@/lib/automations/constants'
    import type { TemplateBuilderToolContext, TemplateDraft } from './types'
    import type { TemplateComponent } from '@/lib/whatsapp/types'

    export function createTemplateBuilderTools(ctx: TemplateBuilderToolContext) {
      return {
        // --------------------------------------------------------------------
        // 1. listExistingTemplates — READ only (dedup + 30-day cooldown check)
        // --------------------------------------------------------------------
        listExistingTemplates: tool({
          description:
            'Lista plantillas existentes del workspace. Usar para detectar duplicados por nombre o cooldown de 30 dias tras rejected.',
          inputSchema: z.object({}),
          execute: async (): Promise<
            | { success: true; templates: Array<{ id: string; name: string; category: string; status: string; language: string }> }
            | { error: string }
          > => {
            try {
              const supabase = createAdminClient()
              const { data, error } = await supabase
                .from('whatsapp_templates')
                .select('id, name, category, status, language, created_at')
                .eq('workspace_id', ctx.workspaceId)
                .order('created_at', { ascending: false })
                .limit(50)
              if (error) return { error: `Error consultando templates: ${error.message}` }
              return { success: true, templates: (data || []) as Array<{ id: string; name: string; category: string; status: string; language: string }> }
            } catch (err) {
              return { error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}` }
            }
          },
        }),

        // --------------------------------------------------------------------
        // 2. suggestCategory — pure reasoning
        // --------------------------------------------------------------------
        suggestCategory: tool({
          description:
            'Sugiere la categoria Meta (MARKETING / UTILITY / AUTHENTICATION) segun el contenido del mensaje. Revisa que UTILITY no incluya lenguaje de venta (Meta reclasifica desde abril 2025).',
          inputSchema: z.object({
            bodyText: z.string(),
            headerText: z.string().optional(),
            footerText: z.string().optional(),
          }),
          execute: async (params): Promise<{ success: true; category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'; reason: string } | { error: string }> => {
            // Simple heuristic — the model does the real classification; this tool gives it a structured path.
            const combined = [params.bodyText, params.headerText || '', params.footerText || ''].join(' ').toLowerCase()
            const otpHints = /\b(codigo|otp|verifica|pin)\b/.test(combined) && /\{\{\d+\}\}/.test(combined)
            const marketingHints = /\b(oferta|descuento|promo|gratis|compra ya|ultimas horas|-\d+%)\b/.test(combined)
            let category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' = 'UTILITY'
            let reason = 'Transaccional/informativa por defecto'
            if (otpHints) {
              category = 'AUTHENTICATION'
              reason = 'Detectado codigo/OTP con variable numerica'
            } else if (marketingHints) {
              category = 'MARKETING'
              reason = 'Detectado lenguaje promocional (oferta/descuento/gratis)'
            }
            return { success: true, category, reason }
          },
        }),

        // --------------------------------------------------------------------
        // 3. suggestLanguage — pure reasoning
        // --------------------------------------------------------------------
        suggestLanguage: tool({
          description:
            'Sugiere el idioma (es / es_CO / en_US) segun el contenido. es_CO si detecta colombianismos.',
          inputSchema: z.object({
            bodyText: z.string(),
            headerText: z.string().optional(),
          }),
          execute: async (params): Promise<{ success: true; language: 'es' | 'es_CO' | 'en_US'; reason: string } | { error: string }> => {
            const combined = [params.bodyText, params.headerText || ''].join(' ').toLowerCase()
            const englishHints = /\b(the|and|your|order|hello|please)\b/.test(combined)
            const coHints = /\b(parcero|chevere|bacano|a la orden|quiubo|papi|mijo|mija)\b/.test(combined)
            let language: 'es' | 'es_CO' | 'en_US' = 'es'
            let reason = 'Espanol generico'
            if (englishHints && !coHints) {
              language = 'en_US'
              reason = 'Detectadas palabras en ingles'
            } else if (coHints) {
              language = 'es_CO'
              reason = 'Detectados colombianismos'
            }
            return { success: true, language, reason }
          },
        }),

        // --------------------------------------------------------------------
        // 4. captureVariableMapping — validates catalog path
        // --------------------------------------------------------------------
        captureVariableMapping: tool({
          description:
            'Captura el mapping de una variable {{N}} a una ruta del catalogo (contacto.nombre, orden.numero, etc.). Valida que la ruta exista en VARIABLE_CATALOG.',
          inputSchema: z.object({
            varIndex: z.number().int().min(1),
            path: z.string().min(1),
          }),
          execute: async (params): Promise<{ success: true; varIndex: number; path: string } | { error: string }> => {
            const valid = Object.keys(VARIABLE_CATALOG).includes(params.path)
            if (!valid) {
              return {
                error: `Ruta "${params.path}" no existe en el catalogo. Usa una de: ${Object.keys(VARIABLE_CATALOG).slice(0, 10).join(', ')}... (ver catalogo completo en system prompt).`,
              }
            }
            return { success: true, varIndex: params.varIndex, path: params.path }
          },
        }),

        // --------------------------------------------------------------------
        // 5. validateTemplateDraft — shared validator
        // --------------------------------------------------------------------
        validateTemplateDraft: tool({
          description:
            'Valida el draft completo contra las reglas de Meta (char limits, variables secuenciales, nombre). Llamar ANTES de submitTemplate.',
          inputSchema: z.object({
            draft: z.custom<TemplateDraft>(),
          }),
          execute: async (params): Promise<{ success: true } | { error: string; errors: string[] }> => {
            const result = validateDraft(params.draft)
            if (result.ok) return { success: true }
            return { error: 'Validacion fallo', errors: result.errors }
          },
        }),

        // --------------------------------------------------------------------
        // 6. submitTemplate — THE mutation. Runs only after user confirmation.
        // --------------------------------------------------------------------
        submitTemplate: tool({
          description:
            'Crea el template y lo envia a 360 Dialog para revision de Meta. SOLO llamar cuando el usuario haya confirmado explicitamente el preview.',
          inputSchema: z.object({
            name: z.string().min(1).max(512).regex(/^[a-z0-9_]+$/, 'Solo minusculas, numeros y guiones bajos'),
            language: z.enum(['es', 'es_CO', 'en_US']),
            category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
            header: z
              .discriminatedUnion('format', [
                z.object({ format: z.literal('NONE') }),
                z.object({
                  format: z.literal('TEXT'),
                  text: z.string().min(1).max(60),
                  exampleValue: z.string().optional(),
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
              exampleValues: z.record(z.string(), z.string()).default({}),
            }),
            footer: z.object({ text: z.string().min(1).max(60) }).optional(),
            variableMapping: z.record(z.string(), z.string()).default({}),
          }),
          execute: async (params): Promise<
            { success: true; templateId: string } | { success: false; error: string }
          > => {
            // Fetch workspace API key (READ, not MUTATION — allowed)
            const supabase = createAdminClient()
            const { data: ws } = await supabase
              .from('workspaces')
              .select('settings')
              .eq('id', ctx.workspaceId)
              .single()

            const apiKey =
              (ws?.settings as { whatsapp_api_key?: string } | undefined)?.whatsapp_api_key ||
              process.env.WHATSAPP_API_KEY
            if (!apiKey) {
              return { success: false, error: 'API key de WhatsApp no configurada para este workspace' }
            }

            // Build components array from structured params
            const components: TemplateComponent[] = []

            if (params.header && params.header.format !== 'NONE') {
              if (params.header.format === 'TEXT') {
                const vars = [...new Set(
                  (params.header.text.match(/\{\{(\d+)\}\}/g) || []).map((v) => v.replace(/[{}]/g, ''))
                )]
                const h: TemplateComponent = {
                  type: 'HEADER',
                  format: 'TEXT',
                  text: params.header.text,
                }
                if (vars.length > 0 && params.header.format === 'TEXT') {
                  const exampleValue = (params.header as { exampleValue?: string }).exampleValue
                  h.example = { header_text: vars.map((n) => exampleValue || `ejemplo_${n}`) }
                }
                components.push(h)
              } else {
                // IMAGE — placeholder component; handle is patched by domain after resumable upload
                components.push({ type: 'HEADER', format: 'IMAGE' })
              }
            }

            const bodyVars = [...new Set(
              (params.body.text.match(/\{\{(\d+)\}\}/g) || []).map((v) => v.replace(/[{}]/g, ''))
            )]
            const bodyComp: TemplateComponent = {
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

            // Delegate to domain (MANDATORY — Regla 3 + agent scope)
            const result = await createTemplate(
              { workspaceId: ctx.workspaceId, source: 'tool-handler' },
              {
                name: sanitizeName(params.name),
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
      }
    }
    ```

    Hard constraints (verifiable by grep):
    - ZERO `.from('whatsapp_templates').insert(` in this file
    - ZERO `createTemplate360(` in this file
    - ZERO `uploadHeaderImage360(` in this file
    - Exactly ONE `createTemplate(` call (the one targeting domain) — all mutation flows through it
    - Imports from `@/lib/domain/whatsapp-templates` (domain)
    - Imports from `./validation` (validator)
    - Imports from `./types` (shared types)
  </action>
  <verify>
    <automated>test -f src/lib/config-builder/templates/tools.ts &amp;&amp; grep -q "export function createTemplateBuilderTools" src/lib/config-builder/templates/tools.ts &amp;&amp; grep -q "from '@/lib/domain/whatsapp-templates'" src/lib/config-builder/templates/tools.ts &amp;&amp; ! grep -q ".insert(" src/lib/config-builder/templates/tools.ts &amp;&amp; ! grep -q "createTemplate360(" src/lib/config-builder/templates/tools.ts &amp;&amp; ! grep -q "uploadHeaderImage360(" src/lib/config-builder/templates/tools.ts &amp;&amp; grep -q "submitTemplate:" src/lib/config-builder/templates/tools.ts &amp;&amp; grep -q "listExistingTemplates:" src/lib/config-builder/templates/tools.ts &amp;&amp; grep -q "validateTemplateDraft:" src/lib/config-builder/templates/tools.ts &amp;&amp; grep -q "suggestCategory:" src/lib/config-builder/templates/tools.ts &amp;&amp; grep -q "suggestLanguage:" src/lib/config-builder/templates/tools.ts &amp;&amp; grep -q "captureVariableMapping:" src/lib/config-builder/templates/tools.ts &amp;&amp; grep -q "source: 'tool-handler'" src/lib/config-builder/templates/tools.ts &amp;&amp; cd /mnt/c/Users/Usuario/Proyectos/morfx-new &amp;&amp; npx tsc --noEmit -p . 2>&amp;1 | grep "templates/tools.ts" | head -5</automated>
  </verify>
  <acceptance_criteria>
    - File exists and exports `createTemplateBuilderTools`
    - Exactly 6 tool keys: `listExistingTemplates`, `suggestCategory`, `suggestLanguage`, `captureVariableMapping`, `validateTemplateDraft`, `submitTemplate` — count verifiable by grep on `: tool(`
    - File imports `createTemplate` from `@/lib/domain/whatsapp-templates`
    - ZERO `.insert(` occurrences (grep)
    - ZERO `createTemplate360(` or `uploadHeaderImage360(` direct calls (grep)
    - `submitTemplate.execute` calls `createTemplate(...)` with `source: 'tool-handler'`
    - All six tools return `{ success: ... } | { error: string }` discriminated unions
    - `npx tsc --noEmit` reports zero errors
  </acceptance_criteria>
  <done>Tools factory compiles, scope invariants enforced, all mutations routed through domain.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.4: Create chat API route at /api/config-builder/templates/chat</name>
  <files>src/app/api/config-builder/templates/chat/route.ts</files>
  <read_first>
    - src/app/api/builder/chat/route.ts (analog — full file, lines 1-163)
    - src/lib/builder/session-store.ts (extended in Plan 01 — createSession now accepts kind param)
    - src/lib/config-builder/templates/system-prompt.ts (Task 3.2)
    - src/lib/config-builder/templates/tools.ts (Task 3.3)
    - .planning/standalone/whatsapp-template-ai-builder/RESEARCH.md (Example 4, lines 856-938 — near-verbatim chat route)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (section: `src/app/api/config-builder/templates/chat/route.ts`)
    - CLAUDE.md (Regla 6 — the existing /api/builder/chat route MUST NOT be modified)
  </read_first>
  <action>
    Create `src/app/api/config-builder/templates/chat/route.ts`. Near-verbatim clone of `src/app/api/builder/chat/route.ts` with these exact swaps:

    1. Replace `buildSystemPrompt` → `buildTemplatesSystemPrompt` (from `@/lib/config-builder/templates/system-prompt`)
    2. Replace `createBuilderTools` → `createTemplateBuilderTools` (from `@/lib/config-builder/templates/tools`)
    3. `stepCountIs(5)` → `stepCountIs(6)` (6 tools; matches agent scope doc)
    4. In `createSession(...)` call, pass `'template'` as 4th arg (the `kind`)

    Exact content:

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
    } from '@/lib/builder/session-store'
    import type { UIMessage } from 'ai'

    export async function POST(request: Request) {
      try {
        // 1. Auth
        const supabase = await createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return new Response('Unauthorized', { status: 401 })

        // 2. Workspace
        const cookieStore = await cookies()
        const workspaceId = cookieStore.get('morfx_workspace')?.value
        if (!workspaceId) return new Response('No workspace selected', { status: 400 })

        // 3. Membership
        const { data: membership } = await supabase
          .from('workspace_members')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id)
          .single()
        if (!membership) return new Response('Forbidden', { status: 403 })

        // 4. Parse body
        const { messages, sessionId: requestedSessionId } = (await request.json()) as {
          messages: UIMessage[]
          sessionId?: string
        }
        if (!messages || !Array.isArray(messages)) {
          return new Response('Missing messages array', { status: 400 })
        }

        // 5. Session
        let sessionId = requestedSessionId
        if (sessionId) {
          const existing = await getSession(sessionId, workspaceId)
          if (!existing) return new Response('Session not found', { status: 404 })
          if (existing.kind !== 'template') {
            return new Response('Session is not a template-builder session', { status: 400 })
          }
        } else {
          const firstUserText = (messages.find((m) => m.role === 'user')?.parts?.find((p) => p.type === 'text') as { text?: string } | undefined)?.text
          const title = firstUserText?.slice(0, 60) || 'Nuevo template'
          const session = await createSession(workspaceId, user.id, title, 'template')
          if (!session) return Response.json({ error: 'Failed to create session' }, { status: 500 })
          sessionId = session.id
        }

        // 6. Stream
        const modelMessages = await convertToModelMessages(messages)
        const tools = createTemplateBuilderTools({ workspaceId, userId: user.id })
        const systemPrompt = buildTemplatesSystemPrompt(workspaceId)

        const result = streamText({
          model: anthropic('claude-sonnet-4-20250514'),
          system: systemPrompt,
          messages: modelMessages,
          tools,
          stopWhen: stepCountIs(6),
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

    CRITICAL (Regla 6):
    - DO NOT modify `src/app/api/builder/chat/route.ts` — the automation builder stays exactly as it is
    - The new route lives at `src/app/api/config-builder/templates/chat/route.ts` — a parallel codebase path
  </action>
  <verify>
    <automated>test -f src/app/api/config-builder/templates/chat/route.ts &amp;&amp; grep -q "buildTemplatesSystemPrompt" src/app/api/config-builder/templates/chat/route.ts &amp;&amp; grep -q "createTemplateBuilderTools" src/app/api/config-builder/templates/chat/route.ts &amp;&amp; grep -q "stepCountIs(6)" src/app/api/config-builder/templates/chat/route.ts &amp;&amp; grep -q "createSession(workspaceId, user.id, title, 'template')" src/app/api/config-builder/templates/chat/route.ts &amp;&amp; grep -q "existing.kind !== 'template'" src/app/api/config-builder/templates/chat/route.ts &amp;&amp; cd /mnt/c/Users/Usuario/Proyectos/morfx-new &amp;&amp; git diff --quiet src/app/api/builder/chat/route.ts &amp;&amp; echo "automation builder untouched" &amp;&amp; npx tsc --noEmit -p . 2>&amp;1 | grep "config-builder/templates/chat" | head -5</automated>
  </verify>
  <acceptance_criteria>
    - File exists at `src/app/api/config-builder/templates/chat/route.ts`
    - Contains `stepCountIs(6)` (not 5)
    - Contains `buildTemplatesSystemPrompt` (not `buildSystemPrompt`)
    - Contains `createTemplateBuilderTools` (not `createBuilderTools`)
    - Contains `createSession(workspaceId, user.id, title, 'template')` (kind arg passed)
    - Contains `existing.kind !== 'template'` session-kind guard
    - `src/app/api/builder/chat/route.ts` is UNMODIFIED (`git diff --quiet` returns 0)
    - `npx tsc --noEmit` reports zero errors in the new route
  </acceptance_criteria>
  <done>Chat route streams correctly, isolates template sessions by `kind`, leaves automation builder untouched.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.5: Create image upload route at /api/config-builder/templates/upload</name>
  <files>src/app/api/config-builder/templates/upload/route.ts</files>
  <read_first>
    - src/app/actions/quick-replies.ts (lines 340-385 — buffer → Storage upload pattern)
    - .planning/standalone/whatsapp-template-ai-builder/RESEARCH.md (Example 5, lines 940-994 — exact route body)
    - .planning/standalone/whatsapp-template-ai-builder/PATTERNS.md (section: `src/app/api/config-builder/templates/upload/route.ts`)
    - .planning/standalone/whatsapp-template-ai-builder/CONTEXT.md (D-10, D-11, D-12 — size + format validation)
    - supabase/migrations/20260131000000_storage_bucket.sql (confirm `whatsapp-media` bucket exists, is public)
  </read_first>
  <action>
    Create `src/app/api/config-builder/templates/upload/route.ts` with exactly this content (from RESEARCH.md Example 5):

    ```typescript
    import { createClient } from '@/lib/supabase/server'
    import { cookies } from 'next/headers'

    const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
    const ALLOWED_MIMES = ['image/jpeg', 'image/png'] as const

    export async function POST(request: Request) {
      // 1. Auth
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return new Response('Unauthorized', { status: 401 })

      // 2. Workspace
      const cookieStore = await cookies()
      const workspaceId = cookieStore.get('morfx_workspace')?.value
      if (!workspaceId) return new Response('No workspace selected', { status: 400 })

      // 3. Membership
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single()
      if (!membership) return new Response('Forbidden', { status: 403 })

      // 4. File
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) return Response.json({ error: 'file field required' }, { status: 400 })

      if (!ALLOWED_MIMES.includes(file.type as (typeof ALLOWED_MIMES)[number])) {
        return Response.json(
          { error: `MIME no soportado: ${file.type}. Solo image/jpeg o image/png.` },
          { status: 400 }
        )
      }
      if (file.size > MAX_BYTES) {
        return Response.json(
          { error: `Archivo muy grande: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximo 5 MB.` },
          { status: 400 }
        )
      }

      // 5. Upload
      const timestamp = Date.now()
      const safeName = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `templates/${workspaceId}/${timestamp}_${safeName}`

      const buffer = Buffer.from(await file.arrayBuffer())
      const { error: upErr } = await supabase.storage
        .from('whatsapp-media')
        .upload(storagePath, buffer, { contentType: file.type, upsert: false })

      if (upErr) {
        return Response.json(
          { error: `Error subiendo a storage: ${upErr.message}` },
          { status: 500 }
        )
      }

      const { data: pub } = supabase.storage.from('whatsapp-media').getPublicUrl(storagePath)

      return Response.json({
        storagePath,
        publicUrl: pub.publicUrl,
        mimeType: file.type,
      })
    }
    ```

    Invariants:
    - Auth + workspace + membership gate BEFORE any file work (same 3-step gate as chat route)
    - Storage path prefix `templates/{workspaceId}/...` — distinguishes from `quick-replies/{ws}/...` used elsewhere
    - MIME whitelist: `image/jpeg`, `image/png` only (D-12)
    - Size cap: 5 MB server-side (defense-in-depth — client-side uploader in Plan 04 also validates, but server is authoritative)
    - Bucket: `whatsapp-media` (already provisioned)
    - Returns `{ storagePath, publicUrl, mimeType }` — UI uses `publicUrl` for preview, `storagePath` is what gets persisted into `submitTemplate` tool params
  </action>
  <verify>
    <automated>test -f src/app/api/config-builder/templates/upload/route.ts &amp;&amp; grep -q "export async function POST" src/app/api/config-builder/templates/upload/route.ts &amp;&amp; grep -q "MAX_BYTES = 5 \* 1024 \* 1024" src/app/api/config-builder/templates/upload/route.ts &amp;&amp; grep -q "ALLOWED_MIMES = \['image/jpeg', 'image/png'\]" src/app/api/config-builder/templates/upload/route.ts &amp;&amp; grep -q "whatsapp-media" src/app/api/config-builder/templates/upload/route.ts &amp;&amp; grep -q "templates/\${workspaceId}" src/app/api/config-builder/templates/upload/route.ts &amp;&amp; grep -q "workspace_members" src/app/api/config-builder/templates/upload/route.ts &amp;&amp; cd /mnt/c/Users/Usuario/Proyectos/morfx-new &amp;&amp; npx tsc --noEmit -p . 2>&amp;1 | grep "config-builder/templates/upload" | head -5</automated>
  </verify>
  <acceptance_criteria>
    - File exists at `src/app/api/config-builder/templates/upload/route.ts`
    - Contains `const MAX_BYTES = 5 * 1024 * 1024`
    - Contains `ALLOWED_MIMES = ['image/jpeg', 'image/png']`
    - Uses `whatsapp-media` bucket (existing, public)
    - Storage path uses `templates/${workspaceId}/...` prefix
    - Auth + workspace + membership gate present (3 checks)
    - Returns JSON with `storagePath`, `publicUrl`, `mimeType` fields
    - `npx tsc --noEmit` reports zero errors
  </acceptance_criteria>
  <done>Upload route validates MIME + size, stores under templates/{ws}/, returns storagePath ready for submitTemplate tool params.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → /api/config-builder/templates/chat | Auth'd request streaming AI tokens |
| browser → /api/config-builder/templates/upload | Multipart binary upload (image) |
| AI model → tool execute() | Model-invoked function calls; params zod-validated |
| tool submitTemplate → domain | Trusted intra-process call with `source: 'tool-handler'` |
| domain → 360 Dialog | Workspace API key + resumable upload + template creation |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Spoofing | chat route session reuse | mitigate | Session GET checks `existing.kind !== 'template'` — prevents resuming automation-builder sessions on the templates endpoint |
| T-03-02 | Tampering | tool inputs | mitigate | zod schemas validate every tool param (name regex, enum language, discriminated header union, MAX char limits on header/body/footer) |
| T-03-03 | Tampering | upload MIME | mitigate | Server-side MIME whitelist + size cap; storage path is server-derived (user cannot supply a path) |
| T-03-04 | Repudiation | chat onFinish | mitigate | `updateSession` persists the full message stream to `builder_sessions.messages` JSONB — audit trail survives browser refresh |
| T-03-05 | Information Disclosure | workspaces.settings readout | accept | Tool reads only `settings` column for its own workspace (filtered by ctx.workspaceId); no cross-workspace exposure |
| T-03-06 | Denial of Service | streamText cost | mitigate | `stopWhen: stepCountIs(6)` caps the tool loop; plus Anthropic API has its own rate limits |
| T-03-07 | Denial of Service | upload 5 MB cap | mitigate | Server-side reject before Buffer allocation (MAX_BYTES check) — prevents memory exhaustion |
| T-03-08 | Elevation of Privilege | tool submitTemplate | mitigate | Tool must go through domain which filters by workspace_id; zero direct `.insert()` in tools.ts (scope rule, grep-verifiable) |
| T-03-09 | Elevation of Privilege | cross-workspace session | mitigate | `getSession` filters by workspace_id; chat route validates membership BEFORE touching session |
| T-03-10 | Information Disclosure | error messages leaking internals | mitigate | Tool errors return human-readable Spanish strings; stack traces only in server console.error |
</threat_model>

<verification>
End-of-plan checks:

1. `npx tsc --noEmit -p .` — zero new errors
2. `grep -R "createTemplate360\|whatsapp_templates.*insert" src/app/api/config-builder/ src/lib/config-builder/` — should return ZERO matches (confirms Regla 3 + agent scope)
3. `git diff --stat src/app/api/builder/ src/lib/builder/tools.ts src/lib/builder/system-prompt.ts` — should show NO CHANGES (automation builder protected, Regla 6)
4. Files created check: 6 new files (types, validation, system-prompt, tools, chat route, upload route)
5. Manual smoke (deferred to Plan 05): `curl -X POST http://localhost:3020/api/config-builder/templates/chat` returns 401 without auth cookie (auth gate works)
</verification>

<success_criteria>
- All 6 new files compile and are lint-clean
- Agent scope enforced: zero direct mutations in tools.ts; all via domain
- Automation builder code untouched (Regla 6)
- Chat route uses `kind='template'` for session isolation
- Upload route accepts only image/jpeg + image/png, ≤5 MB
- System prompt encodes D-03..D-09, D-15 textually
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-template-ai-builder/03-SUMMARY.md` documenting:
- Any deviation from the 6-tool shape (if you added/removed tools, justify)
- Whether `VARIABLE_CATALOG`'s actual shape matched the assumed `{ label, example }` (if not, document the adapted `formatVariableCatalog`)
- Grep evidence of zero `.insert(` / `createTemplate360(` / `uploadHeaderImage360(` in tools.ts
- Git diff proof that `src/app/api/builder/*` and `src/lib/builder/*` remain unchanged (except the Plan 01 `session-store.ts` / `types.ts` changes)
- Git commit SHAs (one commit per file or small batch)
</output>
