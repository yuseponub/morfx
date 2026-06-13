---
phase: v4-dual-intent-query-split
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/comprehension-schema.ts
  - src/lib/agents/somnio-v4/comprehension-prompt.ts
  - src/lib/agents/somnio-v4/slots.ts
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/__tests__/slots.test.ts
autonomous: true
requirements:
  - D-01
  - D-02
  - D-03
  - D-04
  - D-05

must_haves:
  truths:
    - "Turno dual-intent (contraindicaciones+tiempo_entrega): el slot primario recibe su sub-query aislada (primary_query) en lugar del rawMessage completo — Gemini Flash ya no ve la pregunta del secundario mezclada"
    - "El responseConfidence del slot primario sube de ~0.6/FALTA_INFO a ~0.95/RESPONDE_BIEN cuando se le pasa la sub-query limpia (reproducible via scripts/_v4-probe-generation.ts)"
    - "Turno single-intent: primary slot ragQuery === rawMessage exacto — comportamiento byte-identico al pre-fix (Regla 6, garantizado por el guard secondaryIntent !== 'ninguno')"
    - "secondary === 'ninguno': comprehension produce primary_query = null — el campo existe en schema pero no se puebla para mensajes de un solo intent"
    - "v3 / godentist / recompra / pw-confirmation: cero archivos tocados, cero cambio de comportamiento (Regla 6)"
    - "v4 sigue DORMANT en prod — ningun cambio en routing_rules ni workspace_agent_config"
    - "El prompt de generacion (sub-loop/prompt.ts) NO se toca — el fix es INPUT-side (D-05)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/comprehension-schema.ts"
      provides: "Campo primary_query (gemelo de secondary_query) en el intent schema"
      contains: "primary_query"
    - path: "src/lib/agents/somnio-v4/comprehension-prompt.ts"
      provides: "Instruccion primary_query paralela a secondary_query; 4 anclas multi-intent actualizadas; regla SIEMPRE poblar extendida"
      contains: "primary_query"
    - path: "src/lib/agents/somnio-v4/slots.ts"
      provides: "ComputeSlotsArgs con primaryQuery; ragQuery del primario usa primary_query cuando hay secundario"
      contains: "primaryQuery"
    - path: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      provides: "Call site de computeSlots pasa primaryQuery; evento comprehension_completed_v4 loguea primary_query"
      contains: "primary_query"
    - path: "src/lib/agents/somnio-v4/__tests__/slots.test.ts"
      provides: "Casos de regresion dual-intent: low primary usa primary_query; single-intent usa rawMessage; fallback null->rawMessage"
      contains: "primaryQuery"
  key_links:
    - from: "src/lib/agents/somnio-v4/comprehension-schema.ts"
      to: "somnio-v4-agent.ts:analysis.intent.primary_query"
      via: "z.infer<typeof MessageAnalysisSchema>.intent.primary_query"
      pattern: "primary_query: z\\.string\\(\\)\\.nullable\\(\\)"
    - from: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      to: "slots.ts:computeSlots"
      via: "primaryQuery: analysis.intent.primary_query ?? null"
      pattern: "primaryQuery: analysis\\.intent\\.primary_query"
    - from: "src/lib/agents/somnio-v4/slots.ts"
      to: "sub-loop/index.ts:ragQuery"
      via: "SlotDecision.ragQuery = primaryQuery ?? rawMessage (cuando secundario presente)"
      pattern: "secondaryIntent !== 'ninguno' \\? \\(primaryQuery \\?\\? rawMessage\\)"
---

<objective>
Fix aditivo a somnio-sales-v4 que elimina la contaminacion de query dual-intent en el slot primario del sub-loop RAG. El bug causa que el modelo descarte respuestas primarias correctas (~95% confidence aislado) por ver la pregunta del secundario mezclada en la query (~0.6/FALTA_INFO combinado).

Purpose: cuando un turno tiene 2 intents, el slot PRIMARIO ya no recibe el rawMessage completo (que incluye la pregunta del secundario) sino una sub-query segmentada `primary_query` generada por comprehension — gemelo exacto del mecanismo `secondary_query` que ya existe y funciona para el secundario.

Output:
  - comprehension-schema.ts: campo primary_query anadido (z.string().nullable(), gemelo de secondary_query)
  - comprehension-prompt.ts: instruccion primary_query paralela + 4 anclas multi-intent actualizadas + regla SIEMPRE poblar extendida
  - slots.ts: ComputeSlotsArgs.primaryQuery + logica ragQuery del slot primario usa primary_query cuando hay secundario
  - somnio-v4-agent.ts: call site pasa primaryQuery; evento comprehension_completed_v4 loguea primary_query (simetrico a secondary_query)
  - slots.test.ts: nuevos casos para los 3 invariantes Regla 6

Sin migracion de DB. Sin cambio en sub-loop/prompt.ts (D-05). v4 sigue DORMANT.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-dual-intent-query-split/CONTEXT.md

<!-- Regla 6: v4 es DORMANT. Todos los cambios son aditivos.
     Los turnos single-intent quedan byte-identicos (guard secondaryIntent !== 'ninguno').
     v3/godentist/recompra/pw-confirmation: CERO archivos tocados. -->

