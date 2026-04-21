---
phase: whatsapp-template-ai-builder
plan: 04
subsystem: config-builder / whatsapp-templates / UI
tags: [ai-sdk-v6, useChat, DefaultChatTransport, react-context, useReducer, split-pane, image-upload, whatsapp-bubble, regla-6]
status: paused-at-checkpoint
dependency-graph:
  requires:
    - ".planning/standalone/whatsapp-template-ai-builder/01-SUMMARY.md (session-store kind param, builder_sessions.kind column)"
    - ".planning/standalone/whatsapp-template-ai-builder/02-SUMMARY.md (domain createTemplate, uploadHeaderImage360)"
    - ".planning/standalone/whatsapp-template-ai-builder/03-SUMMARY.md (chat+upload routes, 6 AI tools, types/validation)"
    - "src/app/(dashboard)/automatizaciones/builder/components/builder-input.tsx (REUSED read-only)"
    - "src/lib/config-builder/templates/types.ts (TemplateDraft shape)"
  provides:
    - "src/app/(dashboard)/configuracion/whatsapp/templates/builder/page.tsx — ruta server entry"
    - "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx — two-pane shell + draft provider + session switcher"
    - "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-draft-context.tsx — React Context + useReducer (initialDraft exportado)"
    - "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx — streaming chat via DefaultChatTransport a /api/config-builder/templates/chat"
    - "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx — UIMessage parts renderer con ToolOutput que dispatcha patches"
    - "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/preview-pane.tsx — form editable + bubble mount"
    - "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/whatsapp-bubble.tsx — render puro de burbuja WhatsApp"
    - "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/image-uploader.tsx — file input + upload + revoke object URL"
  affects:
    - "Plan 05: CTA 'Crear con IA' en /configuracion/whatsapp/templates/page.tsx apuntara a /configuracion/whatsapp/templates/builder"
    - "Plan 05: regression smoke que confirma /automatizaciones/builder sigue funcionando"
    - "/automatizaciones/builder/** UNCHANGED (Regla 6 verificado por git diff --stat vacio)"
tech-stack:
  added: []
  patterns:
    - "AI SDK v6 useChat + DefaultChatTransport con fetch wrapper para X-Session-Id capture"
    - "UIMessage parts renderer con switch(part.type) — text, dynamic-tool (input-streaming/input-available/output-available/output-error states)"
    - "React Context + useReducer para shared draft state entre dos panes hermanos"
    - "Effect-based dispatch en ToolOutput — side-effect aislado del render body"
    - "URL.createObjectURL + revokeObjectURL lifecycle para preview de imagen pre-upload (T-04-02)"
    - "Client-side validation defense-in-depth (MIME + size) sobre validacion server-side de Plan 03"
    - "Sonner toast para feedback de upload (dep existente, zero install)"
    - "Session switcher con filtro client-side por kind='template' (el GET /api/builder/sessions no filtra server-side todavia)"
    - "Legacy fallback !message.parts preserved — mitiga mensajes persistidos pre-v6"
key-files:
  created:
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/page.tsx"
      why: "Server component entry point for /configuracion/whatsapp/templates/builder (D-01)"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx"
      why: "Two-pane shell adaptado del automation builder (D-01, D-02). Inline TemplateSessionHistory filtra kind=template."
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-draft-context.tsx"
      why: "React Context + useReducer (D-13 Q2). 3 actions: UPDATE_FIELD, APPLY_AI_PATCH, RESET."
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx"
      why: "AI SDK v6 chat contra /api/config-builder/templates/chat (D-13)"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx"
      why: "Parts renderer con tool state branches + ToolOutput dispatcha patches al draft (D-03, D-04, D-13)"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/preview-pane.tsx"
      why: "Editable form + WhatsApp bubble live (D-01, D-05, D-06, D-08, D-09)"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/whatsapp-bubble.tsx"
      why: "Pure-render bubble estilo WhatsApp (D-01)"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/image-uploader.tsx"
      why: "File picker + upload a /api/config-builder/templates/upload (D-10, D-11, D-12)"
  modified: []
