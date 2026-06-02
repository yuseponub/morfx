# Somnio Sales Agent v2 — Arquitectura Definitiva

## Principio Central

**LLM = procesador de lenguaje. Codigo = tomador de decisiones.**

Claude entiende QUE dice el cliente. El codigo decide QUE HACER con eso.

---

## Flujo Completo

```
Mensaje(s) del cliente
  ↓
CAPA 1: Comprension (Claude — 1 sola llamada structured output)
  → intent, datos extraidos, clasificacion, sentimiento, confidence
  ↓
CAPA 2: Estado (deterministico)
  → merge datos, computar fase del funnel, actualizar historial
  ↓
CAPA 3: Decision (reglas de negocio, sin AI)
  → SILENCIOSO / HANDOFF / RESPONDIBLE
  → Si RESPONDIBLE: lista de template IDs + signals (timer, orden)
  ↓
CAPA 4: Respuesta (composicion + envio con interrupcion)
  → Block Composer → No-Repetition Filter → check-before-send → enviar
```

---

## Tipos Base

### Intents v2 (solo intents REALES del cliente)

```typescript
const V2_INTENTS = [
  // Informativos
  'saludo',              // "Hola", "Buenos dias"
  'precio',              // "Cuanto vale?"
  'promociones',         // "Que promociones tienen?", "Tienen combos?"
  'contenido',           // "Cuantas pastillas trae?"
  'como_se_toma',        // "Como se toma?"
  'pago',                // "Como puedo pagar?", "Puedo pagar contra entrega?"
  'envio',               // "Hacen envios a Medellin?"
  'registro_sanitario',  // "Tiene INVIMA?"
  'ubicacion',           // "Desde donde envian?"
  'efectos',             // "Tiene efectos secundarios?"
  'efectividad',         // "Si funciona?"

  // Acciones del cliente
  'quiero_comprar',      // "Lo quiero", "Quiero comprar"
  'seleccion_pack',      // "El de 2", "Quiero el triple" (dato pack se extrae en extracted_fields)
  'confirmar',           // "Si, confirmo", "Proceder"
  'rechazar',            // "Dejame pensarlo", "No, gracias"

  // Escape
  'asesor',              // "Quiero hablar con alguien"
  'queja',               // "Tengo una queja"
  'cancelar',            // "Quiero cancelar"
  'no_interesa',         // "No me interesa"

  // Fallback
  'otro',                // No clasificable
] as const;

type V2Intent = typeof V2_INTENTS[number];
```

**Eliminados vs v1:**
- `resumen_1x/2x/3x` → ahora `seleccion_pack` + dato `pack=1x/2x/3x`
- `ofrecer_promos` → era accion del agente, no intent del cliente
- `compra_confirmada` → ahora `confirmar`
- `captura_datos_si_compra` → ahora `quiero_comprar`
- `info_promociones` → ahora `promociones`
- 11 combos `hola+X` → ahora Claude detecta multiples intents directamente
- `modopago`, `modopago2`, `metodos_de_pago` → unificados en `pago`
- `invima` → `registro_sanitario`
- `contraindicaciones` → `efectos`
- `sisirve` → `efectividad`
- `fallback` → `otro`

**Total: 20 intents (vs 36 en v1)**

---

## Capa 1: Comprension

### Zod Schema (structured output)