<!-- D-05 LOCK: NO modificar sub-loop/prompt.ts ni las reglas anti-invencion / calibracion M1/M2/M3.
     El fix ataca el INPUT (query limpia por topic), no el juicio del modelo.
     Probado en vivo: con query limpia el modelo da 0.95/RESPONDE_BIEN sin tocar el prompt. -->
</context>

<interfaces>
<!-- Interfaces clave verificadas contra el codigo vivo. El ejecutor usa estas directamente. -->

<!-- PATRON A CLONAR — secondary_query ya funciona, primary_query es su gemelo exacto.
     Cada cambio sigue el mismo patron que secondary_query en el mismo archivo. -->

From src/lib/agents/somnio-v4/comprehension-schema.ts (lines 60-75 — CURRENT estado, base para D-01):
```typescript
// Lineas 61-74 actuales (secondary_query es el patron a clonar):
secondary_confidence: z.number().min(0).max(1).nullable().describe(
  '0..1 self-reported confidence en la clasificacion SECUNDARIA. ' +
  'null si secondary === "ninguno". ...'
),
secondary_confidence_reasoning: z.string().nullable().describe(
  'Breve explicacion del secondary_confidence. null si secondary === "ninguno".'
),
secondary_query: z.string().nullable().describe(
  'Sub-query segmentada del SEGUNDO intent — la parte del mensaje que corresponde al ' +
  'secondary, reformulada como pregunta auto-contenida. null si secondary === "ninguno". ' +
  'Ej: "cuanto vale y lo puedo tomar si tengo apnea?" -> secondary_query="puedo tomar el ' +
  'producto si tengo apnea del sueno?"'
),
// ↑ INSERTAR primary_query AQUI (despues de secondary_query, linea 76)
```

From src/lib/agents/somnio-v4/comprehension-prompt.ts (lines 186-212 — bloque SECONDARY INTENT):
```
## SECONDARY INTENT — COBERTURA Y SUB-QUERY (v4-hybrid D-01/D-04)

Cuando secondary != "ninguno", aplica la MISMA calibracion template-fit al secondary:
- secondary_confidence = "la respuesta automatica del secondary CUBRE esta sub-pregunta?" (0..1, ...)
- secondary_query = la parte del mensaje que corresponde al secondary, reformulada como pregunta auto-contenida.
- Si secondary == "ninguno": secondary_confidence=null, secondary_confidence_reasoning=null, secondary_query=null.

REGLA DURA anti-swap: el confidence/query del PRIMARY describe la 1a intencion; el del SECONDARY la 2a. NO los intercambies.

ANCLAS MULTI-INTENT (muestran AMBOS confidences con coberturas OPUESTAS):
- "cuanto vale y lo puedo tomar si tengo apnea?"
  -> primary=precio CUBRE (intent_confidence=0.92),
     secondary=contraindicaciones NO CUBRE (secondary_confidence=0.25),
     secondary_query="puedo tomar el producto si tengo apnea del sueno?"
- "ok pero la entrega cuando?"
  -> primary=acknowledgment (intent_confidence=0.45),
     secondary=tiempo_entrega CUBRE (secondary_confidence=0.88),
     secondary_query="cuando llega el pedido?"
- "hola, puedo tomarlo si tomo sertralina?"
  -> primary=saludo CUBRE (intent_confidence=0.95),
     secondary=contraindicaciones NO CUBRE (secondary_confidence=0.25),
     secondary_query="puedo tomar el producto si tomo sertralina?"
- "cuanto cuesta y de que esta hecho?"
  -> primary=precio CUBRE (intent_confidence=0.92),
     secondary=contenido CUBRE (secondary_confidence=0.85),
     secondary_query="de que esta hecho el producto?"
```

From src/lib/agents/somnio-v4/comprehension-prompt.ts (line 273 — regla SIEMPRE poblar):
```
- Si secondary != "ninguno", SIEMPRE poblar secondary_confidence + secondary_query; si secondary == "ninguno", ponerlos en null.
```

From src/lib/agents/somnio-v4/slots.ts (lines 72-89 — ComputeSlotsArgs CURRENT, base para D-03):
```typescript
export interface ComputeSlotsArgs {
  primaryIntent: string
  primaryConfidence: number
  secondaryIntent: string       // 'ninguno' when no secondary
  secondaryConfidence: number | null
  secondaryQuery: string | null  // ← patron a clonar para primaryQuery
  rawMessage: string
  threshold: number
}
```

From src/lib/agents/somnio-v4/slots.ts (lines 124-130 — THE BUG, base para D-03):
```typescript
const primary: SlotDecision = {
  intent: primaryIntent,
  coverage: primaryCoverage,
  reason: primaryReason,
  // T-2: low primary uses the raw message (unpartitioned — D-04 only segments the secondary).
  ragQuery: primaryCoverage === 'low' ? rawMessage : null,   // ← BUG: usar rawMessage siempre contamina
}
```

Secondary pattern to clone (lines 151-153 — the correct pattern already working):
```typescript
// T-2: low secondary uses secondaryQuery (D-04 sub-query); fallback to rawMessage
ragQuery: secondaryCoverage === 'low' ? (secondaryQuery ?? rawMessage) : null,
```

