# WhatsApp History Toolkit — Lector + Importador (índice)

> **Punto de entrada único** para los 2 mecanismos que respaldan e importan historiales de
> WhatsApp de un número **antes** de migrarlo a la API (la migración da de baja el número y
> se pierde el historial visible). El código NO está en una sola carpeta a propósito (ver
> "Por qué no está todo junto"); este doc te lleva a cada pieza.
>
> **Cómo encontrar esto luego:** `docs/whatsapp-history-toolkit.md`, o
> `grep -ri "whatsapp-history" docs/ robot-whatsapp-reader/ scripts/ src/lib/domain/`.

Son **2 etapas independientes**, se corren por separado:

```
  ┌─────────────────────────┐        ┌──────────────────────────────┐
  │  ETAPA 1 — LECTOR        │  JSON  │  ETAPA 2 — IMPORTADOR        │
  │  robot-whatsapp-reader/  │ ─────► │  CLI + domain importHistorical│
  │  (Playwright, local,     │ backup │  (escribe al inbox MorfX,    │
  │   read-only, lee WA Web) │  local │   archival, sin enviar)      │
  └─────────────────────────┘        └──────────────────────────────┘
        genera output/<num>/              consume output/<num>/
```

---

## ETAPA 1 — Lector (robot que respalda WhatsApp Web)

Robot **local, read-only** (NUNCA envía — D-15). Lee `web.whatsapp.com` vía Playwright + wa-js,
enumera chats 1:1 (incl. archivados) y guarda **un JSON por chat** + un `manifest.json`.

| Pieza | Ubicación |
|---|---|
| Código del robot | **`robot-whatsapp-reader/`** (sub-proyecto autocontenido, `package.json` + `node_modules` propios) |
| Fuentes | `robot-whatsapp-reader/src/` (`browser.ts`, `chat-scraper.ts`, `enumerator.ts`, `writer.ts`, `manifest.ts`, `number-extractor.ts`, `types.ts`) |
| README de uso | `robot-whatsapp-reader/README.md` |
| Backups generados | `robot-whatsapp-reader/output/<numero>/` (manifest.json + `<numero>.json` por chat) |
| Perfiles de navegador | `robot-whatsapp-reader/profiles/<numero>/` (sesión QR aislada por cliente) |
| Planning/decisiones | `.planning/standalone/whatsapp-history-reader/` (CONTEXT, RESEARCH, PLANs, SUMMARYs, SWEEP-RESULTS) |

**Correr (resumen — ver README para detalle):**
```bash
cd robot-whatsapp-reader
npm install && npx playwright install chromium      # primera vez
npm run dev -- --number 573202067077 --pilot        # PILOTO obligatorio (5 chats, halta)
npm run dev -- --number 573202067077                # barrido completo (reanuda, salta done)
npm run dev -- --number 573202067077 --resume       # retoma pending/failed
```
- Multi-cliente: repetir con otro `--number` (cada uno con su `output/` y `profiles/`).
- Tras terminar un cliente: **desvincular** el dispositivo desde el teléfono (one-shot, no 24/7).

**⚠️ Notas Etapa 1:**
- Los JSON en `output/` son **PII** → gitignored, mantener locales y **borrar tras el import**.
- **No descarga media**: deja placeholders (`<imagen omitida>`, `<nota de voz omitida>`, etc.).
- **Profundidad limitada**: WhatsApp Web carga el historial perezosamente. Cada chat llega
  hasta donde el robot alcanzó a hacer scroll. Para más profundidad, ajustar el scroll-back
  del scraper y re-correr (la Etapa 2 es idempotente → solo agrega lo que falte).

---

## ETAPA 2 — Importador (mete el backup al inbox de MorfX)

Inserta contacto + conversación + mensajes históricos vía **domain layer** (Regla 3),
**archival**: NO envía, NO dispara agentes/automatizaciones (Regla 6), **idempotente** (D-01).

| Pieza | Ubicación | Nota |
|---|---|---|
| **Función domain** (única vía de escritura) | **`src/lib/domain/whatsapp-history-import.ts`** | `importHistoricalChat(ctx, params)`. NO se puede mover (Regla 3). |
| **CLI** | **`scripts/import-whatsapp-history.ts`** | parsea manifest, dry-run/apply, reporte reconciliado |
| **Runner** (cómo se corre) | **`scripts/import-whatsapp-history.run.mjs`** | esbuild + node (ver gotcha tsx abajo) |
| **Mapeo puro** + tests | **`scripts/lib/whatsapp-history/map.ts`** + `map.test.ts` | clasificación 3 buckets, wamid sintético, timestamps |
| Runbook operador | `.planning/standalone/whatsapp-history-importer/OPERATOR-RUNBOOK.md` | comandos + rollback |
| Evidencia del piloto/barrido | `.planning/standalone/whatsapp-history-importer/PILOT-RESULTS.md` | |
| Planning/decisiones | `.planning/standalone/whatsapp-history-importer/` (CONTEXT, RESEARCH, PLANs) | |
| Tests del domain | `src/lib/domain/__tests__/whatsapp-history-import.test.ts` | |

