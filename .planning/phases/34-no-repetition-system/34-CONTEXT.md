# Phase 34: No-Repetition System - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

El bot nunca envia la misma informacion dos veces -- ya sea que fue enviada como plantilla, escrita por un humano, o generada por IA. Usa un sistema de verificacion escalonado de 3 niveles y parafrasea plantillas para intents repetidos. No cambia QUE dice el bot (intents, prompts, templates), solo agrega un filtro inteligente de NO-REPETICION antes del envio.

**Requirements:** BLOCK-05, BLOCK-06, BLOCK-07, BLOCK-08, INFRA-03

</domain>

<decisions>
## Implementation Decisions

### Sistema de 3 niveles escalonados

Cada plantilla candidata pasa por verificacion escalonada antes de enviarse:

- **Nivel 1 (ID lookup):** Si el template ID ya esta en `session_state.templates_enviados` -> NO ENVIAR. Costo: 0ms, $0. Cubre ~60% de casos.
- **Nivel 2 (minifrase Haiku):** Comparar la minifrase del template candidato contra las minifrases de TODOS los mensajes salientes previos (plantillas, humano, IA). Haiku decide: ENVIAR / NO_ENVIAR / PARCIAL. Costo: ~200ms, ~$0.0003.
- **Nivel 3 (contexto completo):** Solo cuando Nivel 2 retorna PARCIAL. Lee el mensaje completo desde DB (`messages`/`agent_turns`) y usa Haiku con texto real para decidir si el template agrega suficiente valor. Costo: ~1-3s.

### Minifrases tematicas (~30 plantillas)

- **Para plantillas:** Definidas manualmente como campo `minifrase TEXT` en tabla `agent_templates`. Son fijas y no cambian. Cada minifrase captura la esencia tematica del template.
- **Para mensajes humanos/IA:** Generadas al vuelo por Haiku al momento en que se registra el mensaje saliente. Se guardan como metadata del mensaje.
- Minifrases son frases cortas tematicas (NO keywords). Ejemplo: `/tiempoefecto1` -> "resultados en 3-7 dias, melatonina regula ciclo, magnesio relaja"

### Registro saliente (outbound registry)

Se reconstruye desde tablas existentes (`messages` + `agent_turns` + `session_state.templates_enviados`). NO es un campo separado nuevo. Los datos ya estan en DB.

Estructura reconstruida por conversacion:
```
[
  { tipo: "plantilla", id: "/hola",          tema: "saludo inicial y presentacion" },
  { tipo: "plantilla", id: "/precio",        tema: "precio $77,900 con envio gratis" },
  { tipo: "humano",    id: null,             tema: "efectividad del producto, no es somnifero" },
  { tipo: "ia",        id: null,             tema: "pago contraentrega en efectivo" },
]
```

### Ubicacion en el pipeline

El check de no-repeticion es Layer 7 en la arquitectura (ver ARCHITECTURE-ANALYSIS.md):
- DESPUES del merge de pendientes (BlockComposer, Layer 6)
- ANTES del envio con check pre-envio (MessagingAdapter, Layer 8)
- Se aplica a cada plantilla del bloque compuesto

### Intents repetidos: top 2 parafraseados

Cuando un intent se repite en la misma conversacion:
1. Tomar las 2 plantillas de mayor prioridad (CORE > COMP > OPC)
2. Claude las parafrasea al vuelo (nunca repetir el mismo texto)
3. Maximo 2 plantillas por bloque para intents repetidos (vs 3 para primera_vez)
4. Esto elimina la necesidad de plantillas `visit_type = 'siguientes'` en DB

Ejemplos:
- precio repetido: [/precio CORE (paraf.), /modopago CORE (paraf.)] -> 2
- sisirve repetido: [/sisirve CORE (paraf.), /tiempoefecto1 CORE (paraf.)] -> 2
- hola repetido: [/hola CORE (paraf.)] -> 1 (OPC se cae, queda solo 1)

### Bug conocido a corregir: templates_enviados over-count

El sistema actual (Phase 31) registra en `templates_enviados` TODAS las plantillas seleccionadas por el orchestrator, incluyendo las que nunca se enviaron por interrupcion. Phase 34 debe corregir esto: solo registrar IDs de plantillas realmente enviadas (usar `sentMessageContents` slice del `sendResult.messagesSent`).

