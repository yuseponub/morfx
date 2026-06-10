# WhatsApp History Importer — PILOT RESULTS (Plan 03)

**Fecha:** 2026-06-09
**Workspace:** Varixcenter `c6621640-ba67-43de-9f05-905f09a6dc8f`
**phone_number_id:** `1142973962235424`
**Backup:** `robot-whatsapp-reader/output/573202067077` (537 chats / 4173 msgs, todos `done`)
**Muestra piloto:** `--apply --limit 5` (primeros 5 chats `done`)

> **Hallazgo bloqueante del piloto (resuelto):** correr el CLI con `npx tsx` rompe
> `normalizePhone` — tsx carga el JSON de metadata de `libphonenumber-js` como
> `{ default }` y la librería lo rechaza; el try/catch de `phone.ts` devuelve null
> → **todos** los chats fallan con "Numero de telefono invalido" (0 escritos en el
> primer intento, DB quedó limpia). **Fix:** runner `import-whatsapp-history.run.mjs`
> (esbuild transpila el TS, paquetes npm `external` → node carga la metadata bien).
> CERO cambio en `src/lib/utils/phone.ts` (Regla 6). El piloto se re-corrió OK con el runner.

---

## T1 — Dry-run de control (reconciliación) ✓

```
Chats en manifest:   537  (done=537, pending=0, failed=0)
Chats procesados:    537
Mensajes: insertables (proy): 3161  (text=2987, media=174)
          saltados (system):  745
          saltados (no-texto):267
Reconciliación: Σ counts = 4173  vs  Σ messageCount = 4173  ✓ CUADRA
```
Coincide EXACTO con RESEARCH §3.3 (3161 insertables / 1012 saltados / 4173 total).

## T2 — Apply piloto (`--apply --limit 5`) ✓

5 chats: `+573124510825` (Dra María Carolina, 79), `+573003955741` (Nasly Enfermera, 15),
`+573213450681` (8), `+573208558752` (6), `+573212823711` (4). Σ messageCount = 112.

Resultado: **104 mensajes insertados**, 8 saltados(system), 0 saltados(no-texto).
**5 contactos creados**, **5 conversaciones creadas**. Reconciliación 112 ✓.

## T3 — Fidelidad en el inbox ⏳ (pendiente revisión visual del operador)

Verificado en DB (datos correctos; falta confirmación visual en el inbox UI):
- **Orden cronológico:** mensajes ordenados ascendente por `timestamp` ✓.
- **Fechas:** TIMESTAMPTZ guardado en UTC; el frontend formatea a `America/Bogota` (Regla 2). Parse del offset `-05:00` correcto ✓.
- **Dirección:** `fromMe` → `outbound` (status `read`); cliente → `inbound` (status `null`) ✓.
- **Nombre:** contacto `+573124510825` = "Dra María Carolina" (del backup, no pisado — D-09) ✓.
- **Body:** legible; placeholders de media como texto plano `<imagen omitida>` (type=`text`, sin componente de media roto) ✓.
- **type:** los 104 mensajes son `type='text'` (cero violaciones del CHECK) ✓.

> **Acción operador:** abrir el inbox de MorfX (workspace Varixcenter), revisar los
> chats `Dra María Carolina` (+573124510825) y `Nasly Enfermera` (+573003955741):
> confirmar render cronológico, burbujas in/out, fechas Bogotá, nombre, y que NO
> aparezcan como "no leído". Anotar OK aquí cuando se valide.

## T4 — Idempotencia en vivo ✓

Re-corrida idéntica (`--apply --limit 5`):
```
insertados: 0   duplicados: 104   contactos: creados=0 encontrados=5
conversaciones: creadas=0 mergeadas=5
```
Query de control: `SELECT count(*) FROM messages WHERE workspace_id=WS AND wamid LIKE 'import:%'` = **104** estable entre las dos corridas. ✓

## T5 — Regla 6 en vivo (0 triggers) ✓

- `SELECT count(*) FROM agent_sessions WHERE workspace_id=WS` = **0** (antes y después del apply). El import NO creó ninguna sesión de agente.
- `importHistoricalChat` no importa ni invoca emisores/inngest/runner/LLM (gate grep limpio, Plan 01 T4).
- Cero mensajes outbound enviados (la función nunca llama al send path).

## T6 — Merge sobre conversación viva (D-05) ✓ (cubierto)

