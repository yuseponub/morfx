# Discusión: Sistema de Comportamiento Humano para Somnio

**Fecha inicio:** 2026-02-20
**Estado:** Diseño casi completo — faltan detalles menores y asignación de prioridades por plantilla
**Objetivo:** Hacer que Somnio se comporte como un vendedor humano real en WhatsApp
**Scope:** CÓMO y CUÁNDO dice las cosas — no cambia QUÉ dice (prompts, intents, templates están bien)

---

## ETAPAS DEFINIDAS (5 total)

### ETAPA 1: Delays Inteligentes por Caracteres ✅ DEFINIDA

**Concepto:** Reemplazar el sistema actual de `delay_s` fijo por plantilla con un cálculo dinámico basado en la cantidad de caracteres del mensaje. Simula velocidad de escritura humana con aceleración — mensajes cortos tardan proporcionalmente más (como si el humano "pensara"), mensajes largos no castigan al cliente con esperas eternas.

**Curva definida:**
```
Chars   Delay
─────   ─────
  1-20  ~2.0s   (mínimo fijo, siempre al menos 2s)
  50    ~3.5s
  80    ~5.0s
 100    ~6.0s
 150    ~8.0s
 200    ~10.0s
 250+   ~12.0s  (cap máximo)
```

**Multiplicador ajustable:** Factor configurable (default 1.0) que escala proporcionalmente toda la curva. Si 1.0 se siente lento → 0.7. Si se siente rápido → 1.3. Puede vivir en el preset de velocidad del workspace (`real`, `rapido`, `instantaneo`).

**Cambio técnico:** Reemplazar `sleep(template.delaySeconds * responseSpeed * 1000)` en `ProductionMessagingAdapter.send()` (`messaging.ts:99-105`) con `sleep(calculateCharDelay(messageContent.length) * speedFactor)`.

---

### ETAPA 2: Clasificación de Mensajes (RESPONDIBLE / SILENCIOSO / HANDOFF) + Timer de Retoma ✅ DEFINIDA

**Concepto:** Clasificar el mensaje DESPUÉS del IntentDetector, no antes. No hay gate de regex — todo pasa por Claude y la clasificación se hace post-detección basándose en el intent detectado.

**Tres categorías (post IntentDetector):**
```
RESPONDIBLE → procesar normalmente con orchestrator
  Todos los intents informativos y de flujo de compra

SILENCIOSO → NO responder, activar timer de retoma (90s)
  Intent "otro" con confidence baja, acknowledgments puros
  "Ok", "👍", "Jaja", "Gracias"

HANDOFF → bot se apaga, "Regálame 1 min", notifica host
  6 intents definidos:
    - asesor
    - queja
    - cancelar
    - no_gracias
    - no_interesa
    - fallback
```

**Matiz importante:** "Sí" y "Ok" son SIGNIFICATIVOS en ciertos estados (`resumen`, `collecting_data`, `confirmado`). La clasificación SILENCIOSO SOLO aplica en estados no-confirmatorios (`conversacion`, `bienvenida`).

**Timer de retoma (Inngest):**
```
Mensaje clasificado SILENCIOSO
  → emitir evento 'agent/silence.detected'
  → Inngest function:
      step.waitForEvent('agent/customer.message', timeout: '90s')
      │
      ├── Cliente escribe antes de 90s → CANCELAR timer
      └── Timeout → enviar mensaje de retoma para redirigir a venta
          (ej: "Por cierto, ¿te cuento sobre las promociones? 😊")
```

**Comportamiento del HANDOFF:**
- Bot se apaga para esa conversación
- Envía "Regálame 1 min" al cliente
- Notifica al host humano
- Pendientes de 3B se **guardan** (para cuando el bot se reactive)
- Timer de retoma de Etapa 2 se **cancela** explícitamente vía evento Inngest

**Patrón idéntico a:** `dataCollectionTimer`, `promosTimer` en `agent-timers.ts`. Misma mecánica: `step.waitForEvent()` + timeout + acción proactiva.

**Nota sobre costos:** No hay ahorro de llamadas Claude en Etapa 2 (todo pasa por IntentDetector). El ahorro viene de NO ejecutar el Orchestrator + templates para mensajes SILENCIOSO/HANDOFF.

---

### ETAPA 3: Sistema Inteligente de Bloques (Check Pre-Envío + Interrupción + No-Repetición) ✅ DEFINIDA

**Concepto central: Bloques de conversación.** La conversación no es mensaje-por-mensaje sino bloque-por-bloque. Un "bloque de duda" es un grupo de mensajes del cliente que forman una unidad de consulta. Un "bloque de respuesta" es la secuencia de plantillas que el bot envía.

**3 funciones integradas en un solo sistema:**

#### 3A: Procesamiento Inmediato + Check Pre-Envío (reemplaza Debounce) ✅ DEFINIDO

**Problema:** Cliente manda 3 mensajes seguidos → bot responde a cada uno por separado (3 llamadas a Claude, 3 respuestas descoordinadas).

**Solución:** NO usar debounce (espera artificial). Procesar el mensaje inmediatamente, pero verificar si hay nuevos mensajes inbound **justo antes de enviar cada plantilla** (después del delay de Etapa 1). El delay de caracteres (2s-12s) actúa como ventana natural para que el cliente complete su idea.

