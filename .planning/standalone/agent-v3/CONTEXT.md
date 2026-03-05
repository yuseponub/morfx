# Somnio Sales Agent v3 — Contexto de Diseno

## REGLA CRITICA: v1 intacto en produccion

v1 sigue atendiendo clientes reales. NO tocar, NO desconectar, NO modificar.
v3 se desarrolla como agente separado (ID: 'somnio-sales-v3').
Solo reemplaza a v1 cuando:
1. Probado completamente en sandbox
2. Verificado sin bugs
3. Activacion explicita del usuario

---

## Filosofia

Separacion estricta de 3 conceptos que v1 mezclaba:
- **Intents**: lo que el CLIENTE dice o quiere (Claude clasifica)
- **Acciones**: lo que el BOT ejecuta (motor de reglas decide)
- **Senales**: eventos internos del sistema (timers, datos completos, acks)

---

## Arquitectura: Pipeline de 11 Capas

```
WhatsApp -> Webhook -> Inngest
                         |
                  [CAPA 0: Entry Point]
                         |
                  [CAPA 0.5: Filtros Pre-Agente]
                  Tag check (WPP/P-W/RECO) + cargar sesion
                         |
                  [CAPA 1: Interrupcion]
                  Hay analisis en curso? -> abortar + fusionar msgs
                         |
                  [CAPA 2: Comprehension]
                  Claude Haiku, 1 llamada -> intent + datos + clasificacion
                         |
                  [CAPA 3: State Merge]
                  Actualizar datos/pack/ofiInter en contexto
                         |
                  [CAPA 4: Logica de Ingest]
                  Si enCaptura: datos->silencio, pregunta->responder, mixto->ambos
                         |
                  [CAPA 5: Computar Gates]
                  datosOk? packElegido?
                         |
                  [CAPA 6: Motor de Decision]
                  Reglas R0-R9, determinista, sin Claude
                         |
                  [CAPA 7: Composicion de Respuesta]
                  Templates + no-repeticion + parafraseo Claude
                         |
                  [CAPA 8: Envio con Check-Before-Send]
                  Check interrupcion entre cada template
                         |
                  [CAPA 9: Gestion de Timers]
                  Inngest durable functions
                         |
                  [CAPA 10: Senales CRM]
                  Crear orden + auto-tag WPP si aplica
                         |
                  [CAPA 11: Persistencia de Estado]
                  Guardar todo en session_state
```

---

## CAPA 0: Entry Point

```
WhatsApp (360dialog)
  -> Webhook /api/whatsapp/webhook
    -> Inngest event: whatsapp/message.received
      -> webhook-processor.ts
```

Ya existe. No se modifica.

---

## CAPA 0.5: Filtros Pre-Agente

```
1. Agente habilitado? (is_agent_enabled en conversation) -> NO -> skip
2. Tag check: WPP / P-W / RECO? -> SI -> skip, bot no responde
3. Cargar sesion (session_state en Supabase)
   -> No existe: crear sesion nueva con estado inicial
   -> Existe: cargar estado completo
```

### Tags — Layer Superior (fuera del agente)

El bot NO responde a contactos/conversaciones con estos tags:
- **WPP**: compra realizada por WhatsApp (auto-asignado al crear orden)
- **P/W**: compra realizada por pagina web
- **RECO**: clientes de recompra

---

## CAPA 1: Sistema de Interrupcion

### Ciclo de vida de un analisis

```
PENDIENTE -> EN_PROCESO -> ENVIANDO -> COMPLETADO
                              |
                          ABORTADO (si llega nuevo mensaje)
                            |-- total (0/N enviados)
                            |-- parcial (X/N enviados + pendientes)
```

### Mecanismo de deteccion

Al llegar mensaje nuevo:
1. Leer contexto.analisisActual del session_state
2. Si estado = 'en_proceso' o 'enviando':
   a. Escribir signal: analisisActual.estado = 'abort_requested'
   b. Esperar (poll cada 200ms, max 2-3s) hasta que analisis anterior confirme aborto
   c. analisis anterior al detectar la senal:
      - Para de enviar
      - Guarda enviados + pendientes en contexto
      - Marca estado = 'abortado' (confirmed)
   d. analisis nuevo lee el resultado y procede
3. Si estado = 'completado' o null:
   -> Proceder normal

### Caso 1: Aborto total (0/N enviados)

Fusionar mensajeOriginal + mensajeNuevo como un solo bloque.
Comprehension recibe el bloque completo.

### Caso 2: Aborto parcial (X/N enviados)