```typescript
import { z } from 'zod';

export const MessageAnalysisSchema = z.object({
  // Intent del cliente
  intent: z.object({
    primary: z.enum(V2_INTENTS),
    secondary: z.enum([...V2_INTENTS, 'ninguno']).describe(
      'Segundo intent si el mensaje tiene dos intenciones. Ej: "Hola, cuanto cuesta?" → primary=saludo, secondary=precio'
    ),
    confidence: z.number().describe('0-100. 90+ claro, 70-89 probable, <70 ambiguo'),
    reasoning: z.string().describe('Breve explicacion de por que se eligio este intent'),
  }),

  // Datos extraidos del mensaje
  extracted_fields: z.object({
    nombre: z.string().nullable(),
    apellido: z.string().nullable(),
    telefono: z.string().nullable().describe('Formato: 573XXXXXXXXX'),
    ciudad: z.string().nullable().describe('Normalizar a proper case'),
    departamento: z.string().nullable(),
    direccion: z.string().nullable(),
    barrio: z.string().nullable(),
    correo: z.string().nullable(),
    indicaciones_extra: z.string().nullable(),
    cedula_recoge: z.string().nullable(),
    pack: z.enum(['1x', '2x', '3x']).nullable().describe(
      'Pack seleccionado. "el de 2", "quiero el doble" → 2x'
    ),
    ofi_inter: z.boolean().nullable().describe(
      'true si menciona recoger en oficina Inter. "ofi inter", "recojo en oficina"'
    ),
  }),

  // Clasificacion del mensaje
  classification: z.object({
    category: z.enum(['datos', 'pregunta', 'mixto', 'irrelevante']).describe(
      'datos: solo info personal. pregunta: requiere respuesta. mixto: ambos. irrelevante: ok, gracias, emojis'
    ),
    sentiment: z.enum(['positivo', 'neutro', 'negativo']),
    is_acknowledgment: z.boolean().describe(
      'true si es solo ok/si/gracias/jaja/emoji sin contenido sustancial'
    ),
  }),

  // Negaciones explicitas
  negations: z.object({
    correo: z.boolean().describe('"no tengo correo" → true'),
    telefono: z.boolean().describe('"no tengo celular" → true'),
    barrio: z.boolean().describe('"no se el barrio" → true'),
  }),
});

export type MessageAnalysis = z.infer<typeof MessageAnalysisSchema>;
```

### Llamada Claude

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

export async function comprehend(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  existingData: Record<string, string>,
): Promise<{ analysis: MessageAnalysis; tokensUsed: number }> {

  const client = new Anthropic();

  const response = await client.messages.parse({
    model: 'claude-haiku-4-5',  // Haiku primero, Sonnet si no alcanza
    max_tokens: 1024,
    system: [{
      type: 'text',
      text: buildSystemPrompt(existingData),
      cache_control: { type: 'ephemeral' },  // Cache del system prompt
    }],
    messages: [
      ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: message },
    ],
    output_config: { format: zodOutputFormat(MessageAnalysisSchema) },
  });

  return {
    analysis: response.parsed_output!,
    tokensUsed: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
  };
}
```

### System Prompt (Capa 1)

```typescript
function buildSystemPrompt(existingData: Record<string, string>): string {
  return `Eres un analizador de mensajes para un agente de ventas de Somnio (suplemento natural para dormir).

PRODUCTO: Somnio — 90 comprimidos de melatonina + magnesio
PRECIOS: 1 frasco (1x) = $77,900 | 2 frascos (2x) = $109,900 | 3 frascos (3x) = $139,900
ENVIO: Gratis a nivel nacional via Interrapidisimo o Coordinadora

Tu tarea: analizar el mensaje del cliente y extraer TODA la informacion estructurada.

REGLAS DE EXTRACCION:
- Solo extrae datos EXPLICITAMENTE presentes en el mensaje
- Nunca inventes datos
- Telefono: normalizar a formato 573XXXXXXXXX
- Ciudad: normalizar a proper case (bogota → Bogota)
- Pack: "el de 2", "quiero el doble", "2 frascos" → 2x
- ofi_inter: true si menciona recoger en oficina/transportadora
- Si el cliente niega un dato ("no tengo correo"), marca la negacion

REGLAS DE INTENT:
- primary: el intent principal del mensaje
- secondary: solo si hay DOS intenciones claras (ej: "Hola, cuanto cuesta?" = saludo + precio)
- secondary = "ninguno" si solo hay un intent
- seleccion_pack: cuando el cliente elige un pack especifico
- confirmar: cuando ACEPTA un resumen/pedido previamente mostrado
- is_acknowledgment: true para mensajes sin contenido sustancial (ok, si, gracias, jaja, emojis)

DATOS YA CAPTURADOS (no re-extraer si ya estan):
${JSON.stringify(existingData, null, 2)}`;
}
```

---

## Capa 2: Estado

### Modelo de Estado

```typescript
export interface AgentState {
  // Datos del cliente (slot-filling)
  datos: {
    nombre: string | null;
    apellido: string | null;
    telefono: string | null;
    ciudad: string | null;
    departamento: string | null;
    direccion: string | null;
    barrio: string | null;
    correo: string | null;
    indicaciones_extra: string | null;
    cedula_recoge: string | null;
  };

