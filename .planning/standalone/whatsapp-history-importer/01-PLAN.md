---
phase: whatsapp-history-importer
plan: 01
type: execute
wave: 1
depends_on: []
decisions: [D-01, D-05, D-07, D-08, D-09, D-10, D-11, D-12, D-13]
files_modified:
  - src/lib/domain/whatsapp-history-import.ts
  - src/lib/domain/__tests__/whatsapp-history-import.test.ts
  - src/lib/domain/index.ts
autonomous: true
requirements: [D-01, D-05, D-07, D-08, D-09, D-10, D-11, D-12, D-13]
must_haves:
  truths:
    - "Una función domain NUEVA `importHistoricalChat` inserta contacto+conversación+mensajes históricos vía createAdminClient, filtrando workspace_id (Regla 3)"
    - "La función NUNCA emite triggers: cero emitWhatsAppMessageReceived, cero checkKeywordMatches, cero inngest/runner (Regla 6)"
    - "Idempotencia: re-insertar las mismas filas (mismo wamid) NO duplica — upsert onConflict wamid ignoreDuplicates; retorna inserted vs duplicated"
    - "Merge archival silencioso (D-05): conversación nueva-por-import → is_read=true/unread=0/last_*=datos; conversación ya existente → NO toca is_read/unread/last_*/phone_number_id"
    - "get-or-create conversación por (workspace_id, phone, channel='whatsapp'); phone_number_id solo en create (D-10)"
    - "Contacto vía resolveOrCreateContact — name solo en create, no pisa CRM (D-09)"
  artifacts:
    - path: "src/lib/domain/whatsapp-history-import.ts"
      provides: "importHistoricalChat(ctx, params) — inserción histórica idempotente sin triggers"
      contains: "ignoreDuplicates"
    - path: "src/lib/domain/__tests__/whatsapp-history-import.test.ts"
      provides: "Unit tests: idempotencia, no-triggers (Regla 6), merge condicional D-05, get-or-create"
      contains: "history_import"
  key_links:
    - from: "src/lib/domain/whatsapp-history-import.ts"
      to: "messages upsert idempotente"
      via: "supabase.from('messages').upsert(..., { onConflict: 'wamid', ignoreDuplicates: true })"
      pattern: "onConflict:\\s*'wamid'"
    - from: "src/lib/domain/whatsapp-history-import.ts"
      to: "Regla 6 — sin emit de triggers"
      via: "ausencia de emitWhatsApp/checkKeyword"
      pattern: "resolveOrCreateContact"
---

<objective>
Crear la **función domain nueva** `importHistoricalChat` — el único punto de escritura del importador (Regla 3). Inserta contacto + conversación + mensajes históricos de un chat, **idempotente** (D-01 wamid), con **merge archival silencioso** (D-05), y **sin disparar ningún trigger/agente/automatización** (Regla 6 — por eso NO se reusa `receiveMessage`).

Output: módulo domain testeado + exportado, listo para que el CLI (Plan 02) lo consuma.
</objective>

<context>
Lee primero: `RESEARCH.md` §1, §2, §5. `CONTEXT.md` D-01/D-05/D-07/D-10/D-11.

Hechos clave (verificados):
- `conversations` unique = `(workspace_id, phone, channel)`; `phone_number_id` NOT NULL pero NO en la unicidad → solo create.
- `messages.wamid` UNIQUE global → `upsert({onConflict:'wamid', ignoreDuplicates:true}).select('id')` retorna solo filas insertadas.
- `messages.type` CHECK = 11 canónicos; `status` nullable.
- `receiveMessage` (messages.ts:747) emite triggers → PROHIBIDO reusar.
- `resolveOrCreateContact` (contacts.ts:726) no pisa contacto existente.
- `DomainContext = { workspaceId, source, cascadeDepth? }`.
- El CLI hace TODA la transformación pura (clasificar/mapear/wamid/timestamp) y pasa filas listas; esta función solo escribe.
</context>

<tasks>

### T1 — Implementar `importHistoricalChat`
Crear `src/lib/domain/whatsapp-history-import.ts`:

