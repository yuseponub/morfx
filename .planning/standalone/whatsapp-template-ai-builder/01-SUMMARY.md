---
phase: whatsapp-template-ai-builder
plan: 01
subsystem: config-builder / whatsapp-templates
tags: [foundation, migration, agent-scope, 360dialog, resumable-upload]
status: completed
dependency-graph:
  requires:
    - ".planning/standalone/whatsapp-template-ai-builder/CONTEXT.md (D-09, D-10, D-11, D-15)"
    - "supabase/migrations/20260214000000_builder_sessions.sql (base table)"
    - ".claude/rules/agent-scope.md (governance mandate)"
  provides:
    - "Agent scope 'config-builder-whatsapp-templates' registrado en .claude/rules/agent-scope.md"
    - "builder_sessions.kind columna en producción (TEXT NOT NULL DEFAULT 'automation' CHECK IN ('automation','template'))"
    - "Índice idx_builder_sessions_workspace_kind (workspace_id, kind, updated_at DESC)"
    - "BuilderSession.kind en src/lib/builder/types.ts"
    - "createSession(workspaceId, userId, title?, kind='automation') — param kind opcional backward-compat"
    - "getSessions(workspaceId, userId, limit, kind?) — filtro opcional por kind"
    - "uploadHeaderImage360(apiKey, bytes, mimeType, fileName) en src/lib/whatsapp/templates-api.ts"
    - "UploadHeaderImageResult interface ({ handle })"
  affects:
    - "Builder de automatizaciones en producción (UNCHANGED — Regla 6 preservada)"
    - "Habilita Plan 02 (domain layer createTemplate con header_handle) y planes posteriores"
tech-stack:
  added: []
  patterns:
    - "Governance-before-code (.claude/rules/agent-scope.md mandate)"
    - "ALTER TABLE con DEFAULT + CHECK constraint safe para backfill"
    - "Regla 5 blocking checkpoint — migración aplicada ANTES de pushear código que la referencia"
    - "360 Dialog resumable upload (2-step POST /uploads → POST /{session_id})"
    - "D360-API-KEY header auth (NO OAuth)"
    - "Backward-compatible function signature extension (nuevo param opcional con default)"
key-files:
  created:
    - path: "supabase/migrations/20260421000000_builder_sessions_kind.sql"
      why: "Agrega columna kind a builder_sessions para soportar múltiples sabores de builder"
  modified:
    - path: ".claude/rules/agent-scope.md"
      why: "Registra el scope config-builder-whatsapp-templates antes de cualquier tool handler (BLOQUEANTE per línea 60)"
    - path: "src/lib/builder/types.ts"
      why: "BuilderSession.kind: 'automation' | 'template' agregado"
    - path: "src/lib/builder/session-store.ts"
      why: "createSession + getSessions aceptan kind opcional (backward-compat Regla 6)"
    - path: "src/lib/whatsapp/templates-api.ts"
      why: "Helper uploadHeaderImage360 apendido al final (existing exports intactos)"
decisions:
  - "D-09 honorado: es_CO queda disponible como valor de language a nivel del builder (no se restringe en este plan — el CHECK de la DB es solo sobre 'kind')"
  - "D-10 honorado: endpoint /uploads (resumable) — NO /v1/media; genera handle permanente aceptable por Meta en example.header_handle[0]"
  - "D-11 honorado: uploadHeaderImage360 recibe bytes (ArrayBuffer | Uint8Array) — el caller domain puede re-subir desde Supabase Storage o bytes directos"
  - "D-15 honorado: scope registrado en agent-scope.md con PUEDE/NO PUEDE/Validación antes de cualquier archivo bajo src/lib/config-builder/"
  - "DEFAULT 'automation' en kind preserva el builder de automatizaciones en producción sin feature flag (Regla 6)"
  - "CHECK constraint con lista explícita ('automation','template') — extender el enum requiere nueva ALTER (intencional para controlar growth)"
  - "Índice compuesto (workspace_id, kind, updated_at DESC) pre-optimiza el listado filtrado por tipo del sidebar del builder"
  - "getSessions.kind opcional con default undefined → sin filtro; la ruta /api/builder/sessions sigue funcionando idéntica (el automation builder no conoce aún el param)"
  - "getSession(id, workspaceId) y updateSession(id, workspaceId, patch) NO filtran/permiten kind — lookup por PK ya es seguro; kind es inmutable post-insert"
