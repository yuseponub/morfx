# Snapshot Audit Production — agent-godentist-fb-ig

**Fecha captura:** 2026-05-05 16:00 America/Bogota
**Workspace target:** GoDentist Valoraciones (`f0241182-f79b-4bc6-b0ed-b5f6eb20c514`)
**Source:** outputs verbatim de las 4 queries en `01-AUDIT.sql` (Supabase SQL Editor production) + lectura del codigo para Q1/Q3.
**Proposito:** desbloquear Wave 1 con datos productivos verificados (no asumidos).

> **Estado del documento:** COMPLETO — Q1/Q2/Q3 RESUELTAS. 4/4 queries productivas
> con outputs capturados verbatim. Decision agregada GO emitida. Datos locked
> para Waves 1-7.

---

## Query (A) — Inventario templates godentist

**Total rows:** **79** (well above the ≥50 GO threshold)
**Decision:** [x] **GO** (≥50 rows)

**Caracteristicas globales del catalog:**
- 100% rows con `content_type='texto'` (cero `imagen`, cero `video`)
- 100% rows con `workspace_id=NULL` (catalog global, intencional por D-08 = clonado verbatim al sibling)
- 100% rows con `visit_type='primera_vez'` (no `recurrente` variant exists en prod para godentist — esperado segun catalog actual)
- Priorities presentes: `CORE`, `COMPLEMENTARIA`, `OPCIONAL` (3 niveles).

**Intents cubiertos (full inventory production output):**

```
cancelar_cita, cita_agendada, confirmar_cita, despedida, english_response,
financiacion, fuera_horario, garantia, handoff, horarios,
horarios_generales_sede, invitar_agendar, materiales, menores,
mostrar_disponibilidad, no_interesa, objecion_precio, pedir_datos,
pedir_datos_con_sede, pedir_datos_parcial, pedir_fecha,
pedir_fecha_con_sugerencia, pedir_fecha_no_laboral, precio_alineadores,
precio_autoligado_ceramico, precio_autoligado_clasico, precio_autoligado_pro,
precio_blanqueamiento, precio_brackets_conv, precio_brackets_zafiro,
precio_calza_resina, precio_carillas, precio_corona, precio_diseno_sonrisa,
precio_endodoncia, precio_extraccion_juicio, precio_extraccion_simple,
precio_implante, precio_limpieza, precio_ortodoncia_general, precio_ortopedia,
precio_placa_ronquidos, precio_protesis, precio_radiografia,
precio_rehabilitacion, reagendamiento, recordatorio_sin_compromiso,
retoma_confirmacion, retoma_datos, retoma_fecha, retoma_final, retoma_horario,
retoma_inicial, retoma_post_info, saludo, seguros_eps, ubicacion, urgencia,
valoracion_costo
```

**Saludo CORE (orden=0) — contenido a REEMPLAZAR por D-05 lead-capture text en Wave 5 Plan 07 migration:**

> `"Hola, te damos la bienvenida a GoDentist ¡Nos encanta verte sonreír!"`

**Saludo COMPLEMENTARIA (orden=1) — contenido PRESERVADO verbatim en sibling:**

> `"¿Deseas agendar tu cita de valoración GRATIS?"`

**Target row count para sanity check del migration DO block (Wave 5 Plan 07):** **79 rows**

El `INSERT...SELECT` del Plan 07 debe producir exactamente 79 rows en `agent_templates WHERE agent_id='godentist-fb-ig' AND workspace_id IS NULL`. El DO block debe assert `godentist_count = sibling_count` (ambos = 79).

---

## Query (A-summary) — content_type breakdown (Q2 resolution)

```json
[ { "content_type": "texto", "row_count": 79 } ]
```

| content_type | row_count |
|--------------|-----------|
| texto        | 79        |

**Q2 RESOLUTION:** [x] **SAFE** — 100% texto. Zero images, zero videos. FB/IG son 100% safe to clone verbatim. **Sin anomalias documentadas.**

Razon: como NO hay rows `content_type IN ('imagen', 'video')`, no existe el riesgo de URLs WhatsApp-only hardcoded que Meta rechazara en FB/IG. El sibling enviara solo mensajes de texto, los cuales Graph API soporta sin restricciones para los 3 canales (whatsapp, facebook, instagram). La migration `INSERT...SELECT` con `CASE WHEN intent='saludo' AND priority='CORE' AND orden=0 THEN <new lead-capture text> ELSE content END` clonara verbatim sin necesidad de logica adicional para media.

---

## Query (B) — Conversations FB/IG en workspace target

```json
[
  { "channel": "whatsapp",  "conversation_count": 3463, "last_seen": "2026-05-05 20:38:06.931073+00" },
  { "channel": "facebook",  "conversation_count": 1225, "last_seen": "2026-05-05 20:08:01.241288+00" },
  { "channel": "instagram", "conversation_count": 218,  "last_seen": "2026-05-05 17:42:53.584709+00" }
]
```