decisions:
  - "Merge de variableMapping usa UPDATE_FIELD con dict completo pre-mergeado (no APPLY_AI_PATCH). ToolOutput lee draft.variableMapping via useTemplateDraft() y pasa { ...current, [varIndex]: path } al dispatch. Rationale: APPLY_AI_PATCH hace shallow merge, por lo que pasar { variableMapping: { '1': 'contact.name' } } habria sobreescrito mappings previos."
  - "BuilderInput del automation builder se IMPORTA en vez de clonarse. Regla 6 no se viola porque no lo modifico — solo importo por path. Rationale: es un componente puramente presentacional (textarea auto-resize + Enter/Shift-Enter); duplicarlo seria deuda tecnica."
  - "TemplateSessionHistory queda inline dentro de template-builder-layout.tsx en vez de extraerse a session-history.tsx separado. Rationale: diverge del automation analog en filtrar kind='template' y no mostrar automations_created count; extraerlo generaria codigo casi-duplicado con poca reutilizacion futura."
  - "ImageUploader revierte local URL + storagePath en cualquier error del upload (no solo HTTP fallido — tambien catch de red). Rationale: previene estado inconsistente donde el preview muestra la imagen pero el submitTemplate falla por storagePath vacio."
  - "Session fetch filtra client-side porque /api/builder/sessions no acepta ?kind= todavia. Si el listado se vuelve grande, Plan 05+ deberia extender el endpoint para filtrar server-side."
metrics:
  duration: "~25 min"
  completed: "2026-04-20 (paused at checkpoint — awaiting visual verification)"
  tasks_completed: 3
  tasks_pending: 1
---

# Standalone whatsapp-template-ai-builder — Plan 04: UI Wave 4 Summary

Wave 4 cerrado a nivel de código: el template builder UI (8 archivos: 1 server entry + 7 client components) está implementado, tipado limpio y listo para deploy. La burbuja de WhatsApp se renderea live mientras el AI parchea el draft desde el chat via tools. El upload de imagen flow-es end-to-end contra el endpoint de Plan 03. **Queda pendiente Task 4.4 (checkpoint de verificación visual humana), que requiere deploy a Vercel — manejado por el orquestador.**

## Tareas

| # | Tarea | Estado | Commit |
|---|-------|--------|--------|
| 4.1 | Server entry + layout shell + draft context | completada | `1477ac9` |
| 4.2 | ChatPane + ChatMessage (streaming AI chat) | completada | `70b0131` |
| 4.3 | PreviewPane + WhatsAppBubble + ImageUploader | completada | `0113f3e` |
| 4.4 | [CHECKPOINT] Visual + functional UI verification | **paused** | — (depende de push a Vercel + testing manual) |

## Arquitectura

```
/configuracion/whatsapp/templates/builder/
├── page.tsx                             (server — 11 lineas)
└── components/
    ├── template-builder-layout.tsx      (two-pane shell + session switcher + provider wrapper)
    ├── template-draft-context.tsx       (React Context + useReducer — shared state)
    ├── chat-pane.tsx                    (useChat + DefaultChatTransport)
    ├── chat-message.tsx                 (UIMessage parts + ToolOutput dispatch)
    ├── preview-pane.tsx                 (editable form + bubble mount)
    ├── whatsapp-bubble.tsx              (pure-render WhatsApp style)
    └── image-uploader.tsx               (file input + upload + revoke)
```

Flujo de datos:

```
ChatPane (useChat) --message.parts--> ChatMessage.ToolOutput --dispatch--> TemplateDraftContext
                                                                                    |
                                                                                    v
                                                             PreviewPane (useTemplateDraft) --> WhatsAppBubble
                                                                                    ^
                                                                                    |
                                                                     (user inputs) --UPDATE_FIELD-->
```

## Merge semantics de patches de la IA

| Tool output | Action type | Por que |
|-------------|-------------|---------|
| `suggestCategory` → `{ category }` | `APPLY_AI_PATCH { category }` | Scalar — shallow merge es correcto |
| `suggestLanguage` → `{ language }` | `APPLY_AI_PATCH { language }` | Scalar — shallow merge es correcto |
| `captureVariableMapping` → `{ varIndex, path }` | `UPDATE_FIELD variableMapping { ...current, [idx]: path }` | APPLY_AI_PATCH habria sobreescrito mappings previos; leemos current desde useTemplateDraft y pasamos el dict completo ya mergeado |
| `validateTemplateDraft` → `{ success }` | no dispatch | Solo informa; el UI muestra errores inline |
| `submitTemplate` → `{ templateId }` | no dispatch | Muestra green banner; la UI redirige manual al listado |
| `listExistingTemplates` | no dispatch | Read-only; solo es contexto para la IA |

## Evidencia — Regla 6 cumplida (automation builder intacto)