From src/lib/agents/somnio-v4/somnio-v4-agent.ts (lines 411-419 — computeSlots call site, base para D-04):
```typescript
const slotPlan: SlotPlan = computeSlots({
  primaryIntent: analysis.intent.primary,
  primaryConfidence: analysis.intent.intent_confidence,
  secondaryIntent: analysis.intent.secondary,
  secondaryConfidence: analysis.intent.secondary_confidence ?? null,
  secondaryQuery: analysis.intent.secondary_query ?? null,
  rawMessage: input.message,
  threshold,
})
// ↑ Agregar: primaryQuery: analysis.intent.primary_query ?? null,
```

From src/lib/agents/somnio-v4/somnio-v4-agent.ts (lines 435-450 — comprehension_completed_v4 event, ya tiene secondary_query):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed_v4', {
  agent: SOMNIO_V4_AGENT_ID,
  sessionId: input.sessionId ?? null,
  intent: analysis.intent.primary,
  intent_confidence: analysis.intent.intent_confidence,
  intent_confidence_reasoning: analysis.intent.intent_confidence_reasoning ?? null,
  threshold,
  scaledToSubLoop: anyLowSlot,
  earlyReason: earlyReason ?? null,
  tokensUsed,
  restart_iteration: restartIteration,
  secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : null,
  secondary_confidence: analysis.intent.secondary_confidence ?? null,
  secondary_confidence_reasoning: analysis.intent.secondary_confidence_reasoning ?? null,
  secondary_query: analysis.intent.secondary_query ?? null,
  // ↑ Agregar DESPUES: primary_query: analysis.intent.primary_query ?? null,
})
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Schema + Prompt — agregar primary_query (D-01 + D-02)</name>
  <read_first>
    src/lib/agents/somnio-v4/comprehension-schema.ts (completo — verificar lineas 60-76 donde va el campo nuevo; confirmar que secondary_query termina en linea 75 antes del cierre de intent object)
    src/lib/agents/somnio-v4/comprehension-prompt.ts (lineas 186-212 bloque SECONDARY INTENT + anclas; linea 273 regla SIEMPRE poblar — son los DOS sitios a modificar en el prompt)
  </read_first>
  <files>
    src/lib/agents/somnio-v4/comprehension-schema.ts,
    src/lib/agents/somnio-v4/comprehension-prompt.ts
  </files>
  <behavior>
    - comprehension-schema.ts: primary_query es nullable string, se puebla SOLO cuando secondary != 'ninguno', null cuando un solo intent — gemelo exacto de secondary_query pero para el primer intent
    - comprehension-prompt.ts bloque SECONDARY INTENT: agregar instruccion de primary_query paralela a la de secondary_query; actualizar las 4 anclas para mostrar primary_query junto a secondary_query
    - comprehension-prompt.ts linea SIEMPRE poblar: extender para incluir primary_query cuando secondary != 'ninguno'
    - NINGUN cambio a la logica de clasificacion de intent/confidence — cambio puramente aditivo (D-02)
  </behavior>
  <action>
CHANGE 1 — comprehension-schema.ts: agregar primary_query despues de secondary_query

Despues de la linea que cierra la descripcion de secondary_query (actualmente la ultima propiedad del intent object antes del cierre `}`), agregar:

```typescript
    primary_query: z.string().nullable().describe(
      'Sub-query segmentada del PRIMER intent — la parte del mensaje que corresponde al ' +
      'primary, reformulada como pregunta auto-contenida. null cuando secondary === "ninguno" ' +
      '(se usa el mensaje completo). ' +
      'Ej: "lo puedo tomar si tomo alcohol? cuanto demora en llegar a bucaramanga" -> ' +
      'primary_query="puedo tomar el producto si consumo alcohol?"'
    ),
```

Insertar JUSTO DESPUES del cierre de la descripcion de `secondary_query` (antes del cierre `}),` del objeto intent). El orden en el schema debe quedar:
  ... secondary_confidence, secondary_confidence_reasoning, secondary_query, primary_query ...

CHANGE 2 — comprehension-prompt.ts: modificar bloque SECONDARY INTENT (aprox. lineas 186-212)

Localizar el encabezado `## SECONDARY INTENT — COBERTURA Y SUB-QUERY (v4-hybrid D-01/D-04)`.

2a. Despues de la linea de `secondary_query` (actualmente: `- secondary_query = la parte del mensaje que corresponde al secondary...`), agregar esta linea paralela:
```
- primary_query = la parte del mensaje que corresponde al PRIMARY, reformulada como pregunta auto-contenida. null cuando secondary === "ninguno".
```

