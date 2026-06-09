# WhatsApp History Importer — CONTEXT

**Standalone:** `whatsapp-history-importer`
**Created:** 2026-06-09
**Status:** Discuss-phase capturado — listo para `research-phase`
**Etapa:** 2 de 2 (Etapa 1 = `whatsapp-history-reader`, solo lectura → produce el backup JSON. Esta = migrador/importador a MorfX)

---

## El qué

Un **importador** (CLI) que lee el backup JSON producido por `robot-whatsapp-reader` (Etapa 1) e inserta **contactos + conversaciones + mensajes históricos** en el inbox de WhatsApp de MorfX, **vía domain layer**, de modo que las conversaciones aparezcan "como si se hubieran hecho desde MorfX".

Es **archival silencioso**: marca el origen, es idempotente, e inserta en orden cronológico. **NUNCA envía nada por WhatsApp, NUNCA dispara webhooks / automatizaciones / agentes / runner.**

## El por qué

Cierra el loop de onboarding: Etapa 1 respalda el historial antes de migrar el número a la API; Etapa 2 lo "revive" dentro de MorfX para que el cliente vea sus chats viejos en el inbox. Elimina la objeción "pierdo todos mis chats" — ahora los ve dentro de la plataforma.

Caso disparador: número Varixcenter `573202067077` ya respaldado por Etapa 1 (538 chats en `robot-whatsapp-reader/output/573202067077/`).

---

## Hallazgos de scout (esquema destino — RIGEN el diseño)

Verificado en migraciones + domain layer 2026-06-09:

1. **`conversations` unique = `(workspace_id, phone, channel)`** (migración `20260317000000_add_channel_to_conversations.sql`) — **NO** incluye `phone_number_id`. → get-or-create se llavea por `phone + channel='whatsapp'`; `phone_number_id` (input del número migrado) se setea **solo en el INSERT**.
2. **`messages.wamid` tiene UNIQUE global** (`messages_wamid_unique`). NULLs permitidos múltiples veces. → wamid sintético `import:<chatId>:<idx>` da **idempotencia gratis** Y sirve de **marcador de origen** (filtrable con `wamid LIKE 'import:%'`).
3. **`messages.type` CHECK** solo admite 11 tipos canónicos: `text, image, video, audio, document, sticker, location, contacts, template, interactive, reaction`. **NO existe `'chat'` ni `'unknown'`** → el mapeo DEBE conformar a estos 11.
4. **NO existe columna `source`/`imported_at`** en `messages` ni `conversations` hoy.
5. **`receiveMessage` (messages.ts:747) emite `whatsapp.message_received` + keyword matches** → **PROHIBIDO reusarla**. Hace falta una función domain NUEVA de inserción histórica sin side-effects.
6. **`resolveOrCreateContact` (contacts.ts:726)** solo setea `name` en el create (`name ?? phone`); **nunca pisa** un contacto existente. ✅ cumple el requisito de no pisar datos del CRM.
7. **`findOrCreateConversation` (conversations.ts:309)** ya hace get-or-create por `phone + channel` y setea `phone_number_id` en create — buen precedente, pero no marca origen ni controla last_message_*; la función nueva replica su patrón.

---

## Decisiones (locked)

### Marcador de origen + idempotencia (Área 1)
- **D-01:** El **wamid sintético `import:<chatId>:<idx>`** es el ÚNICO mecanismo de marcado de origen **y** la llave de idempotencia.
  - Idempotencia: vía el `UNIQUE(wamid)` existente — re-correr el importador colisiona y **no duplica** (upsert/ignore on conflict).
  - Marcado de origen (Regla 6): `wamid LIKE 'import:%'` distingue histórico de tráfico real.
  - Rollback: `DELETE FROM messages WHERE wamid LIKE 'import:%'`.
  - **CERO migración** — no se toca la tabla `messages` (la más caliente del sistema). Regla 5 no aplica (no hay schema change).
  - `<chatId>` = `ChatBackup.chatId` (raw JID, ej. `113464529912035@lid`), estable entre corridas. `<idx>` = índice del mensaje en el array (0-based), estable porque el historial es inmutable.

### Chats sin número — `numberMissing=true` (Área 2)
- **D-02:** Si `numberMissing=true` (o `number=null`) → **ALERTAR y NO IMPORTAR** ese chat. Se lista en el reporte final. **Nunca inventar número** (`conversations.phone` es NOT NULL y el spec lo prohíbe). No hay "bandeja sin número" en V1.

### Media y tipos de sistema (Área 3)
- **D-03:** V1 trata el backup como **solo texto**. El backup es text-only en la práctica (la media vino como placeholder en `note`, sin archivos — Etapa 1 D-10).
  - Mensajes con `type` de media (`image/video/document/sticker/ptt/audio/vcard/location`): se insertan como **`type='text'`** con `content.body = note` (ej. `"<imagen omitida>"`), para que rindan como burbuja de texto legible y **no produzcan un componente de media roto** (no hay `media_url`).
  - Si en un backup futuro hay media real con archivos → V1.1.