  // Selecciones
  pack: '1x' | '2x' | '3x' | null;
  ofiInter: boolean;               // Recoge en oficina Inter?
  confirmado: boolean;              // Confirmo el pedido?

  // Negaciones (cliente dijo que NO tiene)
  negaciones: {
    correo: boolean;
    telefono: boolean;
    barrio: boolean;
  };

  // Historial de lo que el bot ya mostro
  mostrado: Set<string>;            // 'saludo' | 'promos' | 'resumen' | etc.
  templatesEnviados: string[];      // IDs de templates enviados
  intentsVistos: string[];          // Intents detectados en la conversacion

  // Fase computada (NO almacenada, se calcula)
  // fase: computarFase(state)

  // Metadata
  turnCount: number;
  createdAt: string;
  updatedAt: string;
}
```

### Fase del Funnel (computada, no almacenada)

```typescript
export type FunnelPhase =
  | 'nuevo'              // Sin datos, sin interaccion significativa
  | 'interesado'         // Hizo preguntas sobre el producto
  | 'datos_parciales'    // Tiene algunos datos pero no todos
  | 'datos_completos'    // Todos los datos criticos llenos
  | 'vio_promos'         // Ya le mostramos las promociones/packs
  | 'pack_elegido'       // Eligio un pack
  | 'resumen_mostrado'   // Ya le mostramos el resumen del pedido
  | 'confirmado'         // Confirmo la compra
  | 'handoff'            // Transferido a humano

export function computarFase(state: AgentState): FunnelPhase {
  if (state.confirmado) return 'confirmado';
  if (state.mostrado.has('resumen')) return 'resumen_mostrado';
  if (state.pack !== null) return 'pack_elegido';
  if (state.mostrado.has('promos')) return 'vio_promos';
  if (datosCompletos(state)) return 'datos_completos';
  if (tieneDatosParciales(state)) return 'datos_parciales';
  if (state.intentsVistos.some(i => INTENTS_DE_INTERES.includes(i))) return 'interesado';
  return 'nuevo';
}
```

### Funcion de Merge (deterministica)

```typescript
export function mergeAnalysis(
  state: AgentState,
  analysis: MessageAnalysis,
): AgentState {
  const updated = structuredClone(state);

  // 1. Merge datos extraidos (no sobreescribir con null)
  for (const [key, value] of Object.entries(analysis.extracted_fields)) {
    if (key === 'pack' || key === 'ofi_inter') continue; // Manejados aparte
    if (value !== null && key in updated.datos) {
      (updated.datos as any)[key] = value;
    }
  }

  // 2. Pack selection
  if (analysis.extracted_fields.pack) {
    updated.pack = analysis.extracted_fields.pack;
  }

  // 3. Ofi Inter
  if (analysis.extracted_fields.ofi_inter === true) {
    updated.ofiInter = true;
  }

  // 4. Negaciones
  if (analysis.negations.correo) updated.negaciones.correo = true;
  if (analysis.negations.telefono) updated.negaciones.telefono = true;
  if (analysis.negations.barrio) updated.negaciones.barrio = true;

  // 5. Normalizar datos (telefono, ciudad, departamento)
  if (updated.datos.telefono) updated.datos.telefono = normalizePhone(updated.datos.telefono);
  if (updated.datos.ciudad) {
    updated.datos.ciudad = normalizeCity(updated.datos.ciudad);
    if (!updated.datos.departamento) {
      updated.datos.departamento = inferDepartamento(updated.datos.ciudad);
    }
  }

  // 6. Actualizar historial
  updated.intentsVistos.push(analysis.intent.primary);
  if (analysis.intent.secondary !== 'ninguno') {
    updated.intentsVistos.push(analysis.intent.secondary);
  }

  // 7. Metadata
  updated.turnCount++;
  updated.updatedAt = new Date().toISOString();

  return updated;
}
```

### Helpers de Completitud

```typescript
const CRITICAL_FIELDS = ['nombre', 'telefono', 'direccion', 'ciudad', 'departamento'] as const;
const CRITICAL_FIELDS_INTER = ['nombre', 'telefono', 'ciudad', 'departamento'] as const;

