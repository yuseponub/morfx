import { TONE_BASE } from './tone-base'
import { FEW_SHOTS } from './few-shots'
import type { ToolingOutput } from './tooling-call'
import type { SubLoopReason } from './output-schema'

/**
 * Sub-loop prompt builders — split por call (Plan 03 RAG-generative refactor).
 *
 * Hay 2 builders:
 *   - buildToolingPrompt(reason) → system prompt para CALL 1 (GPT-4o mini con kb_search).
 *     Para low_confidence/razonamiento_libre: instruye seleccionar UN topic + emitir
 *     material parseado (D-11). NO redactar respuesta al cliente.
 *     Para crm_mutation/cas_reject: PRESERVA verbatim el prompt viejo (D-12 — flujo
 *     legacy single-call sigue intacto para esos paths).
 *
 *   - buildGenerationPrompt(material, toneBase, fewShots) → system prompt para CALL 2
 *     (Gemini Flash con Output.object SIN tools). Compone tono + reglas anti-invención
 *     duras + calibración M1 (PROBABILIDAD framing) + M2 (5 buckets discretos) + M3
 *     backstop (binary enum) + M4 few-shots (FEW_SHOTS by default — Plan 04 wired) +
 *     material del topic ganador.
 *
 * Anti-patterns aplicados:
 * - D-09: scope acotado por reason — el prompt no le da autonomía amplia.
 * - D-12: crm_mutation/cas_reject preservados verbatim del flujo viejo.
 * - mutation-tools Pitfall 1: cas_reject NO retry implícito (máximo 1 intento).
 *
 * Standalone: somnio-v4-rag-generative / Plan 03.
 */

/**
 * Few-shot calibration example shape (Plan 04 — wired).
 *
 * Plan 03 acepta `fewShots: FewShot[] = []` como default; Plan 04 lo cambia a
 * `fewShots: FewShot[] = FEW_SHOTS` (importado de './few-shots') — los 10 examples
 * calibrados del corpus REAL ya se inyectan by default.
 *
 * Aplicación M1+M2+M3+M4 (RESEARCH A1):
 * - M2 (discretización): cada few-shot usa confidence ∈ {0.20, 0.40, 0.60, 0.80, 0.95}.
 * - M3 (binary backstop): binary ∈ {RESPONDE_BIEN, FALTA_INFO, FUERA_SCOPE}.
 * - M4 (cobertura): 10 few-shots — 2 por cada uno de los 5 buckets de confidence.
 */
export type FewShot = {
  pregunta: string
  material: string
  respuesta: string
  confidence: number
  rationale: string
  binary: 'RESPONDE_BIEN' | 'FALTA_INFO' | 'FUERA_SCOPE'
}

/**
 * CALL 1 system prompt builder. Switch por reason.
 *
 * - 'low_confidence' | 'razonamiento_libre' → instruye selección de topic + emitir
 *   material parseado para CALL 2. EXPLICITAMENTE NO redactar respuesta al cliente.
 * - 'crm_mutation' | 'cas_reject' → PRESERVA verbatim el prompt viejo (D-12).
 */
export function buildToolingPrompt(reason: SubLoopReason): string {
  switch (reason) {
    case 'crm_mutation':
      return buildLegacyCommon() +
        `\n\nReason actual: crm_mutation. ` +
        `El state machine quiere ejecutar una mutación CRM (createOrder/updateOrder/moveOrderToStage/etc.). ` +
        `Verifica precondiciones con getActiveOrderByPhone si es necesario. ` +
        `Si la mutación falla con stage_changed_concurrently → no_match (handoff). ` +
        `Si succeed → status='template' apuntando al template apropiado (pendiente_*).`

    case 'cas_reject':
      return buildLegacyCommon() +
        `\n\nReason actual: cas_reject. ` +
        `Una mutación moveOrderToStage retornó stage_changed_concurrently (otra fuente movió el pedido). ` +
        `Re-leer el estado del pedido con getActiveOrderByPhone, decidir si re-intentar el move ` +
        `o escalar a humano (no_match). NO reintentes en loop — máximo 1 retry.`

    case 'low_confidence':
      return buildRagToolingPrompt('low_confidence')

    case 'razonamiento_libre':
      return buildRagToolingPrompt('razonamiento_libre')
  }
}

