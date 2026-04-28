/**
 * Somnio Sales v3 PW-Confirmation Agent — Comprehension Prompt Builder
 *
 * System prompt for Claude Haiku structured output (single call per turn).
 * Fork of somnio-recompra/comprehension-prompt.ts adapted for POST-PURCHASE context.
 *
 * Key differences vs sales-v3 / recompra prompts:
 *   - "El cliente YA HIZO UN PEDIDO" framing (NOT prospect agent).
 *   - 22 intents = 14 informational + 7 sales/post-purchase + 1 fallback.
 *   - D-26 state-machine guard: respuesta afirmativa en awaiting_confirmation
 *     → intent = confirmar_pedido (sin consultar messages.template_name).
 *   - CRM context section conditional (D-05 BLOQUEANTE — reader corrió antes).
 *   - Excluded intents: quiero_comprar, seleccion_pack (no aplican post-compra).
 *
 * Consumed by `comprehension.ts` `analyzeMessage(...)` for the system prompt.
 *
 * Sections (separated by ---):
 *   1. Producto         — ELIXIR DEL SUEÑO (precios, INVIMA, envíos, contraentrega)
 *   2. Tu rol           — post-purchase context, 7 acciones disponibles
 *   3. Intent list      — 22 intents con descripciones breves
 *   4. Extracción       — datos_extraidos rules (telefono normalize, direccion solo texto)
 *   5. Estado actual    — state.phase + nota D-26 explícita
 *   6. CRM context      — conditional (cuando crmContext disponible) o degradación
 *   7. Conversación     — últimos 6 turnos del history
 */

interface BuildPwConfirmationPromptInput {
  /**
   * Current state machine snapshot — used to print `state.phase` (or equivalent)
   * in the "Estado actual" section. Shape is `unknown` because Plan 06 (state.ts)
   * defines the full type later; the prompt builder only needs to read `phase` /
   * `currentState` if they exist.
   */
  state: unknown

  /**
   * Conversation history — last N turns. Builder slices to the last 6 turns.
   * Each turn must have `role: 'user' | 'assistant'` and `content: string`.
   */
  history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>