export function datosCompletos(state: AgentState): boolean {
  const fields = state.ofiInter ? CRITICAL_FIELDS_INTER : CRITICAL_FIELDS;
  return fields.every(f => state.datos[f] !== null && state.datos[f]!.trim() !== '');
}

export function tieneDatosParciales(state: AgentState): boolean {
  return Object.values(state.datos).some(v => v !== null && v.trim() !== '');
}

export function camposFaltantes(state: AgentState): string[] {
  const fields = state.ofiInter ? CRITICAL_FIELDS_INTER : CRITICAL_FIELDS;
  return fields.filter(f => !state.datos[f] || state.datos[f]!.trim() === '');
}
```

---

## Capa 3: Decision

### Output de Decision

```typescript
export interface Decision {
  action:
    | 'respond'           // Enviar templates
    | 'silence'           // No responder, activar timer
    | 'handoff'           // Transferir a humano
    | 'create_order'      // Crear orden + enviar confirmacion

  // Solo si action = 'respond' o 'create_order'
  templateIntents?: string[];     // Intents para buscar templates en DB
  extraContext?: Record<string, string>;  // Variables para sustitucion

  // Signals
  timerSignal?: 'start_silence' | 'start_retake' | 'cancel';
  reason: string;                 // Para debug: por que se tomo esta decision
}
```

### Motor de Reglas

```typescript
export function decide(
  analysis: MessageAnalysis,
  state: AgentState,
): Decision {
  const fase = computarFase(state);
  const intent = analysis.intent.primary;
  const confidence = analysis.intent.confidence;

  // ============================================================
  // REGLA 0: Confidence baja → handoff
  // ============================================================
  if (confidence < 80 && intent === 'otro') {
    return {
      action: 'handoff',
      reason: `Confidence ${confidence}% + intent=otro`,
    };
  }

  // ============================================================
  // REGLA 1: Intents de escape → handoff
  // ============================================================
  if (['asesor', 'queja', 'cancelar'].includes(intent)) {
    return {
      action: 'handoff',
      timerSignal: 'cancel',
      reason: `Intent de escape: ${intent}`,
    };
  }

  // ============================================================
  // REGLA 2: No interesa → responder + cerrar
  // ============================================================
  if (intent === 'no_interesa') {
    return {
      action: 'respond',
      templateIntents: ['no_interesa'],
      timerSignal: 'cancel',
      reason: 'Cliente no interesado',
    };
  }

  // ============================================================
  // REGLA 3: Acknowledgment sin contexto confirmatorio → silencio
  // ============================================================
  if (analysis.classification.is_acknowledgment) {
    // EXCEPCION: Si acabamos de mostrar resumen o promos, "si" = confirmacion
    if (fase === 'resumen_mostrado' && isPositiveAck(analysis)) {
      // Tratar como confirmacion → REGLA 7
      return decideConfirmacion(state);
    }
    if (fase === 'vio_promos' || fase === 'pack_elegido') {
      // En contexto de promos, no silenciar — dejar pasar
    } else {
      return {
        action: 'silence',
        timerSignal: 'start_silence',
        reason: 'Acknowledgment sin contexto confirmatorio',
      };
    }
  }

  // ============================================================
  // REGLA 4: Rechazar → responder con despedida amable
  // ============================================================
  if (intent === 'rechazar') {
    return {
      action: 'respond',
      templateIntents: ['rechazar'],
      timerSignal: 'cancel',
      reason: 'Cliente rechazo',
    };
  }

  // ============================================================
  // REGLA 5: Confirmar compra (solo si ya vio resumen)
  // ============================================================
  if (intent === 'confirmar' && fase === 'resumen_mostrado') {
    return decideConfirmacion(state);
  }

  // ============================================================
  // REGLA 6: Seleccion de pack
  // ============================================================
  if (intent === 'seleccion_pack' || state.pack !== null) {
    // Si tiene pack + datos completos → mostrar resumen
    if (state.pack && datosCompletos(state) && !state.mostrado.has('resumen')) {
      return {
        action: 'respond',
        templateIntents: ['resumen'],
        extraContext: buildResumenContext(state),
        reason: `Pack=${state.pack} + datos completos → resumen`,
      };
    }
    // Si tiene pack pero faltan datos → pedir datos
    if (state.pack && !datosCompletos(state)) {
      return {
        action: 'respond',
        templateIntents: ['pedir_datos'],
        extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
        reason: `Pack=${state.pack} pero faltan: ${camposFaltantes(state).join(', ')}`,
      };
    }
  }

  // ============================================================
  // REGLA 7: Quiero comprar → pedir datos o mostrar promos
  // ============================================================
  if (intent === 'quiero_comprar') {
    if (!state.mostrado.has('promos')) {
      // Primero mostrar promos para que elija pack
      return {
        action: 'respond',
        templateIntents: ['quiero_comprar', 'promociones'],
        reason: 'Quiere comprar, mostrar promos primero',
      };
    }
    if (!datosCompletos(state)) {
      return {
        action: 'respond',
        templateIntents: ['pedir_datos'],
        extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
        reason: 'Quiere comprar, faltan datos',
      };
    }
  }

  // ============================================================
  // REGLA 8: Datos completos + pack + promos vistas → auto resumen
  // ============================================================
  if (datosCompletos(state) && state.pack && state.mostrado.has('promos') && !state.mostrado.has('resumen')) {
    return {
      action: 'respond',
      templateIntents: ['resumen'],
      extraContext: buildResumenContext(state),
      reason: 'Auto-resumen: datos completos + pack + promos vistas',
    };
  }

  // ============================================================
  // REGLA 9: Preguntas informativas → responder con templates del intent
  // ============================================================
  const intentsAResponder = [intent];
  if (analysis.intent.secondary !== 'ninguno') {
    intentsAResponder.push(analysis.intent.secondary);
  }

  // Si es saludo + otro intent, saludo primero
  if (intent === 'saludo' && analysis.intent.secondary !== 'ninguno') {
    // saludo ya esta primero, secondary se agrega
  }

  return {
    action: 'respond',
    templateIntents: intentsAResponder,
    reason: `Responder a intent: ${intentsAResponder.join(' + ')}`,
  };
}