- Tipos: `ImportHistoricalChatParams` + `ImportHistoricalChatResult` (ver RESEARCH §5 verbatim).
- `export async function importHistoricalChat(ctx: DomainContext, params): Promise<DomainResult<ImportHistoricalChatResult>>`:
  1. `const supabase = createAdminClient()` (importar de `@/lib/supabase/admin`).
  2. **Contacto:** `const c = await resolveOrCreateContact(ctx, { phone: params.phone, name: params.contactName ?? undefined })`. Si `!c.success` → return `{success:false, error}`.
  3. **Normalizar phone** una vez (`normalizePhone` de `@/lib/utils/phone`) para llavear la conversación con el mismo valor que guarda el contacto. Si null → `{success:false}`.
  4. **get-or-create conversación:** `SELECT id FROM conversations WHERE workspace_id=ctx.workspaceId AND phone=<norm> AND channel='whatsapp'`. Si existe → `conversationId`, `conversationCreated=false`. Si no:
     - `INSERT { workspace_id, phone:<norm>, phone_number_id: params.phoneNumberId, channel:'whatsapp', status:'active', contact_id: c.data.contactId, is_read:true, unread_count:0 }` → `.select('id').single()`. Manejar carrera `23505` (re-SELECT). `conversationCreated=true`.
  5. **Mensajes:** construir filas:
     `{ conversation_id, workspace_id: ctx.workspaceId, wamid, direction, type:'text', content:{ body }, status, timestamp }`.
     `await supabase.from('messages').upsert(rows, { onConflict:'wamid', ignoreDuplicates:true }).select('id')`.
     `messagesInserted = data?.length ?? 0`; `messagesDuplicated = rows.length - messagesInserted`.
  6. **Update conversación condicional (D-05):** SOLO si `conversationCreated`:
     - `lastTs = max(timestamp)` de TODAS las filas (no solo insertadas); `preview = body del último mensaje cronológico, slice(0,100)`; `lastCustomerTs = max(timestamp) de direction='inbound'` (o null).
     - `UPDATE conversations SET last_message_at=lastTs, last_message_preview=preview, last_customer_message_at=lastCustomerTs, is_read=true, unread_count=0 WHERE id=conversationId`.
     - Si `!conversationCreated` → **NO ejecutar ningún UPDATE** sobre la conversación (archival silencioso).
  7. Return `{success:true, data:{ contactId, conversationId, conversationCreated, messagesInserted, messagesDuplicated }}`.
- **PROHIBIDO** en este archivo: importar/llamar `emitWhatsAppMessageReceived`, `checkKeywordMatches`, cualquier `inngest`, runner, o agente. NADA de envío.
- Manejo de errores: try/catch global → `{success:false, error}` (no throw; el CLI cuenta por chat).

**Acceptance:** `tsc --noEmit` limpio; el archivo no contiene `emit`/`inngest`/`runner`/`checkKeyword`.

### T2 — Exportar desde el barrel
En `src/lib/domain/index.ts` agregar `export * from './whatsapp-history-import'` (seguir el patrón existente del barrel).

**Acceptance:** `import { importHistoricalChat } from '@/lib/domain'` resuelve.

### T3 — Unit tests
Crear `src/lib/domain/__tests__/whatsapp-history-import.test.ts` (vitest, mock de `createAdminClient` + `resolveOrCreateContact` siguiendo el patrón de los tests existentes en `src/lib/domain/__tests__/`):
- **Idempotencia:** segunda corrida con mismas filas → `messagesInserted=0`, `messagesDuplicated=N` (mock upsert retorna [] la 2da vez).
- **Regla 6 (no-triggers):** spy/assert que NO se invoca ningún emisor (verificable porque el módulo no los importa; test documental + grep-gate en T4).
- **Merge D-05 — convo nueva:** `conversationCreated=true` → se ejecuta el UPDATE con is_read=true/unread=0/last_*.
- **Merge D-05 — convo existente:** SELECT retorna id → `conversationCreated=false` → **cero** UPDATE de conversación (assert que `.update` no se llamó sobre conversations).
- **Mapeo de filas:** type siempre 'text', content.body presente, status outbound='read'/inbound=null, wamid pasado verbatim.
- **Contacto no pisa:** resolveOrCreateContact recibe `{phone, name}` y su resultado se usa; no hay update de name.

**Acceptance:** `npx vitest run src/lib/domain/__tests__/whatsapp-history-import.test.ts` verde.

### T4 — Gate Regla 6 + Regla 3 (grep)
Verificar y dejar evidencia en el commit:
```
grep -nE "emitWhatsApp|checkKeyword|inngest|runner|streamText|generateText" src/lib/domain/whatsapp-history-import.ts   # → 0
grep -nc "createAdminClient" src/lib/domain/whatsapp-history-import.ts                                                   # → ≥1 (dentro de domain, OK)
```
**Acceptance:** primer grep = 0 matches.

</tasks>

<verification>
- `tsc --noEmit` limpio (la función vive en src/, se typechquea en build).
- vitest del módulo verde.
- grep Regla 6 = 0.
- Commit atómico: `feat(whatsapp-history-importer-01): domain importHistoricalChat idempotente sin triggers`.
</verification>
