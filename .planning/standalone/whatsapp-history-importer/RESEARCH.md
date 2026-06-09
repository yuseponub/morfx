# WhatsApp History Importer — RESEARCH

**Standalone:** `whatsapp-history-importer` (Etapa 2 de 2)
**Researched:** 2026-06-09
**Status:** Research completo — listo para `plan-phase` (los PLAN ya están escritos en este mismo standalone)
**Consume:** `CONTEXT.md` (D-01..D-13)

> Research mayormente **interno al codebase** (es una herramienta de migración de datos, no hay incógnitas de web). Todos los hechos materiales se verificaron contra el código y contra el **backup real** (`robot-whatsapp-reader/output/573202067077/`, 537 chats).

---

## 1. Esquema destino — hechos verificados (RIGEN el diseño)

### 1.1 `conversations` (migración `20260130000002` + `20260317000000`)
- Unique key efectiva: **`UNIQUE(workspace_id, phone, channel)`** (el `UNIQUE(workspace_id, phone)` original fue reemplazado en `20260317000000_add_channel_to_conversations.sql`).
- `phone TEXT NOT NULL`, `phone_number_id TEXT NOT NULL`, `channel TEXT NOT NULL DEFAULT 'whatsapp'`.
- `status` CHECK ∈ {active, archived}; `is_read BOOL DEFAULT false`; `unread_count INT DEFAULT 0`.
- `last_customer_message_at`, `last_message_at` (TIMESTAMPTZ), `last_message_preview TEXT`.
- **Implicación (D-10):** get-or-create se llavea por `(workspace_id, phone, channel='whatsapp')`. `phone_number_id` NO participa en la unicidad → se setea solo en el INSERT. `phone` es NOT NULL → confirma D-02 (no se puede insertar chat sin número).

### 1.2 `messages` (migración `20260130000002`)
- `wamid TEXT` con **`CONSTRAINT messages_wamid_unique UNIQUE (wamid)`** (constraint completo; NULL permitido N veces en PG).
- `direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound'))`.
- `type TEXT NOT NULL CHECK (type IN ('text','image','video','audio','document','sticker','location','contacts','template','interactive','reaction'))` — **11 tipos canónicos; NO existe `'chat'` ni `'unknown'`**.
- `content JSONB NOT NULL` — el inbox lee `content.body` (verificado en `interactive-bubble.tsx:35` y `use-messages.ts:210` → `(m.content as TextContent).body`). → `type='text'` con `content={body:...}` **rinde correcto**.
- `status TEXT CHECK (status IN ('pending','sent','delivered','read','failed'))` — **nullable**. → outbound histórico `'read'`, inbound `null` (D-11) cumplen el CHECK.
- `timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())`.
- **NO existe `source` ni `imported_at`.** → confirma D-01 (marcador vía wamid prefix, cero migración).

### 1.3 Idempotencia — precedente de código
- `src/lib/domain/crm-mutation-idempotency.ts:103` usa `.upsert(row, { onConflict: '...', ignoreDuplicates: true })`.
- **Patrón a usar:** `supabase.from('messages').upsert(rows, { onConflict: 'wamid', ignoreDuplicates: true }).select('id')`. Con `ignoreDuplicates`, supabase-js retorna **solo las filas insertadas** → `data.length` = insertados; `rows.length - data.length` = duplicados (re-corrida). Da el conteo del reporte gratis.

---

## 2. Por qué NO reusar `receiveMessage` (Regla 6)

`src/lib/domain/messages.ts:747` `receiveMessage`:
1. Inserta el mensaje (bien), pero además:
2. `UPDATE conversations SET ... is_read=false` (rompe D-05 — finge actividad nueva).
3. **`emitWhatsAppMessageReceived(...)`** → dispara el runner/agentes (VIOLA Regla 6).
4. **`checkKeywordMatches(...)`** → dispara automatizaciones por keyword (VIOLA Regla 6).

