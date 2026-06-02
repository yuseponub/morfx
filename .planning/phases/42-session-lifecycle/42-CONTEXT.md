# Phase 42 — Session Lifecycle: Cierre y Reapertura de Sesiones de Agentes

**Descubierto:** 2026-04-06 durante sesion de debug con el usuario
**Agentes afectados:** Somnio V3, GoDentist, Somnio Recompra (cualquier agente que use V3ProductionRunner)
**Tipo:** Bug critico de produccion — clientes recurrentes reciben respuestas contaminadas o no reciben respuesta

---

## 1. Resumen ejecutivo del bug

Las sesiones de agentes conversacionales **nunca se cierran en runtime** salvo en el caso muy acotado de handoff explicito a humano. Cuando un cliente vuelve a escribir dias despues de haber terminado una conversacion, pueden pasar dos cosas malas:

**Caso A (dominante, ~99% de clientes recurrentes):** El sistema encuentra la sesion vieja todavia con `status='active'` y la reusa. El agente retoma con todo el state fosilizado: `accionesEjecutadas` del ciclo anterior, `current_mode` atascado en una fase obsoleta, `datos_capturados` con info vieja, `templates_enviados` ya pre-cargados. El bot responde cosas sin sentido o queda pegado en un estado imposible.

**Caso B (minoria, clientes que pasaron por handoff):** El sistema no encuentra sesion activa (porque la anterior quedo `handed_off`), intenta crear una nueva, y **explota con error Postgres 23505** por violacion del `UNIQUE(conversation_id, agent_id)`. El mensaje queda sin respuesta — el bot queda mudo.

---

## 2. Diagnostico detallado con code locations

### 2.1 Schema actual

**`supabase/migrations/20260205000000_agent_sessions.sql:11-34`**

```sql
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'closed', 'handed_off')),
  current_mode TEXT NOT NULL DEFAULT 'conversacion',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(conversation_id, agent_id)  -- ← constraint mortal
);
```

Estados permitidos: `active`, `paused`, `closed`, `handed_off`. **En produccion, `paused` y `closed` NUNCA se escriben.** Solo existen `active` y `handed_off`.

### 2.2 Flujo de lookup al llegar un mensaje

```
WhatsApp webhook
  → src/lib/whatsapp/webhook-handler.ts (processIncomingMessage)
    → src/lib/agents/production/webhook-processor.ts (processMessageWithAgent)
      → src/lib/agents/engine/v3-production-runner.ts (processMessage)
        → src/lib/agents/engine-adapters/production/storage.ts:41 (getOrCreateSession)
          → src/lib/agents/session-manager.ts:202 (getSessionByConversation)
```

**`src/lib/agents/session-manager.ts:202-229`** — la query con el filtro problematico:

```typescript
async getSessionByConversation(conversationId: string, agentId: string) {
  const { data: session, error } = await this.supabase
    .from('agent_sessions')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('agent_id', agentId)
    .eq('status', 'active')   // ← solo encuentra activas
    .maybeSingle()
  // ...
}
```

Y en el adapter, **`storage.ts:41-62`** (`getOrCreateSession`):

```typescript
const existing = await this.sessionManager.getSessionByConversation(conversationId, this.agentId)
if (existing) return existing  // reusa sin mirar que tan vieja es

// si no hay, crea nueva
const newSession = await this.sessionManager.createSession({...})
```

**No hay logica de "esta vieja, resetealo".** No hay logica de "intenta reabrir si esta closed". Simplemente: si existe active → reusar; si no → crear.

### 2.3 Donde se cierran las sesiones en runtime — auditoria exhaustiva

Grep de TODAS las rutas que escriben a `agent_sessions`:

| Ubicacion | Operacion | Escribe `status`? |
|---|---|---|
| `session-manager.ts:123` | INSERT (createSession) | `'active'` fijo |
| `session-manager.ts:162` | DELETE (rollback por error de state) | — |
| `session-manager.ts:256` | UPDATE con version (updateSessionWithVersion) | solo si caller pasa status |
| `inngest/functions/agent-timers-v3.ts:391` | UPDATE `current_mode` | ❌ NO toca status |
| `inngest/functions/agent-production.ts:150` | SELECT con `.eq('is_active', true)` | **BUG: columna inexistente** |
| `storage.ts:142` | handoffSession (via adapter) | `'handed_off'` |

