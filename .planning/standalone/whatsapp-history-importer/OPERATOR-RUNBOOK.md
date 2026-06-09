# WhatsApp History Importer — OPERATOR RUNBOOK

Herramienta ops para importar historiales de WhatsApp (respaldados por Etapa 1, el
robot `robot-whatsapp-reader`) al inbox de MorfX. **Archival**: NO envía mensajes, NO
dispara agentes/automatizaciones (Regla 6), idempotente (D-01).

---

## 0. Pre-requisitos

- `.env.local` en la raíz del repo con `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (producción).
- Node ≥ 20 (probado en v24). Dependencias instaladas con **pnpm** (repo pnpm-only).
- El backup de Etapa 1 en `robot-whatsapp-reader/output/<numero>/` con su `manifest.json`.
- Datos del cliente:
  - `WS` = `workspace_id` del workspace dueño del número.
  - `PNID` = `phone_number_id` del número migrado en MorfX (el que usan sus conversaciones whatsapp).
  - Para hallarlos sin adivinar: `SELECT id,name FROM workspaces WHERE name ILIKE '%<cliente>%';`
    y `SELECT phone_number_id, count(*) FROM conversations WHERE workspace_id='<WS>' AND channel='whatsapp' GROUP BY 1;`

## ⚠️ Comando — usar el RUNNER, no `npx tsx`

`tsx` rompe `libphonenumber-js` (carga su JSON de metadata como `{ default }`) →
`normalizePhone` falla y **todos** los chats se rechazan ("Numero de telefono invalido").
Correr SIEMPRE con el runner (esbuild + node):

```bash
node --env-file=.env.local scripts/import-whatsapp-history.run.mjs \
  --backup robot-whatsapp-reader/output/<numero> \
  --workspace <WS> --phone-number-id <PNID> [--apply] [--limit N]
```

- Sin `--apply` = **DRY-RUN** (no escribe; imprime reporte reconciliado).
- `--limit N` = procesa solo los primeros N chats `done` (para pilotos).

---

## 1. Control (dry-run) — SIEMPRE primero

```bash
node --env-file=.env.local scripts/import-whatsapp-history.run.mjs \
  --backup robot-whatsapp-reader/output/<numero> --workspace <WS> --phone-number-id <PNID>
```
Confirmar que la **Reconciliación** dice `✓ CUADRA` (Σ counts == Σ messageCount del manifest).
Si hay DELTA → STOP, revisar clasificación antes de escribir.

## 2. Piloto (muestra pequeña)

```bash
node --env-file=.env.local scripts/import-whatsapp-history.run.mjs \
  --backup robot-whatsapp-reader/output/<numero> --workspace <WS> --phone-number-id <PNID> \
  --apply --limit 5
```
Revisar 1-2 chats en el inbox de MorfX: orden cronológico, fechas Bogotá, burbujas in/out,
nombre del contacto, body legible, conversación NO marcada como "no leída".

## 3. Barrido completo

Solo tras piloto OK (ver `PILOT-RESULTS.md`):

```bash
node --env-file=.env.local scripts/import-whatsapp-history.run.mjs \
  --backup robot-whatsapp-reader/output/<numero> --workspace <WS> --phone-number-id <PNID> \
  --apply
```

### Conteos esperados de éxito (backup Varixcenter `573202067077`, 537 chats)
- **Insertados ≈ 3161** (text=2987, media=174).
- Saltados: system=745, no-texto=267 (Σ saltados=1012).
- Reconciliación total = 4173 ✓.
- Idempotencia: re-correr el barrido → `insertados=0`, `duplicados=3161`.

## 4. Multi-cliente

Repetir los pasos 1-3 con otro `--backup <otra carpeta>` + el `<WS>`/`<PNID>` del cliente
correspondiente. Cada número/cliente tiene su propia carpeta de backup en `output/`.

---

## 5. Rollback

**Total (borra TODO lo importado en el workspace):**
```sql
DELETE FROM messages
WHERE workspace_id = '<WS>' AND wamid LIKE 'import:%';
```
El prefijo `import:` marca cada fila escrita por esta herramienta (D-01) → el rollback es
quirúrgico y no toca mensajes reales.

**Conversaciones huérfanas (opcional)** — las que el import creó y quedaron sin mensajes
reales tras el rollback:
```sql
-- Revisar antes de borrar:
SELECT c.id, c.phone
FROM conversations c
WHERE c.workspace_id = '<WS>' AND c.channel = 'whatsapp'
  AND NOT EXISTS (
    SELECT 1 FROM messages m
    WHERE m.conversation_id = c.id AND (m.wamid IS NULL OR m.wamid NOT LIKE 'import:%')
  );
-- (Borrar manualmente las confirmadas; los contactos creados pueden dejarse.)
```

> **Regla 5 (futuro):** hoy el marcador de origen es el prefijo del `wamid` → **cero
> migración**. Si en el futuro se decide añadir una columna `imported_at`/`source` a
> `messages`, PARAR y aplicar la migración en producción ANTES de pushear código que la use.

---

## 6. Qué NO hace (scope)

- NO envía mensajes de WhatsApp (archival puro).
- NO dispara agentes, automatizaciones, ni keywords (Regla 6 — función domain dedicada
  `importHistoricalChat`, no `receiveMessage`).
- NO importa chats sin número (`numberMissing`) — los reporta como alerta (D-02).
- NO pisa el nombre/datos de un contacto existente, ni el estado de una conversación viva (D-05/D-09).