**Correr (SIEMPRE con el runner, NO con `npx tsx` — ver gotcha):**
```bash
# Pre-req: .env.local con NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
# WS=workspace_id dueño del número · PNID=phone_number_id del número en MorfX

# 1) Dry-run de control (no escribe; debe decir "✓ CUADRA"):
node --env-file=.env.local scripts/import-whatsapp-history.run.mjs \
  --backup robot-whatsapp-reader/output/573202067077 --workspace <WS> --phone-number-id <PNID>

# 2) Piloto (muestra pequeña) → revisar inbox:
node --env-file=.env.local scripts/import-whatsapp-history.run.mjs \
  --backup robot-whatsapp-reader/output/573202067077 --workspace <WS> --phone-number-id <PNID> --apply --limit 5

# 3) Barrido completo:
node --env-file=.env.local scripts/import-whatsapp-history.run.mjs \
  --backup robot-whatsapp-reader/output/573202067077 --workspace <WS> --phone-number-id <PNID> --apply
```
Hallar WS/PNID sin adivinar:
```sql
SELECT id,name FROM workspaces WHERE name ILIKE '%<cliente>%';
SELECT phone_number_id, count(*) FROM conversations
WHERE workspace_id='<WS>' AND channel='whatsapp' GROUP BY 1;
```

**Rollback total** (el prefijo `import:` del wamid marca cada fila escrita → quirúrgico):
```sql
DELETE FROM messages WHERE workspace_id='<WS>' AND wamid LIKE 'import:%';
```

**⚠️ GOTCHAS Etapa 2 (descubiertos en el piloto/barrido — NO repetir):**
1. **`npx tsx` ROMPE el import.** tsx carga el JSON de metadata de `libphonenumber-js` como
   `{ default }` → `normalizePhone` (en el domain `resolveOrCreateContact`) devuelve null →
   TODOS los chats fallan "Numero de telefono invalido". **Usar SIEMPRE el runner**
   `import-whatsapp-history.run.mjs` (esbuild transpila el TS, paquetes npm `external` → node
   carga la metadata bien). CERO cambio en `src/lib/utils/phone.ts` (Regla 6).
2. **Trigger DB `messages_update_conversation`** (`supabase/migrations/20260130000002`, AFTER
   INSERT ON messages) pisa `last_message_at/last_message_preview/last_customer_message_at/
   unread_count/is_read` de la conversación por CADA fila insertada, sin guard de timestamp.
   Al importar a una **conversación viva real**, la corrompería. El importador ya lo maneja:
   **snapshot de esos 5 campos antes del upsert + restore después** para convos existentes
   (D-05). Si escribes mensajes históricos por otra vía, recuerda este trigger.

---

## Receta end-to-end para un cliente nuevo

1. **Etapa 1:** `cd robot-whatsapp-reader && npm run dev -- --number <NUM> --pilot` → inspeccionar
   `output/<NUM>/` → barrido completo `--number <NUM>` → desvincular dispositivo.
2. **Etapa 2:** hallar `<WS>`/`<PNID>` (SQL arriba) → dry-run de control (✓ CUADRA) → `--apply
   --limit 5` → revisar inbox → `--apply` completo.
3. **Limpieza:** borrar `robot-whatsapp-reader/output/<NUM>/` (PII) tras confirmar el import.

---

## Por qué no está todo en una sola carpeta

- La **función domain** DEBE vivir en `src/lib/domain/` — Regla 3 (toda mutación de datos pasa
  por el domain layer; el CLI la importa desde ahí). Moverla rompería la regla y el import.
- El **robot** es un sub-proyecto aparte con su propio `node_modules` (Playwright) — vive en su
  carpeta para no romper el `next build` (tsconfig lo excluye; ver memoria
  `build_subprojects_break_next_build`).
- Los **scripts** del importador viven en `scripts/` (excluido del build). Este índice es el
  pegamento que une las piezas sin moverlas.

---

*Lector: standalone `whatsapp-history-reader`. Importador: standalone `whatsapp-history-importer`
(COMPLETADO 2026-06-09 — barrido full Varixcenter: 3161 msgs / 537 convos).*