**Cambio arquitectónico:**
```
HOY:     Webhook → guarda mensaje → llama agente DIRECTO (inline)
NUEVO:   Webhook → guarda mensaje → emite evento Inngest → FIN (~200ms)
                                          │
                                    Inngest (concurrency 1 por conversación)
                                          │
                                    Procesa mensaje inmediatamente
                                          │
                                    Genera bloque de respuesta
                                          │
                                    Para cada plantilla:
                                      1. Calcular delay por caracteres
                                      2. sleep(delay)
                                      3. CHECK DB: ¿hay nuevo inbound?
                                         → SÍ → PARAR secuencia
                                         → NO → enviar plantilla
```

**Ejemplo de agrupación natural:**
```
Cliente: "Hola"           ← llega, se procesa inmediatamente
Bot: genera [/hola, /plantilla_producto]
  → delay para /hola (~3.5s, ~50 chars)
  → CHECK: ¿hay nuevo? → NO → envía /hola ✅
  → delay para /plantilla_producto...
  → CHECK: ¿hay nuevo? → SÍ ("cuánto vale?" llegó) → PARA ❌

"cuánto vale?" ya tiene su evento Inngest en cola (concurrency 1 esperó).
Se procesa como bloque nuevo con contexto completo.
Sistema de no-repetición (3C) evita re-enviar /hola.
```

**Ventana ciega:** ~250ms entre check DB y envío real a 360dialog. Riesgo menor aceptado.

**Necesita migración DB:** Campo `processed_by_agent` en tabla `messages` (boolean, default true para existentes, false para nuevos inbound).

#### 3B: Interrupción + Merge de Pendientes por Prioridad ✅ DEFINIDO

**Problema:** Bot envía secuencia de plantillas. Cliente responde en medio. Bot ignora y sigue enviando.

**Solución:** El check pre-envío de 3A ES la detección de interrupción. Son el mismo mecanismo. Cuando se detecta un nuevo inbound, la secuencia se cancela y las plantillas no enviadas quedan como **pendientes**.

**Detección:** Query simple a DB (mismo check de 3A):
```sql
SELECT count(*) FROM messages
WHERE conversation_id = X
  AND direction = 'inbound'
  AND created_at > [timestamp_inicio_procesamiento]
```

**Merge de pendientes con prioridad:** Las plantillas pendientes NO se descartan — se integran al siguiente bloque de respuesta usando el sistema de prioridades CORE/COMPLEMENTARIA/OPCIONAL.

**Reglas de merge:**
```
1. Generar plantillas nuevas para el nuevo intent
2. Agregar pendientes de la secuencia interrumpida
3. Aplicar no-repetición (3C) a todas
4. Si total > máximo (3): descartar por prioridad
   → Primero OPCIONAL
   → Luego COMPLEMENTARIA
   → CORE nunca se descarta
5. Pendiente de mayor prioridad REEMPLAZA nueva de menor prioridad
```

**Ejemplo completo:**
```
Cliente(1): "Hola"              → intent: hola
Bot(1): genera [/hola, /plantilla_producto, /precio]
  → /hola ✅ enviada
  → /plantilla_producto ✅ enviada
  → delay para /precio... CHECK → nuevo inbound → PARA ❌
  → Pendientes: [/precio (CORE)]

Cliente(2): "y cómo se toma?"
Bot(2) procesa:
  Plantillas nuevas: [/modouso (CORE), /tiempoefecto1 (COMPLEMENTARIA)]
  Pendientes: [/precio (CORE)]

  Merge por prioridad (máximo 3):
  1. /modouso       → CORE (nueva)     → ✅ entra
  2. /precio        → CORE (pendiente) → ✅ entra
  3. /tiempoefecto1 → COMPLEMENTARIA   → ✅ entra (hay espacio)

  Envía: [/modouso, /precio, /tiempoefecto1]
```

**Ejemplo donde pendiente desplaza nueva:**
```
Pendientes: [/precio (CORE)]
Plantillas nuevas: [/modouso (CORE), /tiempoefecto1 (COMPLEMENTARIA), /tiempoefecto2 (COMPLEMENTARIA)]

  Merge (máximo 3):
  1. /modouso       → CORE             → ✅ entra
  2. /precio        → CORE (pendiente) → ✅ entra
  3. /tiempoefecto1 → COMPLEMENTARIA   → ✅ entra
  4. /tiempoefecto2 → COMPLEMENTARIA   → ❌ descartada (máximo alcanzado)

  Envía: [/modouso, /precio, /tiempoefecto1]
```

#### 3C: No-Repetición con Sistema Retroactivo ✅ DEFINIDO

**Problema:** El bot puede enviar la misma plantilla dos veces, o enviar una plantilla cuyo contenido ya fue cubierto por un humano o por IA generativa.

**Solución:** Registro de mensajes salientes con "minifrases" temáticas.

**Dónde vive el registro saliente:** Se **reconstruye** desde las tablas existentes (`messages` + `agent_turns`) cada vez que se necesita. NO se guarda como campo separado. Los datos ya están en DB — solo se necesita agregar el etiquetado temático (minifrase) a cada mensaje saliente.