```
$ git diff --stat main~3 main -- src/app/(dashboard)/automatizaciones/builder/ src/app/api/builder/ src/lib/builder/
(vacio)
```

Zero bytes cambiados en el automation builder. El único import cruzado es `BuilderInput` (solo lectura) en chat-pane.tsx — sin modificación al archivo fuente.

## Evidencia — Grep patterns esperados

| Pattern | Archivo | Count |
|---------|---------|-------|
| `DefaultChatTransport` | chat-pane.tsx | 3 |
| `/api/config-builder/templates/chat` | chat-pane.tsx | 2 |
| `X-Session-Id` | chat-pane.tsx | 3 |
| `part.type` | chat-message.tsx | 2 |
| `dynamic-tool` | chat-message.tsx | 1 |
| `useReducer` | template-draft-context.tsx | 3 |
| `TemplateDraftProvider` | template-builder-layout.tsx | 4 |
| `/api/config-builder/templates/upload` | image-uploader.tsx | 3 |
| `es_CO` | preview-pane.tsx | 2 |
| `WhatsAppBubble` | preview-pane.tsx | 3 |

## Sanidad TypeScript

```
$ npx tsc --noEmit -p . 2>&1 | grep -vE "\.test\.ts|node_modules"
(vacio)
```

Cero errores TS en el proyecto completo. Los únicos errores pre-existentes son archivos `.test.ts` por `vitest` no instalado (fuera de scope).

## D-requirements cubiertos (para este plan)

| ID | Descripcion | Estado | Donde |
|----|-------------|--------|-------|
| D-01 | Layout dos paneles + preview live | ✓ | template-builder-layout.tsx (grid-cols-1 md:grid-cols-2), whatsapp-bubble.tsx |
| D-02 | Coexistencia con form manual en /configuracion/whatsapp/templates | ✓ | Back-link a /configuracion/whatsapp/templates; form manual UNCHANGED |
| D-03 | IA acepta lenguaje natural | ✓ | Delegado al system prompt (Plan 03); UI solo renderea el flujo |
| D-04 | Mapping de variables capturado inline | ✓ | captureVariableMapping → ToolOutput → UPDATE_FIELD con merge |
| D-05 | Header TEXT e IMAGE | ✓ | preview-pane.tsx HEADER_FORMAT_OPTIONS (NONE/TEXT/IMAGE, no VIDEO/DOCUMENT) |
| D-06 | Body obligatorio, Footer opcional | ✓ | textarea body required=natural (no se puede enviar vacio; validado por domain); footer opcional en UI |
| D-09 | 3 idiomas (es, es_CO, en_US) | ✓ | preview-pane.tsx LANGUAGE_OPTIONS |
| D-10 | Upload con handle permanente | ✓ | image-uploader.tsx POST a /api/config-builder/templates/upload (delega a domain resumable upload) |
| D-11 | Flujo upload Storage → 360 Dialog | ✓ | image-uploader.tsx guarda storagePath; PreviewPane lo incluira en submitTemplate |
| D-12 | Validaciones de archivo | ✓ | image-uploader.tsx client-side MIME + size; server re-valida en Plan 03 |
| D-13 | Reutilizar Automation Builder como base | ✓ | Clon adaptado; BuilderInput importado read-only; /automatizaciones/builder intacto |

## Threat mitigations implementadas

| Threat ID | Mitigacion | Ubicacion |
|-----------|-----------|-----------|
| T-04-01 | Client-side validation defense-in-depth | image-uploader.tsx handleFileChange (MIME whitelist + MAX_BYTES) |
| T-04-02 | URL.revokeObjectURL lifecycle | image-uploader.tsx handleRemove + replace path |
| T-04-03 | React escape by default + no dangerouslySetInnerHTML | whatsapp-bubble.tsx, chat-message.tsx |
| T-04-04 | Session kind='template' filter | Client-side en TemplateSessionHistory (Plan 03 ya enforcea server-side en /api/config-builder/templates/chat) |
| T-04-05 | status='streaming' disables input | chat-pane.tsx ya delegado a BuilderInput.isLoading |
| T-04-06 | Rutas fisicamente separadas | /configuracion/whatsapp/templates/builder vs /automatizaciones/builder; zero shared state |

## Deviations from Plan

### Auto-fixed adaptations