Ninguno de los 5 chats piloto colisiona con la única conversación viva de Varixcenter
(`+573137549286`). Verificación en vivo de no-clobber: esa conversación quedó
**idéntica** tras el apply — `is_read=false, unread_count=1, last_message_preview="Hola"`
(sin cambios). El caso "import sobre convo existente NO toca su estado" está además
cubierto por el unit test de Plan 01 T3 (`merge D-05 — convo EXISTENTE → CERO update`).

---

## Resumen de criterios de éxito (CONTEXT.md)

| # | Criterio | Estado |
|---|----------|--------|
| 1 | Conteo cuadra (vs manifest) | ✓ 112 (104 ins + 8 system) / dry-run 4173 |
| 2 | Fidelidad inbox | ✓ DB-verified · ⏳ visual operador (T3) |
| 3 | 0 envíos | ✓ |
| 4 | 0 triggers (Regla 6) | ✓ agent_sessions=0 |
| 5 | Idempotente | ✓ re-run 0 ins / 104 dup |
| 6 | No-clobber de lives (D-05) | ✓ live convo intacta + unit test |

**Gate:** ✅ Técnicamente verde para barrido completo. Pendiente único: confirmación
visual del operador en el inbox (T3) antes de autorizar el sweep de los 537 chats.

---

## T8 — Barrido completo (537 chats) ✓

Operador autorizó tras revisión visual OK del piloto (chat Dra María Carolina: orden
cronológico, fechas Colombia, placeholders `<imagen omitida>`/`<contacto omitido>` como
texto, contenido legible).

```
Chats procesados:    537  (0 errores, 0 numberMissing)
Mensajes: insertados 3057  +  duplicados 104 (los 5 del piloto)  = 3161 importados
          saltados system 745 / no-texto 267
Contactos: creados 532 / encontrados 5
Conversaciones: creadas 531 / mergeadas 6
Reconciliación: 4173 ✓ CUADRA
```
Verificado en DB: total `wamid LIKE 'import:%'` = **3161**; `agent_sessions` = **0**;
todos los importados `type='text'`.

### ⚠️ Hallazgo del barrido: D-05 vs trigger `messages_update_conversation` (RESUELTO)

Uno de los 537 chats (`97616352276726@lid`) resuelve al número **+573137549286**, que
ya tenía una **conversación viva real** en Varixcenter (1 mensaje "Hola"). Al insertar sus
7 mensajes históricos, el trigger de DB `messages_update_conversation` (AFTER INSERT ON
messages, `supabase/migrations/20260130000002`) pisó `last_message_at`/`last_message_preview`/
`unread_count`/`is_read`/`last_customer_message_at` **por cada fila, sin guard de timestamp**
→ la convo viva quedó apuntando a un mensaje importado viejo (00:15) en vez del "Hola" real
(17:18), y `unread_count` 1→2. **El research no detectó este trigger** (RESEARCH §2 solo
señaló el UPDATE+emit de `receiveMessage`, no el trigger a nivel DB).

**Impacto:** 1 sola conversación (la única viva-real pre-existente; las 5 del piloto no
recibieron inserts nuevos → intactas).

**Resolución (2 partes):**
1. **Prod fix inmediato:** se restauró +573137549286 a su estado real recomputado de sus
   mensajes NO-import: `unread_count=1, is_read=false, last_message_at=17:18:38, preview="Hola"`.
   Los 7 mensajes históricos permanecen en el hilo (intención archival).
2. **Hardening del importador** (`importHistoricalChat`): para convos YA existentes, ahora
   hace **snapshot** de los 5 campos denormalizados ANTES del upsert y los **restaura**
   después (deshace el trigger) → D-05 garantizado aunque exista el trigger. Para convos
   nuevas-por-import el UPDATE explícito (max ts / is_read=true / unread=0) ya corregía al
   trigger. Test nuevo `merge D-05 — convo VIVA: restaura snapshot`. Sin migración (Regla 5
   no aplica — no se toca schema).

## Estado actual en producción

- **537 conversaciones / 3161 mensajes** importados a Varixcenter (`c6621640-...`).
- Conversación viva `+573137549286` **restaurada** a su estado correcto.
- `agent_sessions=0` (Regla 6 — cero agentes/automatizaciones/envíos por el import).
- 0 import en cualquier otro workspace.
- Rollback total disponible (ver `OPERATOR-RUNBOOK.md`):
  `DELETE FROM messages WHERE workspace_id='c6621640-...' AND wamid LIKE 'import:%'`.
  (Tras rollback, recomputar denormalizados de +573137549286 desde sus mensajes reales.)
