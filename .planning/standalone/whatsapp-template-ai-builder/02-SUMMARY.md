---
phase: whatsapp-template-ai-builder
plan: 02
subsystem: config-builder / whatsapp-templates / domain
tags: [domain-layer, regla-3, 360dialog, header-image, server-action-refactor]
status: completed
dependency-graph:
  requires:
    - ".planning/standalone/whatsapp-template-ai-builder/01-SUMMARY.md (uploadHeaderImage360 helper)"
    - "src/lib/domain/types.ts (DomainContext, DomainResult)"
    - "src/lib/whatsapp/types.ts (TemplateComponent.example.header_handle ya existía)"
  provides:
    - "src/lib/domain/whatsapp-templates.ts — createTemplate orquestador (single source of truth por Regla 3)"
    - "CreateTemplateParams con headerImage?: { storagePath, mimeType } opcional"
    - "src/app/actions/templates.ts:createTemplate como thin wrapper delegado al domain"
    - "Manual form en /configuracion/whatsapp/templates/nuevo sigue funcionando (D-02 coexistencia)"
  affects:
    - "Cualquier futuro caller (Plan 03+ AI tools) debe pasar por el domain"
    - "El SEND path (src/app/actions/messages.ts) permanece UNCHANGED (D-16/D-17 scope)"
tech-stack:
  added: []
  patterns:
    - "Domain layer orchestration (uniqueness check -> optional upload -> INSERT PENDING -> external call -> submitted_at OR REJECTED)"
    - "Server action thin wrapper: auth -> workspace -> validation -> apiKey lookup -> domain delegate -> revalidatePath"
    - "DomainResult discriminated-style union con success: boolean (matching tags.ts shape)"
    - "Row-preserved-on-error audit trail (status='REJECTED' + rejected_reason)"
    - "Optional param for backward-compat (headerImage? — no breaking change a callers existentes)"
key-files:
  created:
    - path: "src/lib/domain/whatsapp-templates.ts"
      why: "Domain layer para mutaciones de whatsapp_templates (Regla 3)"
  modified:
    - path: "src/app/actions/templates.ts"
      why: "Refactor createTemplate para delegar al domain; signature extendida con headerImage opcional"
decisions:
  - "Mantener TemplateComponent.example.header_handle en types.ts sin tocarlo — ya existía desde el SEND path; extensión innecesaria"
  - "apiKey missing ahora retorna error explícito en el action (mejora de correctitud vs comportamiento previo que insertaba localmente sin submit)"
  - "headerImage opcional preserva exactly la forma del call en template-form.tsx; no requiere cambios en la UI manual"
  - "Domain no emite triggers de automatización (templates no disparan automatizaciones, a diferencia de tags.ts)"
  - "Domain silencioso (sin console.*); el caller server-action decide qué loggear — match con estilo tags.ts"
metrics:
  duration: "~15 min"
  completed: "2026-04-20"
  tasks_completed: 2
  tasks_pending: 0
---

# Standalone whatsapp-template-ai-builder — Plan 02: Domain Layer & Server Action Refactor Summary

Wave 2 cerrado: `whatsapp_templates` ahora tiene un único punto de mutación en `src/lib/domain/whatsapp-templates.ts`. El server action `createTemplate` es thin wrapper que delega al domain, y acepta `headerImage` opcional para el flujo IMAGE sin romper el form manual.

## Tareas

| # | Tarea | Estado | Commit |
|---|-------|--------|--------|
| 2.1 | Crear `src/lib/domain/whatsapp-templates.ts` con orquestador `createTemplate` | completada | `3eba130` |
| 2.2 | Refactor `src/app/actions/templates.ts:createTemplate` → delega al domain | completada | `b57b68f` |

## Firma exacta del domain `createTemplate`

```typescript
export interface CreateTemplateParams {
  name: string
  language: string
  category: TemplateCategory
  components: TemplateComponent[]
  variableMapping: Record<string, string>
  headerImage?: {
    storagePath: string
    mimeType: 'image/jpeg' | 'image/png'
  }
  apiKey: string
}

export async function createTemplate(
  ctx: DomainContext,
  params: CreateTemplateParams
): Promise<DomainResult<Template>>
```

Orquestación (6 pasos):

1. **Uniqueness check** — `.eq('workspace_id', ctx.workspaceId).eq('name', params.name).maybeSingle()` → error "Ya existe un template con nombre X" si existe.
2. **Upload IMAGE (condicional)** — si `params.headerImage`:
   - valida que haya HEADER con `format='IMAGE'`
   - `supabase.storage.from('whatsapp-media').download(storagePath)` — trae bytes
   - `uploadHeaderImage360(apiKey, bytes, mimeType, fileName)` — handle permanente
   - patch `components[headerIdx].example.header_handle = [handle]`
