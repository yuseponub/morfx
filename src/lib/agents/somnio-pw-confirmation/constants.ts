/**
 * Somnio PW-Confirmation — Constants
 *
 * Single source of truth para: intents, stages (UUIDs reales de prod), keywords,
 * action-template mapping, shipping required fields, timeouts.
 *
 * IMPORTS: solo del propio modulo del agente (./config, ./types) para evitar
 * circular deps. Patron clonado de somnio-recompra/constants.ts.
 *
 * Stage UUIDs HARDCODED (Open Q7 resuelto post-audit Plan 01) — captured verbatim
 * de prod via `01-AUDIT.sql` Query (a) y locked en `01-SNAPSHOT.md` (workspace
 * Somnio a3843b3f-..., pipeline 'Ventas Somnio Standard'). Si el pipeline se
 * recreara en prod, estos UUIDs deben actualizarse.
 *
 * Catalogo de templates referenciados — 24 intents post-checkpoint Plan 02:
 *   - 18 informacionales (incluye 5 zone-specific tiempo_entrega_*)
 *   - 2 sales clonados de sales-v3 (confirmacion_orden_same_day / _transportadora)
 *   - 4 nuevos/adaptados (pedir_datos_post_compra, agendar_pregunta,
 *     claro_que_si_esperamos, fallback)
 * Templates ELIMINADOS post-checkpoint (no referenciados aqui):
 *   - confirmar_direccion_post_compra (redundante con direccion_entrega)
 *   - cancelado_handoff (handoff es silencioso, engine devuelve messages: [])
 *   - error_carga_pedido (mismo patron silencioso)
 */

import { SOMNIO_PW_CONFIRMATION_AGENT_ID } from './config'
import type { TipoAccion } from './types'

// ============================================================================
// Agent ID re-export + TemplateManager lookup key
// ============================================================================

/**
 * agent_id usado por TemplateManager para lookup de templates de este agente.
 * MUST match `agent_id` column en `agent_templates` (Plan 02 migration).
 */
export const TEMPLATE_LOOKUP_AGENT_ID = SOMNIO_PW_CONFIRMATION_AGENT_ID
export { SOMNIO_PW_CONFIRMATION_AGENT_ID }

// ============================================================================
// Stage UUIDs (post-audit Plan 01, locked verbatim de 01-SNAPSHOT.md)
// ============================================================================

/**
 * Stages del pipeline 'Ventas Somnio Standard' relevantes para este agente.
 * UUIDs capturados de prod via `01-AUDIT.sql` Query (a) el 2026-04-27 (Bogota).
 * Source of truth: `.planning/standalone/somnio-sales-v3-pw-confirmation/01-SNAPSHOT.md`
 *
 * Workspace: a3843b3f-c337-4836-92b5-89c58bb98490 (Somnio).
 */
export const PW_CONFIRMATION_STAGES = {
  PIPELINE_ID: 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8',
  NUEVO_PAG_WEB: '42da9d61-6c00-4317-9fd9-2cec9113bd38',
  FALTA_INFO: '05c1f783-8d5a-492d-86c2-c660e8e23332',
  FALTA_CONFIRMAR: 'e0cf8ecf-1e8c-46bc-bc57-f5580bfb12bd',
  CONFIRMADO: '4770a36e-5feb-4eec-a71c-75d54cb2797c',
} as const

/**
 * Nombres legibles de stages donde el agente puede operar (D-04 entry stages).
 * Usado por routing rule fact `activeOrderStageRaw` (string match en routing-editor).
 * NO incluye CONFIRMADO porque es estado terminal del agente (D-28).
 */
export const ENTRY_STAGE_NAMES = ['NUEVO PAG WEB', 'FALTA INFO', 'FALTA CONFIRMAR'] as const

// ============================================================================
// Intent Sets (consumidos por comprehension.ts Plan 05 + tracks Plans 07-08)
// ============================================================================

/**
 * Set completo de intents que el agente reconoce via Haiku comprehension.
 * Subset adaptado de sales-v3 / recompra para contexto post-compra.
 */
export const PW_CONFIRMATION_INTENTS: ReadonlySet<string> = new Set([
  // Informacionales (clonados verbatim de sales-v3 — D-15, D-27)
  'saludo',
  'precio',
  'promociones',
  'contenido',
  'formula',
  'como_se_toma',
  'pago',
  'envio',
  'ubicacion',
  'contraindicaciones',
  'dependencia',
  'efectividad',
  'registro_sanitario',
  'tiempo_entrega', // alto-nivel; response-track Plan 07 elige zone-specific dinamicamente
  // Acciones post-compra (PW-confirmation specific)
  'confirmar_pedido', // "si", "dale", "ok", "confirmo", "listo", "correcto"
  'cancelar_pedido', // "no", "no me interesa", "cancela"
  'esperar', // "espera lo pienso", "ya te confirmo", "luego" (D-14)
  'cambiar_direccion', // "quiero cambiar la direccion" (D-12)
  'editar_items', // "quitar/agregar producto" (V1 → handoff, D-13 deferred)
  'agendar', // respuesta afirmativa a agendar_pregunta (D-11)
  'pedir_humano', // "asesor", "humano" (D-21)
  'fallback', // intent no clasificable
])