// ============================================================
// Sub-decisiones
// ============================================================

function decideConfirmacion(state: AgentState): Decision {
  if (!datosCompletos(state)) {
    return {
      action: 'respond',
      templateIntents: ['pedir_datos'],
      extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
      reason: 'Confirmo pero faltan datos',
    };
  }
  if (!state.pack) {
    return {
      action: 'respond',
      templateIntents: ['promociones'],
      reason: 'Confirmo pero no ha elegido pack',
    };
  }
  return {
    action: 'create_order',
    templateIntents: ['confirmacion_orden'],
    timerSignal: 'cancel',
    reason: 'Confirmacion con datos completos + pack',
  };
}

function isPositiveAck(analysis: MessageAnalysis): boolean {
  return analysis.classification.sentiment === 'positivo'
    || analysis.intent.primary === 'confirmar';
}

function buildResumenContext(state: AgentState): Record<string, string> {
  const precios = { '1x': '$77,900', '2x': '$109,900', '3x': '$139,900' };
  return {
    nombre: state.datos.nombre ?? '',
    ciudad: state.datos.ciudad ?? '',
    direccion: state.datos.direccion ?? '',
    pack: state.pack ?? '',
    precio: precios[state.pack as keyof typeof precios] ?? '',
  };
}
```

### Diagrama de Reglas

```
Mensaje analizado por Capa 1
  ↓