- Templates enviados quedan en templatesMostrados (no repetir)
- Templates no enviados van a pendientes (con prioridad)
- analisis nuevo procesa bloque fusionado + pendientes priorizados

### Prioridades de templates

- P0: Confirmacion de orden (nunca posponer)
- P1: Respuesta directa al intent actual
- P2: Templates pendientes de analisis interrumpido
- P3: Templates informativos adicionales

---

## CAPA 2: Comprehension (Claude)

```
Input:
  - mensajeCliente (o bloque fusionado si hubo interrupcion)
  - historial de conversacion
  - datos ya capturados (para no re-extraer)

Modelo: Claude Haiku 4.5, structured output (Zod schema)
Prompt cacheado con cache_control: { type: 'ephemeral' }
1 sola llamada por turno.

Output (MessageAnalysis):
  intent: { primary, secondary, confidence, reasoning }
  extracted_fields: { nombre, apellido, tel, ..., pack, ofi_inter }
  classification: { category: datos|pregunta|mixto|irrelevante, sentiment, is_acknowledgment }
  negations: { correo, telefono, barrio: boolean }
```

Parsing resiliente: safeParse + sanitizacion de intents invalidos.

---

## CAPA 3: State Merge

```
mergeAnalysis(estadoActual, analysisResult):
  1. Merge datos extraidos (no sobrescribir null sobre valores existentes)
  2. Actualizar pack si Claude lo extrajo
  3. Actualizar ofiInter si detectado
  4. Marcar negaciones
  5. Normalizar: telefono, ciudad, inferir departamento
  6. Actualizar intentsVistos
  7. Incrementar turnCount
  -> Retorna estado nuevo (inmutable)
```

---

## CAPA 4: Logica de Ingest

Si enCapturaSilenciosa == true:

| Clasificacion | Accion |
|---------------|--------|
| datos | Acumular silenciosamente, NO responder. Reevaluar timer (L0->L1->L2). Si datosOk -> auto-trigger ofrecer_promos |
| pregunta | Responder normalmente (continua a Capa 5) |
| mixto | Acumular datos + responder (continua a Capa 5) |
| irrelevante | Ignorar, sin efecto en timer |

### Route Ofi Inter
Si ciudad llega sin direccion (en modo normal):
  -> Preguntar: "Deseas recibirlo a domicilio o recoger en oficina Inter?"
  -> Si confirma ofi inter: ofiInter=true, campos criticos cambian

### Auto-complete
Si todos los campos criticos llenos -> auto-trigger ofrecer_promos

### Negaciones
"No tengo correo" -> marcar correo como N/A, no seguir pidiendo

Si enCapturaSilenciosa == false:
  -> Continuar a Capa 5

---

## CAPA 5: Computar Gates

```
datosOk     = camposCriticos.every(c => datos[c] !== null)
packElegido = pack !== null
```

Computados cada turno, NUNCA almacenados. Se recalculan del estado crudo.

No hay gate de "confirmado" — al confirmar se crea orden + tag WPP
y el bot deja de responder (layer de tags).

### Campos Criticos por Modo

Normal (6): nombre, apellido, telefono, direccion, ciudad, departamento
Ofi Inter (5): nombre, apellido, telefono, ciudad, departamento

### Flujo de Gates

```
datosOk -> ofrecer promos -> packElegido -> confirmacion compra -> crear orden + tag WPP
                |                              |
          si no elige,                   si no confirma,
          regla de ingest                dar tiempo / retomar
          (silencio + timer)
```

Si tiene criticos pero no adicionales:
- Timer L2 (2 min) -> si expira, seguir con solo criticos -> ofrecer promos

---

## CAPA 6: Motor de Decision

Reglas priority-ordered. Primera que matchea gana.
Determinista, sin Claude. Excepciones se anaden incrementalmente.

```
R0: confidence < 80 + intent=otro                    -> HANDOFF
R1: intent in {asesor, queja, cancelar}               -> HANDOFF + cancel timers
R2: intent = no_interesa                              -> RESPONDER(despedida) + cancel timers
R3: is_acknowledgment + no es post-promos/confirm     -> DAR_TIEMPO + timer silence
    EXCEPCIONES:
    - post-promos (esperando pack): no silenciar, timer L3 ya corre
    - post-confirmacion (esperando si/no): tratar como confirmacion
R4: intent = rechazar                                 -> RESPONDER(farewell) + cancel timers
R5: intent = confirmar + datosOk + packElegido        -> CREAR_ORDEN
    - sin datosOk                                     -> PEDIR_DATOS
    - sin pack                                        -> OFRECER_PROMOS
R6: intent = seleccion_pack + datosOk                 -> MOSTRAR_CONFIRMACION
    - sin datosOk                                     -> PEDIR_DATOS (+ guardar pack)
R7: intent = quiero_comprar + datosOk                 -> OFRECER_PROMOS
    - sin datosOk                                     -> PEDIR_DATOS + entrar captura
R8: datosOk + packElegido + promos mostradas          -> MOSTRAR_CONFIRMACION (auto)
R9: default                                           -> RESPONDER(intent + secondary)
```

