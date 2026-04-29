---
phase: standalone-crm-mutation-tools
plan: 01
subsystem: domain
tags: [foundation, migration, idempotency, closeOrder, rehydrate-getters, inngest-cron]
dependency_graph:
  requires: []
  provides:
    - crm_mutation_idempotency_keys table (DB)
    - orders.closed_at column (DB)
    - getIdempotencyRow / insertIdempotencyRow / pruneIdempotencyRows (domain)
    - closeOrder (domain)
    - getContactNoteById / getOrderNoteById (domain)
    - getTaskById (domain)
    - crmMutationIdempotencyCleanupCron (Inngest)
  affects:
    - src/lib/domain/orders.ts (OrderDetail.closedAt agregado, getOrderById SELECT extendido)
    - src/app/api/inngest/route.ts (registro de cron nuevo)
tech_stack:
  added: []
  patterns:
    - Domain-as-sole-writer (D-pre-02): crm-mutation-idempotency.ts es el único archivo que toca crm_mutation_idempotency_keys
    - Soft-delete only (D-pre-04): closed_at independiente de archived_at
    - Rehydrate fresh post-mutación (D-09): closeOrder llama getOrderById tras update
    - Inngest cron pattern: TZ=America/Bogota inline + step.run encode-on-return
key_files:
  created:
    - supabase/migrations/20260429180000_crm_mutation_idempotency_keys.sql
    - supabase/migrations/20260429180001_orders_closed_at.sql
    - src/lib/domain/crm-mutation-idempotency.ts
    - src/inngest/functions/crm-mutation-idempotency-cleanup.ts
    - .planning/standalone/crm-mutation-tools/01-SUMMARY.md
  modified:
    - src/lib/domain/orders.ts (closeOrder + OrderDetail.closedAt + getOrderById SELECT)
    - src/lib/domain/notes.ts (getContactNoteById + getOrderNoteById + interfaces)
    - src/lib/domain/tasks.ts (getTaskById + TaskDetail interface)
    - src/app/api/inngest/route.ts (cron import + registro en functions[])
decisions:
  - D-03 idempotency table opt-in con TTL 30 días
  - D-09 rehydrate fresh post-mutación vía getXxxById (NUNCA fabricar snapshot desde input)
  - D-11 Resolución A locked — orders.closed_at + closeOrder distinct from archiveOrder
  - A11 gap closure — getNoteById/getTaskById agregados ahora para Plan 04
  - Notes contract usa `body` (camelCase) aunque DB column es `content` — consistencia con snapshot rehydrate
  - Tasks no expone archivedAt (no existe la columna en schema) — soft-delete via completed_at
metrics:
  completed: 2026-04-29
  duration_minutes: ~30
  tasks_total: 7
  tasks_completed: 7
  files_created: 5
  files_modified: 4
  commits: 7
---

# Standalone CRM Mutation Tools — Plan 01: Wave 0 Foundation Summary

Foundation entregada en una sola Wave 0: 2 migraciones DB aplicadas a producción + helpers domain de idempotencia + closeOrder (Resolución A) + 3 getters by-id para rehydrate verídico (A11 gap closure) + cron Inngest TTL diario. Plan 02 desbloqueado.

## Tasks Completadas

| # | Task | Commit | Archivos |
|---|------|--------|----------|
| 1.1 | Migration crm_mutation_idempotency_keys | `743788e` | `supabase/migrations/20260429180000_crm_mutation_idempotency_keys.sql` |
| 1.2 | Migration orders.closed_at (D-11 Resolución A) | `22a6bbf` | `supabase/migrations/20260429180001_orders_closed_at.sql` |
| 1.3 | PAUSE — User aplica ambas migraciones a producción Supabase (Regla 5) | — | (sin commit; user typed "approved" tras los 4 SELECT verifications) |
| 1.4 | Domain idempotency helpers (get/insert/prune) | `f7dc247` | `src/lib/domain/crm-mutation-idempotency.ts` |
| 1.5 | Domain closeOrder + OrderDetail.closedAt | `85a01db` | `src/lib/domain/orders.ts` |
| 1.5-bis | Domain getters by-id (notes + tasks, A11 gap) | `cabcb38` | `src/lib/domain/notes.ts`, `src/lib/domain/tasks.ts` |
| 1.6 | Inngest cron idempotency cleanup + registro | `31a5320` | `src/inngest/functions/crm-mutation-idempotency-cleanup.ts`, `src/app/api/inngest/route.ts` |
| 1.7 | Push to origin/main + SUMMARY commit | (este commit) | `.planning/standalone/crm-mutation-tools/01-SUMMARY.md` |