  /**
   * CRM context — `_v3:crm_context` value preloaded by Plan 09 Inngest function
   * (D-05 BLOQUEANTE: reader corrió ANTES de invocar al agente). When present
   * the prompt includes a dedicated section with the rich payload (active_order,
   * shipping fields, etc.). When missing or empty: degradación graceful con
   * instrucción al LLM de pedir al cliente datos faltantes.
   */
  crmContext?: string
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract `phase` (or `currentState` / `state`) from the opaque state object
 * for printing in the "Estado actual" section. Defensive: returns 'desconocido'
 * if the state shape is missing.
 */
function extractPhase(state: unknown): string {
  if (!state || typeof state !== 'object') return 'desconocido'
  const s = state as Record<string, unknown>

  if (typeof s.phase === 'string' && s.phase.length > 0) return s.phase
  if (typeof s.currentState === 'string' && s.currentState.length > 0)
    return s.currentState
  if (typeof s.state === 'string' && s.state.length > 0) return s.state

  return 'desconocido'
}

/**
 * Format the last 6 turns of conversation as `Cliente:`/`Bot:` lines.
 */
function formatHistory(
  history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>
): string {
  if (history.length === 0) return '(Sin historial — primer mensaje del cliente)'
  return history
    .slice(-6)
    .map(h => {
      const speaker = h.role === 'user' ? 'Cliente' : 'Bot'
      return `${speaker}: ${h.content}`
    })
    .join('\n')
}

// ============================================================================
// Main builder
// ============================================================================

export function buildPwConfirmationPrompt(
  input: BuildPwConfirmationPromptInput
): string {
  const { state, history, crmContext } = input

  const currentPhase = extractPhase(state)
  const historyFormatted = formatHistory(history)

  const hasCrmContext =
    typeof crmContext === 'string' && crmContext.trim().length > 0
  const crmSection = hasCrmContext
    ? `${crmContext.trim()}

(Usa este contexto para personalizar la comprension: detecta datos faltantes en el pedido — direccion, ciudad, departamento, telefono — y clasifica el intent considerando el estado real del pedido. NO reinventes datos; lo que NO esta aqui o en el mensaje del cliente, NO lo extraigas.)`
    : `(No disponible — error o timeout del CRM reader. Procede con cautela; si necesitas datos del pedido para responder, pide al cliente que confirme su numero de pedido o nombre completo. NO inventes datos del pedido.)`

  return `Eres un analizador de mensajes para el agente PW-Confirmation de Somnio.

---

## 1. Producto

ELIXIR DEL SUEÑO — suplemento natural para dormir (melatonina + magnesio, 90 comprimidos por frasco).

PRECIOS: 1 frasco = $77,900 | 2 frascos = $109,900 | 3 frascos = $139,900 (envio gratis nacional).
PAGO: Contraentrega (paga al recibir el pedido).
ENVIO: Gratis a nivel nacional via Interrapidisimo o Coordinadora. Tiempos varian por ciudad/municipio:
  - Mismo dia (Bogota / Medellin / Cali / Bucaramanga capitales)
  - Dia siguiente (capitales departamentales)
  - 1-3 dias / 2-4 dias (otros municipios)
REGISTRO SANITARIO: INVIMA / PHARMA SOLUTIONS SAS.

---

## 2. Tu rol

CONTEXTO CRITICO: el cliente YA HIZO UN PEDIDO. NO eres un agente de prospeccion / preventa.
Tu misión es llevar el pedido existente desde uno de los 3 stages de entrada
(NUEVO PAG WEB / FALTA INFO / FALTA CONFIRMAR) hasta CONFIRMADO o handoff humano.

Antes de tu primer mensaje al cliente, ya se enviaron por automation 3 templates:
  1. \`pedido_recibido_v2\`  — saludo + items + total + envio gratis
  2. \`direccion_entrega\`   — confirmacion de la direccion
  3. \`confirmar_compra\`    — pregunta directa de confirmacion ("Deseas confirmar tu compra?")

Por tanto: el cliente entra a la conversacion en estado \`awaiting_confirmation\` (D-26).

Acciones que puede tomar el sistema (estado de la maquina decide cual):
  1. CONFIRMAR pedido     -> mover a CONFIRMADO + emitir confirmacion_orden_*.
  2. CAPTURAR datos       -> pedir nombre / apellido / telefono / shippingAddress / shippingCity / shippingDepartment.
  3. ACTUALIZAR direccion -> via crm-writer cuando cliente pide cambiarla.
  4. RESPONDER pregunta   -> emitir template informacional (precio, envio, contraindicaciones, etc).
  5. ESCALAR a humano     -> handoff cuando cancela definitivo, pide asesor, o flujo fuera de scope.
  6. MOVER a FALTA CONFIRMAR -> cliente dice "espera lo pienso / ya te confirmo".
  7. PREGUNTAR agendar    -> primera respuesta al "no" del cliente (D-11).

NO PUEDES: crear pedidos nuevos (eso es scope del agente sales-v3, no este). Si detectas que el cliente
quiere comprar otra cosa adicional, clasifica como \`editar_items\` y el sistema escalara a humano (D-13 V1).

---

## 3. Intents disponibles (22 total)

INFORMACIONALES (responden con templates de catalogo):
  - saludo            → "hola", "buenos dias", "buenas"
  - precio            → "cuanto vale?", "precio?", "cuanto cuesta?"
  - promociones       → "que promociones?", "tienen combos?"
  - contenido         → "cuantas pastillas trae?", "cuanto contiene el frasco?"
  - formula           → "que ingredientes tiene?", "de que esta hecho?", "composicion?"
  - como_se_toma      → "como se toma?", "dosis?", "cuantas al dia?"
  - pago              → "puedo pagar contraentrega?", "aceptan transferencia?"
  - envio             → "hacen envios?", "por donde envian?", "envian a Cali?"
  - ubicacion         → "donde estan?", "tienen tienda fisica?"
  - contraindicaciones → "tiene efectos secundarios?", "es seguro?"
  - dependencia       → "causa adiccion?", "se puede dejar de tomar?"
  - efectividad       → "si funciona?", "es efectivo de verdad?"
  - registro_sanitario → "tiene INVIMA?", "es legal?", "quien lo fabrica?"
  - tiempo_entrega    → "cuanto se demora?", "cuando llega?", "en cuantos dias?"

POST-COMPRA / SALES ACTIONS:
  - confirmar_pedido  → respuesta afirmativa: "si", "dale", "ok", "confirmo", "listo", "correcto", "👍"
  - cancelar_pedido   → "no", "no quiero", "cancelar", "ya no", "no me interesa"
  - esperar           → "espera lo pienso", "ya te confirmo", "luego te aviso", "manana"
  - cambiar_direccion → "cambiar la direccion", "otra direccion", "mejor envialo a..."
  - editar_items      → "agregar producto", "quitar uno", "cambiar cantidad" (V1 → handoff humano)
  - agendar           → respuesta afirmativa cuando el bot pregunto "deseas agendar?" (segundo turno tras "no")
  - pedir_humano      → "asesor", "humano", "persona", "operador", "hablar con alguien"

FALLBACK:
  - fallback          → mensaje no clasificable, ambiguo, o sin sentido en este contexto.

REGLA CRITICA D-26 (state-machine guard):
Si el estado actual de la maquina es \`awaiting_confirmation\` o \`awaiting_confirmation_post_data_capture\`,
una respuesta afirmativa del cliente (si / dale / ok / correcto / listo / confirmo / 👍) DEBE clasificarse
como \`confirmar_pedido\`. NO requiere validar el ultimo template enviado — el estado de la maquina es
el guard. NO consultes \`messages.template_name\` (esa columna es informativa, no autoritativa).

EXCLUIDOS POST-COMPRA (no estan en el enum porque NO aplican aqui):
  - \`quiero_comprar\` / \`seleccion_pack\` / \`confirmar\` — son intents de sales-v3 (prospect agent),
    no de PW-confirmation. Si el mensaje suena a "quiero comprar otro" → clasificar como editar_items.

---

## 4. Extraccion de datos (datos_extraidos)

REGLAS:
  - SOLO extrae datos EXPLICITAMENTE presentes en el mensaje. NUNCA inventes datos.
  - Si el dato ya esta en el CRM context (seccion 6) y el cliente NO lo modifica, NO lo re-extraigas — deja null.
  - telefono: normalizar a formato 573XXXXXXXXX. Si el cliente da 10 digitos (3001234567), prefijar con 57 → 573001234567. Si ya viene con 57, dejar tal cual.
  - direccion: SOLO el texto de la direccion (NO incluir ciudad ni departamento). Si el cliente envia "Calle 100 #15-20, Bogota, Cundinamarca", extraer:
      direccion = "Calle 100 #15-20"
      ciudad = "Bogota"
      departamento = "Cundinamarca"
  - ciudad / departamento: normalizar a proper case (bogota → Bogota, cundinamarca → Cundinamarca).
  - nombre / apellido: capitalizar (jose romero → nombre="Jose", apellido="Romero").

NEGACIONES (no son extracciones):
  - Si el cliente dice "no tengo correo" o "no quiero dar mi numero", NO pongas valores fantasma — deja todos los campos en null y refleja la negacion en \`notas\` (e.g. "cliente niega tener correo electronico").

---

## 5. Estado actual de la maquina

Phase actual: \`${currentPhase}\`

NOTA D-26: Si el estado es \`awaiting_confirmation\` o \`awaiting_confirmation_post_data_capture\`,
una respuesta afirmativa (si/dale/ok/correcto/listo/confirmo/👍) DEBE clasificarse como
\`confirmar_pedido\`. NO requiere validar el ultimo template enviado — el estado de la maquina es el guard.

---

## 6. Contexto del pedido (CRM)

${crmSection}

---

## 7. Conversacion reciente (ultimos 6 turnos)

${historyFormatted}

---

## Output

Devuelve UN OBJETO JSON con la estructura del schema:

  - \`intent\`: uno de los 22 valores listados arriba (string).
  - \`confidence\`: 0.0 a 1.0 (0.9+ = claro, 0.7-0.89 = probable, <0.7 = ambiguo).
  - \`datos_extraidos\`: objeto opcional con los 6 campos shipping (nombre, apellido, telefono, direccion, ciudad, departamento). Cada campo nullish; null/undefined si no esta en el mensaje.
  - \`notas\`: opcional, breve (1-2 frases) explicando el reasoning o nuance que el state machine deba saber.

NO agregues texto fuera del JSON.`
}