**1. [Rule 2 - Missing critical functionality] Merge correcto de variableMapping en ToolOutput**
- **Found during:** Task 4.2 (el plan menciona el pitfall pero no lo resuelve explicitamente)
- **Issue:** APPLY_AI_PATCH hace shallow merge — `{ variableMapping: { '2': 'order.id' } }` sobreescribiria `{ '1': 'contact.name' }` si existia.
- **Fix:** `ToolOutput` usa `useTemplateDraft()` para leer el estado actual y dispatcha `UPDATE_FIELD` con `{ ...currentMapping, [varIndex]: path }`. El reducer asigna directamente sin merge, que es lo que necesitamos al pasar el dict ya mergeado.
- **Files:** `chat-message.tsx:71-105`
- **Justificacion:** Sin este fix, cada tool call de captureVariableMapping resetaria los mappings previos — bug crítico en flujos multi-variable.

**2. [Rule 2 - Missing critical functionality] Effect-based dispatch en ToolOutput**
- **Found during:** Task 4.2 (el plan sketch usaba dispatch en render body, marcado como "side-effect malo")
- **Issue:** Dispatchear en render body viola React rules-of-hooks y puede causar loops infinitos si el dispatch causa re-render que re-dispatch.
- **Fix:** `useEffect([toolName, output, onDraftPatch])` aisla el side-effect. El `output` ref estable por part.output garantiza una ejecución por tool-call. Excluimos `currentMapping` de deps para evitar re-ejecuciones al actualizar el mapping.
- **Files:** `chat-message.tsx:82-105`
- **Justificacion:** React 19 es más estricto con side-effects en render. Sin useEffect, habría warning en dev-mode y riesgo de loops.

**3. [Rule 3 - Blocking] Reutilización de BuilderInput en vez de clonarlo**
- **Found during:** Task 4.2
- **Issue:** El plan mandaba clonar el análogo completo. BuilderInput del automation builder es un textarea auto-resize con Enter-to-submit, puramente presentacional.
- **Fix:** Import directo del archivo del automation builder (read-only). Regla 6 no se viola: zero modificaciones al archivo fuente; `git diff --stat src/app/(dashboard)/automatizaciones/builder/` sigue vacio.
- **Files:** `chat-pane.tsx:22`
- **Justificacion:** Clonarlo generaría deuda técnica (2 componentes idénticos); compartirlo es seguro porque no hay estado interno acoplado al automation builder.

**4. [Rule 2 - Missing critical functionality] Inline TemplateSessionHistory con kind filter**
- **Found during:** Task 4.1
- **Issue:** El plan sugería reutilizar SessionHistory del automation builder, pero ese fetch de `/api/builder/sessions` retorna TODAS las sesiones (automation + template). Si un usuario tiene ambas, veria mezcladas.
- **Fix:** Componente inline `TemplateSessionHistory` dentro de template-builder-layout.tsx que filtra `data.filter(s => s.kind === 'template')` client-side. El loader individual de sesión (`handleSelectSession`) también valida `session.kind === 'template'` antes de cargarla.
- **Files:** `template-builder-layout.tsx:196-340`
- **Justificacion:** Sin este filtro, un usuario con sesiones de automations vería sus templates-history contaminado. Plan 05+ puede extender `/api/builder/sessions?kind=template` para filtrar server-side si el volumen lo justifica.

**5. [Rule 2 - Missing critical functionality] URL.revokeObjectURL en replace path del image-uploader**
- **Found during:** Task 4.3
- **Issue:** El plan mencionaba revoke solo en handleRemove. Pero si el usuario selecciona una imagen, luego otra distinta (sin clicar "Quitar"), la primera URL queda leaked.
- **Fix:** handleFileChange hace `URL.revokeObjectURL(draft.headerImageLocalUrl)` antes de crear la nueva URL si existe una previa.
- **Files:** `image-uploader.tsx:44-47`
- **Justificacion:** Memory leak al re-seleccionar sin removal previo. Cumple T-04-02 mitigation de forma completa.

### Architectural deviations

Ninguna. Todas las decisiones arquitectónicas del plan (two-pane, React Context + useReducer, AI SDK v6 useChat, clone-no-modify del automation builder) se respetaron exactamente.

### Stubs creados

Ninguno. Todos los componentes tienen lógica funcional real — sin `TODO`, sin `throw new Error('not implemented')`.

## Authentication gates

Ninguno. El endpoint `/api/config-builder/templates/chat` y el upload ya delegan auth (cookies + workspace check) — Plan 03. La UI asume usuario autenticado (está dentro de `(dashboard)` group que tiene auth guard via middleware).