/**
 * Subset que dispara emision de templates informacionales (response-track.ts Plan 07).
 * Patron clonado de recompra constants.ts:67-71 — mismo set + registro_sanitario (D-27)
 * + intents adicionales que sales-v3 si tiene (contenido, formula, como_se_toma, efectividad).
 * `tiempo_entrega` es alto-nivel — response-track resuelve a zone-specific
 * (tiempo_entrega_same_day / next_day / 1_3_days / 2_4_days / sin_ciudad) en runtime.
 */
export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([
  'saludo',
  'precio',
  'promociones',
  'contenido',
  'formula',
  'como_se_toma',
  'pago',
  'envio',
  'ubicacion',
  'contraindicaciones',
  'dependencia',
  'efectividad',
  'registro_sanitario',
  'tiempo_entrega',
])

/**
 * Subset que dispara sales actions (transitions de state machine, NO templates directamente).
 * sales-track.ts Plan 08 mapea estos a TipoAccion via comprehension + state.
 */
export const SALES_INTENTS: ReadonlySet<string> = new Set([
  'confirmar_pedido',
  'cancelar_pedido',
  'esperar',
  'cambiar_direccion',
  'editar_items',
  'agendar',
  'pedir_humano',
])

/**
 * Intents que escalan a humano por si solos (sin pasar por sales-track).
 * Patron clonado de recompra/v3 ESCAPE_INTENTS (renombrado mentalmente para PW).
 */
export const ESCAPE_INTENTS: ReadonlySet<string> = new Set([
  'pedir_humano',
])

// ============================================================================
// State Machine guards
// ============================================================================

/**
 * Estados donde un afirmativo ("si") cuenta como confirmacion (D-26).
 * D-09 originalmente decia "solo si el ultimo template fue confirmar_compra";
 * D-26 reinterpreto: la fuente de verdad es el estado de la maquina, NO
 * messages.template_name (que es secondary sanity check).
 */
export const INITIAL_AWAITING_STATES = [
  'awaiting_confirmation',
  'awaiting_confirmation_post_data_capture',
] as const

// ============================================================================
// Shipping Required Fields (D-06 + RESEARCH §D.3)
// ============================================================================

/**
 * Campos requeridos para considerar "shipping completo" (D-06).
 * Algoritmo `shippingComplete()` (Plan 06 state.ts) verifica que TODOS estos
 * existan + non-empty en el orden activo. Si falta alguno → emit
 * `pedir_datos_envio` con template `pedir_datos_post_compra` (Plan 07).
 */
export const SHIPPING_REQUIRED_FIELDS = [
  'nombre',
  'apellido',
  'telefono',
  'shippingAddress',
  'shippingCity',
  'shippingDepartment',
] as const

export type ShippingFieldName = (typeof SHIPPING_REQUIRED_FIELDS)[number]

// ============================================================================
// Action → Template intent mapping (response-track.ts Plan 07)
// ============================================================================

/**
 * Mapping de TipoAccion → array de template intents que response-track emite.
 *
 * Templates referenciados existen en el catalogo (Plan 02 migration, 24 intents).
 * Acciones que NO emiten templates → array vacio (handoff silencioso o decision
 * dinamica deferida a Plan 06/07):
 *
 *   - `actualizar_direccion`: array vacio. Decision pendiente Plan 06/07 — puede
 *     reusar `direccion_entrega` (template productivo workspace-level, agent_id NULL)
 *     o emitir texto natural. NO esta en catalog del agente.
 *   - `editar_items`: array vacio. V1 → handoff silencioso (D-13 deferred).
 *   - `cancelar_definitivo`: array vacio. Handoff silencioso post 2do "no" (D-11).
 *   - `handoff`: array vacio. Engine retorna messages: [] cuando action='handoff'
 *     (patron somnio-v3 engine-v3.ts:101 + somnio-v3-agent.ts:327-345).
 *   - `noop`: array vacio. Ignorar turn (e.g. ya procesado).
 *
 * `confirmar_compra` mapea a AMBOS confirmacion_orden_*. response-track Plan 07
 * elige zone-specific dinamicamente per `crm_context.zone` (mismo patron que
 * recompra response-track.ts:301-302).
 */