¿Confidence < 80 + intent=otro?     → HANDOFF
¿Intent = asesor/queja/cancelar?     → HANDOFF
¿Intent = no_interesa?               → RESPOND (despedida)
¿Acknowledgment?
  ├─ En resumen_mostrado + positivo? → CREAR ORDEN (si datos ok)
  ├─ En contexto promos?             → dejar pasar
  └─ Otro contexto?                  → SILENCIO
¿Intent = rechazar?                  → RESPOND (despedida)
¿Intent = confirmar + resumen visto? → CREAR ORDEN (si datos ok)
¿Pack elegido?
  ├─ + datos completos?              → RESPOND (resumen)
  └─ + datos incompletos?            → RESPOND (pedir datos)
¿Intent = quiero_comprar?
  ├─ Sin promos vistas?              → RESPOND (promos)
  └─ Sin datos?                      → RESPOND (pedir datos)
¿Datos completos + pack + promos?    → RESPOND (auto-resumen)
Default                              → RESPOND (templates del intent)
```

---

## Capa 4: Respuesta

### Pipeline

```typescript
export async function respond(
  decision: Decision,
  state: AgentState,
  checkInbox: () => Promise<string[]>,  // Adapter: buscar mensajes nuevos
  sendTemplate: (template: ProcessedTemplate) => Promise<void>,  // Adapter: enviar
): Promise<ResponseResult> {

  // 1. Buscar templates en DB
  const rawTemplates = await templateManager.getTemplatesForIntents(
    'somnio-sales-v2',
    decision.templateIntents ?? [],
    state.intentsVistos,
    state.templatesEnviados,
  );

  // 2. Procesar templates (variable substitution)
  const processed = await templateManager.processTemplates(
    rawTemplates,
    decision.extraContext ?? {},
    false, // isRepeated — manejar con no-rep filter
  );

  // 3. Block Composer (max 3, prioridades)
  const composed = composeBlock(processed, state.pendingTemplates ?? []);

  // 4. No-Repetition Filter (3 niveles)
  const filtered = await noRepFilter.filterBlock(
    composed.block,
    state.outboundRegistry ?? [],
    state.templatesEnviados,
  );

  // 5. Enviar con check-before-send
  const sent: string[] = [];
  const aborted = false;

  for (const template of filtered.surviving) {
    // CHECK INBOX antes de cada envio
    const newMessages = await checkInbox();
    if (newMessages.length > 0) {
      return {
        sent,
        aborted: true,
        pendingMessages: newMessages,
        pendingTemplates: composed.pending,
      };
    }

    await sendTemplate(template);
    sent.push(template.templateId);
  }

  // 6. Actualizar mostrado
  const mostradoUpdates: string[] = [];
  if (decision.templateIntents?.includes('promociones')) mostradoUpdates.push('promos');
  if (decision.templateIntents?.includes('resumen')) mostradoUpdates.push('resumen');
  if (decision.templateIntents?.includes('saludo')) mostradoUpdates.push('saludo');

  return {
    sent,
    aborted: false,
    pendingTemplates: composed.pending,
    dropped: composed.dropped,
    filtered: filtered.filtered,
    mostradoUpdates,
  };
}
```

### ResponseResult

```typescript
export interface ResponseResult {
  sent: string[];                    // Template IDs enviados exitosamente
  aborted: boolean;                  // Se interrumpio por mensaje nuevo?
  pendingMessages?: string[];        // Mensajes nuevos que causaron el abort
  pendingTemplates: any[];           // Templates para el siguiente ciclo
  dropped?: any[];                   // Templates OPCIONAL descartados
  filtered?: any[];                  // Templates filtrados por no-rep
  mostradoUpdates?: string[];        // Que se mostro en este turn
}
```

---

## Sistema de Interrupcion

### Flujo en el Engine

```typescript
export async function processTurn(
  messages: string[],          // Puede ser 1 o N mensajes acumulados
  state: AgentState,
  adapters: Adapters,
): Promise<TurnResult> {

  // Combinar mensajes en un solo input
  const combinedMessage = messages.join('\n');

  // CAPA 1
  const { analysis, tokensUsed } = await comprehend(
    combinedMessage,
    adapters.getHistory(),
    state.datos,
  );

  // CAPA 2
  const updatedState = mergeAnalysis(state, analysis);

  // CAPA 3
  const decision = decide(analysis, updatedState);

  // Manejar acciones no-respond
  if (decision.action === 'handoff') {
    return { state: updatedState, action: 'handoff', tokensUsed };
  }
  if (decision.action === 'silence') {
    return { state: updatedState, action: 'silence', timerSignal: decision.timerSignal, tokensUsed };
  }

  // CAPA 4 (con interrupcion)
  const responseResult = await respond(
    decision,
    updatedState,
    adapters.checkInbox,
    adapters.sendTemplate,
  );

  // Si se aborto, reprocesar con mensajes acumulados
  if (responseResult.aborted && responseResult.pendingMessages) {
    // Actualizar state con lo que SI se envio
    const partialState = applyResponseToState(updatedState, responseResult);
    // Reprocesar con mensajes acumulados
    return processTurn(
      [...messages, ...responseResult.pendingMessages],
      partialState,
      adapters,
    );
  }

  // Turn completado exitosamente
  const finalState = applyResponseToState(updatedState, responseResult);

  // Crear orden si la decision lo indica
  if (decision.action === 'create_order') {
    await adapters.createOrder(finalState);
  }

  return {
    state: finalState,
    action: decision.action,
    tokensUsed,
    sent: responseResult.sent,
    timerSignal: decision.timerSignal,
  };
}
```

---

## Mapping Templates (DB)

### Como se seleccionan templates en v2

En v1, los templates se buscan por `intent` (1 de 36 intents).
En v2, los templates se buscan por `templateIntents` que salen de Capa 3.

Los `templateIntents` de Capa 3 NO son intents del cliente — son **directivas de respuesta**:

| templateIntent (Capa 3) | Templates en DB | Cuando se usa |
|---|---|---|
| `saludo` | Saludo de bienvenida | Intent=saludo |
| `precio` | Info de precios | Intent=precio |
| `promociones` | Pack 1x/2x/3x con precios | Intent=promociones o auto-trigger |
| `pedir_datos` | "Necesito tus datos para el envio..." | Cuando faltan datos |
| `resumen` | Resumen del pedido con variables | Datos completos + pack elegido |
| `confirmacion_orden` | "Tu pedido ha sido creado!" | Orden confirmada |
| `rechazar` | "Entiendo, si cambias de opinion..." | Cliente rechazo |
| `no_interesa` | Despedida amable | Cliente no interesado |
| `contenido` | Info del envase | Intent=contenido |
| `como_se_toma` | Instrucciones de uso | Intent=como_se_toma |
| `pago` | Metodos de pago | Intent=pago |
| `envio` | Info de envios | Intent=envio |
| `registro_sanitario` | Info INVIMA | Intent=registro_sanitario |
| `ubicacion` | Ubicacion/origen | Intent=ubicacion |
| `efectos` | Contraindicaciones | Intent=efectos |
| `efectividad` | Testimonios/eficacia | Intent=efectividad |
| `quiero_comprar` | Respuesta a intencion de compra | Intent=quiero_comprar |
| `retoma_silence` | Mensaje de retoma tras silencio | Timer de silencio |

**Nota**: Esto requiere re-mapear los templates existentes en DB de los 36 intents v1 a los ~18 template intents v2. Es una migracion de datos, no de schema.

---

## Adapters (interfaz para sandbox vs produccion)

```typescript
export interface Adapters {
  // Lectura
  getHistory(): { role: 'user' | 'assistant'; content: string }[];
  checkInbox(): Promise<string[]>;  // Mensajes nuevos desde lastMessageId