metrics:
  duration: "2 sesiones (inicial hasta checkpoint + reanudada post-migración)"
  completed: "2026-04-20"
  tasks_completed: 5
  tasks_pending: 0
---

# Standalone whatsapp-template-ai-builder — Plan 01: Foundation Summary

Foundation wave completo — scope del agente registrado, migración `builder_sessions.kind` creada **y aplicada en producción por el usuario**, session-store extendido con `kind` opcional (backward-compat), y helper resumable `uploadHeaderImage360()` exportado.

## Tareas

| # | Tarea | Estado | Commit |
|---|-------|--------|--------|
| 1.1 | Registrar scope `config-builder-whatsapp-templates` en `.claude/rules/agent-scope.md` | ✓ completada | `825d6f8` |
| 1.2 | Crear migración `20260421000000_builder_sessions_kind.sql` | ✓ completada | `da73437` |
| 1.3 | **[BLOCKING]** Aplicar migración en Supabase producción (Regla 5) | ✓ aplicada por usuario | — (acción humana) |
| 1.4 | Extender `session-store.ts` + types con param `kind` opcional (Regla 6) | ✓ completada | `a6bcf9c` |
| 1.5 | Agregar helper `uploadHeaderImage360()` resumable | ✓ completada | `c964bf1` |

## Firma exacta de `uploadHeaderImage360`

```typescript
export interface UploadHeaderImageResult {
  handle: string  // "4::aW..."
}

export async function uploadHeaderImage360(
  apiKey: string,
  bytes: ArrayBuffer | Uint8Array,
  mimeType: 'image/jpeg' | 'image/png',
  fileName: string
): Promise<UploadHeaderImageResult>
```

Flujo interno:
1. `POST https://waba-v2.360dialog.io/uploads?file_length=X&file_type=image/jpeg&file_name=...` con header `D360-API-KEY` → `{ id: "upload:MTphd..." }`
2. `POST https://waba-v2.360dialog.io/{sessionId}` con headers `D360-API-KEY`, `file_offset: 0`, `Content-Type: image/jpeg` y body = bytes → `{ h: "4::aW..." }`
3. Retorna `{ handle: h }` listo para `components[].example.header_handle[0]` en `createTemplate360()`.

## Firmas actualizadas de session-store

```typescript
// createSession — kind opcional con default 'automation' (Regla 6)
export async function createSession(
  workspaceId: string,
  userId: string,
  title?: string,
  kind: 'automation' | 'template' = 'automation'
): Promise<BuilderSession | null>

// getSessions — kind filtro opcional; undefined => sin filtro
export async function getSessions(
  workspaceId: string,
  userId: string,
  limit: number = 20,
  kind?: 'automation' | 'template'
): Promise<Pick<BuilderSession, 'id' | 'title' | 'created_at' | 'updated_at' | 'automations_created' | 'kind'>[]>
```

`getSession` y `updateSession` no se modificaron — el primero ya filtra por PK+workspaceId (seguro), y el segundo no incluye `kind` en el patch porque es inmutable post-insert.

## Migración aplicada en producción (Task 1.3 — Regla 5)

- **Archivo:** `supabase/migrations/20260421000000_builder_sessions_kind.sql`
- **Timestamp:** `20260421000000`
- **Confirmación del usuario:** "Success. No rows returned." — aplicada el **2026-04-20** en Supabase producción del proyecto morfx-new antes de que Tasks 1.4 y 1.5 tocaran código dependiente.
- **Protección contra incidente de 20h:** cumplida. Ningún código fue pusheado referenciando `builder_sessions.kind` antes de que la columna existiera en producción.

## Sanidad Regla 6 (agente en producción UNCHANGED)

Verificaciones ejecutadas:

- [x] `src/app/api/builder/chat/route.ts` — `git diff` vacío (UNMODIFIED). Caller existente `createSession(workspaceId, user.id, title)` sigue funcionando: los 3 args llenan los 3 primeros params y `kind` defaultea a `'automation'`.
- [x] `src/app/api/builder/sessions/route.ts` — `git diff` vacío (UNMODIFIED). Caller existente `getSessions(ctx.workspaceId, ctx.userId, 20)` sigue funcionando: `kind` defaultea a `undefined` → sin filtro → devuelve las mismas filas que antes.
- [x] `DEFAULT 'automation'` en DB garantiza que cualquier INSERT desde código legacy (sin incluir `kind` en el payload) recibe el valor correcto automáticamente — pero nuestro nuevo `createSession` ya siempre pasa `kind` explícito.
- [x] Todas las filas pre-existentes de `builder_sessions` fueron backfilled a `'automation'` por el DEFAULT en el ALTER.