→ **Se requiere función domain NUEVA** (D-07) sin pasos 2-4. Insert directo idempotente + update de conversación condicional (D-05).

---

## 3. Mapeo origen → destino (D-08..D-12) refinado con datos reales

### 3.1 Distribución real del backup Varixcenter (537 chats, 4173 mensajes)

| `type` (origen) | count | con texto | bucket | destino |
|---|---|---|---|---|
| `chat` | 2967 | 2967 | TEXT | `type='text'`, body=text |
| `interactive` | 240 | **11** | TEXT si texto / SKIP si no | 11→text, 229→skip |
| `automated_greeting_message` | 47 | **9** | TEXT si texto / SKIP si no | 9→text, 38→skip |
| `image` | 79 | 0 | MEDIA placeholder | `type='text'`, body=note |
| `ptt` (nota de voz) | 63 | 0 | MEDIA placeholder | `type='text'`, body=note |
| `document` | 22 | 0 | MEDIA placeholder | `type='text'`, body=note |
| `sticker` | 5 | 0 | MEDIA placeholder | `type='text'`, body=note |
| `vcard` | 3 | 0 | MEDIA placeholder | `type='text'`, body=note |
| `video` | 2 | 0 | MEDIA placeholder | `type='text'`, body=note |
| `e2e_notification` | 535 | 0 | SYSTEM | **SKIP** |
| `notification_template` | 159 | 0 | SYSTEM | **SKIP** |
| `protocol` | 22 | 0 | SYSTEM | **SKIP** |
| `revoked` | 15 | 0 | SYSTEM | **SKIP** |
| `gp2` | 8 | 0 | SYSTEM | **SKIP** |
| `unknown` | 3 | 0 | SYSTEM | **SKIP** |
| `ciphertext` | 3 | 0 | SYSTEM | **SKIP** |

`numberMissing`: **0** en este backup → la rama D-02 (skip+alert) no se dispara aquí, pero **debe** implementarse igual (otros clientes la usarán).
Anomalías: **0** `chat` con `text=null`; **0** body vacío tras fallback.

### 3.2 Clasificación (función pura `classifyMessage(m): 'text' | 'media' | 'skip'`)

```
SYSTEM_TYPES   = {e2e_notification, notification_template, protocol, revoked, gp2,
                  unknown, ciphertext, call_log, group_notification}
MEDIA_TYPES    = {image, video, audio, ptt, document, sticker, vcard, multi_vcard, location}
TEXT_TYPES     = {chat, interactive, automated_greeting_message}

if type ∈ SYSTEM_TYPES                       → 'skip'   (D-04)
else if type ∈ TEXT_TYPES and text != ''     → 'text'   (body = text)
else if type ∈ MEDIA_TYPES                   → 'media'  (D-03 → type='text', body = note)
else                                          → 'skip'   (TEXT_TYPE sin texto, o tipo desconocido → ruido)
```

> **Decisión de research (overridable en el piloto):** los `interactive`/`greeting` **sin texto** (note genérico `<… omitido>`, sin contenido legible) se **SALTAN** como ruido, igual que system. Solo se conserva contenido legible (texto real) o marcas de media real (que sí dan contexto: "aquí mandó una foto/audio"). El usuario puede revertir esto en el gate del piloto si quiere conservar los placeholders de interactive.

### 3.3 Conteo esperado para el criterio de éxito (este backup)
- **Insertados ≈ 3161** = TEXT(2967+11+9=2987) + MEDIA(174).
- **Saltados ≈ 1012** = SYSTEM(745) + interactive/greeting sin texto(229+38=267).
- 3161 + 1012 = 4173 ✓ (cuadra exacto). El reporte debe reproducir este desglose.
- Direcciones: 2568 outbound / 1605 inbound (pre-skip). Post-skip los conteos cambian; el reporte los recomputa.