**Estructura actual relevante (ya existe en DB):**
- `session_state.templates_enviados` → array de IDs de plantillas enviadas (ya es Nivel 1)
- `messages` → todos los mensajes WhatsApp con direction, type, content
- `agent_turns` → historial del agente con role, content

**Registro saliente reconstruido por conversación:**
```
[
  { tipo: "plantilla", id: "/hola",          tema: "saludo inicial y presentación" },
  { tipo: "plantilla", id: "/precio",        tema: "precio $77,900 con envío gratis, 90 comprimidos" },
  { tipo: "plantilla", id: "/tiempoefecto1", tema: "resultados en 3-7 días, melatonina regula ciclo, magnesio relaja" },
  { tipo: "humano",    id: null,             tema: "efectividad del producto, no es somnífero, regula ciclo natural" },
  { tipo: "ia",        id: null,             tema: "pago contraentrega en efectivo al recibir" },
]
```

**Etiquetado de minifrases:**
- **Plantillas (~30):** Minifrases definidas **manualmente una vez** en código/config junto a cada plantilla. Son fijas y no cambian.
- **Mensajes humanos/IA:** Minifrases generadas **al vuelo** por un modelo ligero (Haiku) al momento de enviar el mensaje. Se guardan como metadata del mensaje.

**Rol de la minifrase vs mensaje completo:**
- **Nivel 2 (decisiones rápidas):** Solo compara minifrases entre sí. Suficiente para el 90% de los casos.
- **Nivel 3 (PARCIAL):** Lee el **mensaje completo** del historial desde `messages`/`agent_turns`. Necesita el texto real para decidir si la cobertura parcial justifica enviar o no.

**Ejemplo completo de no-repetición:**
```
Bot(1) envió: /hola, /precio, /tiempoefecto1, /modopago
Humano intervino: "Tranquilo, verás cambios desde la primera semana.
                   No es un somnífero, regula tu ciclo natural."
  → Haiku genera minifrase: "efectividad, no es somnífero, regula ciclo natural"
  → Se guarda como metadata del mensaje en DB

Cliente(3): "Sí sirve?"     → intent: sisirve
Plantillas de sisirve (primera_vez): [/sisirve, /tiempoefecto1, /tiempoefecto2]

Verificación escalonada por plantilla:

  /tiempoefecto1 → Nivel 1: ¿ID en templates_enviados? → SÍ → ❌ NO ENVIAR (0ms, $0)

  /sisirve       → Nivel 1: no enviada antes
                 → Nivel 2: minifrase "severidad del insomnio, tiempo de efecto"
                   vs registro → PARCIAL (humano habló de efectividad)
                 → Nivel 3: lee mensaje completo del humano + plantilla completa
                   → humano dijo efectividad general, plantilla agrega ángulo
                     de "severidad" → ✅ ENVIAR

  /tiempoefecto2 → Nivel 1: no enviada antes
                 → Nivel 2: minifrase "reloj biológico, no es somnífero"
                   vs registro → humano dijo "no es somnífero, regula ciclo"
                   → CUBIERTO → ❌ NO ENVIAR ($0.0003)

Bot(3) solo envía: [/sisirve]
  (1 plantilla en vez de 3, porque el resto ya se cubrió)
```

#### Sistema de Prioridad por Plantilla

Cada plantilla tiene una prioridad para decisiones de merge y descarte:

```
CORE           → respuesta directa al intent (NUNCA descartar)
COMPLEMENTARIA → agrega valor pero no es esencial
OPCIONAL       → nice to have, primera en descartarse
```

**La prioridad es POR PLANTILLA POR INTENT** — una misma plantilla puede tener prioridad diferente según el intent que la invoca. Ej: `/tiempoefecto1` es COMP en `precio` pero CORE en `sisirve`.

##### Asignación completa de prioridades (primera_vez)

**Intents Informativos (13):**

```
hola: [/hola CORE, /deseas_adquirir OPC]

precio: [/precio CORE, /tiempoefecto1 COMP, /modopago CORE]
  Nota: /modopago es CORE porque contraentrega quita barrera de compra.
  Si se interrumpe, debe enviarse como pendiente.

contenido_envase: [/contenido CORE, /tiempoefecto1 COMP]

como_se_toma: [/modouso CORE, /tiempoefecto1 COMP, /tiempoefecto2 OPC]

modopago: [/modopago CORE]

metodos_de_pago: [/metodos CORE]

modopago2: [/modopago2 CORE]

envio: [/envio CORE, /transportadoras COMP]

invima: [/invima CORE]

ubicacion: [/ubicacion CORE, /modopago OPC]

contraindicaciones: [/seguro CORE, /anticoagulantes COMP]

sisirve: [/sisirve CORE, /tiempoefecto1 CORE, /tiempoefecto2 COMP]
  Nota: tiempoefecto1 es CORE aquí porque explica el mecanismo de
  acción — ES la respuesta a "¿sí sirve?"

info_promociones: [/intro_promos CORE, /lista_precios CORE, /cta_adquirir COMP]
```

