# Somnio Sales Agent v2 — Contexto

## Problema con v1

El agente v1 mezcla 3 conceptos diferentes bajo "intents":

1. **Intents reales del cliente** — lo que el cliente quiere
   - `hola`, `precio`, `envio`, `queja`, `asesor`, `info_promociones`

2. **Acciones del agente** (disfrazadas de intents)
   - `resumen_1x/2x/3x` → confirmaciones que el agente genera
   - `ofrecer_promos` → paso del protocolo, no petición del cliente
   - `captura_datos_si_compra` → acción del agente

3. **Estados del flujo** (disfrazados de intents)
   - `compra_confirmada` → estado, no intent
   - `info_promociones` vs `ofrecer_promos` → mismo concepto para el cliente, 2 intents por necesidad interna

### Bug concreto que demuestra el problema

Cliente pide promos → bot envía promos (intent: `info_promociones`)
Cliente dice "si el de 2 frascos" → intent detector detecta `resumen_2x`
Pero transition validator BLOQUEA porque requiere `ofrecer_promos` en `intents_vistos`
El cliente SÍ vio las promos (via `info_promociones`), pero son intents diferentes.

`resumen_2x` NO debería ser un intent — es una RESPUESTA del agente que se genera cuando tiene datos + pack seleccionado.

### Otros problemas detectados en producción
- Mensajes dobles/triples (Inngest retries: 2 en agent processor, sin idempotency)
- Timer + Engine dual sending (timer envía mensaje + engine también)
- Órdenes duplicadas (sin constraint de unicidad)
- No hay sistema de interrupción: si el cliente manda 3 mensajes rápidos, se procesan como 3 turns separados

---

## Arquitectura v2 — 4 Capas + Interrupción

### Capa 1: Comprensión (Claude AI — UNA sola llamada)

```
Input: mensaje(s) del cliente (puede ser bloque acumulado)
Output (structured):
  - intent: intent REAL del cliente (hola, precio, promos, queja, asesor...)
  - datos: datos extraídos (nombre, tel, pack, dirección...)
  - clasificacion: datos/pregunta/irrelevante/mixto
  - sentimiento: positivo/negativo/neutro
```

Diferencia clave con v1: UNA llamada a Claude extrae TODO (intent + datos + clasificación) en vez de 2-3 llamadas separadas. Los intents se reducen drásticamente — solo quedan los que representan lo que el cliente QUIERE, no acciones del bot ni estados del flujo. `resumen_2x`, `ofrecer_promos`, `compra_confirmada` desaparecen como intents.

### Capa 2: Estado del negocio (determinista, sin AI)

```
Actualiza estado con datos nuevos de Capa 1:
  - datosCapturados: {nombre: ✓, tel: ✓, pack: "2x", dirección: ✗}
  - faseDelFunnel: prospecto → datos_parciales → listo_para_orden → orden_creada
  - mostrado: [saludo, promos]  (qué ya le mostramos)
  - templatesEnviados: [...]

La fase del funnel se COMPUTA automáticamente del estado, no de intents ni modos.
```

Diferencia con v1: No hay "modos" rígidos (bienvenida, collecting_data, ofrecer_promos). La fase se calcula del estado real de los datos.

### Capa 3: Decisión (reglas de negocio, sin AI)

```
Input: intent (Capa 1) + estado actualizado (Capa 2)
Reglas:
  - SILENCIOSO/RESPONDIBLE/HANDOFF (era regex separado en v1, ahora es parte de las reglas)
  - SI SILENCIOSO → no response, activar timer
  - SI HANDOFF → transferir a humano
  - SI RESPONDIBLE:
    - SI intent=promos + no las ha visto → mostrar promos
    - SI tiene todos los datos + pack → generar resumen
    - SI dice "el de 2" → capturar pack=2x, pedir datos faltantes
    - SI datos completos + confirmación → crear orden
  - Timer/retoma: decide qué enviar en retoma basado en estado
Output: lista de template IDs a enviar
```

Diferencia con v1: No hay transiciones rígidas (24 transiciones hardcoded). La decisión se basa en el ESTADO COMPLETO, no en "qué intent vino después de qué intent".

### Capa 4: Respuesta (composición + envío con interrupción)