## Follow-ups

- **Task 4.4 checkpoint (human-verify):** requiere push a Vercel + testing manual. El orquestador maneja este paso.
  - **7 checks del plan:** regression automation builder, template builder loads, chat streams, right pane updates, edit preview directly, upload image (happy + size + MIME error paths), submit flow smoke test (si staging), session switcher.
  - **Resume signal:** usuario responde "approved" o describe el fallo.
- **Plan 05:** CTA "Crear con IA" en `/configuracion/whatsapp/templates/page.tsx`. Regression smoke que confirma `/automatizaciones/builder` sigue funcional. Push final a Vercel.
- **Backlog:** extender `/api/builder/sessions?kind=template` para filtro server-side si el volumen de sesiones crece — hoy es cliente.

## Archivos tocados (full list)

**Created (8):**
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/page.tsx` (14 líneas)
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx` (343 líneas)
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-draft-context.tsx` (77 líneas)
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx` (143 líneas)
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx` (267 líneas)
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/preview-pane.tsx` (289 líneas)
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/whatsapp-bubble.tsx` (41 líneas)
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/image-uploader.tsx` (159 líneas)

**Modified (0):**
- Ninguno.

**UNMODIFIED (verificado via `git diff --stat main~3 main -- <paths>`):**
- `src/app/(dashboard)/automatizaciones/builder/**` — byte-exact
- `src/app/api/builder/**` — byte-exact
- `src/lib/builder/**` — byte-exact
- `src/lib/config-builder/templates/**` — byte-exact (Plan 03 ya lo definió)
- `src/app/api/config-builder/templates/**` — byte-exact (Plan 03 ya lo definió)
- `src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx` (list) — byte-exact (Plan 05 añade el CTA)
- `src/app/(dashboard)/configuracion/whatsapp/templates/nuevo/**` (form manual) — byte-exact

## Commits

| Commit | Tarea |
|--------|-------|
| `1477ac9` | T1: shell + context + server entry |
| `70b0131` | T2: ChatPane + ChatMessage streaming |
| `0113f3e` | T3: PreviewPane + WhatsAppBubble + ImageUploader |

## Self-Check

- [x] `src/app/(dashboard)/configuracion/whatsapp/templates/builder/page.tsx` existe
- [x] `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx` existe
- [x] `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-draft-context.tsx` existe
- [x] `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx` existe
- [x] `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx` existe
- [x] `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/preview-pane.tsx` existe
- [x] `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/whatsapp-bubble.tsx` existe
- [x] `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/image-uploader.tsx` existe
- [x] Commit `1477ac9` existe en git log
- [x] Commit `70b0131` existe en git log
- [x] Commit `0113f3e` existe en git log
- [x] `grep -c "DefaultChatTransport" chat-pane.tsx` = 3 (import + new + key)
- [x] `grep -c "/api/config-builder/templates/chat" chat-pane.tsx` = 2 (comment + api prop)
- [x] `grep -c "X-Session-Id" chat-pane.tsx` = 3 (comment + getHeader + doc)
- [x] `grep -c "part.type" chat-message.tsx` = 2 (switch + default)
- [x] `grep -c "dynamic-tool" chat-message.tsx` = 1
- [x] `grep -c "useReducer" template-draft-context.tsx` = 3 (import + doc + use)
- [x] `grep -c "TemplateDraftProvider" template-builder-layout.tsx` = 4
- [x] `grep -c "/api/config-builder/templates/upload" image-uploader.tsx` = 3
- [x] `grep -c "es_CO" preview-pane.tsx` = 2
- [x] `grep -c "WhatsAppBubble" preview-pane.tsx` = 3
- [x] `git diff --stat main~3 main -- src/app/\(dashboard\)/automatizaciones/builder/ src/app/api/builder/ src/lib/builder/` retorna VACIO (Regla 6)
- [x] `npx tsc --noEmit -p .` → cero errores en archivos del plan (y cero en el proyecto excluyendo .test.ts pre-existentes)

## Self-Check: PASSED

## Status: paused-at-checkpoint

Task 4.4 (visual human-verify) requiere:
1. Push de los 3 commits a `main` y deploy a Vercel
2. Usuario visita URL desplegada, ejecuta los 7 checks del plan
3. Usuario reporta "approved" o descripción del fallo

El orquestador maneja el push + comunicación del checkpoint al usuario.