**Intents Flujo de Compra (7):**

```
captura_datos_si_compra: [/intro_datos CORE, /formulario CORE]

ofrecer_promos: [/promos_cta CORE]

resumen_1x: [/resumen CORE, /confirmar CORE]
resumen_2x: [/resumen CORE, /confirmar CORE]
resumen_3x: [/resumen CORE, /confirmar CORE]

compra_confirmada: [/despacho CORE, /recordatorio_efectivo COMP]

no_confirmado: [/ofrecer_opciones CORE]
```

**Intents HANDOFF/Escape (2):**

```
no_interesa: [/despedida CORE]

fallback: [/regalame_1min CORE]
```

##### Regla para combinaciones hola+X

El saludo `/hola` siempre es CORE. Las demás plantillas heredan la prioridad del intent base X.

```
hola+precio: [/hola CORE, /precio CORE, /tiempoefecto1 COMP, /modopago CORE]
hola+sisirve: [/hola CORE, /sisirve CORE, /tiempoefecto1 CORE, /tiempoefecto2 COMP]
(etc. para las 11 combinaciones)
```

##### Regla para intents repetidos (reemplaza "siguientes")

Cuando un intent se repite en la misma conversación:
1. Tomar las **2 plantillas de mayor prioridad** (CORE > COMP > OPC)
2. Claude las **parafrasea** al vuelo (nunca repetir el mismo texto)
3. Esto elimina la necesidad de plantillas `visit_type = 'siguientes'` en DB

```
Ejemplos:
precio repetido:    [/precio CORE (para.), /modopago CORE (para.)]     → 2 (COMP se cae)
sisirve repetido:   [/sisirve CORE (para.), /tiempoefecto1 CORE (para.)] → 2 (COMP se cae)
como_se_toma rep.:  [/modouso CORE (para.), /tiempoefecto1 COMP (para.)] → 2 (OPC se cae)
hola repetido:      [/hola CORE (para.)]                               → 1 (OPC se cae, queda solo 1)
envio repetido:     [/envio CORE (para.), /transportadoras COMP (para.)] → 2
```

**Regla de descarte por longitud:**
Si el bloque de respuesta tiene más de 3 plantillas, descartar en orden:
1. Primero OPCIONAL
2. Luego COMPLEMENTARIA
3. CORE nunca se descarta

**Máximo por bloque:** 3 plantillas (primera_vez), 2 plantillas (repetido).

---

### ETAPA 4: Procesamiento de Medios (Audio/Imagen/Sticker/Video/Reacción) ✅ DEFINIDA

**Concepto:** Hoy `webhook-handler.ts:250` solo procesa `msg.type === 'text'`. Audio, imágenes, stickers se guardan en DB pero nunca llegan al agente. El sistema debe manejar cada tipo de media de forma inteligente.

#### Audio/Voice → Transcribir + procesar o handoff

```
Audio llega
  → Whisper transcribe a texto (~$0.006/min)
  → Detectar intents del texto transcrito
  │
  ├── 1-2 intents → flujo normal (como si fuera texto)
  │                  El cliente no sabe que se transcribió.
  │                  Se responde como un vendedor que escuchó el audio.
  │
  └── 3+ intents → HANDOFF
                    → "Regálame 1 min" al cliente
                    → Notificar host CON los intents detectados:
                      "Cliente envió audio con 4 temas: precio, envío,
                       composición, garantía. No pude responder a todo."
```

**Interacción con Etapa 3:**
- Audio cuenta como inbound para el check pre-envío (3A) → para la secuencia si está enviando
- Múltiples audios seguidos → se transcriben y concatenan como un solo texto
- Audio + texto juntos → transcripción + texto se concatenan y procesan juntos
- Misma lógica de agrupación que 3A para mensajes de texto

#### Imagen → Handoff directo

```
Imagen llega → HANDOFF
  → "Regálame 1 min" al cliente
  → Notificar host que llegó imagen
```

#### Video → Handoff directo

```
Video llega → HANDOFF
  → "Regálame 1 min" al cliente
  → Notificar host que llegó video
```

#### Sticker → Vision interpreta o handoff

```
Sticker llega
  → Claude Vision analiza la imagen del sticker (~$0.003)
  │
  ├── Interpretable (ok, saludo, pulgar arriba, etc.)
  │   → Tratar como texto (ej: sticker de "OK" → procesar como si escribió "ok")
  │   → Pasa por Etapa 2 normalmente
  │
  └── No interpretable (abstracto, arte, meme)
      → HANDOFF ("Regálame 1 min" + notificar host)
```

#### Reacción (emoji a un mensaje) → Interpretar o handoff

```
Reacción llega (WhatsApp envía el emoji exacto, NO es imagen)
  → NO necesita Vision (el emoji es texto directo)
  │
  ├── Interpretable (👍 ❤️ ✅ → "ok", 😂 → "jaja")
  │   → Tratar como texto
  │   → Pasa por Etapa 2 normalmente
  │
  └── Ambiguo (emoji raro/sin significado claro)
      → HANDOFF ("Regálame 1 min" + notificar host)
```

#### Resumen por tipo