| channel    | conversation_count | last_seen                          |
|------------|--------------------|------------------------------------|
| whatsapp   | 3463               | 2026-05-05 20:38:06.931073+00      |
| facebook   | 1225               | 2026-05-05 20:08:01.241288+00      |
| instagram  | 218                | 2026-05-05 17:42:53.584709+00      |

**Decision:** [x] **GO** — rows con `channel='facebook'` (1225) y `channel='instagram'` (218) presentes con `channel` populated correctamente.

**Pitfall 7 sanity check PASSED:** Zero rows con `channel=NULL` para este workspace. El fact `channel` (resuelto por `routing-channel-fact` shipped 2026-05-04) resolvera correctamente cuando la routing rule del sibling fire. Recent activity (`last_seen` dentro de horas del audit) confirma que ambos canales estan activos en produccion ahora mismo.

---

## Query (C) — Baseline agent_templates godentist-fb-ig

```text
Result: Success. No rows returned
```

**Decision:** [x] **GO** — 0 rows pre-existentes (sibling es greenfield).

**GREENFIELD CONFIRMADO:** la migration `INSERT...SELECT` del Wave 5 Plan 07 landeara cleanly. El `DELETE FROM agent_templates WHERE agent_id='godentist-fb-ig'` inicial idempotente del migration sigue siendo recomendado como guardia defensivo (sin efecto en este momento, pero protege re-runs).

---

## Query (D) — Priorities ocupados en routing_rules workspace target

```text
Result: Success. No rows returned
```

| priority | name | rule_type |
|----------|------|-----------|
| _empty_  | _empty_ | _empty_ |

**CRITICAL FINDING:** El workspace `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` tiene **ZERO active routing rules**. Esto significa:

1. **No hay riesgo de priority collision** — el usuario puede escoger cualquier priority libre para la nueva regla del sibling (D-15 routing rule manual en Plan 09).
2. El dispatch path actual del trafico FB/IG de este workspace ocurre via **una de dos rutas legacy** (NO via `agent-lifecycle-router`):
   - (a) Fallback if/else en `webhook-processor.ts`, o
   - (b) `workspace_agent_config.conversational_agent_id` directo.
3. **No es blocker** para el sibling — el lifecycle router ya tiene fall-through a legacy cuando no matchea ninguna regla (anti-Pitfall 1 documentado en LEARNINGS de `agent-lifecycle-router`).

**Plan 09 deployment guidance — REQUERIDO antes de crear la rule manual:**

1. **Verificar `workspace_agent_config.lifecycle_routing_enabled`** para `f0241182-f79b-4bc6-b0ed-b5f6eb20c514`:
   ```sql
   SELECT lifecycle_routing_enabled
   FROM workspace_agent_config
   WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
   ```
   - Si `true` → la routing rule del sibling se evaluara correctamente.
   - Si `false` o NULL → el lifecycle router se SALTARA y caera al legacy. Activarlo via:
     ```sql
     UPDATE workspace_agent_config
     SET lifecycle_routing_enabled = true
     WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
     ```

2. **Confirmar dispatch path actual antes de cambiar:** revisar logs de webhook-processor para una conversation reciente (`facebook` o `instagram`) y verificar que termina en `agent_id='godentist'`. Si si, el flip a `lifecycle_routing_enabled=true` + creacion de rule debe preservar el comportamiento WhatsApp y reroutear FB/IG al sibling.

**Priority slot recomendado para nueva rule del sibling:** **`100`** (cualquier valor libre funciona; sugerimos un numero bajo como 100 o 500 para que el usuario tenga espacio para agregar reglas above/below en el futuro). Cero colisiones con `uq_routing_rules_priority` UNIQUE INDEX porque la tabla esta vacia para este workspace.

---

## Open Questions Resolved

### Q1: routing-editor consume agent catalog filtrado o directo?

**Hallazgo (verificado por lectura directa de codigo):**
`src/app/(dashboard)/agentes/routing/editor/page.tsx` linea 65:

```ts
const agents = agentRegistry
  .list()
  .map((a) => ({ id: a.id, name: a.name ?? a.id }))
  .sort((a, b) => a.id.localeCompare(b.id))
```

El editor invoca **`agentRegistry.list()` directo** — NO usa `getAgentsForWorkspace`.
Los siblings se registran via side-effect imports en lineas 25-30 del mismo archivo:

```ts
import '@/lib/agents/somnio-recompra'
import '@/lib/agents/somnio-v3'
import '@/lib/agents/somnio'
import '@/lib/agents/godentist'
import '@/lib/agents/somnio-pw-confirmation'
import '@/lib/agents/somnio-v4'
```

**Implicacion:** El sibling `godentist-fb-ig` auto-aparece en el dropdown del routing-editor cuando agreguemos `import '@/lib/agents/godentist-fb-ig'` a esa lista (1 linea). NO requiere extender `getAgentsForWorkspace` ni tocar `agent-catalog.ts`.