2b. Actualizar las 4 anclas MULTI-INTENT para mostrar primary_query. Reemplazar el bloque de anclas completo con:
```
ANCLAS MULTI-INTENT (muestran AMBOS confidences, sub-queries Y coberturas OPUESTAS):
- "cuanto vale y lo puedo tomar si tengo apnea?"
  -> primary=precio CUBRE (intent_confidence=0.92),
     primary_query="cuanto cuesta el producto?",
     secondary=contraindicaciones NO CUBRE (secondary_confidence=0.25),
     secondary_query="puedo tomar el producto si tengo apnea del sueno?"
- "ok pero la entrega cuando?"
  -> primary=acknowledgment (intent_confidence=0.45),
     primary_query="ok",
     secondary=tiempo_entrega CUBRE (secondary_confidence=0.88),
     secondary_query="cuando llega el pedido?"
- "hola, puedo tomarlo si tomo sertralina?"
  -> primary=saludo CUBRE (intent_confidence=0.95),
     primary_query="hola",
     secondary=contraindicaciones NO CUBRE (secondary_confidence=0.25),
     secondary_query="puedo tomar el producto si tomo sertralina?"
- "cuanto cuesta y de que esta hecho?"
  -> primary=precio CUBRE (intent_confidence=0.92),
     primary_query="cuanto cuesta el producto?",
     secondary=contenido CUBRE (secondary_confidence=0.85),
     secondary_query="de que esta hecho el producto?"
```

CHANGE 3 — comprehension-prompt.ts: extender la regla SIEMPRE poblar (aprox. linea 273)

Localizar la linea:
```
- Si secondary != "ninguno", SIEMPRE poblar secondary_confidence + secondary_query; si secondary == "ninguno", ponerlos en null.
```

Reemplazar por:
```
- Si secondary != "ninguno", SIEMPRE poblar secondary_confidence + secondary_query + primary_query; si secondary == "ninguno", ponerlos en null (primary_query = null cuando un solo intent — se usa el mensaje completo).
```

NO tocar ninguna otra parte del prompt (clasificacion de intents, confidence rules, datos de extraccion, etc.).
  </action>
  <verify>
    <automated>
      grep -n "primary_query" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/comprehension-schema.ts
      grep -c "primary_query" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/comprehension-prompt.ts
      npx tsc --noEmit 2>&1 | head -20
      npx vitest run src/lib/agents/somnio-v4/ --reporter=verbose 2>&1 | tail -20
    </automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "primary_query" src/lib/agents/somnio-v4/comprehension-schema.ts` retorna 1
    - `grep -n "z\.string()\.nullable()" src/lib/agents/somnio-v4/comprehension-schema.ts` incluye una linea con "primary_query" (verifica tipo correcto)
    - `grep -c "primary_query" src/lib/agents/somnio-v4/comprehension-prompt.ts` retorna >= 5 (instruccion + 4 anclas actualizadas + regla SIEMPRE poblar)
    - `grep -c "secondary_query" src/lib/agents/somnio-v4/comprehension-prompt.ts` sigue siendo >= 5 (anclas existentes de secondary no borradas)
    - `grep -c "sub-loop/prompt.ts" src/lib/agents/somnio-v4/comprehension-prompt.ts` retorna 0 (Regla D-05 — no se toco el generation prompt)
    - `npx tsc --noEmit` sale con codigo 0
    - `npx vitest run src/lib/agents/somnio-v4/` verde (todos los tests pasan — schema nuevo no rompe nada)
    - NO hay cambio en las reglas de clasificacion de intent/confidence (solo se agregaron campos nuevos)
  </acceptance_criteria>
  <done>
    comprehension-schema.ts tiene primary_query como z.string().nullable(). comprehension-prompt.ts
    tiene instruccion primary_query paralela a secondary_query, 4 anclas actualizadas con primary_query,
    y regla SIEMPRE poblar extendida. tsc=0. Suite v4 verde.
    Commit: `feat(somnio-v4): [D-01/D-02] agregar primary_query a schema y prompt de comprehension`
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: slots.ts + somnio-v4-agent.ts — consumir primary_query (D-03 + D-04)</name>
  <read_first>
    src/lib/agents/somnio-v4/slots.ts (completo — ComputeSlotsArgs lineas 72-89; ragQuery del primario linea 129; patron secondary_query lineas 151-153; jsdoc del archivo que describe T-2)
    src/lib/agents/somnio-v4/somnio-v4-agent.ts (lineas 411-419 call site; lineas 435-450 evento comprehension_completed_v4)
    src/lib/agents/somnio-v4/__tests__/slots.test.ts (completo — la matriz de 4 casos + edges; los nuevos tests se agregan a este archivo)
  </read_first>
  <files>
    src/lib/agents/somnio-v4/slots.ts,
    src/lib/agents/somnio-v4/somnio-v4-agent.ts,
    src/lib/agents/somnio-v4/__tests__/slots.test.ts
  </files>
  <behavior>
    - slots.ts: ComputeSlotsArgs gana primaryQuery: string | null (gemelo de secondaryQuery)
    - slots.ts: ragQuery del slot primario usa primary_query cuando hay secundario, rawMessage cuando no (Regla 6 byte-identical para single-intent)
    - slots.ts: el jsdoc del modulo actualiza la nota T-2 del primario (era "rawMessage — D-04 only segments the secondary")
    - somnio-v4-agent.ts: call site agrega primaryQuery: analysis.intent.primary_query ?? null
    - somnio-v4-agent.ts: evento comprehension_completed_v4 loguea primary_query ?? null (simetrico a secondary_query que ya esta en linea 449)
    - slots.test.ts: 3 nuevos casos de regresion Regla 6 (ver behavior detallado abajo)
  </behavior>
  <action>
CHANGE 1 — slots.ts: agregar primaryQuery a ComputeSlotsArgs

En la interfaz ComputeSlotsArgs (lineas 72-89), agregar primaryQuery justo despues de secondaryQuery:

```typescript
  /**
   * Segmented sub-query for the primary intent (D-01/D-02 v4-dual-intent-query-split).
   * null when secondaryIntent === 'ninguno' or not available.
   * Used as ragQuery for low primary when a secondary exists (T-2 fix).
   */
  primaryQuery: string | null