**Callers de `updateSessionWithVersion({status: ...})`:**
- `session-manager.ts:287` — `closeSession()` define `status='closed'` → **CERO callers en runtime**
- `session-manager.ts:296` — `handoffSession()` define `status='handed_off'` → SI tiene callers

**Callers de `closeSession()` — grep exhaustivo en `src/`:**
```
src/lib/agents/engine.ts:493  ← definicion wrapper (el wrapper mismo tiene cero callers)
src/lib/agents/session-manager.ts:287  ← definicion
```
**Ningun codigo de runtime llama closeSession.** Ni la maquina de estados V3, ni Inngest, ni webhooks, ni tool handlers. Solo existe como API muerta.

**Callers de `handoffSession()`:**
- `engine.ts:607` — `handleHandoff()` cuando intent=handoff
- `somnio/somnio-engine.ts:455` — engine legacy V1
- `storage.ts:142` — expuesto al V3 runner

**Conclusion:** el unico path real que cierra una sesion en produccion es **handoff a humano**, y el status resultante es `handed_off`, no `closed`. El estado `closed` del schema es codigo muerto.

### 2.4 El falso amigo: `phase='closed'` en las maquinas de estado V3

Esto casi me confunde durante el debug. Los agentes V3 (Somnio, GoDentist, Recompra) tienen un concepto de `Phase` que incluye el valor `'closed'`:

**`src/lib/agents/somnio-v3/phase.ts:14-37`** (y equivalentes en `godentist/phase.ts`, `somnio-recompra/phase.ts`):

```typescript
export function derivePhase(acciones: (string | AccionRegistrada)[]): Phase {
  for (let i = acciones.length - 1; i >= 0; i--) {
    // ...
    switch (tipo) {
      case 'handoff':
      case 'rechazar':
      case 'no_interesa':  return 'closed'
      // ...
    }
  }
  return 'initial'
}
```

Y luego en **`src/lib/agents/somnio-v3/transitions.ts:420-426`**:

```typescript
{
  phase: 'closed', on: '*', action: 'silence',
  resolve: () => ({ reason: 'Fase closed -> fallback (no action)' }),
},
```

**Esto no es el `status` de la sesion.** La `Phase` es un valor **derivado en memoria cada turno** desde `accionesEjecutadas`, NO un campo persistido. Cuando el cliente dice "no me interesa":
1. Se agrega `rechazar` a `accionesEjecutadas`
2. Proximo turno, `derivePhase()` calcula `phase='closed'`
3. Transicion dispara `action: 'silence'` → el bot no responde
4. **`agent_sessions.status` sigue siendo `'active'` para siempre**

El bot queda "silencioso" porque la phase derivada dice `closed`, pero la sesion en DB no. Dias despues el cliente escribe, se reusa la sesion, el bot vuelve a derivar phase desde el mismo `accionesEjecutadas` (que sigue teniendo el `rechazar` al final) → phase sigue siendo `closed` → bot sigue mudo. **El bot no solo queda confundido, queda permanentemente mudo para cualquier cliente que haya dicho "no" una vez.**

### 2.5 Bug colateral: `is_active` en agent-production.ts

**`src/inngest/functions/agent-production.ts:149-157`**:

```typescript
const { data: session } = await supabase
  .from('agent_sessions')
  .select('id')
  .eq('conversation_id', conversationId)
  .eq('workspace_id', workspaceId)
  .eq('is_active', true)  // ← columna INEXISTENTE
  .order('created_at', { ascending: false })
  .limit(1)
  .single()
```

La columna `is_active` no existe en `agent_sessions` (verificado en el schema 20260205000000). Esta query:
- Probablemente retorna `error + null data` silenciosamente (Supabase puede tratar columna inexistente como error)
- Si retorna null, el bloque `if (session)` en la linea siguiente no ejecuta → el `inngest.send` de cancelacion de silence timer nunca se dispara
- El path afectado es solo `execute-media-handoff` (cuando el gate de media dispara handoff)

Impacto real: al hacer media handoff, el silence timer zombie no se cancela. Esto es un bug separado que no se arregla en Phase 42 pero queda documentado para atacar despues.

### 2.6 Timers que pueden quedar zombies