export const ACTION_TEMPLATE_MAP: Record<TipoAccion, string[]> = {
  confirmar_compra: ['confirmacion_orden_same_day', 'confirmacion_orden_transportadora'],
  pedir_datos_envio: ['pedir_datos_post_compra'],
  actualizar_direccion: [], // pendiente Plan 06/07 (reuso direccion_entrega vs texto natural)
  editar_items: [], // V1: handoff silencioso (D-13 deferred)
  cancelar_con_agendar_pregunta: ['agendar_pregunta'],
  cancelar_definitivo: [], // handoff silencioso (D-11)
  mover_a_falta_confirmar: ['claro_que_si_esperamos'],
  handoff: [], // engine retorna messages: [] (D-21)
  noop: [],
}

// ============================================================================
// Keyword-based intent detection (defense-in-depth sobre Haiku)
// ============================================================================

/**
 * Keywords usadas como capa de fallback ON TOP de Haiku comprehension.
 * Strings normalizados: lowercase, sin tildes (excepto las de canonicidad
 * 'sí' / 'mañana' / 'dirección' que tambien se incluyen para match raw).
 * transitions.ts Plan 06 normaliza el mensaje del cliente y compara via
 * `array.includes(normalized)` o `normalized.includes(keyword)` segun el caso.
 */
export const AFFIRMATIVE_KEYWORDS = [
  'si',
  'sí',
  'sii',
  'siii',
  'siiii',
  'dale',
  'ok',
  'okay',
  'oki',
  'okey',
  'confirmo',
  'confirmar',
  'confirmado',
  'listo',
  'correcto',
  'asi es',
  'así es',
  'perfecto',
  'va',
  'vale',
  'de una',
  '👍',
  '✅',
] as const

export const NEGATIVE_KEYWORDS = [
  'no',
  'nop',
  'nope',
  'no gracias',
  'rechazo',
  'rechazar',
  'cancelar',
  'cancelo',
  'cancelar pedido',
  'cancelado',
  'no quiero',
  'no me interesa',
  'mejor no',
  'ya no',
  '❌',
] as const

export const WAIT_KEYWORDS = [
  'espera',
  'esperame',
  'esperame un momento',
  'espera lo pienso',
  'lo pienso',
  'ya te confirmo',
  'mas tarde',
  'mas rato',
  'luego',
  'despues',
  'manana',
  'mañana',
  'lo reviso',
  'lo penso',
  'ya te aviso',
  'te aviso',
  'dame un momento',
  'un rato',
  'un momento',
] as const

export const ADDRESS_CHANGE_KEYWORDS = [
  'cambiar direccion',
  'cambiar dirección',
  'cambiar la direccion',
  'cambiar la dirección',
  'otra direccion',
  'otra dirección',
  'nueva direccion',
  'nueva dirección',
  'direccion nueva',
  'dirección nueva',
  'cambiar a',
  'mejor a',
  'envialo a',
  'envíalo a',
  'enviar a otro lado',
  'mudar',
  'cambiar lugar',
] as const

export const ITEMS_CHANGE_KEYWORDS = [
  'agregar producto',
  'quitar producto',
  'sumar producto',
  'agregar otro',
  'quitar uno',
  'cambiar producto',
  'cambiar cantidad',
  'mas unidades',
  'menos unidades',
  'editar pedido',
  'editar items',
] as const

export const HUMAN_HANDOFF_KEYWORDS = [
  'asesor',
  'humano',
  'persona',
  'agente humano',
  'hablar con alguien',
  'hablar con un humano',
  'hablar con asesor',
  'operador',
  'reclamo',
  'queja',
  'devolucion',
  'devolución',
] as const

// ============================================================================
// Confidence threshold (Haiku comprehension)
// ============================================================================

/**
 * Threshold por debajo del cual el sales-track aplica fallback.
 * Convencion clonada de recompra/v3 (porcentaje 0..100, NO fraccion 0..1).
 * comprehension-schema.ts (Plan 05) emite `confidence: number` en mismo rango.
 */
export const LOW_CONFIDENCE_THRESHOLD = 80

// ============================================================================
// CRM Reader timeout (D-05 BLOQUEANTE)
// ============================================================================

/**
 * Timeout para CRM reader preload bloqueante (D-05).
 * Inngest function `pw-confirmation-preload-and-invoke` (Plan 09) usa este valor.
 * Asume hasta 25s aceptable post-purchase (cliente ya esta en confirmacion,
 * latencia mas alta tolerable que en saludo recompra).
 */
export const READER_TIMEOUT_MS = 25_000

// ============================================================================
// Inngest events (canonical)
// ============================================================================

/**
 * Nombre canonico del evento Inngest dispatch + function trigger.
 * webhook-processor.ts (Plan 09) emite este evento al crear sesion;
 * Inngest function `pw-confirmation-preload-and-invoke` lo escucha.
 */
export const INNGEST_EVENT_PRELOAD_AND_INVOKE = 'pw-confirmation/preload-and-invoke' as const