```

CHANGE 2 — slots.ts: actualizar la logica ragQuery del slot primario (linea 129)

Localizar este comentario + linea:
```typescript
    // T-2: low primary uses the raw message (unpartitioned — D-04 only segments the secondary).
    ragQuery: primaryCoverage === 'low' ? rawMessage : null,
```

Reemplazar SOLO ese bloque de comentario + propiedad con:
```typescript
    // T-2 fix (v4-dual-intent-query-split D-03): low primary uses primary_query when a
    // secondary exists (segmented sub-query avoids contamination from the secondary's question).
    // Single-intent turns: secondaryIntent === 'ninguno' → exact rawMessage (byte-identical, Regla 6).
    // Defensive fallback to rawMessage if comprehension produced no primary_query despite a secondary.
    ragQuery: primaryCoverage === 'low'
      ? (secondaryIntent !== 'ninguno' ? (primaryQuery ?? rawMessage) : rawMessage)
      : null,
```

CHANGE 3 — slots.ts: actualizar destructuring en computeSlots para incluir primaryQuery

En la linea de destructuring de args (dentro de computeSlots, antes de la seccion "Primary slot"):
```typescript
  const {
    primaryIntent,
    primaryConfidence,
    secondaryIntent,
    secondaryConfidence,
    secondaryQuery,
    rawMessage,    // ← agregar primaryQuery despues de secondaryQuery
    threshold,
  } = args
```

Cambiar a:
```typescript
  const {
    primaryIntent,
    primaryConfidence,
    secondaryIntent,
    secondaryConfidence,
    secondaryQuery,
    primaryQuery,
    rawMessage,
    threshold,
  } = args
```

CHANGE 4 — slots.ts: actualizar el jsdoc T-2 del modulo (primeras lineas del archivo)

Localizar en el jsdoc del modulo:
```
 * T-2 sub-query selection:
 *   - low PRIMARY  → ragQuery = rawMessage (full message, behavior unchanged from today)
 *   - low SECONDARY → ragQuery = secondaryQuery (segmented sub-query from comprehension D-04);
```

Reemplazar esas dos lineas con:
```
 * T-2 sub-query selection (v4-dual-intent-query-split D-03 fix):
 *   - low PRIMARY with secondary present → ragQuery = primaryQuery ?? rawMessage (segmented, avoids contamination)
 *   - low PRIMARY single-intent → ragQuery = rawMessage (byte-identical to pre-fix, Regla 6)
 *   - low SECONDARY → ragQuery = secondaryQuery (segmented sub-query from comprehension D-04);
```

CHANGE 5 — somnio-v4-agent.ts: agregar primaryQuery al call site de computeSlots

Localizar el bloque computeSlots (lineas 411-419). Agregar `primaryQuery` despues de `secondaryQuery`:

```typescript
    const slotPlan: SlotPlan = computeSlots({
      primaryIntent: analysis.intent.primary,
      primaryConfidence: analysis.intent.intent_confidence,
      secondaryIntent: analysis.intent.secondary,
      secondaryConfidence: analysis.intent.secondary_confidence ?? null,
      secondaryQuery: analysis.intent.secondary_query ?? null,
      primaryQuery: analysis.intent.primary_query ?? null,   // ← AGREGAR
      rawMessage: input.message,
      threshold,
    })
```

CHANGE 6 — somnio-v4-agent.ts: loguear primary_query en comprehension_completed_v4

Localizar el evento comprehension_completed_v4 (lineas 435-450). Despues de la linea:
```typescript
      secondary_query: analysis.intent.secondary_query ?? null,
```
Agregar:
```typescript
      primary_query: analysis.intent.primary_query ?? null,