3. **INSERT PENDING** — workspace_id, name, language, category, status='PENDING', components (con handle si aplica), variable_mapping.
4. **Submit a 360 Dialog** — `createTemplate360(apiKey, { name, language, category, components })`.
5. **UPDATE submitted_at** — en caso de éxito.
6. **UPDATE status='REJECTED' + rejected_reason** — si 360 lanza error post-insert (row preservado para audit trail per D-16/D-17).

## Firma exacta del server action `createTemplate` (refactorizado)

```typescript
export async function createTemplate(params: {
  name: string
  language?: string
  category: TemplateCategory
  components: TemplateComponent[]
  variable_mapping?: Record<string, string>
  headerImage?: { storagePath: string; mimeType: 'image/jpeg' | 'image/png' }  // NEW
}): Promise<ActionResult<Template>>
```

Body (7 pasos, ~65 líneas vs ~85 originales):

1. Auth via `createClient()` + `supabase.auth.getUser()` → 'No autenticado' si falla.
2. Workspace vía cookie `morfx_workspace` → 'No hay workspace seleccionado' si falta.
3. Name cleanup (regex lowercase+underscores, trim) — mismo código que antes, intacto.
4. Components length check.
5. API key de `workspaces.settings.whatsapp_api_key` o env var → error si ambos faltan.
6. `createTemplateDomain({ workspaceId, source: 'server-action' }, { ...params, apiKey })`.
7. Translate `DomainResult<Template>` → `ActionResult<Template>`; `revalidatePath('/configuracion/whatsapp/templates')` solo en éxito.

## Evidencia grep — mutaciones fuera del domain = 0

```
$ grep -rn "createTemplate360\|whatsapp_templates.*insert\|\.from('whatsapp_templates')\s*\.insert" src/
src/lib/whatsapp/templates-api.ts:47:export async function createTemplate360(...)
src/lib/domain/whatsapp-templates.ts:13://   5. Call createTemplate360()
src/lib/domain/whatsapp-templates.ts:25:  createTemplate360,
src/lib/domain/whatsapp-templates.ts:181:    await createTemplate360(params.apiKey, {
```

- `createTemplate360` solo existe como export en su helper (línea 47) y como caller en el domain (línea 181). Ningún server action, tool handler o route handler lo llama directo.
- INSERT a `whatsapp_templates` solo vive en `src/lib/domain/whatsapp-templates.ts` (Step 3 del orquestador).

## Callers del server action `createTemplate` auditados

```
$ grep -rn "import.*createTemplate.*from.*['\"]@/app/actions/templates['\"]" src/
src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx:24:import { createTemplate } from '@/app/actions/templates'
```

Un único caller: el form manual. Su llamada actual (`template-form.tsx:107-113`):
```tsx
const result = await createTemplate({
  name, language, category, components, variable_mapping: variableMapping,
})
```
— no pasa `headerImage`, por lo tanto el domain toma el TEXT-only path (step 2 no-op). **Backward-compat confirmada**; el form manual no requiere cambios (D-02 coexistencia).

## Sanidad TypeScript

```
$ npx tsc --noEmit -p . 2>&1 | grep -v "\.test\.ts"
(vacío)
```

Cero errores TS en archivos del plan (ni pre-existentes en el resto del árbol productivo). Los únicos errores del proyecto siguen siendo los `.test.ts` por `vitest` no instalado (pre-existente, fuera de scope).

## D-requirements cubiertos

| ID | Descripción | Estado |
|----|-------------|--------|
| D-02 | Form manual coexiste con nuevo flujo | ✓ template-form.tsx intacto, action backward-compat |
| D-05 | Header TEXT e IMAGE soportados | ✓ domain maneja ambos (IMAGE branch condicional) |
| D-06 | Body obligatorio, Footer opcional | ✓ validación delegada a caller; domain no restringe |
| D-07 | Botones NO en este standalone | ✓ domain no los menciona (ni los bloquea — schema JSONB ya los soporta) |
| D-09 | Idioma abierto (es, es_CO, en_US a nivel builder) | ✓ `language: string` sin CHECK en domain |
| D-10 | Upload via /uploads resumable (handle permanente) | ✓ delegado a uploadHeaderImage360 de Plan 01 |
| D-11 | Flujo upload (Supabase Storage → 360 → header_handle) | ✓ Steps 2a/2b/2c del domain |
| D-14 | Toda mutación pasa por domain | ✓ Regla 3 cumplida; grep limpio |
| D-16 | Bug CREATE imagen cerrado en código | ✓ headerImage propagado desde action → domain → 360 |
| D-17 | Se cierra brecha CREATE (no se toca SEND) | ✓ src/app/actions/messages.ts UNMODIFIED |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] apiKey missing ahora retorna error explícito**
- **Found during:** Task 2.2 refactor
- **Issue:** El código original en `src/app/actions/templates.ts:201-231` hacía `if (apiKey) { ... submit ... }` — si faltaba la apiKey, insertaba localmente un template que nunca llegaba a Meta ni se marcaba como error. Quedaba huérfano con status=PENDING indefinido.
- **Fix:** El refactor retorna `{ error: 'API key de WhatsApp no configurada en el workspace' }` ANTES de llamar al domain. Sin apiKey no se crea row local — correctitud sobre permisividad.
- **Files modified:** `src/app/actions/templates.ts` (Task 2.2, commit `b57b68f`)
- **Justificación:** El caller domain requiere `apiKey: string` (no opcional) porque el step 4 debe llamar obligatoriamente a `createTemplate360`; aceptar llamadas sin apiKey rompería el contrato del domain. Además alinea con el flow esperado por D-17 (CREATE gap cerrado = CREATE siempre llega a Meta, o falla explícitamente).