```
Input: template IDs de Capa 3
Pipeline:
  1. Block Composer → compone max 3 bloques de templates
  2. No-Repetition Filter → filtra contra templatesEnviados
  3. POR CADA template a enviar:
     a. Check inbox: ¿hay mensaje nuevo del cliente?
     b. SI hay → ABORTAR templates restantes → nuevo ciclo
     c. SI no hay → enviar template → siguiente
  4. Actualizar templatesEnviados en estado
```

---

## Sistema de interrupción (check-before-send)

No usa debounce ni timers de espera. El bot procesa inmediatamente y se detiene si detecta un mensaje nuevo justo antes de enviar.

### Flujo normal (sin interrupción)

```
Cliente: "hola"
→ Capas 1-3 procesan → deciden enviar [T1, T2, T3]
→ Check inbox antes de T1 → limpio → ENVÍA T1
→ Check inbox antes de T2 → limpio → ENVÍA T2
→ Check inbox antes de T3 → limpio → ENVÍA T3
→ Turn completado
```

### Flujo con interrupción

```
Cliente: "hola"
→ Capas 1-3 procesan → deciden enviar [T1, T2, T3]
→ Check inbox antes de T1 → limpio → ENVÍA T1
→ Check inbox antes de T2 → cliente mandó "cuanto cuesta" → ABORTAR T2, T3
→ Marcar "hola" como ABORTADO (parcial: T1 sí se envió)
→ Nuevo ciclo: "hola" + "cuanto cuesta" se analizan como 1 solo input
  (Capa 1 sabe que T1 ya se envió via templatesEnviados)
```

### Acumulación en cascada

```
Si llega un 3er mensaje antes de responder el 2do:
→ Se aborta el 2do ciclo también
→ Nuevo ciclo: "hola" + "cuanto cuesta" + "tienen envío gratis?" como 1 solo input
```

### Estado del turn para interrupción

```typescript
{
  pendingMessages: string[]     // mensajes acumulados sin responder
  lastMessageId: string         // el mensaje que disparó este ciclo
  abortedTemplates: string[]    // templates que SÍ se enviaron antes del abort
}
```

### Check inbox (antes de cada template)

```
→ query: ¿hay mensaje más reciente que lastMessageId?
→ SI: abort, push mensaje actual a pendingMessages, reprocesar
→ NO: enviar template, continuar
```

---

## Infraestructura reutilizable de v1

| Pieza | v1 | v2 |
|---|---|---|
| SILENCIOSO/RESPONDIBLE/HANDOFF | Regex hardcoded separado | Parte de Capa 3 (reglas de decisión) |
| Block Composer | Recibe templates del orchestrator | Recibe template IDs de Capa 3, misma lógica |
| No-Repetition Filter | 3 niveles (exact, semantic, content) | Se mantiene en Capa 4 |
| Message Sequencer | Envía con delays | Se mantiene pero con check-before-send |
| Timer/Retoma | Timer levels L0-L4, separado | Timer igual, decisión de qué enviar la toma Capa 3 |
| Ingest (collecting_data) | Modo especial que atrapa mensajes | DESAPARECE. Capa 1 SIEMPRE extrae datos + intent |
| Adapters (5) | storage, timer, messaging, orders, debug | Reutilizables conceptualmente |
| Templates DB | agent_templates por intent/visit_type | Se mantiene, cambia cómo se seleccionan |

---

## Análisis de v1 — Qué es código vs Claude vs DB

| Componente | Tipo | Somnio-specific? |
|---|---|---|
| 36 intents (definiciones + ejemplos) | Hardcoded TS | Sí |
| 10 modos (bienvenida, collecting_data, ofrecer_promos...) | Hardcoded TS | Sí |
| 24 transiciones (qué intent permite qué modo) | Hardcoded TS | Sí |
| Intent detection | Claude Sonnet | Prompt somnio-specific |
| Message classification (datos/pregunta/irrelevante) | Claude Sonnet | Reutilizable |
| Data extraction (nombre, tel, dirección...) | Claude Sonnet | Campos somnio-specific |
| SILENCIOSO/RESPONDIBLE/HANDOFF | Hardcoded regex | Sí |
| Templates (textos de respuesta) | DB (agent_templates) | Reutilizable |
| Pack selection (1x/2x/3x + precios) | Hardcoded regex | Sí |
| Timer levels (L0-L4, duraciones) | Hardcoded TS | Sí |
| Block composition (max 3, pending) | Hardcoded TS | Reutilizable |
| No-repetition filter | Hardcoded + Haiku | Reutilizable |
| UnifiedEngine | TS engine | Acoplado a v1 (no reutilizable directo) |
| 5 Adapters (storage, timer, messaging, orders, debug) | TS adapters | Reutilizable |