```

CHANGE 7 — slots.test.ts: agregar 3 nuevos casos de regresion al final del archivo

Agregar un nuevo describe block al final del archivo (antes del cierre `})` del describe principal):

```typescript
  // ============================================================
  // Regla 6 regressions — v4-dual-intent-query-split D-03
  // ============================================================
  describe('Regla 6 — single-intent byte-identical + primary_query usage', () => {

    // Invariant 1: single-intent => rawMessage exacto (byte-identical a pre-fix)
    it('single-intent low primary: ragQuery === rawMessage exacto (Regla 6 byte-identical)', () => {
      const result = computeSlots({
        primaryIntent: 'contraindicaciones',
        primaryConfidence: 0.25,
        secondaryIntent: 'ninguno',
        secondaryConfidence: null,
        secondaryQuery: null,
        primaryQuery: null,       // null cuando no hay secundario
        rawMessage: RAW_MESSAGE,
        threshold: THRESHOLD,
      })
      expect(result.primary.coverage).toBe('low')
      expect(result.primary.ragQuery).toBe(RAW_MESSAGE)  // byte-identical
    })

    // Invariant 2: dual-intent low primary con primary_query => usa primary_query
    it('dual-intent low primary con primary_query: ragQuery === primary_query (fix D-03)', () => {
      const PRIMARY_QUERY = 'puedo tomar el producto si consumo alcohol?'
      const result = computeSlots({
        primaryIntent: 'contraindicaciones',
        primaryConfidence: 0.25,
        secondaryIntent: 'tiempo_entrega',
        secondaryConfidence: 0.88,
        secondaryQuery: 'cuando llega el pedido a bucaramanga?',
        primaryQuery: PRIMARY_QUERY,
        rawMessage: 'lo puedo tomar si tomo alcohol? cuanto demora en llegar a bucaramanga',
        threshold: THRESHOLD,
      })
      expect(result.primary.coverage).toBe('low')
      expect(result.primary.ragQuery).toBe(PRIMARY_QUERY)   // usa la sub-query limpia
    })

    // Invariant 3: dual-intent low primary SIN primary_query (null) => fallback a rawMessage
    it('dual-intent low primary con primary_query=null: fallback defensivo a rawMessage', () => {
      const raw = 'lo puedo tomar si tomo alcohol? cuanto demora en llegar a bucaramanga'
      const result = computeSlots({
        primaryIntent: 'contraindicaciones',
        primaryConfidence: 0.25,
        secondaryIntent: 'tiempo_entrega',
        secondaryConfidence: 0.88,
        secondaryQuery: 'cuando llega el pedido a bucaramanga?',
        primaryQuery: null,   // comprehension no produjo primary_query — fallback defensivo
        rawMessage: raw,
        threshold: THRESHOLD,
      })
      expect(result.primary.coverage).toBe('low')
      expect(result.primary.ragQuery).toBe(raw)   // fallback a rawMessage sin crash
    })
  })
```
  </action>
  <verify>
    <automated>
      # slots.ts: primaryQuery en interfaz y en logica
      grep -n "primaryQuery" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/slots.ts

      # slots.ts: ragQuery del primario tiene el guard secondaryIntent !== 'ninguno'
      grep -n "secondaryIntent !== 'ninguno'" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/slots.ts

      # somnio-v4-agent.ts: primaryQuery en call site y en evento
      grep -n "primary_query\|primaryQuery" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/somnio-v4-agent.ts

      # tests nuevos en slots.test.ts
      grep -c "primaryQuery\|primary_query\|Regla 6" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/__tests__/slots.test.ts

      # TypeScript clean (critical — ComputeSlotsArgs debe satisfacerse en todos los call sites)
      npx tsc --noEmit 2>&1 | head -30

      # Suite completa v4 verde
      npx vitest run src/lib/agents/somnio-v4/ --reporter=verbose 2>&1 | tail -30
    </automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "primaryQuery: string | null" src/lib/agents/somnio-v4/slots.ts` retorna 1 (campo en interfaz)
    - `grep -c "primaryQuery" src/lib/agents/somnio-v4/slots.ts` retorna >= 4 (interfaz + destructuring + ragQuery logic + jsdoc)
    - `grep -n "secondaryIntent !== 'ninguno'" src/lib/agents/somnio-v4/slots.ts` retorna match en el bloque ragQuery del primary slot (Regla 6 guard)
    - El bloque ragQuery del primary slot contiene: `(secondaryIntent !== 'ninguno' ? (primaryQuery ?? rawMessage) : rawMessage)` — grep exacto: `grep -c "secondaryIntent !== 'ninguno' ? (primaryQuery" src/lib/agents/somnio-v4/slots.ts` retorna 1
    - `grep -c "primaryQuery: analysis\.intent\.primary_query" src/lib/agents/somnio-v4/somnio-v4-agent.ts` retorna 1 (call site)
    - `grep -c "primary_query: analysis\.intent\.primary_query" src/lib/agents/somnio-v4/somnio-v4-agent.ts` retorna 1 (evento observabilidad)
    - `grep -c "Regla 6" src/lib/agents/somnio-v4/__tests__/slots.test.ts` retorna >= 1 (describe block nuevo)
    - `grep -c "primaryQuery" src/lib/agents/somnio-v4/__tests__/slots.test.ts` retorna >= 3 (3 nuevos casos)
    - `npx tsc --noEmit` sale con codigo 0 (CRITICO — ComputeSlotsArgs tiene campo nuevo obligatorio; todos los call sites deben pasarlo)
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/slots.test.ts` — todos los tests pasan, incluyendo los 3 nuevos (describe 'Regla 6')
    - `npx vitest run src/lib/agents/somnio-v4/` verde (suite completa sin regresiones)
    - `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/somnio-v4/slots.ts src/lib/agents/somnio-v4/somnio-v4-agent.ts` retorna 0 matches en codigo nuevo (Regla 3 — este fix no toca DB)
  </acceptance_criteria>
  <done>
    slots.ts: ComputeSlotsArgs.primaryQuery agregado; ragQuery del primario usa primary_query cuando
    hay secundario, rawMessage cuando no (Regla 6 byte-identical). somnio-v4-agent.ts: call site pasa
    primaryQuery; evento comprehension_completed_v4 loguea primary_query. 3 nuevos tests de regresion
    Regla 6 en slots.test.ts (verde). tsc=0. Suite v4 completa verde.
    Commit: `feat(somnio-v4): [D-03/D-04] consumir primary_query en computeSlots y call site`
  </done>
</task>

<task type="auto">
  <name>Task 3: Verificacion final + push (Regla 1)</name>
  <read_first>
    No se requiere lectura de codigo — solo comandos de verificacion.
  </read_first>
  <files>
    (ninguno — solo verificacion y push)
  </files>
  <action>
Ejecutar los siguientes comandos de verificacion en secuencia y confirmar que todos pasan:

STEP A — TypeScript limpio (predictor del build de Vercel):
```bash
npx tsc --noEmit
# Esperado: exit code 0. Si falla, revisar call sites de ComputeSlotsArgs —
# el campo primaryQuery es OBLIGATORIO en la interfaz. Verificar que todos los
# puntos donde se llama computeSlots pasen el campo (puede haber otros call sites
# ademas de somnio-v4-agent.ts — grep para encontrarlos).
```

STEP B — Suite completa somnio-v4:
```bash
npx vitest run src/lib/agents/somnio-v4/ --reporter=verbose
# Esperado: todos los tests verdes, incluyendo los 3 nuevos en slots.test.ts describe 'Regla 6'.
```

STEP C — Regla 6 anti-regresion (cero archivos de otros agentes tocados):
```bash
git diff --name-only | grep -vE "somnio-v4|v4-dual-intent"
# Esperado: 0 lineas — todos los archivos modificados son del scope somnio-v4.
```

STEP D — Invariantes de contenido clave:
```bash
# D-01: primary_query en schema
grep -c "primary_query: z.string().nullable()" src/lib/agents/somnio-v4/comprehension-schema.ts
# Esperado: 1