### Architectural deviations

Ninguna. El código del domain es verbatim lo que el plan describe en RESEARCH.md Example 2, con adaptación del tipo `DomainResult<T>` (que en `src/lib/domain/types.ts` está modelado como `{ success: boolean; data?; error? }` — no el discriminated-union estricto que mostraba el plan en `<interfaces>`). Uso la forma real del proyecto para consistencia con `tags.ts`.

### Type extensions needed

**Ninguna.** `TemplateComponent.example.header_handle?: string[]` ya estaba definido en `src/lib/whatsapp/types.ts:599-603`:

```typescript
example?: {
  header_text?: string[]
  body_text?: string[][]
  header_handle?: string[]
}
```

No requirió modificar `types.ts`. El SEND path (commit `acffa6e`) ya lo había introducido.

## Archivos tocados (full list)

**Created:**
- `src/lib/domain/whatsapp-templates.ts` — nuevo domain (211 líneas)

**Modified:**
- `src/app/actions/templates.ts` — `createTemplate` refactorizado; imports ajustados (`createTemplate360` removido, alias `createTemplateDomain` agregado)

**UNMODIFIED (verificado):**
- `src/lib/whatsapp/types.ts` — `header_handle` ya existía
- `src/lib/whatsapp/templates-api.ts` — `createTemplate360` y `uploadHeaderImage360` intactos
- `src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx` — el caller sigue tipando porque `headerImage` es opcional
- `src/app/actions/messages.ts` — SEND path fuera de scope (D-16/D-17)

## Follow-ups (fuera de este plan)

- Plan 03: AI tool handlers bajo `src/lib/config-builder/templates/tools.ts` deben llamar al domain `createTemplate` via `source: 'tool-handler'`.
- Plan 04+: UI del builder (chat-pane + preview-pane + image-uploader) que alimenta `headerImage.storagePath` al server action.
- Plan 05: regression test del form manual (smoke TEXT-only) — ya garantizado por el fact de que template-form.tsx compila y su call shape no cambió.
- Posible mejora: agregar threat_flag si en Plan 03 se introduce nueva surface via HTTP routes (no aplica en este plan — solo intra-process calls).

## Self-Check

- [x] `src/lib/domain/whatsapp-templates.ts` existe
- [x] Exporta `createTemplate(ctx, params): Promise<DomainResult<Template>>`
- [x] Importa `createAdminClient` desde `@/lib/supabase/admin`
- [x] Importa `createTemplate360` y `uploadHeaderImage360` desde `@/lib/whatsapp/templates-api`
- [x] NO importa `createClient()` desde `@/lib/supabase/server`
- [x] 6 ocurrencias de `workspace_id` (>= 4 requerido)
- [x] Contiene `supabase.storage.from('whatsapp-media').download(...)`
- [x] Contiene `status: 'PENDING'` en insert
- [x] Contiene `status: 'REJECTED'` en error handler
- [x] Contiene `header_handle: [handle]` patch
- [x] `src/app/actions/templates.ts` contiene `import { createTemplate as createTemplateDomain }`
- [x] Llama `createTemplateDomain(...)` con `source: 'server-action'`
- [x] NO contiene `await createTemplate360(` (grep count = 0)
- [x] NO contiene `.insert({` dentro del export createTemplate (grep count = 0)
- [x] Signature acepta `headerImage?` opcional
- [x] `template-form.tsx` sigue tipando sin modificarse
- [x] `npx tsc --noEmit -p .` → 0 errores en archivos del plan
- [x] Commit `3eba130` existe — Task 2.1
- [x] Commit `b57b68f` existe — Task 2.2

## Self-Check: PASSED