- **D-04:** Tipos de **sistema / cifrado** (`e2e_notification, notification_template, protocol, revoked, gp2, ciphertext, unknown`) → **SE SALTAN** (no son conversación; son ruido de cifrado/protocolo). Se cuentan como "saltados" en el reporte. Esto explica el delta esperado entre `messageCount` del manifest y mensajes insertados.

### Merge con tráfico vivo (Área 4) — **archival silencioso**
- **D-05:** Importar **nunca finge actividad nueva ni reordena el inbox**. La liveness la maneja **solo el tráfico real**.
  - **Conversación NUEVA (creada por el import):** `is_read=true`, `unread_count=0`, y `last_message_at` / `last_message_preview` / `last_customer_message_at` derivados de los datos del chat (último mensaje histórico / último mensaje inbound). Evita reventar el inbox con cientos de "no leídos" falsos.
  - **Conversación YA EXISTENTE (viva por tráfico real):** insertar los mensajes viejos **dentro del hilo SIN tocar** `is_read`, `unread_count`, `last_message_at`, `last_message_preview`, `last_customer_message_at`, ni `phone_number_id`. El historial aparece al abrir el chat; el estado "vivo" queda intacto.
  - El chat "se pone vivo" automáticamente cuando el cliente escribe de verdad (flujo normal `receiveMessage`) — el importador no interfiere.
  - `phone_number_id` (input) se setea **solo en create**.

### Entrega / ejecución (Área 5)
- **D-06:** **CLI `tsx`** en `scripts/import-whatsapp-history.ts` (patrón `scripts/` existente). Corre **local** con `SUPABASE_SERVICE_ROLE_KEY`. Args: `rutaBackup`, `workspaceId`, `phoneNumberId`, `--dry-run` (**default ON** — primero dry-run, luego `--apply` o `--no-dry-run` para escribir). Importa la función domain nueva. Sin UI (server action/UI = diferible a V1.1 si se repite por muchos clientes).
- **D-07:** **Función domain NUEVA** para inserción histórica (NO reusar `receiveMessage`). Vive en `src/lib/domain/` (Regla 3), usa `createAdminClient`, filtra por `workspace_id`. **NO emite** `whatsapp.message_received`, **NO** corre keyword matches, **NO** invoca agentes/runner. Insert directo idempotente (on-conflict-do-nothing por wamid) + update de conversación condicional según D-05.

### Mapeo (locked desde el prompt — restated para downstream)
- **D-08:** `phone = "+" + ChatBackup.number` (E.164).
- **D-09:** Contacto: `resolveOrCreateContact(workspaceId, phone, { name: contactName })` — name solo en create (D-06 contacts), no pisa CRM real.
- **D-10:** Conversación: get-or-create por `(workspace_id, phone, channel='whatsapp')`; `phone_number_id` = input solo en create (ver D-05).
- **D-11:** Por mensaje:
  - `direction = fromMe ? 'outbound' : 'inbound'`
  - `type`: mapeo a los 11 canónicos (D-03/D-04): `chat`/`automated_greeting_message`/`interactive`-con-texto → `text`; media-placeholder → `text` con body=note; sistema → saltar.
  - `content = { body: text ?? note ?? '' }`
  - `timestamp` = parse de `"yyyy-MM-dd HH:mm:ss -05:00"` → `timestamptz` (America/Bogota, Regla 2)
  - `status`: outbound histórico → `'read'`; inbound → `null`.
  - `wamid = "import:" + chatId + ":" + index` (D-01)
- **D-12:** Insertar en **orden cronológico ascendente** (el array `messages` ya viene en orden; respetarlo).
- **D-13:** Workspace correcto: `workspaceId` y `phoneNumberId` son **inputs del CLI**, nunca hardcodeados, nunca cruzados entre workspaces. (Caso piloto: Varixcenter, `business.number=573202067077` en el backup — pero el CLI no infiere el workspace del backup; lo recibe explícito.)

### Claude's Discretion
- Nombre/archivo exacto de la función domain nueva (ej. `importHistoricalConversation` / `insertHistoricalMessages` en `src/lib/domain/whatsapp-history-import.ts`).
- Mecánica del on-conflict (insert `ON CONFLICT (wamid) DO NOTHING` vs select-then-insert) — research/plan; debe ser idempotente y eficiente para ~538 chats / miles de mensajes.
- Formato exacto del reporte (tabla en stdout): contactos creados/encontrados, conversaciones creadas/mergeadas, mensajes insertados/saltados(sistema)/duplicados(idempotencia), chats saltados por numberMissing, errores por chat.
- Estrategia de batch/transacción por chat (atomicidad por chat análoga al checkpoint de Etapa 1).
- Validación de muestra (un chat de ejemplo) post-import para el criterio de éxito visual.

---

## Restricciones duras (no negociables)