**`src/inngest/functions/agent-timers-v3.ts`** es el handler principal de los timers V3 (L2, L4, L5 — mensajes proactivos cuando el cliente calla). Tras Phase 42, cualquier timer que dispare sobre una sesion ya cerrada debe abortar silenciosamente. El check va al inicio del handler principal, antes de cualquier procesamiento.

Hay que grep ademas otros handlers Inngest que operen sobre `sessionId`:

```bash
grep -rn "sessionId" src/inngest/functions/ | grep -v "test"
```

Durante el research se debe hacer la lista exhaustiva. Candidatos probables: `agent-production.ts`, `agent-timers-v3.ts`, y posibles jobs de followup de GoDentist.

---

## 3. Decisiones de diseno y su rationale

### 3.1 Modelo conceptual: Opcion A (multiples sesiones por conversacion)

**Decidido:** Una sesion = un ciclo conversacional finito. Pueden coexistir N sesiones para el mismo `(conversation_id, agent_id)` a lo largo del tiempo, con maximo 1 activa simultaneamente.

**Rationale:**
- El usuario fue explicito: "se cierra y se abre otra desde 0 [...] realmente no se borra, solo se archiva"
- Prepara el terreno para fase 2 (memoria entre sesiones): poder leer de sesiones cerradas anteriores para sembrar contexto en la nueva
- Auditable: cada ciclo queda inmutable con sus propios turns, state, timestamps — se puede reconstruir exactamente que paso en cada visita
- Habilita metricas futuras: "cuantas veces vuelve un cliente antes de comprar", "tasa de reapertura", "duracion promedio de ciclo"

**Alternativa rechazada (Opcion B):** Una sola fila permanente por `(conversation_id, agent_id)` que se "resetea" al reabrir. Rechazada porque pierde separacion historica: `agent_turns` quedarian mezclados entre ciclos distintos sin marcador natural de frontera, y no permite facil lectura de "que paso en la visita anterior".

### 3.2 Cambio de schema: indice parcial unico

**Decidido:**
```sql
ALTER TABLE agent_sessions DROP CONSTRAINT agent_sessions_conversation_id_agent_id_key;

CREATE UNIQUE INDEX agent_sessions_one_active_per_conv_agent
  ON agent_sessions(conversation_id, agent_id)
  WHERE status = 'active';
```

**Rationale:** Permite N sesiones historicas (archivadas) pero garantiza maximo 1 activa a la vez. Es la forma correcta de implementar Opcion A sin perder la invariante de unicidad donde importa.

**Migracion debe aplicarse en produccion ANTES del deploy** (Regla 5 de CLAUDE.md). Razon: el codigo nuevo va a crear sesiones nuevas para conversaciones que ya tienen una sesion cerrada — si el constraint viejo sigue activo, esas inserciones explotan.

### 3.3 Cron de cierre a las 2 AM

**Decidido:** Inngest scheduled function corriendo diariamente a las **02:00 America/Bogota** con la query:

```sql
UPDATE agent_sessions
SET status = 'closed',
    updated_at = timezone('America/Bogota', NOW())
WHERE status = 'active'
  AND last_activity_at < date_trunc('day', timezone('America/Bogota', NOW()));
```

**Rationale del horario (2 AM):**
- Valle real de trafico en Colombia (entre 2-5 AM, minima actividad de clientes)
- Suficientemente tarde para que conversaciones nocturnas (10-11 PM) ya hayan terminado
- Suficientemente temprano para que el cierre este hecho antes del despertar matutino (5-6 AM)

**Rationale de la regla (variante Y — "cierra las que no tuvieron actividad hoy"):**
- Respeta al cliente que esta chateando en la madrugada: si su `last_activity_at` es posterior a medianoche, la sesion sobrevive al cron
- Natural alineacion con "el dia empieza fresco" — todas las conversaciones del dia anterior quedan archivadas al amanecer
- Robusto contra el race del cliente que escribe a las 01:59 AM: su sesion no se cerrara hasta el cron del dia siguiente (si no tiene mas actividad)

**Rationale de tocar solo `active`:** Las sesiones `handed_off` ya son terminales. No hay razon para tocarlas. El cron explicitamente las excluye.

