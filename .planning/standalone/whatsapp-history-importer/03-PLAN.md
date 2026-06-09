---
phase: whatsapp-history-importer
plan: 03
type: execute
wave: 3
depends_on: [01, 02]
decisions: [D-01, D-02, D-05, D-06]
files_modified:
  - .planning/standalone/whatsapp-history-importer/PILOT-RESULTS.md
  - .planning/standalone/whatsapp-history-importer/OPERATOR-RUNBOOK.md
autonomous: false
requirements: [D-01, D-05, D-06]
must_haves:
  truths:
    - "Gate de piloto: apply sobre una muestra pequeña (--limit) ANTES del barrido completo (D-06, igual que Etapa 1)"
    - "Fidelidad verificada en el inbox de MorfX: orden cronológico, fechas Bogota, in/out, nombre, body legible"
    - "Idempotencia probada en vivo: re-correr el apply NO duplica (inserted=0 la 2da vez)"
    - "Regla 6 verificada en vivo: 0 eventos de agente/automatización generados por el import (observability/logs)"
    - "Merge archival silencioso verificado (D-05): importar sobre una conversación viva no altera su is_read/unread/posición"
    - "Runbook para el operador: cómo correr el barrido completo + rollback (DELETE WHERE wamid LIKE 'import:%')"
  artifacts:
    - path: ".planning/standalone/whatsapp-history-importer/PILOT-RESULTS.md"
      provides: "Evidencia del piloto: conteos, screenshots/queries de fidelidad, idempotencia, Regla 6"
      contains: "wamid LIKE 'import:%'"
    - path: ".planning/standalone/whatsapp-history-importer/OPERATOR-RUNBOOK.md"
      provides: "Pasos del barrido completo + rollback + criterios de éxito"
      contains: "rollback"
  key_links: []
---

<objective>
**Gate del piloto (D-06)** + verificación de los criterios de éxito en vivo, antes de autorizar el barrido completo. Mismo principio que Etapa 1: no migrar 537 chats sobre una estructura no probada. Este plan es **supervisado** (`autonomous: false`) — requiere el `workspace_id` + `phone_number_id` reales del operador y revisión visual del inbox.
</objective>

<context>
Lee primero: `RESEARCH.md` §3.3 (conteos esperados), §7 (pitfalls). `CONTEXT.md` Criterios de éxito.

Inputs del operador (NO hardcodear — D-13):
- `WS` = workspace_id de Varixcenter (el dueño del número 573202067077).
- `PNID` = phone_number_id del número migrado en MorfX.
- `.env.local` con `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL`.

⚠️ Este plan ESCRIBE en producción. Empezar con `--limit` chico.
</context>

<tasks>

### T1 — Dry-run de control (reconciliación)
`npx tsx --env-file=.env.local scripts/import-whatsapp-history.ts --backup robot-whatsapp-reader/output/573202067077 --workspace $WS --phone-number-id $PNID`
- Confirmar que el reporte cuadra ~4173 (≈3161 insertables / ≈1012 saltados — RESEARCH §3.3). Si el delta no cuadra → STOP, revisar clasificación (no proceder a apply).

### T2 — Apply piloto (muestra pequeña)
`... --apply --limit 5`
- Capturar el reporte (contactos creados/encontrados, conversaciones creadas/mergeadas, insertados/duplicados/saltados).

### T3 — Verificación de fidelidad en el inbox (manual, operador)
Abrir el inbox de MorfX (workspace Varixcenter) y revisar 1-2 de los chats piloto:
- Orden cronológico ascendente correcto.
- Fechas en `America/Bogota` (Regla 2).
- `fromMe` → burbuja outbound (derecha); cliente → inbound (izquierda).
- Nombre del contacto correcto (no pisado si ya existía).
- Body legible; placeholders de media (`<imagen omitida>` etc.) se ven como texto, sin componente de media roto.
- La conversación NO aparece como "no leída" / no saltó al tope falsamente (D-05, convo nueva = leída).
- Anotar hallazgos en PILOT-RESULTS.md. Si algo está roto → STOP, volver a Plan 01/02.

### T4 — Idempotencia en vivo
Re-correr T2 idéntico (`--apply --limit 5`):
- Esperado: `messagesInserted=0`, `messagesDuplicated=<N del piloto>`, conversaciones todas "mergeadas" (0 creadas), contactos todos "encontrados". 
- Query de control: `SELECT count(*) FROM messages WHERE wamid LIKE 'import:%';` estable entre las dos corridas.

### T5 — Regla 6 en vivo (0 triggers)
- Revisar observability/logs durante/after el apply: NO debe aparecer ningún `pipeline_decision:*`, `whatsapp.message_received`, ni ejecución de automatización atribuible al import.
- Query/inspección: confirmar que no se crearon sesiones de agente ni eventos de runner por estos mensajes.
- Anotar evidencia en PILOT-RESULTS.md.

### T6 — Merge sobre conversación viva (D-05) — si aplica
- Si entre los 5 piloto hay un número que YA tenía conversación viva en MorfX: confirmar que su `is_read`/`unread_count`/`last_message_at` NO cambiaron tras el import (solo se agregaron mensajes viejos al hilo).
- Si ninguno de los 5 aplica: forzar un caso de prueba controlado (un número con conversación existente) o documentar como "no cubierto en piloto, cubierto por unit test Plan 01 T3".

### T7 — Runbook del barrido completo + rollback
Escribir `OPERATOR-RUNBOOK.md`:
- Comando del barrido completo (sin `--limit`): `... --apply`.
- Conteos esperados de éxito.
- **Rollback total:** `DELETE FROM messages WHERE workspace_id='$WS' AND wamid LIKE 'import:%';` (+ opcional limpiar conversaciones que quedaron vacías y fueron creadas solo por el import — query de las que no tienen mensajes no-import).
- Nota Regla 5: si en el futuro se decide añadir columna `imported_at`/`source`, PARAR y migrar antes (hoy NO aplica — D-01).
- Multi-cliente: repetir con otro `--backup <otra carpeta>` + `$WS`/`$PNID` del cliente correspondiente.

### T8 — Decisión de barrido completo (gate)
Con PILOT-RESULTS.md verde en T2-T6 → **autorizar barrido completo**. Documentar la corrida final en PILOT-RESULTS.md (conteos reales vs esperados). Si el operador prefiere correr el barrido él mismo, dejar el runbook listo y marcar el gate como "listo para operador".

</tasks>

<verification>
- PILOT-RESULTS.md con evidencia de los 6 criterios de éxito (CONTEXT.md): conteo cuadra, fidelidad inbox, 0 envíos, 0 triggers, idempotente, no-clobber de lives.
- OPERATOR-RUNBOOK.md con barrido + rollback.
- Commit: `docs(whatsapp-history-importer-03): pilot results + operator runbook`.

> No se hace push de código en este plan (es verificación + docs). El código (Plan 01/02) se pushea tras su propio `tsc --noEmit` + tests verdes, por Regla 1.
</verification>