**Resumen: ~60% hardcoded, ~25% Claude AI, ~15% DB**

---

## Flujo completo de v1 (para referencia)

```
Webhook WhatsApp → Inngest event → Media Gate
  ↓
¿Modo collecting_data? → MessageClassifier (Sonnet)
  ├─ datos → DataExtractor (Sonnet) → silent
  ├─ pregunta → sale del ingest, va a intent
  ├─ mixto → extrae + responde
  └─ irrelevante → ignora
  ↓
Intent Detector (Sonnet) → 1 de 36 intents
  ↓
Message Classifier (hardcoded rules)
  ├─ SILENCIOSO → timer de silencio
  ├─ HANDOFF → transfiere a humano
  └─ RESPONDIBLE → continúa
  ↓
Orchestrator (hardcoded state machine)
  ├─ Valida transición
  ├─ Selecciona templates de DB
  ├─ Detecta pack (regex)
  └─ Decide siguiente modo
  ↓
Block Composer → max 3 templates
  ↓
No-Repetition Filter (3 niveles)
  ↓
Message Sequencer → envía con delays
```

---

## Estado actual del skeleton v2

- Directorio: `src/lib/agents/somnio-v2/`
- Archivos: `somnio-v2-agent.ts`, `engine-v2.ts`, `index.ts`
- Selector en sandbox muestra "Somnio Sales Agent v1" y "Somnio Sales Agent v2"
- Process route (`/api/sandbox/process`) detecta agentId y rutea al engine correspondiente
- v2 tiene tipos propios — NO importa nada de `somnio/` (v1)
- v1 completamente aislado (verificado: 0 referencias a v2 en producción, engine, adapters)

---

## Archivos clave de v1 (para análisis)

### Core
- `src/lib/agents/engine/unified-engine.ts` — Engine principal (acoplado a v1)
- `src/lib/agents/engine/types.ts` — Tipos del engine

### Somnio v1
- `src/lib/agents/somnio/somnio-agent.ts` — Agente (toda la lógica de negocio)
- `src/lib/agents/somnio/somnio-orchestrator.ts` — Orquestador (state machine, templates, pack)
- `src/lib/agents/somnio/config.ts` — Config + transiciones
- `src/lib/agents/somnio/constants.ts` — Constantes
- `src/lib/agents/somnio/intents.ts` — 36 intents definidos
- `src/lib/agents/somnio/prompts.ts` — Prompts de Claude
- `src/lib/agents/somnio/transition-validator.ts` — Validador de transiciones
- `src/lib/agents/somnio/template-manager.ts` — Selección de templates
- `src/lib/agents/somnio/ingest-manager.ts` — Recolección de datos
- `src/lib/agents/somnio/message-classifier.ts` — Clasificador datos/pregunta/irrelevante
- `src/lib/agents/somnio/data-extractor.ts` — Extractor de datos con Claude
- `src/lib/agents/somnio/message-category-classifier.ts` — SILENCIOSO/RESPONDIBLE/HANDOFF
- `src/lib/agents/somnio/block-composer.ts` — Composición de bloques
- `src/lib/agents/somnio/no-repetition-filter.ts` — Filtro anti-repetición

### Adapters
- `src/lib/agents/engine-adapters/production/` — Producción (DB, Inngest, WhatsApp)
- `src/lib/agents/engine-adapters/sandbox/` — Sandbox (in-memory)

### Producción
- `src/inngest/functions/agent-production.ts` — Processor de Inngest
- `src/inngest/functions/agent-timers.ts` — Timers de Inngest

### DB
- `supabase/migrations/20260205000000_agent_sessions.sql` — agent_sessions, agent_turns, session_state
- Tabla `agent_templates` — templates configurables por intent/visit_type

---

## Próximos pasos

1. Análisis profundo del código de v1 (ya tenemos resumen, falta detalle de cada componente)
2. Investigar herramientas/patrones extra que podamos usar (structured outputs, slot-filling, etc.)
3. Diseñar la arquitectura detallada de v2 (tipos, interfaces, flujo exacto)
4. Implementar incrementalmente en sandbox