**Alternativas rechazadas:**
- **Variante X ("cierralo todo"):** Cortaria conversaciones en curso a las 2 AM. Mala UX.
- **Variante Z ("cierra por X horas de inactividad"):** Mas flexible pero pierde el beneficio mental de "madrugada = reseteo". Ademas requiere mas cron ticks o calcular continuamente.
- **Cierre por intent inmediato:** Mas sofisticado (ej. cerrar al instante cuando el cliente dijo "no" o compro), pero el usuario pidio explicitamente "por ahora manejemoslo por tiempos". Queda para fase 2.

### 3.4 Defensive check en timers (no cancelacion activa)

**Decidido:** Al inicio de cada handler Inngest que opere sobre `sessionId`, verificar `status === 'active'`. Si no, abortar silenciosamente con log info.

```typescript
const { data: session } = await supabase
  .from('agent_sessions')
  .select('status')
  .eq('id', sessionId)
  .single()

if (!session || session.status !== 'active') {
  logger.info({ sessionId, status: session?.status }, 'Timer aborted: session not active')
  return
}
```

**Rationale:**
- Trivial de implementar (1 query + 1 check por handler)
- 100% robusto: no importa por que la sesion dejo de estar activa (cron, handoff, bug futuro) — siempre aborta limpio
- No require infraestructura nueva de Inngest (cancel-by-reference es mas complejo y no bien soportado)
- Red de seguridad que cubre casos futuros no previstos

**Alternativa rechazada (cancelacion activa al cerrar):** El cron cerraria sesiones y simultaneamente enviaria eventos Inngest para cancelar timers pendientes por sessionId. Mas limpio en teoria pero: (a) Inngest no tiene cancel-by-reference trivial, requeriria patterns complejos; (b) el defensive check solo ya es suficiente para el objetivo de fase 1; (c) si falla la cancelacion, igual necesitarias el defensive check como fallback. Decision: el check solo es simple y suficiente.

### 3.5 Edge case aceptado: mensaje en medio del cron

**Escenario:** Cliente envia mensaje exactamente durante la ejecucion del cron a las 02:00:30 AM.

**Posibles outcomes:**
1. El cron aun no cerro esa sesion → webhook la encuentra `active` → usa la vieja → cron la cierra despues → siguiente mensaje del mismo cliente nace en sesion nueva. Medio segundo de state "cruzado".
2. El cron ya cerro esa sesion → webhook no encuentra → crea nueva → todo limpio.

**Decision:** Dejarlo asi. No vale la pena locking complejo. Caso rarisimo (2 AM + cliente justo escribiendo) con impacto puramente cosmetico (un turno posiblemente atado a la sesion vieja). No hay corrupcion de datos.

### 3.6 Multi-workspace / multi-timezone

**Decidido:** Hardcode `America/Bogota` para todos los workspaces en fase 1.

**Rationale:** CLAUDE.md dice explicitamente "TODA la logica de fechas usa America/Bogota". Todos los clientes actuales de morfx estan en Colombia. Si mañana entra un cliente en otra zona, se refactorea para leer timezone por workspace. Fase 1 no se bloquea por generalizacion especulativa.

---

## 4. Scope de fase 1 (lo que SI va)

1. Migracion SQL: drop UNIQUE + create indice parcial unico
2. Inngest scheduled function `close-stale-sessions` a las 02:00 COT diario
3. Defensive check al inicio de handlers de timers V3 (auditar todos los handlers en research)
4. Tests/verificacion manual: simular cliente recurrente con sesion cerrada, verificar que nace limpia
5. Logging del cron (count de sesiones cerradas por ejecucion) para observabilidad

## 5. Fuera de scope (fase 2 futura)

1. **Memoria entre sesiones** — extraer datos relevantes de sesion cerrada (ultimo pack ofrecido, ultima objecion, nombre del cliente, etc.) para sembrar la nueva sesion. El usuario lo menciono explicitamente: "mas adelante buscaremos la forma de ver que datos relevantes se pueden reflejar en cada sesion cerrada para tener en cuenta en la siguiente"
2. **Cierre por intent inmediato** — cerrar en el momento cuando el cliente dijo "no", compro, agendo cita, etc. (en lugar de esperar al cron nocturno)
3. **UI en CRM** — ver historial de sesiones de un contacto, drill-down por sesion
4. **Metricas** — razones de cierre, duracion promedio, tasa de reapertura, deteccion de clientes recurrentes
5. **Fix del bug `is_active`** en `agent-production.ts:154`
6. **Multi-timezone** — leer timezone por workspace
7. **Phase derivada** — considerar si en vez de derivar `phase='closed'` desde `accionesEjecutadas` (y dejar el bot mudo permanentemente), debemos resetear `accionesEjecutadas` al cerrar/abrir sesion. Esto se resuelve indirectamente en Phase 42 porque la nueva sesion nace con `accionesEjecutadas=[]` por default, asi que la phase derivada volvera a `initial`. Esto es importante notarlo en el plan: el bug de "bot permanentemente mudo tras decir no" se resuelve automaticamente con la reapertura limpia.