# D-02: primary_query en prompt (instruccion + anclas + regla SIEMPRE)
grep -c "primary_query" src/lib/agents/somnio-v4/comprehension-prompt.ts
# Esperado: >= 5

# D-03: guard Regla 6 en slots.ts
grep -c "secondaryIntent !== 'ninguno'" src/lib/agents/somnio-v4/slots.ts
# Esperado: >= 1 (el guard en el ragQuery del primary slot)

# D-05: generation prompt NO tocado
git diff -- src/lib/agents/somnio-v4/sub-loop/prompt.ts
# Esperado: 0 lineas de diff (archivo sin cambios)
```

STEP E — Push a Vercel (Regla 1):
```bash
git push origin main
# v4 sigue DORMANT — el push es seguro. No activa ningun comportamiento nuevo para
# usuarios finales. Los cambios solo afectan code paths de somnio-sales-v4 sin trafico.
```

STEP F — (Opcional pero recomendado) Probe de validacion en vivo:
```bash
npx tsx scripts/_v4-probe-generation.ts
# Confirma que el primario ya no se contamina cuando comprehension produce primary_query limpia.
# Esperado: query combinada (rawMessage) -> ~0.6/FALTA_INFO (comportamiento pre-fix para comparar)
#           query aislada (primary_query) -> ~0.95/RESPONDE_BIEN (post-fix)
# El probe es READ-ONLY — no modifica ningun estado en la DB.
# Si hay diferencia entre pre y post, confirma que el fix funciona de extremo a extremo.
```
  </action>
  <verify>
    <automated>
      npx tsc --noEmit && echo "tsc OK"
      npx vitest run src/lib/agents/somnio-v4/ --reporter=verbose 2>&1 | tail -10
      git diff --name-only | grep -vE "somnio-v4|v4-dual-intent" | wc -l
    </automated>
  </verify>
  <acceptance_criteria>
    - `npx tsc --noEmit` sale con exit code 0
    - `npx vitest run src/lib/agents/somnio-v4/` — todos los tests verdes (incluyendo 3 nuevos Regla 6 en slots.test.ts)
    - `git diff --name-only | grep -vE "somnio-v4|v4-dual-intent" | wc -l` retorna 0 (Regla 6 — cero otros agentes tocados)
    - `grep -c "primary_query" src/lib/agents/somnio-v4/comprehension-schema.ts` = 1
    - `grep -c "primary_query" src/lib/agents/somnio-v4/comprehension-prompt.ts` >= 5
    - `git diff -- src/lib/agents/somnio-v4/sub-loop/prompt.ts` = vacio (D-05 — generation prompt intacto)
    - `git push origin main` completa sin error y Vercel despliega exitosamente
  </acceptance_criteria>
  <done>
    tsc=0. Suite v4 verde. Cero archivos de otros agentes modificados. sub-loop/prompt.ts intacto.
    Push a origin/main completado. v4 sigue DORMANT.
    Commit final ya estaba creado en Task 2 — el push lleva los 2 commits al remoto.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| LLM output → comprehension schema | primary_query es un string nullable producido por Gemini 2.5 Flash; llega deserializado via Zod antes de llegar a slots.ts |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v4diq-01 | Tampering | primary_query value from LLM | accept | Valor usado solo como ragQuery en el sub-loop (generacion RAG). Maxima consecuencia: respuesta RAG de menor calidad si el LLM produce una sub-query malformada. Fallback defensivo a rawMessage si primary_query=null. Sin exec de codigo, sin escritura a DB. |
| T-v4diq-02 | Information Disclosure | primary_query en comprehension_completed_v4 event | accept | Datos de calibracion interna (sub-query del cliente, sin PII adicional). Tabla agent_observability_events accesible solo por operadores autorizados del workspace. Mismo nivel de riesgo que secondary_query ya logueado (linea 449). |
| T-v4diq-03 | Denial of Service | primary_query null cuando secondary presente (fallback rawMessage) | mitigate | El fallback defensivo `primaryQuery ?? rawMessage` garantiza que el sub-loop recibe siempre una query valida — nunca undefined ni crash. Regresion al comportamiento pre-fix si comprehension falla en producir primary_query. |
</threat_model>

<verification>
Verificacion final del standalone:

```bash
# 1. tsc clean (predictor de Vercel build)
npx tsc --noEmit
# Esperado: exit code 0