### 3.4 Body de media placeholder
- Etapa 1 ya escribe notes en español claro: `<imagen omitida>`, `<nota de voz omitida>`, `<documento omitido>`, etc.
- **V1:** `content.body = note` verbatim (faithful, simple). El gate del piloto decide si se "limpia" a etiquetas tipo `📷 Imagen` (polish opcional — Claude's discretion).

### 3.5 Timestamp
- Origen: `"yyyy-MM-dd HH:mm:ss -05:00"` (ej. `"2026-05-28 15:18:19 -05:00"`) — **ya trae offset -05:00**.
- `new Date("2026-05-28 15:18:19 -05:00")` parsea bien en Node (offset explícito) → ISO UTC → la columna TIMESTAMPTZ guarda el instante correcto; el frontend ya formatea a `America/Bogota` (Regla 2). No hace falta `date-fns-tz` en el importador (el offset está en la cadena). Validar parse en el piloto (1 caso) por robustez.

---

## 4. `phone` y contactos

- **D-08:** `phone = "+" + ChatBackup.number`. `normalizePhone` (`@/lib/utils/phone:37`) parsea `+<digits>` con `libphonenumber` → E.164. Maneja internacionales (el backup tiene US `+1…`, ES `+34…`, CL `+56…`). `resolveOrCreateContact` ya normaliza internamente.
- **D-09:** `resolveOrCreateContact(ctx, {phone, name: contactName})` — `createContact` setea `name: params.name ?? params.phone` **solo en create**; búsqueda por phone normalizado exacto. **No pisa** nombre/datos de un contacto existente. ✓
- **Riesgo:** un `number` malformado → `resolveOrCreateContact` retorna `{success:false}`. El importador **captura por chat**, lo cuenta como error y sigue (no aborta el batch).

---

## 5. Función domain nueva — contrato propuesto (Claude's discretion en naming)

`src/lib/domain/whatsapp-history-import.ts`:

```ts
export interface ImportHistoricalChatParams {
  phone: string                 // "+57..." (sin normalizar; domain normaliza)
  phoneNumberId: string         // input CLI — solo se usa en create de conversación
  contactName: string | null
  messages: Array<{             // YA mapeadas+clasificadas por el CLI (puras)
    wamid: string               // "import:<chatId>:<idx>"
    direction: 'inbound' | 'outbound'
    type: 'text'                // V1: siempre 'text'
    body: string
    timestamp: string           // ISO
    status: 'read' | null
  }>
}
export interface ImportHistoricalChatResult {
  contactId: string
  conversationId: string
  conversationCreated: boolean
  messagesInserted: number      // filas realmente nuevas (ignoreDuplicates)
  messagesDuplicated: number    // ya existían (re-corrida idempotente)
}
export async function importHistoricalChat(
  ctx: DomainContext,           // { workspaceId, source:'history_import' }
  params: ImportHistoricalChatParams
): Promise<DomainResult<ImportHistoricalChatResult>>
```

Pasos internos (Regla 3, sin triggers — Regla 6):
1. `resolveOrCreateContact(ctx, { phone, name: contactName })`.
2. get-or-create conversación: `SELECT id FROM conversations WHERE workspace_id, phone(normalizado), channel='whatsapp'`. Si no existe → INSERT con `phone_number_id`, `contact_id`, `channel='whatsapp'`, `status='active'`, `is_read=true`, `unread_count=0` (D-05 convo nueva). `conversationCreated=true`.
3. `upsert(messageRows, { onConflict:'wamid', ignoreDuplicates:true }).select('id')` → `messagesInserted = data.length`; `messagesDuplicated = rows.length - data.length`.
4. **Update de conversación condicional (D-05):**
   - Si `conversationCreated` → `UPDATE ... SET last_message_at=<max ts>, last_message_preview=<último body, ≤100 chars>, last_customer_message_at=<max ts inbound>, is_read=true, unread_count=0`.
   - Si existente (viva) → **NO tocar** `is_read/unread_count/last_message_at/last_message_preview/last_customer_message_at/phone_number_id`. (Solo se insertaron los mensajes en el hilo.)
5. **NUNCA** `emitWhatsAppMessageReceived` ni `checkKeywordMatches`.
6. Retornar conteos.

> El CLI hace toda la transformación pura (clasificar, mapear, sintetizar wamid, parsear timestamp) y pasa filas listas. El domain solo hace get-or-create + write idempotente + update condicional. Separación limpia: pura testeable en el CLI, escritura testeable en domain.

---

## 6. CLI — `scripts/import-whatsapp-history.ts` (D-06)

- Args: `--backup <ruta carpeta del número>` `--workspace <uuid>` `--phone-number-id <id>` `[--apply]` (default = **dry-run**) `[--limit N]` (para piloto).
- Lee `manifest.json`; itera chats `status='done'` (los `pending/failed` de Etapa 1 se ignoran/reportan).
- Por chat: carga `<file>.json`, valida `numberMissing` (D-02 → skip+alert), clasifica+mapea mensajes (sección 3.2), sintetiza wamids, y:
  - **dry-run:** NO escribe; acumula conteos proyectados.
  - **apply:** llama `importHistoricalChat(...)` por chat.
- Carga env: `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` (igual que otros `scripts/*.ts`). Correr local: `npx tsx scripts/import-whatsapp-history.ts --backup robot-whatsapp-reader/output/573202067077 --workspace <uuid> --phone-number-id <id>`.
- Reporte final (stdout, tabla): chats procesados / saltados(numberMissing) / con error; contactos creados vs encontrados; conversaciones creadas vs mergeadas; mensajes insertados / duplicados / saltados(system) / saltados(interactive-sin-texto). Compara contra el manifest (`Σ messageCount`).
- **Cero `createAdminClient` en el script** (verificable con grep) — toda escritura vía `importHistoricalChat`.

---

## 7. Pitfalls identificados

1. **`receiveMessage` dispara agentes** → función nueva obligatoria (§2). El gate de Regla 6: `grep -rn "emit\|checkKeyword\|inngest\|runner" src/lib/domain/whatsapp-history-import.ts` = 0.
2. **`type` CHECK no acepta `'chat'`/`'unknown'`** → todo se mapea a los 11 canónicos; V1 todo a `'text'`. Un INSERT con type fuera del CHECK falla la fila entera.
3. **`onConflict:'wamid'` requiere wamid no-null** → todas las filas import llevan wamid sintético (nunca null), si no, la dedup no aplica.
4. **Conversación viva**: olvidar la condición D-05 y hacer UPDATE incondicional reordenaría el inbox por mensajes viejos / marcaría leído un chat con no-leídos reales. El update DEBE ser solo-en-create.
5. **Número malformado / internacional inválido** → `resolveOrCreateContact` falla; capturar por chat, no abortar.
6. **`scripts/` rompe `next build`** (memoria `build_subprojects_break_next_build`): el script nuevo en `scripts/` se typechquea en el build de Vercel. Asegurar `tsc --noEmit` limpio y/o que `scripts/` esté excluido del tsconfig del app ANTES de pushear. Verificar exclusión actual de `scripts/` en `tsconfig.json`.
7. **Idempotencia parcial por crash**: si el batch de un chat se interrumpe, re-correr re-inserta solo los faltantes (upsert ignoreDuplicates) — seguro. No hace falta checkpoint propio (Etapa 1 ya garantiza chats `done`); el wamid determinista da la idempotencia.

---

## 8. Decisiones que el research deja fijas para el plan

- Clasificación de 3 buckets (§3.2) con interactive/greeting-sin-texto → skip.
- Conteo esperado del piloto Varixcenter: ~3161 insertados / ~1012 saltados (§3.3) — el reporte debe cuadrar 4173.
- Función domain nueva con update condicional (§5).
- CLI dry-run-default con reporte reconciliado (§6).
- `tsc --noEmit` limpio antes de push (Pitfall 6).

---

*Standalone: whatsapp-history-importer*
*Researched: 2026-06-09*
