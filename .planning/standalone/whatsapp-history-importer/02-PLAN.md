---
phase: whatsapp-history-importer
plan: 02
type: execute
wave: 2
depends_on: [01]
decisions: [D-02, D-03, D-04, D-06, D-08, D-11, D-12, D-13]
files_modified:
  - scripts/import-whatsapp-history.ts
  - scripts/lib/whatsapp-history/map.ts
  - scripts/lib/whatsapp-history/map.test.ts
autonomous: true
requirements: [D-02, D-03, D-04, D-06, D-08, D-11, D-12, D-13]
must_haves:
  truths:
    - "CLI tsx scripts/import-whatsapp-history.ts: args --backup --workspace --phone-number-id [--apply] [--limit]; dry-run por default (D-06)"
    - "Clasificación pura de 3 buckets (text/media/skip) por RESEARCH §3.2: system+interactive/greeting-sin-texto → skip; media → text body=note; texto real → text body=text"
    - "wamid sintético determinista 'import:<chatId>:<idx>' (D-01) — idempotencia + marcador de origen"
    - "numberMissing=true (o number=null) → SKIP+ALERTA, nunca importar, nunca inventar número (D-02)"
    - "Toda escritura vía importHistoricalChat (domain) — cero createAdminClient/@supabase en el script (Regla 3)"
    - "Reporte reconciliado: contactos creados/encontrados, conversaciones creadas/mergeadas, mensajes insertados/duplicados/saltados(system)/saltados(no-texto), chats saltados(numberMissing)/error, vs Σ messageCount del manifest"
  artifacts:
    - path: "scripts/lib/whatsapp-history/map.ts"
      provides: "Helpers puros: classifyMessage, mapMessage, synthWamid, parseBackupTimestamp, buildChatPayload"
      contains: "import:"
    - path: "scripts/lib/whatsapp-history/map.test.ts"
      provides: "Unit tests de la clasificación/mapeo contra los tipos reales del backup"
      contains: "e2e_notification"
    - path: "scripts/import-whatsapp-history.ts"
      provides: "CLI: traversal de manifest, dry-run/apply, reporte"
      contains: "--apply"
  key_links:
    - from: "scripts/import-whatsapp-history.ts"
      to: "domain importHistoricalChat"
      via: "import desde @/lib/domain"
      pattern: "importHistoricalChat"
    - from: "scripts/lib/whatsapp-history/map.ts"
      to: "wamid determinista"
      via: "synthWamid(chatId, idx)"
      pattern: "`import:\\$\\{"
---

<objective>
Construir el **CLI** `scripts/import-whatsapp-history.ts` + los **helpers puros de mapeo** (testeable sin DB). El CLI recorre el `manifest.json`, clasifica/mapea cada mensaje (RESEARCH §3.2), sintetiza wamids, y — en `--apply` — llama `importHistoricalChat` (Plan 01) por chat. Default **dry-run** con reporte reconciliado contra el manifest.

Output: herramienta ops corrible local (`npx tsx ... --env-file=.env.local`), Regla 3 limpia.
</objective>

<context>
Lee primero: `RESEARCH.md` §3, §6, §7. `CONTEXT.md` D-02/D-03/D-04/D-06.