# 2. Suite somnio-v4 completa
npx vitest run src/lib/agents/somnio-v4/ --reporter=verbose
# Esperado: todos los tests verdes — incluyendo los 3 nuevos Regla 6 en slots.test.ts
# (describe 'Regla 6 — single-intent byte-identical + primary_query usage')

# 3. Regla 6 — cero archivos de otros agentes modificados
git diff --name-only | grep -vE "somnio-v4|v4-dual-intent"
# Esperado: 0 lineas

# 4. D-05 invariant — generation prompt intacto
git diff -- src/lib/agents/somnio-v4/sub-loop/prompt.ts
# Esperado: 0 lineas de diff

# 5. Contenido clave (resumen rapido)
grep -c "primary_query" src/lib/agents/somnio-v4/comprehension-schema.ts   # Esperado: 1
grep -c "primary_query" src/lib/agents/somnio-v4/comprehension-prompt.ts   # Esperado: >= 5
grep -c "primaryQuery" src/lib/agents/somnio-v4/slots.ts                   # Esperado: >= 4
grep -c "primaryQuery" src/lib/agents/somnio-v4/somnio-v4-agent.ts         # Esperado: 1 (call site)
grep -c "primary_query" src/lib/agents/somnio-v4/somnio-v4-agent.ts        # Esperado: 1 (observabilidad)
grep -c "Regla 6" src/lib/agents/somnio-v4/__tests__/slots.test.ts         # Esperado: >= 1
```
</verification>

<success_criteria>
- comprehension-schema.ts tiene `primary_query: z.string().nullable()` justo despues de secondary_query.
- comprehension-prompt.ts tiene instruccion primary_query paralela a secondary_query; las 4 anclas MULTI-INTENT muestran primary_query junto a secondary_query; la regla SIEMPRE poblar incluye primary_query cuando secondary != 'ninguno'.
- slots.ts: ComputeSlotsArgs tiene `primaryQuery: string | null`; ragQuery del slot primario usa `secondaryIntent !== 'ninguno' ? (primaryQuery ?? rawMessage) : rawMessage` cuando coverage='low'.
- somnio-v4-agent.ts: call site de computeSlots pasa `primaryQuery: analysis.intent.primary_query ?? null`; evento comprehension_completed_v4 loguea `primary_query: analysis.intent.primary_query ?? null`.
- slots.test.ts: 3 nuevos tests en describe 'Regla 6' (single-intent byte-identical; dual-intent usa primary_query; fallback null->rawMessage) — todos verdes.
- `npx tsc --noEmit` = exit code 0.
- `npx vitest run src/lib/agents/somnio-v4/` = todos los tests verdes.
- sub-loop/prompt.ts sin cambios (D-05).
- Cero archivos de v3/godentist/recompra/pw-confirmation modificados (Regla 6).
- v4 sigue DORMANT en prod (sin cambio en routing_rules ni workspace_agent_config).
- `git push origin main` completado (Regla 1).
</success_criteria>

<output>
Despues de completar las 3 tareas, crear:
`.planning/standalone/v4-dual-intent-query-split/01-SUMMARY.md`

Con el formato estandar (@$HOME/.claude/get-shit-done/templates/summary.md):
- Descripcion del bug y el fix (causa raiz, query contaminada vs limpia, archivos tocados)
- D-01: campo primary_query en schema (linea exacta)
- D-02: cambios en comprehension-prompt.ts (instruccion + 4 anclas + regla SIEMPRE)
- D-03: cambio ragQuery en slots.ts (logica antes/despues)
- D-04: call site somnio-v4-agent.ts + observabilidad
- Regla 6: confirmacion byte-identical single-intent + cero archivos externos
- D-05: confirmacion que sub-loop/prompt.ts NO fue tocado
- Tests nuevos: 3 casos Regla 6 en slots.test.ts
- Deuda residual: handoff del primario cortaba el secundario (bug orquestacion separado), responseText en observabilidad (punto ciego conocido)
</output>