| Tipo | Acción | Herramienta | Costo |
|------|--------|-------------|-------|
| Audio | Transcribir → 1-2 intents: flujo normal, 3+: handoff | Whisper | ~$0.006/min |
| Imagen | Handoff directo | — | $0 |
| Video | Handoff directo | — | $0 |
| Sticker | Vision interpreta → texto o handoff | Claude Vision | ~$0.003 |
| Reacción | Emoji directo → texto o handoff | — | $0 |

---

### ETAPA 5: Confidence Thresholds + Log de Ambigüedades ✅ DEFINIDA

**Enfoque "data-first":** recolectar casos reales antes de construir disambiguador.

**Problema actual:** El sistema de confidence thresholds existe en código (`types.ts:64-68`) pero NO está funcionando en producción.

#### V1 (primera implementación): 2 bandas + log

```
80-100% → RESPONDER directo (intent detector seguro)
0-79%   → HANDOFF real + LOG de la situación
            → Bot se apaga
            → Envía "Regálame 1 min" al cliente
            → Notifica al agente humano
            → Guarda situación en disambiguation_log
```

**Filosofía:** NO construir disambiguador sin data. Primero recolectar situaciones reales donde el bot no supo qué hacer. El humano revisa cada caso y documenta qué debió hacer el agente. Cuando haya suficientes casos documentados (~20-50), se construye el disambiguador.

#### Tabla `disambiguation_log` (Supabase)

```sql
CREATE TABLE disambiguation_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  message_id UUID REFERENCES messages(id),

  -- Situación (se llena automáticamente al hacer handoff)
  customer_message TEXT NOT NULL,
  agent_state TEXT,                    -- current_mode del agente
  intent_alternatives JSONB,           -- {"compra": 72, "más_info": 68}
  confidence_top NUMERIC,              -- el score más alto
  templates_enviados TEXT[],           -- qué ya se envió en la conversación
  pending_templates TEXT[],            -- qué quedó pendiente de secuencia anterior
  history_summary TEXT,                -- resumen corto del contexto de conversación

  -- Guianza (la llena el humano manualmente)
  correct_intent TEXT,                 -- "compra"
  correct_action TEXT,                 -- "responder con captura_datos"
  guidance_notes TEXT,                 -- "después de ver precio, 'me interesa' = compra"
  reviewed BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);
```

**Flujo de una situación:**
```
1. Cliente: "Me interesa" → Intent Detector → confidence 72% (< 80%)
2. HANDOFF automático:
   → Bot se apaga, envía "Regálame 1 min"
   → Notifica agente humano
   → INSERT en disambiguation_log con toda la situación
     (incluye contexto de Etapa 3: templates_enviados, pending_templates)

3. Humano revisa (Supabase dashboard):
   → Ve la conversación completa
   → Llena: correct_intent, correct_action, guidance_notes
   → Marca reviewed: true
```

#### V2 (futuro, cuando haya ~20-50 situaciones revisadas): 3 bandas + disambiguador

```
80-100% → RESPONDER directo
60-79%  → AGENTE DISAMBIGUADOR
           → Usa situaciones revisadas como few-shot examples
           → Recibe contexto de Etapa 3 (registro saliente + pendientes)
0-59%   → HANDOFF real (sigue loggeando)
```

---

## PROPUESTAS DESCARTADAS

### P1: Typing Indicator Real (WhatsApp API)
**Razón:** Usuario no le interesa por ahora.

### P2: Delays Dinámicos (varianza aleatoria + reading time)
**Razón:** Reemplazada por Etapa 1 (delays por caracteres), sistema más simple y predecible.

### P4: Message Debouncer con Inngest
**Razón:** Debounce separado eliminado. Reemplazado por check pre-envío (3A) + delay de caracteres (Etapa 1) como ventana natural.

### COMPLEMENTARY/CONFLICTING intents (código existente en InterruptionHandler)
**Razón:** Reemplazado por sistema de prioridades CORE/COMPLEMENTARIA/OPCIONAL (Etapa 3B). El concepto de "intents conflictivos" (asesor, queja, cancelar) ahora vive como categoría HANDOFF en Etapa 2.

---

## ARQUITECTURA GENERAL — FLUJO COMPLETO