Output de Decision:
```
{
  accion: string              -- que hacer
  templateKeys: string[]      -- que templates buscar
  extraContext: {}             -- variables para templates
  timerSignal: string|null    -- que timer iniciar/cancelar
  prioridad: 'P0'|'P1'|'P2'|'P3'
  reason: string              -- debug
}
```

Senales de timer integradas:
- timer_expirado L0 -> enviar "quedamos pendientes a tus datos..."
- timer_expirado L1 -> enviar "para despachar nos faltaria: [lista]"
- timer_expirado L2 -> auto-trigger OFRECER_PROMOS
- timer_expirado L3 -> CREAR_ORDEN (valor $0) + mensaje
- timer_expirado L4 -> CREAR_ORDEN (valor $0, con pack) + mensaje
- silence_expirado  -> enviar retake message

---

## CAPA 7: Composicion de Respuesta

```
composeResponse(decision, estado):
  1. Resolver templates desde DB (agent_templates, agentId='somnio-sales-v3')
  2. Agregar pendientes de analisis abortado (segun prioridad)
  3. No-repeticion:
     - templateId en templatesMostrados? -> parafrasear con Claude
     - Si no -> usar template original
  4. Sustitucion de variables: {nombre}, {ciudad}, {precio}, {pack}, {campos_faltantes}
  5. Limitar bloque: max 3 templates. Sobrantes -> pendientes
```

### Sistema de No-Repeticion

Niveles:
1. **ID lookup** (0ms): templateId en templatesMostrados?
2. **Minifrase** (~200ms): comparacion tematica con Claude
3. **Full content** (~1-3s): solo si nivel 2 retorna PARCIAL

Estrategia fail-open: en error -> enviar de todas formas.

---

## CAPA 8: Envio con Check-Before-Send

```
Para cada mensaje en mensajes[]:
  1. ANTES de enviar: leer analisisActual.estado
     - Si 'abort_requested' -> PARAR
       - Marcar enviados hasta aqui
       - Mover restantes a pendientes
       - Confirmar aborto
       - SALIR
     - Si no -> continuar
  2. Enviar via WhatsApp API (texto o imagen)
  3. Guardar en messages table (direction='outbound')
  4. Delay entre mensajes: calculateCharDelay(contenido.length)
  5. Marcar template en templatesEnviados
```

---

## CAPA 9: Gestion de Timers (Inngest)

### Timers de Ingest

| Timer | Condicion | Duracion | Accion al expirar |
|-------|-----------|----------|-------------------|
| L0 | en captura + 0 campos | 10 min | Mensaje: "Quedamos pendientes a tus datos..." |
| L1 | en captura + algunos campos | 6 min | Mensaje: "Para despachar nos faltaria: [lista]" |
| L2 | en captura + criticos completos | 2 min | Auto-trigger ofrecer_promos |

### Timers de Venta

| Timer | Condicion | Duracion | Accion al expirar |
|-------|-----------|----------|-------------------|
| L3 | promos mostradas + sin pack | 10 min | Crear orden ($0) + "Quedamos pendientes a la promo..." |
| L4 | confirmacion mostrada + con pack | 10 min | Crear orden ($0) + "Quedamos pendientes a la confirmacion..." |

### Timer Silence Retake

| Timer | Condicion | Duracion | Accion al expirar |
|-------|-----------|----------|-------------------|
| Silence | ACK en modo no-confirmatorio | 90 seg | Template "hola" (imagen) o "Deseas adquirir el tuyo?" |

Reglas silence retake:
- Si full ya enviado -> enviar short
- Si ambos enviados -> skip
- Verificar agente sigue habilitado antes de ejecutar

### Excepciones al silencio (NUNCA silenciar)
saludo, precio, promociones, quiero_comprar, seleccion_pack, contenido,
como_se_toma, pago, envio, registro_sanitario, ubicacion, efectos, efectividad