## Highlights

### 1. Migraciones aplicadas a producción ANTES del push (Regla 5)

Ambos archivos SQL fueron staged como commits locales (`743788e`, `22a6bbf`) y el push se difirió hasta después de la PAUSE de Task 1.3. El usuario confirmó "approved" tras correr 4 verificaciones en Supabase Editor:

1. `SELECT 1 FROM crm_mutation_idempotency_keys LIMIT 0;` → no error.
2. `SELECT closed_at FROM orders LIMIT 0;` → no error.
3. `SELECT indexname FROM pg_indexes WHERE tablename = 'orders' AND indexname = 'idx_orders_closed_at_not_null';` → 1 row.
4. `SELECT policyname FROM pg_policies WHERE tablename = 'crm_mutation_idempotency_keys';` → 1 row (`crm_mutation_idempotency_keys_select`).

Esto cumple Regla 5: nunca pushear código que referencia tabla/columna inexistente en producción (incidente de 20h de mensajes perdidos como prevención).

### 2. Idempotency helpers (D-pre-02 sole-writer pattern)

`src/lib/domain/crm-mutation-idempotency.ts` es el ÚNICO archivo del repo que escribe a `crm_mutation_idempotency_keys`. Cero `createAdminClient` sobre esa tabla en cualquier otro lugar. Tres exports:

- `getIdempotencyRow(ctx, { toolName, key })` — lookup por PK; null = miss.
- `insertIdempotencyRow(ctx, { toolName, key, resultId, resultPayload })` — upsert con `ignoreDuplicates: true` (= ON CONFLICT DO NOTHING). `data.inserted` indica si ganamos la carrera.
- `pruneIdempotencyRows(olderThanDays)` — DELETE workspace-agnostic (cron scope).

Plan 02 consume estos helpers desde `helpers.withIdempotency()` (espejo del flow `withIdempotency` definido en RESEARCH.md).

### 3. closeOrder = Resolución A locked (D-11)

`closeOrder` es el único de los 15 tools que carecía de domain function. Implementado como mirror exacto de `archiveOrder`:

- Pre-check `SELECT id, closed_at FROM orders WHERE id=? AND workspace_id=?` (workspace isolation).
- Idempotente: si `closed_at IS NOT NULL`, retorna `OrderDetail` re-hidratado SIN re-mutar el timestamp (preserva el momento original del cierre).
- UPDATE `closed_at = NOW().toISOString()` cuando es la primera vez.
- Re-hidrata vía `getOrderById(ctx, { orderId, includeArchived: true })` para soportar el caso edge donde un pedido esté archivado Y cerrado simultáneamente (campos independientes).

`OrderDetail` ahora expone `closedAt: string | null` (nuevo campo no opcional). `getOrderById` SELECT extendido para incluir `closed_at` y mapping seguro con cast `(data as { closed_at?: string | null })`.

TODO inline documentado: cuando se agregue `order.closed` al TRIGGER_CATALOG, `closeOrder` debe emitirlo (D-11 — hoy no existe ese trigger).

### 4. A11 gap closure — 3 nuevos getters by-id

Research detectó que notes y tasks no exponían getters por id. Plan 04 los necesita para rehydrate verídico (D-09 — Pitfall 6: NUNCA fabricar snapshot desde input). Agregados ANTES de Plan 04 para evitar dependencia circular:

- `getContactNoteById(ctx, { noteId })` → `ContactNoteDetail | null`
- `getOrderNoteById(ctx, { noteId })` → `OrderNoteDetail | null`
- `getTaskById(ctx, { taskId })` → `TaskDetail | null`

Todos filtran `.eq('workspace_id', ctx.workspaceId)` (Regla 3 absoluta). Decisiones de mapping:

- **Notes**: la columna DB es `content`, pero el contract público es `body` (camelCase consistente con snapshot rehydrate del flujo crm-mutation-tools). Mapping `body: data.content as string` en ambos getters.
- **Tasks**: el schema (migración `20260203000004_tasks_foundation.sql`) NO tiene `archived_at` — soft-delete usa `completed_at`. `TaskDetail` no expone `archivedAt`. Columna real es `due_date` (no `due_at`), expuesta como `dueDate: string | null`.