```
MENSAJE ENTRANTE (WhatsApp)
│
▼
[Webhook Handler]
  → Guarda mensaje en DB (processed_by_agent: false)
  → Emite evento Inngest 'agent/whatsapp.message_received'
  → FIN del webhook (~200ms)
│
▼
[Inngest Function — concurrency 1 por conversación]
  → Procesa mensaje INMEDIATAMENTE (sin debounce)
│
▼
[Media Gate] (Etapa 4)
  │
  ├── Audio    → Whisper transcribe → ¿1-2 intents? → SÍ: continúa como texto ↓
  │                                                  → NO (3+): HANDOFF + notificar host con intents
  ├── Imagen   → HANDOFF ("Regálame 1 min") + notificar host → FIN
  ├── Video    → HANDOFF ("Regálame 1 min") + notificar host → FIN
  ├── Sticker  → Vision interpreta → ¿interpretable? → SÍ: continúa como texto ↓
  │                                                   → NO: HANDOFF → FIN
  ├── Reacción → emoji directo → ¿interpretable? → SÍ: continúa como texto ↓
  │                                               → NO: HANDOFF → FIN
  │
  └── Texto ↓
│
▼
[Intent Detection + Confidence] (Etapas 2 + 5 integradas)
  │
  │  IntentDetector.detect() → intent + confidence
  │
  ├── confidence < 80% → HANDOFF + LOG en disambiguation_log (Etapa 5)
  │
  ├── intent ∈ {asesor, queja, cancelar, no_gracias, no_interesa, fallback}
  │   → HANDOFF → bot se apaga, "Regálame 1 min", notifica host (Etapa 2)
  │              → pendientes de 3B se guardan
  │              → timer retoma se cancela
  │              → FIN
  │
  ├── intent = SILENCIOSO (acknowledgment en estado no-confirmatorio)
  │   → activar timer retoma (90s) (Etapa 2)
  │   → si cliente escribe antes de 90s → cancelar timer
  │   → si timeout → enviar mensaje de retoma
  │
  └── RESPONDIBLE (todo lo demás) ↓
│
▼
[Acumulación de intents]
  → Procesar intent del mensaje
  → Resolver combinaciones con contexto previo
  → Determinar primera_vez vs siguientes
│
▼
[Selección de plantillas + Merge de pendientes] (Etapa 3B)
  → Obtener plantillas del intent
  → Agregar plantillas pendientes de secuencia interrumpida anterior
  → Ordenar por prioridad (CORE > COMPLEMENTARIA > OPCIONAL)
│
▼
[No-Repetición Escalonada] (Etapa 3C)
  → Para cada plantilla candidata:
    → Nivel 1: ¿ID ya enviado? → SÍ → ❌ descartar (0ms, $0)
    → Nivel 2: ¿Tema cubierto? → Haiku compara minifrases (~200ms)
      → NO_ENVIAR → ❌ descartar
      → ENVIAR → ✅ mantener
      → PARCIAL ↓
    → Nivel 3: Lee mensaje completo del historial + contexto (~1-3s)
      → Decide con información real si vale la pena enviar
│
▼
[Prioridad + Descarte por longitud] (Etapa 3)
  → Si cola > 3 plantillas → descartar OPCIONAL primero, luego COMPLEMENTARIA
  → CORE nunca se descarta
│
▼
[Envío con Check Pre-Envío] (Etapa 1 + 3A/3B integrados)
  → Para cada plantilla del bloque de respuesta:
    1. Calcular delay por caracteres (mín 2s, cap 12s)
    2. Aplicar multiplicador
    3. sleep(delay)
    4. CHECK DB: ¿hay nuevo inbound?
       → SÍ → PARAR secuencia
              → Plantillas no enviadas → "pendientes" para siguiente bloque
              → Merge por prioridad en el siguiente ciclo
       → NO → enviar plantilla
              → Registrar en no-repetición (minifrase pre-definida para plantillas)
```

---

## ETAPA 6: Flujo Ofi Inter (Recogida en Oficina Interrapidísimo) ✅ DEFINIDA

**Concepto:** El agente detecta que el cliente quiere recogida en oficina de Interrapidísimo (en vez de envío a domicilio) y cambia el flujo de captura de datos a campos diferentes.

**Solo aplica a Interrapidísimo.** No hay ofi Coordinadora ni otras transportadoras con este flujo.

**3 formas de detección:**

```
1. DIRECTA: cliente dice "ofi inter", "recojo en inter", "oficina interrapidísimo"
   → Confirmar + cambiar a flujo ofi inter

2. DATO PARCIAL: cliente solo envía municipio sin dirección
   → Ingest acumula datos
   → Al detectar que falta dirección pero hay municipio:
     "¿Deseas recibir en oficina de Interrapidísimo?"
   → SÍ → flujo ofi inter
   → NO → pedir dirección normal

3. MUNICIPIO POCO COMÚN: cliente menciona municipio lejano/poco conocido
   → No hay lista fija (criterio del vendedor, municipio "que no suena")
   → Agente pregunta: "¿Deseas recibir en oficina de Interrapidísimo?"
   → Siempre confirmar, NUNCA asumir
```

**Datos bifurcados:**

```
DOMICILIO (flujo normal — 8 campos):
  Nombre, Apellido, Teléfono, Dirección completa, Barrio, Departamento, Ciudad, Correo

OFI INTER (recogida en oficina — 7 campos):
  Nombre, Apellido, Teléfono, Cédula de quien recoge, Municipio, Departamento, Correo
  (sin Dirección, sin Barrio, con Cédula de quien recoge)
```

**Regla clave:** SIEMPRE confirmar antes de cambiar a flujo ofi inter. Nunca asumir.

**Interacción con otras etapas:**
- **Etapa 2 (Clasificación):** Detección de "ofi inter" puede ser un sub-intent de `captura_datos_si_compra`
- **Ingest System (existente):** Cuando solo llega municipio, el ingest acumula y el agente debe preguntar
- **Data Extraction:** Bifurcar campos según modo de envío (domicilio vs ofi inter)

---

## PREGUNTAS PENDIENTES

Ninguna — diseño completo (6 etapas).

---