### Claude's Discretion

- Prompt exacto para Haiku en Nivel 2 (comparacion de minifrases)
- Prompt exacto para Haiku en Nivel 3 (contexto completo)
- Prompt para parafraseo de plantillas repetidas (tono, longitud, restricciones)
- Como manejar edge case: 0 plantillas sobreviven el filtro de no-repeticion (todas filtradas)
- Formato de almacenamiento de minifrase generada para mensajes humanos/IA (metadata key name)

</decisions>

<specifics>
## Specific Ideas

### Ejemplo completo del flujo (de DISCUSSION.md)

```
Bot(1) envio: /hola, /precio, /tiempoefecto1, /modopago
Humano intervino: "Tranquilo, veras cambios desde la primera semana.
                   No es un somnifero, regula tu ciclo natural."
  -> Haiku genera minifrase: "efectividad, no es somnifero, regula ciclo natural"

Cliente(3): "Si sirve?"     -> intent: sisirve
Plantillas de sisirve: [/sisirve, /tiempoefecto1, /tiempoefecto2]

Verificacion por plantilla:

  /tiempoefecto1 -> Nivel 1: ID en templates_enviados? -> SI -> NO ENVIAR (0ms)

  /sisirve       -> Nivel 1: no enviada antes
                 -> Nivel 2: minifrase "severidad del insomnio, tiempo de efecto"
                   vs registro -> PARCIAL (humano hablo de efectividad)
                 -> Nivel 3: lee mensaje completo del humano + plantilla
                   -> humano dijo efectividad general, plantilla agrega angulo
                     de "severidad" -> ENVIAR

  /tiempoefecto2 -> Nivel 1: no enviada antes
                 -> Nivel 2: minifrase "reloj biologico, no es somnifero"
                   vs registro -> humano dijo "no es somnifero, regula ciclo"
                   -> CUBIERTO -> NO ENVIAR ($0.0003)

Bot(3) solo envia: [/sisirve]
```

### Contenido de plantillas clave (para definir minifrases)

```
/hola           -> "Hola Bienvenido a Somnio, donde tus suenos se hacen realidad"
/precio         -> "Nuestro ELIXIR DEL SUENO tiene un valor de $77,900 con envio gratis,
                   este contiene 90 comprimidos de melatonina y magnesio..."
/tiempoefecto1  -> "Veras los resultados desde los primeros 3-7 dias de uso..."
/tiempoefecto2  -> "Lo ideal es que con los dias y de forma natural se ajuste tu reloj
                   biologico... Recuerda que no es un somnifero"
/modopago       -> "Recuerda que el pago lo haces una vez recibes el producto en tu hogar
                   y lo pagas en efectivo"
/modouso        -> "Debes consumir 1 comprimido 30min antes de dormir, todos los dias."
/envio          -> "Hacemos envios a toda Colombia (gratis)."
/sisirve        -> "Claro que si! El tiempo en el que el suplemento empezara a hacer efecto
                   depende de la severidad de tu insomnio"
```

Repo completo: github.com/yuseponub/AGENTES-IA-FUNCIONALES-v3/blob/master/plantillas/

### Estado actual del codebase relevante

- `templates_enviados`: existe como `string[]` en `SessionState`, tracking funcional pero con over-count bug
- `priority` (CORE/COMPLEMENTARIA/OPCIONAL): campo en `agent_templates`, fully implemented (Phase 31)
- `minifrase`: NO existe aun en ningun lado -- necesita migracion DB + tipos
- Send loop (`messaging.ts`): tiene punto de integracion claro (despues de delay, antes de send)
- BlockComposer: fully implemented, produce bloque compuesto que es input del no-rep check
- Dedup por ID: existe en TemplateManager.selectTemplates() (filtra `templatesSent`)
- Dedup por contenido: NO existe -- es lo que Phase 34 agrega

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

Todo el contexto viene de la discusion exhaustiva del milestone v4.0 (DISCUSSION.md) donde el sistema completo ya fue disenado antes de dividirse en fases.

</deferred>

---

*Phase: 34-no-repetition-system*
*Context gathered: 2026-03-03*