1. **Regla 3:** TODA escritura por `src/lib/domain/*` (createAdminClient dentro de domain, filtrando `workspace_id`). **Cero `createAdminClient` fuera de domain** en el código nuevo (verificable via grep en el CLI).
2. **Regla 6:** importación HISTÓRICA. NO enviar WhatsApp, NO disparar webhooks/automatizaciones/agentes/runner. Origen marcado con `wamid LIKE 'import:%'` (D-01) para distinguir de tráfico real. La función domain nueva NO emite triggers (D-07).
3. **Regla 5:** **NO se agrega columna ni índice** (D-01 usa el `UNIQUE(wamid)` existente) → no hay migración → no aplica la pausa. Si research descubre que hace falta una columna, PARAR y pedir aplicar migración en prod ANTES de correr.
4. **Idempotente:** re-correr NO duplica (UNIQUE wamid + on-conflict-do-nothing).
5. **Regla 2:** timestamps America/Bogota.
6. **Workspace correcto:** `workspaceId` + `phoneNumberId` como inputs del CLI; nunca hardcodear ni cruzar workspaces (D-13).

---

## Criterios de éxito

- Mensajes importados ≈ `Σ messageCount` del manifest **menos** los tipos de sistema saltados (D-04) y los chats `numberMissing` saltados (D-02). El reporte cuadra el delta.
- Un chat de muestra se ve correcto en el inbox de MorfX: orden cronológico, fechas Bogota, in/out (fromMe→outbound), nombre del contacto.
- **0 envíos, 0 ejecuciones de agente/automatización** (verificable en observability/logs — no aparece ningún `pipeline_decision` ni `whatsapp.message_received` por el import).
- Re-correr el importador **NO duplica** (idempotente vía wamid).
- `grep -rn "createAdminClient" scripts/import-whatsapp-history.ts` → **0 matches** (toda escritura via domain).
- Importar sobre una conversación viva **no altera** su estado de no-leídos ni su posición en el inbox (D-05).

---

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Etapa 1 (origen de datos)
- `.planning/standalone/whatsapp-history-reader/CONTEXT.md` — decisiones del lector (D-07/D-08/D-09/D-10 = esquema del backup).
- `robot-whatsapp-reader/src/types.ts` — `ChatBackup` / `BackupMessage` / `Manifest` (esquema verbatim a consumir).
- `robot-whatsapp-reader/output/573202067077/` — backup real Varixcenter (538 chats + `manifest.json`) = fuente del piloto.

### Destino (domain layer MorfX)
- `src/lib/domain/contacts.ts` §726 `resolveOrCreateContact`, §95 `createContact` — no pisa CRM (D-09).
- `src/lib/domain/conversations.ts` §309 `findOrCreateConversation` — patrón get-or-create por phone+channel (D-10).
- `src/lib/domain/messages.ts` §747 `receiveMessage` — **NO reusar** (emite triggers); referencia de columnas del insert.
- `supabase/migrations/20260130000002_whatsapp_conversations.sql` — schema base `conversations`/`messages`, `UNIQUE(wamid)`, CHECK de `type`.
- `supabase/migrations/20260317000000_add_channel_to_conversations.sql` — unique `(workspace_id, phone, channel)`.

### Reglas
- `CLAUDE.md` — Reglas 2/3/5/6.

### Precedente de CLI
- `scripts/` (varios `*.ts` tsx) — patrón de script ops local con env service-role.

---

## Code Context

### Reusable Assets
- `resolveOrCreateContact` / `createContact` — contacto sin pisar (D-09).
- `findOrCreateConversation` — patrón get-or-create por phone+channel (la función nueva lo replica con control de last_message_* + sin triggers).
- `normalizePhone` (contacts.ts) — normalización E.164 ya usada por el domain.

### Established Patterns
- Domain layer = única superficie de mutación (Regla 3); `createAdminClient` solo dentro de domain.
- Scripts ops viven en `scripts/*.ts`, corridos con `tsx` y env del repo.
- Idempotencia por unique constraint (precedente: `crm_mutation_idempotency_keys`, dedup de `messages` por wamid en `receiveMessage`).

### Integration Points
- **Lectura:** archivos JSON locales de Etapa 1 (`robot-whatsapp-reader/output/<numero>/`).
- **Escritura:** `contacts` + `conversations` + `messages` vía función domain nueva. CERO otros side-effects.
- **No-integración deliberada:** NO webhook, NO Inngest, NO runner/agentes (Regla 6).

---

## Deferred Ideas

- **Captura/import de media real** (archivos): omitida en V1 (solo texto + placeholder→text). V1.1 si un cliente lo requiere.
- **Server action + UI de admin** para correr el import desde el navegador (multi-cliente self-serve). Diferido (D-06: CLI por ahora).
- **Bandeja "sin número"** para chats `numberMissing` (phone sintético desde `@lid`): descartado en V1 (D-02 los alerta y salta). Reconsiderar si la tasa de numberMissing fuera alta.
- **Columna `source`/`imported_at`** en `messages`: descartada (D-01 usa wamid prefix). Reconsiderar solo si se necesita analítica/filtrado semántico más allá de `wamid LIKE 'import:%'`.

---

*Standalone: whatsapp-history-importer*
*Context gathered: 2026-06-09*