  // Escritura
  sendTemplate(template: ProcessedTemplate): Promise<void>;
  saveState(state: AgentState): Promise<void>;
  createOrder(state: AgentState): Promise<void>;

  // Timers
  startTimer(type: 'silence' | 'retake', durationMs: number): Promise<void>;
  cancelTimer(): Promise<void>;

  // Debug
  emitDebug(info: DebugInfo): void;
}
```

**Sandbox adapter**: in-memory, checkInbox siempre retorna [], timers via setTimeout
**Production adapter**: Supabase, checkInbox query DB, timers via Inngest events

---

## Archivos v2 (estructura propuesta)

```
src/lib/agents/somnio-v2/
├── index.ts                    # Exports publicos
├── somnio-v2-agent.ts          # Entry point: processTurn()
├── engine-v2.ts                # Engine wrapper para sandbox
├── comprehension.ts            # CAPA 1: Claude structured output
├── comprehension-schema.ts     # Zod schema + types
├── comprehension-prompt.ts     # System prompt builder
├── state.ts                    # CAPA 2: AgentState + merge + helpers
├── decision.ts                 # CAPA 3: Reglas de negocio
├── response.ts                 # CAPA 4: Pipeline de respuesta
├── constants.ts                # Constantes v2 (fields, thresholds)
├── types.ts                    # Tipos compartidos
└── normalizers.ts              # Normalizacion (phone, city, dept) — reusar de v1
```

**Reutilizados de v1** (importados, no copiados):
- `block-composer.ts` — Composicion de bloques
- `no-repetition-filter.ts` — Filtro anti-repeticion
- `template-manager.ts` — Carga y procesamiento de templates
- `normalizers.ts` — Normalizacion de datos colombianos

---

## Resumen de Diferencias v1 vs v2

| Aspecto | v1 | v2 |
|---|---|---|
| Llamadas Claude/turn | 1-5 (intent + classifier + extractor + norep) | **1** (structured output) + norep |
| Intents | 36 (mezclados) | **20** (solo del cliente) |
| Modos/estados | 10 rigidos con 24 transiciones | **Fase computada** del estado |
| Pack selection | Intent (resumen_2x) | **Dato extraido** (pack=2x) |
| Collecting mode | Modo especial que atrapa mensajes | **No existe** — siempre extrae todo |
| Transiciones | 24 hardcoded, validator con 5 reglas | **Reglas de estado** priority-ordered |
| Interrupcion | No existe | **Check-before-send** + acumulacion |
| Modelo | Solo Sonnet | **Haiku primero**, Sonnet si necesario |
| Costo estimado | ~$0.01/msg | ~$0.002/msg (5x mas barato) |

---

## Orden de Implementacion (sandbox)

1. **Capa 1** — Schema Zod + prompt + llamada Claude (lo mas critico)
2. **Capa 2** — State model + merge + computarFase
3. **Capa 3** — Reglas de decision (empezar con las basicas)
4. **Capa 4** — Conectar template manager + block composer + envio simple
5. **Interrupcion** — check-before-send (sandbox simula con delays)
6. **Polish** — Debug panel, metrics, edge cases