**Plan 05 Wave 3 adjustment:** agregar 1 linea de import en `page.tsx` (registrar side-effect). Cero LOC adicionales.

**Q1 Status:** [x] **RESUELTA** — sin trabajo adicional mas alla de 1 import line en Wave 3 Plan 05.

---

### Q2: content_types FB/IG safe para clonado verbatim?

**Hallazgo (verificado por output Q-A-summary):**
100% de las 79 rows del catalog godentist tienen `content_type='texto'`. Cero `imagen`, cero `video`.

**Implicacion:** **SAFE.** No hay riesgo de que el sibling envie URLs hardcoded WhatsApp-only que Meta rechazara en FB/IG. La migration `INSERT...SELECT` clonara los 79 rows verbatim (con override del `saludo`/CORE/orden=0 por el lead-capture text de D-05). Cero anomalias para documentar.

**Plan 07 Wave 5 adjustment:** ninguno — la migration no necesita logica especial para media porque no existe en este catalog.

**Q2 Status:** [x] **RESUELTA — SAFE.**

---

### Q3: robot Railway acepta string 'godentist-valoraciones' para sibling?

**Hallazgo (verificado por lectura directa de codigo):**
`src/lib/agents/godentist/dentos-availability.ts` linea 50:

```ts
body: JSON.stringify({
  workspaceId: 'godentist-valoraciones',
  credentials: ROBOT_CREDENTIALS,
  date,
  sucursal,
}),
```

El `workspaceId` es un **string literal hardcoded** (`'godentist-valoraciones'`), NO el UUID de Supabase ni una expresion dinamica. Confirmado tambien:

- `ROBOT_URL = 'https://godentist-production.up.railway.app'` (linea 8) — hardcoded
- `ROBOT_CREDENTIALS = { username: 'JROMERO', password: '123456' }` (linea 9) — hardcoded
- El robot recibe `workspaceId` + `credentials` + `date` + `sucursal` y NO discrimina por agent_id

**Implicacion:** El sibling clonando `dentos-availability.ts` verbatim (Wave 1 Plan 02 listing) usara la misma string `'godentist-valoraciones'` → ambos agentes (godentist y godentist-fb-ig) hablan al mismo robot Railway con misma credencial JROMERO/123456 contra la misma cuenta Dentos. Funciona out-of-the-box.

**Plan 02 Wave 1 adjustment:** ninguno — el archivo se clona verbatim como esta. Cero ajustes.

**Q3 Status:** [x] **RESUELTA** — clone verbatim sin ajustes.

---

## Decision agregada

**Verdict por query:**

| Query | Result | Threshold | Verdict |
|-------|--------|-----------|---------|
| (A) godentist templates | 79 rows | ≥50 | **GO** |
| (A-summary) content_type | 100% texto | mostly texto + media compatible | **GO** |
| (B) FB/IG conversations | 1225 facebook + 218 instagram con channel populated | rows con facebook/instagram | **GO** |
| (C) baseline `agent_id='godentist-fb-ig'` | 0 rows | =0 | **GO** |
| (D) priorities | empty (no active rules) | gap exists | **GO** (cualquier priority libre — recomendado 100) |

**Open Questions:**

| Question | Status | Resolution |
|----------|--------|------------|
| Q1 routing-editor data source | [x] RESUELTA | usa `agentRegistry.list()` directo; 1 import line en Plan 05 |
| Q2 content_types FB/IG safe | [x] RESUELTA | 100% texto; cero anomalias |
| Q3 robot Railway workspace string | [x] RESUELTA | string literal `'godentist-valoraciones'`; clone verbatim |

- [x] **Wave 0 PASA — desbloquear Wave 1.** Todas las decisions GO + las 3 Qs RESUELTAS.
- [ ] Wave 0 BLOCKER — pausar fase. _(no aplica)_

---

## Datos locked para Waves 1-7

- **Q-A row count:** **79** (target del sanity check `godentist_count = sibling_count` en Plan 07 DO block)
- **Q-C baseline:** 0 rows (greenfield, migration land cleanly)
- **Priority slot recomendado para Plan 09 routing rule:** **100** (cualquier valor libre — workspace tiene cero rules activas)
- **Plan 09 deployment pre-check (NUEVO):** verificar `workspace_agent_config.lifecycle_routing_enabled = true` para `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` antes de crear la rule. Si esta `false`/`NULL`, activarlo manualmente via SQL. Razon: el dispatch actual probablemente va via legacy fallback porque no hay rules activas; activar el lifecycle router es prerequisito para que la rule del sibling sea evaluada.
- **Q1 plan adjustment:** ninguno — `page.tsx` solo necesita 1 import line (`import '@/lib/agents/godentist-fb-ig'` en lineas 25-30 de `editor/page.tsx`)
- **Q2 plan adjustment:** ninguno — la migration no necesita logica especial para media (cero rows imagen/video)
- **Q3 plan adjustment:** ninguno — `dentos-availability.ts` clonado verbatim