/**
 * Common header del prompt LEGACY (path crm_mutation/cas_reject). Preserva el
 * contrato del flujo viejo: 3 status posibles (template/canonical/no_match) +
 * NUNCA texto libre + canonical verbatim del KB.
 *
 * NOTA D-12: este path NO emite status='generated'. El schema acepta 'generated'
 * solo para el flujo RAG nuevo (low_confidence/razonamiento_libre). Para
 * crm_mutation/cas_reject los outputs son 'template' o 'no_match' (la canonical
 * verbatim path queda obsoleta — Tasks 3.7+3.8 redirigen lo que era 'canonical'
 * a 'no_match' handoff_humano si el agente legacy intenta producirla).
 */
function buildLegacyCommon(): string {
  return (
    `Eres el sub-loop del agente conversacional Somnio v4 — path LEGACY (D-12). ` +
    `Tu trabajo es decidir cómo responder al cliente cuando el state machine no pudo. ` +
    `Tienes ESTRICTAMENTE 2 opciones de output (LoopOutcome) para este path:\n` +
    `  1) status='template' → seleccionar un template existente del catálogo Somnio v4. ` +
    `Devuelves su intent en responseTemplate.\n` +
    `  2) status='no_match' → handoff humano. Usar cuando ningún tool resuelve. ` +
    `responseTemplate='handoff_humano' literal.\n\n` +
    `NUNCA generes texto libre. ` +
    `Toda respuesta al cliente sale de templates aprobados o escala a humano.`
  )
}

/**
 * NUEVO prompt para CALL 1 cuando reason es low_confidence o razonamiento_libre.
 * Instruye a GPT-4o mini a:
 *   1. Llamar kb_search(query) con la query del cliente.
 *   2. Razonar sobre los 3 hits.
 *   3. SELECCIONAR UN topic ganador (D-11) — el que mejor responda la pregunta.
 *   4. Emitir output schema: topic_seleccionado + material_del_topic (copiar verbatim
 *      Hechos / Posición / Debe contener relevantes / NUNCA decir / Cuándo escalar
 *      del topic ganador) + should_handoff + handoff_reason.
 *
 * CRITICAL: NO redactar respuesta al cliente. La redacción la hace otro modelo
 * (Gemini Flash en CALL 2) usando el material como insumo.
 */
function buildRagToolingPrompt(reason: 'low_confidence' | 'razonamiento_libre'): string {
  const reasonHint = reason === 'low_confidence'
    ? `El comprehension Gemini no pudo clasificar con certeza el mensaje del cliente.`
    : `El cliente dijo algo fuera del flujo de venta (filosofía, anécdotas, divagaciones, preguntas tangenciales sobre sueño).`

  return (
    `Eres el sub-loop del agente conversacional Somnio v4 — path RAG-generative tooling call (Plan 03).\n\n` +
    `Reason actual: ${reason}. ${reasonHint}\n\n` +
    `Tu trabajo NO es redactar la respuesta al cliente. ` +
    `La redacción la hace OTRO modelo después usando el material que vos emitís.\n\n` +
    `PROCEDIMIENTO:\n` +
    `1. PRIMERA búsqueda — OBLIGATORIO: llamá kb_search(query) con la pregunta del cliente\n` +
    `   VERBATIM (textual, sin reformular, sin extraer keywords, sin agregar contexto).\n` +
    `   Si la pregunta es "tengo gastritis ocasional, puedo tomarlo?", la query DEBE ser\n` +
    `   exactamente esa frase. NO la conviertas a "gastritis Elixir del Sueño" ni a\n` +
    `   "contraindicaciones X" ni a ningún otro reformulado.\n` +
    `   Razón: el KB se indexa con embedding del scope_summary completo. El verbatim del\n` +
    `   cliente conserva verbos y patrones ("tengo X + puedo Y") que matchean mejor los\n` +
    `   anclajes semánticos del scope_summary. Reformular pierde ese matching.\n` +
    `2. Razoná sobre los hits (hasta 3, ordenados por similarity).\n` +
    `3. Si el top-1 de la primera búsqueda parece encajar claramente (sim ≥ 0.30 + topic\n` +
    `   conceptualmente relevante al caso del cliente), USALO. NO hagas búsqueda extra.\n` +
    `4. SEGUNDA búsqueda — SOLO si el top-1 de la primera no encaja: podés hacer 1 búsqueda\n` +
    `   adicional reformulada (sinónimo o paráfrasis amplia, no extracción de keywords).\n` +
    `5. SELECCIONÁ UN topic ganador (D-11) — el que mejor responda la pregunta ESPECÍFICA\n` +
    `   del cliente. RESTRICCIÓN: SOLO podés elegir un topic que aparezca en los hits\n` +
    `   retrievados por kb_search. NUNCA un topic que no haya sido devuelto.\n` +
    `6. Emití el output schema:\n` +
    `   - topic_seleccionado: nombre del topic ganador (o null si ninguno aplica).\n` +
    `   - material_del_topic: copiá VERBATIM del hit ganador:\n` +
    `       * hechos: contenido de "hechosDelProducto" del hit.\n` +
    `       * posicion: contenido de "posicionDelNegocio" del hit.\n` +
    `       * debe_contener_aplicables: items de "debeContener" RELEVANTES al caso del cliente\n` +
    `         (filtrá [SIEMPRE] todos + [SI APLICA] los que matcheen con la situación).\n` +
    `       * nunca_decir: copiá VERBATIM "nuncaDecirRules" del hit.\n` +
    `       * cuando_escalar: copiá VERBATIM "cuandoEscalar" del hit.\n` +
    `   - should_handoff: false si encontraste topic relevante; true si NINGÚN hit aplica.\n` +
    `   - handoff_reason: corto (ej: "no_relevant_hit") — observability.\n\n` +
    `REGLAS:\n` +
    `- Máximo 2 búsquedas kb_search. Si tras 2 búsquedas no hay topic relevante, emite\n` +
    `  should_handoff=true con material_del_topic=null + topic_seleccionado=null.\n` +
    `- NO inventes contenido del material — TODO viene VERBATIM del hit ganador.\n` +
    `- NO emitas texto destinado al cliente — sólo el material parseado para CALL 2.\n` +
    `- NO elijas un topic_seleccionado que no esté en los hits retornados por kb_search.`
  )
}