## CONTEXTO TÉCNICO DE REFERENCIA

### Archivos clave que se modificarían:
- `src/lib/whatsapp/webhook-handler.ts` — Cambiar de llamada directa a evento Inngest + media gate
- `src/lib/agents/engine-adapters/production/messaging.ts` — Delays inteligentes por caracteres + check pre-envío
- `src/inngest/functions/` — Nuevas funciones: silence timer, agent message processor
- `src/inngest/events.ts` — Nuevos eventos: silence.detected
- `src/lib/agents/somnio/` — Clasificación RESPONDIBLE/SILENCIOSO/HANDOFF, no-repetición
- `src/lib/domain/messages.ts` — Campo processed_by_agent en receiveMessage
- Migración DB — ALTER TABLE messages ADD COLUMN processed_by_agent
- Migración DB — CREATE TABLE disambiguation_log
- API externa — OpenAI Whisper para transcripción de audio (~$0.006/min)
- API externa — Claude Vision para interpretación de stickers (~$0.003/sticker)

### Componentes existentes (diseñados pero no conectados):
- `src/lib/agents/somnio/message-sequencer.ts` — buildSequence(), executeSequence(), checkForInterruption()
- `src/lib/agents/somnio/interruption-handler.ts` — detectInterruption(), savePendingMessages()

### Patrones Inngest existentes (reutilizables):
- `agent-timers.ts`: step.waitForEvent() + timeout → acción proactiva
- Concurrency 1 por conversación
- Evento `agent/customer.message` para cancelación de timers

### Plantillas actuales de referencia:
- Repo: github.com/yuseponub/AGENTES-IA-FUNCIONALES-v3/blob/master/plantillas/
- `intents.json` — 21 intents, detección regex, combinaciones, primera_vez vs siguientes
- `mensajes.json` — ~30 plantillas base + 3 Callbell templates
- Cada intent mapea a array de plantillas con prioridad implícita (primera = CORE)

---

## HISTORIAL DE DECISIONES

| Fecha | Decisión | Contexto |
|-------|----------|----------|
| 2026-02-20 | Typing Indicator descartado | Usuario no le interesa por ahora |
| 2026-02-20 | Multiplicador ajustable para delays | Factor proporcional configurable por workspace |
| 2026-02-20 | Timer retoma con Inngest (mismo patrón que timers existentes) | step.waitForEvent() + timeout |
| 2026-02-20 | Prioridad por plantilla: CORE/COMPLEMENTARIA/OPCIONAL | Para decisiones de merge y descarte por longitud |
| 2026-02-20 | Minifrases temáticas (no solo keywords) para etiquetado | Captura semántica de qué se comunicó |
| 2026-02-20 | Verificación semántica ESCALONADA (3 niveles) | Nivel 1: lookup directo (gratis). Nivel 2: Haiku. Nivel 3: agente con contexto completo |
| 2026-02-23 | Curva delay: mín 2s, 250 chars = 12s cap | Logarítmica con aceleración |
| 2026-02-23 | Timer retoma: 90 segundos | Más agresivo que los 3min originales |
| 2026-02-23 | Máximo 3 plantillas por bloque de respuesta | Definido por usuario |
| 2026-02-23 | Debounce eliminado → check pre-envío lo reemplaza | Delay de Etapa 1 es la ventana natural |
| 2026-02-23 | Pendientes de interrupción se recuerdan y mergean | Merge por prioridad CORE > COMP > OPC |
| 2026-02-23 | Ventana ciega ~250ms aceptada como riesgo menor | Se revisará si es problema en producción |
| 2026-02-23 | Registro saliente se reconstruye desde DB | Datos ya en messages + agent_turns + session_state |
| 2026-02-23 | Minifrases: manuales para plantillas, Haiku para humanos/IA | ~30 fijas + generadas al vuelo |
| 2026-02-23 | PARCIAL escala a Nivel 3 con mensaje completo | Nivel 2 solo minifrases, Nivel 3 texto real |
| 2026-02-23 | Etapa 5: data-first, 2 bandas V1 (80/0) | Disambiguador se construye con casos reales |
| 2026-02-23 | disambiguation_log en Supabase | Situaciones ambiguas + guianza manual del humano |
| 2026-02-23 | Handoff preserva pendientes de 3B | Siempre se guardan para historial |
| 2026-02-23 | Handoff cancela timer retoma (Etapa 2) | Cancelación explícita vía evento Inngest |
| 2026-02-23 | Audio: Whisper desde V1 | ~$0.006/min, ~1-2 audios/día |
| 2026-02-23 | Audio: 1-2 intents → normal, 3+ → handoff con lista de intents | Host recibe notificación detallada |
| 2026-02-23 | Audio: responder sin mencionar transcripción | Como vendedor que escuchó y contesta |
| 2026-02-23 | Audio: concatenar múltiples audios y audio+texto | Misma lógica de agrupación que 3A |
| 2026-02-23 | Imagen/Video: handoff directo | "Regálame 1 min" + notificar host |
| 2026-02-23 | Sticker: Claude Vision, no interpretable → handoff | ~$0.003/sticker |
| 2026-02-23 | Reacción: emoji directo, no necesita Vision | Interpretable → texto, ambiguo → handoff |
| 2026-02-23 | Etapa 2 expandida a 3 categorías | RESPONDIBLE + SILENCIOSO + HANDOFF (intents conflictivos) |
| 2026-02-23 | COMPLEMENTARY/CONFLICTING intents descartado | Reemplazado por prioridades + HANDOFF en Etapa 2 |
| 2026-02-23 | Prioridades por plantilla: definir DESPUÉS del diseño | Asignar cuando todas las etapas estén cerradas |
| 2026-02-23 | No hay gate de regex pre-IntentDetector | Todo pasa por Claude, clasificación post-detección |
| 2026-02-23 | 6 intents HANDOFF definidos | asesor, queja, cancelar, no_gracias, no_interesa, fallback |
| 2026-02-23 | Análisis de arquitectura actual documentado | ARCHITECTURE-ANALYSIS.md con 7 hallazgos + 8 layers |
| 2026-02-23 | Prioridades por plantilla por intent asignadas | 13 informativos + 7 flujo + 2 escape, CORE/COMP/OPC |
| 2026-02-23 | Prioridad es POR PLANTILLA POR INTENT, no global | Misma plantilla puede ser CORE o COMP según intent |
| 2026-02-23 | /modopago en precio = CORE (no OPC) | Contraentrega quita barrera de compra, crítico para venta |
| 2026-02-23 | /tiempoefecto1 en sisirve = CORE (no COMP) | Mecanismo de acción ES la respuesta a "¿sí sirve?" |
| 2026-02-23 | Intents repetidos: top 2 por prioridad + parafraseo | Elimina visit_type='siguientes', Claude parafrasea al vuelo |
| 2026-02-23 | /deseas_adquirir en hola = OPC | Upsell que no agrega info, cliente solo saludó |
| 2026-02-23 | Combinaciones hola+X: /hola=CORE, resto hereda de X | No necesitan asignación independiente |
| 2026-02-23 | Etapa 6: Flujo Ofi Inter agregada | Recogida en oficina Interrapidísimo, datos bifurcados, 3 formas de detección |
| 2026-02-23 | Ofi Inter: solo Interrapidísimo | No hay ofi para otras transportadoras |
| 2026-02-23 | Ofi Inter: no hay lista fija de municipios lejanos | Criterio del vendedor, siempre confirmar |
| 2026-02-23 | Ofi Inter: SIEMPRE confirmar antes de cambiar flujo | Nunca asumir ofi inter sin preguntar al cliente |