### Modos confirmatorios (ACK = confirmacion, NO silencio)
- Post-promos (esperando pack)
- Post-confirmacion (esperando si/no)

### Infraestructura de timers
- Inngest durable functions con waitForEvent + timeout
- settle 5s antes de escuchar (evitar auto-cancelacion)
- customer.message cancela timers activos
- Verificar agente habilitado antes de ejecutar accion

---

## CAPA 10: Senales CRM

Si accion = CREAR_ORDEN:
1. Buscar contacto por telefono -> existe: actualizar, no existe: crear
2. Crear orden en pipeline "NUEVO PEDIDO" con productos segun pack
3. shippingAddress: direccion completa o "OFICINA INTER - ciudad, depto"
4. notes: cedula_recoge, indicaciones_extra
5. Auto-tag WPP en orden + conversacion
6. Enviar template confirmacion al cliente

Si timer L3/L4 expira (orden valor $0):
- Misma logica pero precio = $0
- Sirve como "lead calificado" en pipeline

Futuro:
- Lead calificado: senalar cuando datosOk
- Carrito abandonado: cuando timer expira con datos
- Leer estados de ordenes: agente consulta tracking

---

## CAPA 11: Persistencia de Estado

Al finalizar cada turno (exitoso o abortado):

```
session_state (Supabase):
  datos_capturados: { nombre, apellido, ... }
  pack_seleccionado: '1x'|'2x'|'3x'|null
  ofi_inter: boolean
  intents_vistos: string[]
  acciones_ejecutadas: string[]
  templates_mostrados: string[]
  ultimo_msg_cliente: timestamp
  ultimo_msg_bot: timestamp
  en_captura_silenciosa: boolean
  analisis_actual: { id, estado, enviados, pendientes }
  pendientes: [{ templateId, contenido, prioridad, origenAnalisisId }]

messages table:
  Cada mensaje enviado (outbound) con wamid

conversation:
  last_message_at, last_message_preview, current_mode
```

---

## Estado del Contexto (estructura completa)

```
CONTEXTO
|-- datos: {
|     nombre, apellido, telefono, ciudad, departamento,
|     direccion, barrio, correo, indicaciones_extra, cedula_recoge
|   }
|-- pack: '1x'|'2x'|'3x'|null
|-- ofiInter: boolean
|
|-- historial:
|     intentsVistos: string[]
|     accionesEjecutadas: string[]
|     templatesMostrados: string[]
|
|-- timing:
|     ultimoMsgCliente: timestamp
|     ultimoMsgBot: timestamp
|     enCapturaSilenciosa: boolean
|
|-- analisisActual: {
|     id: string
|     estado: 'pendiente'|'en_proceso'|'enviando'|'completado'|'abortado'
|     mensajeOriginal: string
|     templatesTotales: string[]
|     templatesEnviados: string[]
|     templatesPendientes: [{id, contenido, prioridad}]
|   }
|
|-- pendientes: [{
|     templateId, contenido, prioridad,
|     origenAnalisisId
|   }]
```

---

## Intents (lo que el cliente dice)

### Informativos (11)
saludo, precio, promociones, contenido, como_se_toma,
pago, envio, registro_sanitario, ubicacion, efectos, efectividad

### Acciones del cliente (4)
quiero_comprar, seleccion_pack, confirmar, rechazar

### Escape (4)
asesor, queja, cancelar, no_interesa

### Fallback (1)
otro

### Multi-intent
Claude extrae primary + secondary. No hay intents combinados tipo "hola+precio".

---

## Acciones (lo que el bot ejecuta)

- saludar
- responder_info
- pedir_datos
- ofrecer_promos
- mostrar_confirmacion
- crear_orden
- dar_tiempo
- retomar
- handoff

---

## Senales (eventos internos)

- timer_expirado (con nivel L0-L4)
- datos_completos
- ack_detectado
- interrupcion
- analisis_abortado

---

## Productos y Precios

- 1x Somnio 90 Caps: $77,900 COP
- 2x Somnio 90 Caps: $109,900 COP (ahorra $45,900)
- 3x Somnio 90 Caps: $139,900 COP (ahorra $93,800)
- Envio gratis a toda Colombia
- Pago contraentrega

---

## Stack Tecnico

- Comprehension: Claude Haiku 4.5 (structured output, 1 llamada/turno)
- Decision: TypeScript puro (sin Claude)
- Response: Claude para parafraseo cuando template ya enviado
- Timers: Inngest durable functions (waitForEvent + timeout)
- Estado: session_state en Supabase
- WhatsApp: 360dialog API