Hechos clave:
- `tsconfig.json` **excluye** `scripts` y `__tests__` → el script y su test NO rompen `next build` (Pitfall 6 mitigado), pero igual deben pasar `tsc --noEmit` por seguridad.
- `createAdminClient` (que usa el domain) lee `process.env.NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → correr con `npx tsx --env-file=.env.local scripts/import-whatsapp-history.ts ...` (Node ≥20) o `dotenv`.
- Esquema origen: `robot-whatsapp-reader/src/types.ts` (`ChatBackup`/`BackupMessage`/`Manifest`).
- Distribución real (537 chats / 4173 msgs): esperado ~3161 insertados / ~1012 saltados (RESEARCH §3.3) — el reporte debe cuadrar.
- El test de map vive en `scripts/lib/whatsapp-history/map.test.ts` (excluido del build; correr con vitest apuntando al archivo).
</context>

<tasks>

### T1 — Helpers puros de mapeo (`scripts/lib/whatsapp-history/map.ts`)
Sin I/O, sin DB. Exportar:
- `const SYSTEM_TYPES = new Set([...])`, `MEDIA_TYPES`, `TEXT_TYPES` (RESEARCH §3.2 verbatim).
- `classifyMessage(m: BackupMessage): 'text' | 'media' | 'skip'` (lógica §3.2: system→skip; TEXT_TYPE con text no-vacío→text; MEDIA_TYPE→media; resto→skip).
- `synthWamid(chatId: string, idx: number): string` → `` `import:${chatId}:${idx}` `` (D-01).
- `parseBackupTimestamp(s: string): string` → `new Date(s).toISOString()` con validación (lanzar/retornar null si NaN; el offset -05:00 ya viene en la cadena — RESEARCH §3.5).
- `mapMessage(m, chatId, idx): InsertMessageRow | null` → null si classify='skip'; si 'text'→`{wamid, direction: m.fromMe?'outbound':'inbound', body: m.text!, status: m.fromMe?'read':null, timestamp}`; si 'media'→igual pero `body: m.note ?? ''`.
- `buildChatPayload(chat: ChatBackup): { phone, contactName, rows, counts }` → `phone = '+' + chat.number`; itera `chat.messages` con índice, mapea, acumula `counts:{ text, media, skippedSystem, skippedNoText }`. Reusar el `type` original para discriminar system vs no-texto en los counts.
- Importar los tipos desde `../../../robot-whatsapp-reader/src/types` (o copiar las interfaces mínimas si el import cruzado molesta a tsx; preferir import directo).

**Acceptance:** funciones puras, deterministas, sin efectos.

### T2 — Tests de mapeo (`scripts/lib/whatsapp-history/map.test.ts`)
Vitest. Cubrir con casos representativos de los tipos REALES del backup:
- `chat` con texto → text, body=texto, direction según fromMe.
- `interactive` sin texto (`text:null`, note `<interactive omitido>`) → skip (skippedNoText).
- `interactive` con texto → text.
- `image`/`ptt`/`document` (text:null, note) → media, body=note.
- `e2e_notification`/`notification_template`/`protocol`/`revoked`/`gp2`/`unknown`/`ciphertext` → skip (skippedSystem).
- `synthWamid` determinista.
- `parseBackupTimestamp("2026-05-28 15:18:19 -05:00")` → ISO correcto (instante = 20:18:19Z).
- `buildChatPayload` sobre un chat mock → counts cuadran; rows.length = text+media.

**Acceptance:** `npx vitest run scripts/lib/whatsapp-history/map.test.ts` verde.

### T3 — CLI (`scripts/import-whatsapp-history.ts`)
- Header doc con uso: `npx tsx --env-file=.env.local scripts/import-whatsapp-history.ts --backup <dir> --workspace <uuid> --phone-number-id <id> [--apply] [--limit N]`.
- Parse de args (sin libs pesadas; `process.argv` o un mini-parser). `--apply` ausente = **dry-run**. `--limit N` = procesar solo los primeros N chats `done` (para el piloto, D-06).
- Validar args requeridos; abortar con mensaje claro si falta `--workspace` o `--phone-number-id`.
- Leer `manifest.json` del `--backup`; iterar entradas con `status==='done'` (contar `pending`/`failed` aparte como "no respaldados por Etapa 1").
- Por chat:
  - Cargar `<file>.json`. Si `numberMissing===true || number==null` → **SKIP + push a lista de alertas** (D-02); continue.
  - `payload = buildChatPayload(chat)`.
  - **dry-run:** acumular `payload.counts` + proyectar contacto/conversación (no se sabe sin DB — reportar "proyectado"). NO escribir.
  - **apply:** `const r = await importHistoricalChat({ workspaceId: argv.workspace, source: 'history_import' }, { phone: payload.phone, phoneNumberId: argv.phoneNumberId, contactName: payload.contactName, messages: payload.rows })`. Si `!r.success` → push a errores con `{chatId, error}`; continue. Acumular `r.data` (contactCreated, conversationCreated, inserted, duplicated).
- **Reporte final** (stdout, legible): 
  - Chats: total / procesados / saltados(numberMissing, con lista) / con error (con lista) / no-done en manifest.
  - Contactos: creados vs encontrados (solo apply).
  - Conversaciones: creadas vs mergeadas (solo apply).
  - Mensajes: insertados / duplicados / saltados(system) / saltados(no-texto).
  - **Reconciliación:** `Σ counts (text+media+skippedSystem+skippedNoText)` vs `Σ messageCount del manifest` (de chats done procesados). Imprimir si cuadra (✓) o el delta.
- **Cero** `createAdminClient`, `@supabase/supabase-js`, `createClient` en el script y en map.ts (Regla 3 — la escritura es 100% vía domain).

**Acceptance:** corre en dry-run sin tocar DB; `tsc --noEmit` no reporta errores nuevos en estos archivos.

### T4 — Gate Regla 3 (grep)
```
grep -nE "createAdminClient|@supabase/supabase-js|createClient\(" scripts/import-whatsapp-history.ts scripts/lib/whatsapp-history/map.ts   # → 0
grep -nc "importHistoricalChat" scripts/import-whatsapp-history.ts   # → ≥1
```
**Acceptance:** primer grep = 0.

</tasks>

<verification>
- `npx vitest run scripts/lib/whatsapp-history/map.test.ts` verde.
- Dry-run real: `npx tsx --env-file=.env.local scripts/import-whatsapp-history.ts --backup robot-whatsapp-reader/output/573202067077 --workspace <ws> --phone-number-id <id>` → reporte que cuadra ~3161 insertables / ~1012 saltados / 4173 total (RESEARCH §3.3), sin escribir.
- grep Regla 3 = 0.
- Commit: `feat(whatsapp-history-importer-02): CLI dry-run + mapeo puro (Regla 3 via domain)`.

> El **apply real** y la verificación de fidelidad en el inbox se hacen en el Plan 03 (gate del piloto). Este plan entrega el dry-run validado.
</verification>
