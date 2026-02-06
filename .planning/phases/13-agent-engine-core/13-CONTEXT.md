# Phase 13: Agent Engine Core - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Motor generico de ejecucion de agentes conversacionales. Incluye:
- Registro y configuracion de agentes
- Persistencia de sesiones con versionado
- Integracion con Claude API
- Ejecucion de tools del Action DSL
- Control de tokens y auditoria por turno

**NO incluye:** Logica especifica de Somnio (Phase 14), UI de sandbox (Phase 15), integracion con WhatsApp real (Phase 16).

</domain>

<decisions>
## Implementation Decisions

### Arquitectura del Agente de Ventas

El agente de ventas tiene 2 componentes principales de Claude + componentes especializados:

**1. Intent Detector (Claude)**
- Detecta el intent del mensaje del cliente
- Retorna porcentaje de confianza (0-100%)
- Retorna alternativas cuando hay ambiguedad
- NO decide el flujo, solo clasifica

**2. Orquestador (Claude)**
- Vision general del flujo de venta
- Recibe intent + confianza + estado de sesion
- Decide que componentes llamar segun el intent
- Valida que el flujo sea correcto (no saltar pasos)
- Maneja casos edge de forma inteligente
- Decide handoff cuando confianza es muy baja

**3. Componentes especializados (llamados por Orquestador)**
- Data Extractor: extrae datos del cliente del mensaje
- Response Generator: genera/selecciona respuesta apropiada
- Order Creator: crea pedido via Action DSL

### Manejo de confianza del Intent Detector

```
>= 85%  → PROCEDER: Orquestador ejecuta flujo normal
60-84%  → RE-ANALIZAR: Orquestador usa mas contexto para decidir
40-59%  → CLARIFICAR: Pedir clarificacion al cliente
< 40%   → HANDOFF: Pasar a humano o escalar
```

Umbrales hardcodeados inicialmente, configurables despues.

### Sesiones y estado

**Sesion por ventana de 24h de WhatsApp.** Cuando se cierra la ventana y se abre una nueva, se crea nueva sesion. Idea futura: sintetizar lo hablado en sesion anterior para contexto.

**Estructura de tablas separadas:**

```
agent_sessions
├── id, agent_id, conversation_id, contact_id
├── version (optimistic locking - contador que incrementa cada turno)
├── status: active | paused | closed | handed_off
├── current_mode: string flexible por agente
├── created_at, updated_at, last_activity_at

agent_turns
├── session_id, turn_number
├── role: user | assistant | system
├── content, intent_detected, confidence
├── tools_called (JSONB)
├── tokens_used, created_at

session_state (JSONB)
├── intents_vistos: [{intent, orden, timestamp}]
├── templates_enviados: [string]
├── datos_capturados: {nombre, ciudad, direccion, ...}
├── pack_seleccionado: "1x" | "2x" | "3x" | null
```

**Eliminado `_last_intent`** — se obtiene del ultimo elemento de `intents_vistos`.

### Versionado de sesion (optimistic locking)

Version simple: contador que incrementa en cada turno. Si al guardar la version no coincide, se detecta conflicto y se re-procesa. Previene que dos procesos sobre-escriban el trabajo del otro.

### Distincion importante: Intents vs Templates

- **Intents (lo que dice el cliente):** SIEMPRE pueden repetirse. Cliente puede preguntar precio 5 veces.
- **Templates (lo que enviamos):** NO deben repetirse. Si ya enviamos template_precio, parafraseamos o usamos respaldo.

`intents_vistos` trackea intents para contexto.
`templates_enviados` trackea respuestas para no repetir.

### Estados del flujo de venta

```
conversacion → collecting_data → ofrecer_promos → resumen → compra_confirmada
```

Transiciones validadas por el Orquestador:
- `ofrecer_promos` requiere datos minimos completos
- `resumen` requiere haber enviado `ofrecer_promos`
- `compra_confirmada` requiere haber enviado algun `resumen_Xx`

### Datos minimos vs opcionales

```
MINIMOS (requeridos): nombre, telefono, ciudad, direccion
OPCIONALES: apellido, barrio, departamento, correo
```

Si faltan solo opcionales, se puede proceder a ofrecer promos.

### Timers y flujos temporales: Inngest

Usamos **Inngest** para reemplazar el Proactive Timer de n8n:

- `step.waitForEvent()` con timeout en lugar de polling
- `step.sleep()` para delays precisos
- Event-driven puro: solo se ejecuta cuando hay evento o timeout
- Persistente: si servidor cae, Inngest retoma

**Flujos temporales definidos:**

1. **collecting_data.started:**
   - waitForEvent(customer.message, timeout: 6min)
   - Si timeout sin datos: enviar "quedamos pendientes"
   - Si datos parciales: pedir los faltantes
   - Si datos completos: sleep(2min) → ofrecer promos

2. **promos.offered:**
   - waitForEvent(customer.message, timeout: 10min)
   - Si timeout: auto-crear orden
   - Si responde: procesar seleccion de pack

### Modos de sesion

`current_mode` es string flexible. El Orquestador activa modos segun el flujo:
- `conversacion` — respondiendo preguntas generales
- `collecting_data` — capturando datos del cliente
- `ofrecer_promos` — esperando seleccion de pack
- `resumen` — esperando confirmacion
- `compra_confirmada` — orden creada

### Validador de flujo

Hardcodeado inicialmente, imperativo para facilitar generalizacion futura. El Orquestador (Claude) valida transiciones de forma inteligente, no es codigo rigido.

### Claude's Discretion

- Modelo especifico para cada componente (Haiku vs Sonnet)
- Estructura exacta de prompts para Intent Detector y Orquestador
- Implementacion del Data Extractor (codigo vs Claude)
- Esquema exacto de la tabla proactive_checks para Inngest

</decisions>

<specifics>
## Specific Ideas

**Referencia arquitectura actual:** El usuario tiene agentes funcionando en n8n con:
- State Analyzer: detecta intents, valida transiciones
- Proactive Timer: loop cada 2 min para timeouts
- Historial V3: orquestador de webhooks
- Repositorio: https://github.com/yuseponub/AGENTES-IA-FUNCIONALES-v3

**Modelo de intents actual:**
- `intents_vistos` como array ordenado con timestamps
- Intents informativos (hola, precio, envio) sin restricciones
- Intents transaccionales (resumen, compra_confirmada) con validacion de secuencia

**Proactive Timer actual (a reemplazar con Inngest):**
- 20 iteraciones max, 2 min entre cada una
- Escenarios: sin datos (10min), parciales (6min), completos (2min), post-promo (10min)
- Timestamps: `_proactive_started_at`, `_first_data_at`, `_min_data_at`, `_ofrecer_promos_at`

</specifics>

<deferred>
## Deferred Ideas

1. **Templates de respaldo** — Sistema para no repetir el mismo template cuando cliente repite intent. Resolver durante pruebas.

2. **Sentiment detection** — Detectar frustracion/urgencia del cliente para ajustar tono de respuesta.

3. **Configuracion generalizada** — Hacer tiempos, umbrales y flujos configurables por agente para otros negocios. Por ahora hardcodeado para Somnio.

4. **Sintesis de sesiones anteriores** — Cuando se crea nueva sesion (nueva ventana 24h), sintetizar lo hablado antes para dar contexto al agente.

</deferred>

---

*Phase: 13-agent-engine-core*
*Context gathered: 2026-02-05*