## 6. Criterios de exito

Los 5 definidos en ROADMAP.md seccion Phase 42. Copiados aca para consulta rapida:

1. Cliente con conversacion cerrada hace >24h vuelve a escribir y recibe respuesta normal, arranca desde cero sin contexto contaminado
2. DB muestra multiples filas en `agent_sessions` para mismo `(conversation_id, agent_id)` para clientes con varios ciclos
3. Cron ejecuta 02:00 COT diario, logea count de cerradas; sesiones con actividad post-medianoche sobreviven
4. Clientes previamente bloqueados por `handed_off` + unique constraint ahora reciben respuesta; no hay errores 23505 en logs; defensive check previene mensajes zombi
5. Sesiones activas en curso al momento del deploy no sufren regresion; migracion sin downtime

## 7. Riesgos y mitigaciones

| Riesgo | Mitigacion |
|---|---|
| Migracion falla en prod porque hay data inconsistente | Research debe validar con `SELECT COUNT(*), status FROM agent_sessions GROUP BY status` antes del deploy. Drop de UNIQUE es seguro (no requiere reescribir data) |
| Cron se olvida de correr o Inngest falla | Log del count por ejecucion + alerta si no hay ejecucion en 48h (fase 2). Fase 1: verificar manualmente los primeros dias |
| Defensive check omitido en algun handler | Research debe listar TODOS los handlers que operan sobre sessionId con grep exhaustivo. Plan debe incluir tarea explicita por handler |
| Cambio de comportamiento percibido por usuarios actuales | Ninguna sesion activa en curso se toca — el cron solo cierra las con actividad pre-medianoche. Zero disruption. |
| Codigo downstream que asume UNIQUE histórico (SELECT con .single()) | Research debe hacer `grep -rn "from('agent_sessions')" src/` y auditar cada query por supuestos de unicidad |

## 8. Entregable del siguiente paso (research)

El research agent (via `/gsd:research-phase 42`) debe producir `42-RESEARCH.md` con:

1. **Audit exhaustivo de handlers Inngest** — lista completa de funciones que operan sobre `sessionId`, con la linea exacta donde insertar el defensive check
2. **Audit de queries a `agent_sessions`** — identificar cualquier query que asuma unicidad por `(conversation_id, agent_id)` y que rompa con el cambio de schema
3. **Precedente de cron Inngest en morfx** — buscar ejemplos de scheduled functions ya implementadas para seguir el patron existente (imports, estructura, logging)
4. **Estado actual de data en prod** — ejecutar (o pedir al usuario ejecutar) query diagnostica para saber cuantas sesiones `active` hay hoy, cuantas `handed_off`, y sobre todo cuantas con `last_activity_at` antiguo (para dimensionar el impacto del primer cron run)
5. **Sintaxis exacta de Inngest cron scheduled function** en la version de SDK que usa morfx
6. **Confirmar nombre de tabla y columnas** por si hay renombres recientes no documentados

## 9. Preguntas abiertas para aclarar antes del plan

1. **Primer cron run masivo:** la primera vez que el cron corra, va a cerrar probablemente cientos/miles de sesiones "huerfanas" que llevan meses activas. ¿Es aceptable hacerlo de golpe o se prefiere un primer run manual limitado (ej. WHERE last_activity_at < NOW() - INTERVAL '7 days')?
2. **Handed_off viejos:** hay sesiones `handed_off` historicas. ¿Se dejan asi para siempre o se migran a `closed` en un one-off? (Mi sugerencia: dejar tal cual, la semantica es distinta).
3. **Agente Somnio V1 (legacy):** hoy `somnio/somnio-engine.ts:455` llama `handoffSession`. ¿Somnio V1 se sigue usando en produccion o ya esta deprecated? Afecta si el defensive check tambien aplica a handlers V1.

Estas 3 preguntas se resuelven durante research o al principio del plan.