---

## PRÓXIMOS PASOS

**Dónde estamos:** Diseño 100% COMPLETO. 6 etapas cerradas. Prioridades asignadas. Análisis de arquitectura hecho. NO se ha escrito código.

**Lo que falta:**
1. ~~Asignar prioridades CORE/COMP/OPC~~ ✅ HECHO
2. Crear milestone GSD para implementar

**Documentos del sistema:**
- `DISCUSSION.md` — Diseño completo de las 5 etapas
- `RESEARCH.md` — Investigación original con 7 propuestas y fuentes web
- `ARCHITECTURE-ANALYSIS.md` — Mapa de infraestructura actual + plan de integración por layers

**Para retomar, decirle a Claude:**
> "Lee `.planning/standalone/human-behavior/DISCUSSION.md` y `ARCHITECTURE-ANALYSIS.md`. Diseño 100% completo. Siguiente paso: crear milestone GSD para implementar."

---

## REFERENCIA: Contenido de plantillas clave (del repo GitHub)
Cra 8 # 5 - 46, Nicolas borrero olano - el dovio
```
/hola           → "Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴"
/precio         → "Nuestro ELIXIR DEL SUEÑO tiene un valor de $77,900 con envio gratis,
                   este contiene 90 comprimidos de melatonina y magnesio. Tambien manejamos
                   promociones extra si compras el combo 2X o 3X🤗"
/tiempoefecto1  → "Verás los resultados desde los primeros 3-7 dias de uso. La melatonina
                   te ayudará a descansar mejor mediante un proceso regulando tu ciclo
                   biologico de sueño. El magnesio entrara como un relajante..."
/tiempoefecto2  → "Lo ideal es que con los días y de forma natural se ajuste tu reloj
                   biológico y puedas tener un descanso profundo y reparador. Recuerda
                   que no es un somnífero‼️"
/modopago       → "Recuerda que el pago lo haces una vez recibes el producto en tu hogar
                   y lo pagas en efectivo💴🏡"
/modouso        → "Debes consumir 1 comprimido 30min antes de dormir, todos los dias."
/envio          → "Hacemos envíos a toda Colombia 🚚 (gratis)."
/sisirve        → "Claro que sí! El tiempo en el que el suplemento empezará a hacer efecto
                   depende de la severidad de tu insomnio"
/plantilla_producto → Template Callbell con imagen del producto
```

**Repo completo de plantillas:** github.com/yuseponub/AGENTES-IA-FUNCIONALES-v3/blob/master/plantillas/
- `intents.json` — 21 intents con regex, combinaciones (hola+X), primera_vez vs siguientes
- `mensajes.json` — ~30 plantillas base + 3 Callbell templates