### 5. Inngest cron seguro (WARNING #5 satisfecho)

`src/app/api/inngest/route.ts` es infra compartida — un import roto rompería TODOS los crons del proyecto. Ordering aplicado:

1. Cron file creado y validado con `npx tsc --noEmit -p .` (zero errors).
2. Cron file commiteado en mismo commit que el edit de `route.ts` — `git diff --cached --name-only` muestra los 2 archivos juntos (Task 1.6 acceptance OK).
3. TS gate sobre `src/app/api/inngest/**` retorna 0 errores antes del push (Task 1.6 explicit gate).

Cron config:

- ID: `crm-mutation-idempotency-cleanup`
- Cron: `TZ=America/Bogota 0 3 * * *` (diario 03:00 Bogota — off-peak, evita colisión con `*/1 * * * *` del crm-bot-expire-proposals).
- Retries: 1.
- step.run encode-on-return → result serializado por Inngest replay boundaries.

## Deviations from Plan

**None.** Plan ejecutado exactamente como escrito. Las únicas adaptaciones (todas previstas explícitamente en `<read_first>` y `<action>` del plan) fueron:

- Notes column real es `content` no `body` → mapping en interface a `body` (Plan instructed: "MANTENER el contract").
- Tasks no tiene `archived_at` → omitido del interface (Plan instructed: "ej: `archived_at` puede no existir en tasks ... AJUSTAR el SELECT y el interface").
- Tasks usa `due_date` no `due_at` → expuesto como `dueDate` (Plan instructed: "verificar nombres exactos de columnas").

Estas adaptaciones están documentadas en los doc-comments de los nuevos getters para que Plan 04 las consuma sin sorpresas.

## Authentication Gates

**None.** Solo la PAUSE estructural de Task 1.3 (Regla 5 migration apply) que el usuario manejó con "approved".

## Acceptance Criteria — Verification

| Plan acceptance | Resultado |
|---|---|
| Task 1.4: file exists + 3 exports + tsc clean | OK (3/3 functions, 0 errors) |
| Task 1.5: closeOrder export count == 1, tsc clean, ≥2 closed_at refs | OK (1 export, 0 errors, 9 refs) |
| Task 1.5-bis: 3 getters + 3 interfaces + workspace_id filter en cada uno + tsc clean | OK (1+1+1 getters, 2+1 interfaces, 2+1 workspace filters, 0 errors) |
| Task 1.6: cron file + TZ=America/Bogota 0 3 * * * literal + registro en route.ts + TS gate sobre inngest infra == 0 | OK (file present, 2 cron literals, 2 mentions in route.ts, 0 errors) |
| Task 1.7: git log includes "crm-mutation-tools" + "wave 0", git status clean, push success | (verificado tras push final abajo) |

## Self-Check: PASSED

- All 5 created files exist on disk (verified at SUMMARY write time).
- All 4 modified files contain the expected new code blocks (grep verified per task).
- All 6 prior commits exist locally (`git log --oneline origin/main..HEAD`):
  - 743788e (Task 1.1) FOUND
  - 22a6bbf (Task 1.2) FOUND
  - f7dc247 (Task 1.4) FOUND
  - 85a01db (Task 1.5) FOUND
  - cabcb38 (Task 1.5-bis) FOUND
  - 31a5320 (Task 1.6) FOUND
- Final commit (Task 1.7 with this SUMMARY) created below.
- Push to `origin/main` will move HEAD to remote tip (verification in next step).

## Next

- **Plan 02:** consumes `getIdempotencyRow` + `insertIdempotencyRow` from this Wave 0 to implement `withIdempotency` helper inside `src/lib/agents/shared/crm-mutation-tools/helpers.ts`. Also consumes `closeOrder` + `OrderDetail.closedAt` for the `closeOrder` tool wrapper.
- **Plan 04:** consumes `getContactNoteById` / `getOrderNoteById` / `getTaskById` for rehydrate-from-domain in note + task mutation tools (D-09 — NUNCA desde input).
- **Production cron:** `crmMutationIdempotencyCleanupCron` arrancará en Inngest Cloud al primer trigger 03:00 Bogota tras el deploy de este push.

---

*Standalone: crm-mutation-tools — Plan 01 (Wave 0)*
*Completed 2026-04-29.*