## Sanidad TypeScript

```
npx tsc --noEmit -p .  →  0 errores en archivos del plan (session-store.ts, types.ts, templates-api.ts)
```

Los únicos errores TS del proyecto son pre-existentes en archivos `.test.ts` por `vitest` no instalado (no tiene relación con este plan).

## Archivos tocados (full list)

**Created:**
- `supabase/migrations/20260421000000_builder_sessions_kind.sql` — migración aplicada en prod 2026-04-20

**Modified:**
- `.claude/rules/agent-scope.md` — nueva sección H3 "Config Builder: WhatsApp Templates"
- `src/lib/builder/types.ts` — `BuilderSession.kind` agregado
- `src/lib/builder/session-store.ts` — `createSession` + `getSessions` con param `kind` opcional
- `src/lib/whatsapp/templates-api.ts` — `UploadHeaderImageResult` + `uploadHeaderImage360()` apendidos al final

**UNMODIFIED (verificado por git diff vacío):**
- `src/app/api/builder/chat/route.ts`
- `src/app/api/builder/sessions/route.ts`

## Decisiones LOCKED honradas

- **D-09** — idiomas `es`, `es_CO`, `en_US` disponibles a nivel builder (este plan no restringe `language`; solo agrega column `kind` para distinguir sabores de builder)
- **D-10** — endpoint `/uploads` resumable (NO `/v1/media`); genera handle permanente aceptable por Meta
- **D-11** — dos pasos (sesión + bytes) con re-upload desde bytes en memoria; caller domain puede traer los bytes desde Supabase Storage o de un buffer
- **D-15** — scope del agente registrado ANTES de cualquier tool handler, con PUEDE/NO PUEDE/Validación explícitos

## Deviations

Ninguna. Plan ejecutado exactamente como estaba escrito, incluyendo:
- Filename y contenido exactos de la migración
- Copia verbatim del helper `uploadHeaderImage360` desde RESEARCH.md (Example 1)
- Firma exacta de `createSession` / `getSessions` con `kind` al final (compatibilidad hacia atrás)

## Follow-ups (fuera de este plan)

- Plan 02: domain layer `src/lib/domain/whatsapp-templates.ts` con `createTemplate()` que consume `uploadHeaderImage360` para poblar `header_handle`
- Plan 03+: tool handlers del agente `config-builder-whatsapp-templates` bajo `src/lib/config-builder/templates/`
- La deprecación del form manual en `/configuracion/whatsapp/templates/nuevo` sigue fuera de alcance de este standalone

## Self-Check

- [x] `.claude/rules/agent-scope.md` contiene `config-builder-whatsapp-templates` (Task 1.1)
- [x] `supabase/migrations/20260421000000_builder_sessions_kind.sql` existe y contiene `ALTER TABLE builder_sessions`
- [x] Migración aplicada en Supabase producción (confirmación del usuario 2026-04-20 — "Success. No rows returned.")
- [x] `src/lib/builder/types.ts` contiene `kind: 'automation' | 'template'`
- [x] `src/lib/builder/session-store.ts` contiene `kind: 'automation' | 'template' = 'automation'` en `createSession`
- [x] `src/lib/builder/session-store.ts` contiene `kind?: 'automation' | 'template'` en `getSessions`
- [x] `src/lib/whatsapp/templates-api.ts` contiene `export async function uploadHeaderImage360`
- [x] `src/lib/whatsapp/templates-api.ts` contiene `export interface UploadHeaderImageResult`
- [x] `src/lib/whatsapp/templates-api.ts` usa `'D360-API-KEY': apiKey` (NO `Authorization: OAuth`)
- [x] `npx tsc --noEmit` reporta 0 errores en archivos del plan
- [x] Rutas `/api/builder/chat` y `/api/builder/sessions` UNMODIFIED (git diff vacío)
- [x] Commit `825d6f8` existe — Task 1.1
- [x] Commit `da73437` existe — Task 1.2
- [x] Commit `a6bcf9c` existe — Task 1.4
- [x] Commit `c964bf1` existe — Task 1.5

## Self-Check: PASSED