/**
 * CALL 2 system prompt builder (Gemini Flash + Output.object).
 *
 * Estructura:
 *   - TONE_BASE (D-05 global Somnio).
 *   - Reglas anti-invención duras.
 *   - Calibración M1 (PROBABILIDAD framing) + M2 (5 buckets discretizados) + M3 (binary backstop).
 *   - Few-shots (Plan 04 inyecta — Plan 03 acepta array vacío).
 *   - Material del topic ganador (de tooling-call.ToolingOutput.material_del_topic).
 *
 * @param material - de tooling-call.ToolingOutput.material_del_topic (non-null por contrato — orchestrator only calls cuando topic_seleccionado !== null).
 * @param toneBase - default TONE_BASE (D-05). Override per-topic via parser.tone_override en futuro.
 * @param fewShots - default FEW_SHOTS (10 calibration examples del corpus real — Plan 04 wired).
 */
export function buildGenerationPrompt(
  material: NonNullable<ToolingOutput['material_del_topic']>,
  toneBase: string = TONE_BASE,
  fewShots: FewShot[] = FEW_SHOTS,
): string {
  const debeContener = (material.debe_contener_aplicables ?? [])
    .map((item) => `- ${item}`)
    .join('\n') || '(sin items aplicables)'

  const nuncaDecir = (material.nunca_decir ?? [])
    .map((item) => `- ${item}`)
    .join('\n') || '(sin reglas explícitas)'

  const cuandoEscalar = (material.cuando_escalar ?? [])
    .map((item) => `- ${item}`)
    .join('\n') || '(sin triggers explícitos)'

  const fewShotsBlock = fewShots.length === 0
    ? `(sin few-shots — el modelo confía en las reglas duras + M2 buckets discretos arriba)`
    : `EJEMPLOS DE CALIBRACIÓN (few-shots — M4 cobertura del rango completo 0.20-0.95):\n\n` +
      fewShots.map((fs, i) =>
        `### Few-shot ${i + 1}:\n` +
        `Pregunta del cliente: ${fs.pregunta}\n` +
        `Material disponible:\n${fs.material}\n` +
        `Respuesta esperada: ${fs.respuesta || '(handoff silente — responseText vacío)'}\n` +
        `responseConfidence: ${fs.confidence} — ${fs.rationale}\n` +
        `binary: ${fs.binary}`,
      ).join('\n\n')

  return (
    `${toneBase}\n\n` +
    `REGLAS DURAS DE ANTI-INVENCIÓN:\n\n` +
    `1. SOLO usá la información presentada abajo en "MATERIAL DEL TOPIC".\n` +
    `2. PROHIBIDO mencionar marcas, dosis, condiciones, sustancias, o reglas que\n` +
    `   NO aparezcan literalmente en el material. Ejemplos de invención prohibida:\n` +
    `   - Si el material dice "anticoagulantes", NO menciones "warfarina" específicamente\n` +
    `     a menos que esté en el material.\n` +
    `   - Si el cliente pregunta por "lupus" y el material dice "autoinmunes" genérico,\n` +
    `     NO afirmes nada específico de lupus — reportá responseConfidence ≤ 0.40 + binary\n` +
    `     "FALTA_INFO".\n` +
    `   - Si el cliente pregunta por "Miami" y el material dice "envíos en Colombia", NO\n` +
    `     improvises políticas de envío internacional — responseConfidence ≤ 0.30 + binary\n` +
    `     "FUERA_SCOPE".\n` +
    `3. Si te falta material para responder con precisión, REPORTÁ confidence bajo (≤ 0.60)\n` +
    `   y un binary { FALTA_INFO | FUERA_SCOPE }. El sistema escalará a humano. No es un\n` +
    `   error — es lo correcto.\n` +
    `4. La empresa PREFIERE handoffs que respuestas inventadas. NUNCA "lo intentes" si\n` +
    `   no tenés base. El silencio cuesta menos que la información incorrecta.\n\n` +
    `CALIBRACIÓN DEL responseConfidence (M1 — RESEARCH A1):\n\n` +
    `El responseConfidence (0.0 a 1.0) debe ser tu mejor estimación de:\n\n` +
    `  "¿Cuál es la PROBABILIDAD de que tu respuesta cumpla FIELMENTE la Posición del negocio\n` +
    `   y los items 'Debe contener' aplicables del material, SIN inventar contenido fuera del KB?"\n\n` +
    `Nota importante: si la Posición del KB indica una acción (ej: 'derivar al médico tratante',\n` +
    `'recomendar consulta profesional', 'sugerir validación') y tu respuesta cumple esa acción\n` +
    `con el material disponible, ESA ES una respuesta FIEL — independiente de si el KB cubre\n` +
    `el caso del cliente de forma literal o sólo genérica. NO confundas 'cumplir la posición\n` +
    `del KB' con 'tener data específica del caso del cliente'.\n\n` +
    `Nota sobre escalación: NO te preocupes por evaluar si el caso requiere handoff humano.\n` +
    `Un verifier independiente post-generación (compliance-check) revisa eso usando la lista\n` +
    `[Cuándo escalar a humano] del material. Tu trabajo aquí es redactar la mejor respuesta\n` +
    `posible con el material disponible — el verifier decide si hay que escalar.\n\n` +
    `Usá SÓLO estos 5 buckets (M2 — discretizada): 0.20, 0.40, 0.60, 0.80, 0.95.\n` +
    `NO uses valores intermedios tipo 0.42, 0.67, 0.89.\n\n` +
    `BACKSTOP BINARIO (M3):\n\n` +
    `Después del confidence numérico, respondé:\n` +
    `- "RESPONDE_BIEN": si tu respuesta usa SOLO material del KB y cubre la pregunta específica.\n` +
    `- "FALTA_INFO": si necesitarías más data (sobre el cliente, el producto, una condición no listada).\n` +
    `- "FUERA_SCOPE": si la pregunta no está en el material en absoluto.\n\n` +
    `${fewShotsBlock}\n\n` +
    `MATERIAL DEL TOPIC SELECCIONADO:\n\n` +
    `[Hechos del producto]\n` +
    `${material.hechos ?? '(sin Hechos en el material)'}\n\n` +
    `[Posición del negocio]\n` +
    `${material.posicion ?? '(sin Posición en el material)'}\n\n` +
    `[Debe contener la respuesta — items aplicables al caso]\n` +
    `${debeContener}\n\n` +
    `[NUNCA decir]\n` +
    `${nuncaDecir}\n\n` +
    `[Cuándo escalar a humano] ← lo evalúa el compliance-check post-generación\n` +
    `${cuandoEscalar}\n\n` +
    `Ahora redactá la respuesta al cliente siguiendo el tono Somnio + reglas + material. ` +
    `Emití responseText + responseConfidence (5 buckets) + confidenceRationale (1 frase) + binary.`
  )
}

/**
 * DEPRECATED — alias de buildToolingPrompt para callers legacy que aún importan
 * `buildSubLoopPrompt`. Será eliminado tras migración completa (Task 3.8 sub-loop/index.ts
 * actualizado). Mantenido temporalmente para no romper external consumers en otros
 * archivos durante el refactor — typecheck transition aid.
 *
 * @deprecated Use buildToolingPrompt instead.
 */
export const buildSubLoopPrompt = buildToolingPrompt
