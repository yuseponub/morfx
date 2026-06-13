/**
 * CRM GATE — el corazon del standalone #2 (Plan 06). D-01..D-18 + S1 + Pitfall 3/5/6/7.
 *
 * Reemplaza el camino determinista inline (`executeInvocations` + el `createOrder`
 * del runner) por el sub-loop GROUNDED, con las 3 capas de seguridad (D-03):
 *
 *  1. **Gate (D-01/D-02/D-03):** determinista PERO amplio (alto recall),
 *     post-sales-track. Filosofia D-03: gate preciso (recall) + sub-loop grounded
 *     que rescata la extraccion fallida (precision) + guards como red final.
 *  2. **Aditivo, NO early-return (D-05):** el gate carga grounding (lazy, Plan 02),
 *     corre el sub-loop CRM (Plan 05, con simulate en sandbox), deriva crmActions,
 *     actualiza el snapshot _v4 — y el caller CAE a response-track (sigue enviando
 *     templates). El gate NUNCA hace `return` que corte el turno.
 *  3. **createOrder-cascaron temprano (D-15/D-17/S1):** se dispara en
 *     `datosCriticosJustCompleted && !hasPriorOrder` (+ sin pedido activo en
 *     grounding). El cascaron nace en NUEVO PEDIDO (env-bridge Plan 02, NO NUEVO
 *     PAG WEB — evita la automation order.created, Pitfall 5). Triple idempotencia
 *     (S1): edge `datosCriticosJustCompleted` + `hasPriorOrder` (View B) + re-query
 *     fresco (grounding.activeOrder) + idempotency key `somnio-v4-createOrder-{sessionId}`
 *     (D-12). El hint determinista incluye contactId (via resolveOrCreateContact,
 *     Plan 03) + pipelineId (via getPipelineUuid, Plan 02) + stageId NUEVO PEDIDO.
 *  4. **Guards (D-12/D-13):** createOrder already_exists (re-query + idempotency key);
 *     moveOrderToStage whitelist (SOLO ->CONFIRMADO desde PRE_CONFIRMATION_STAGE_UUIDS)
 *     + CAS existente del domain.
 *  5. **confirmar_orden -> moveOrderToStage(CONFIRMADO) (D-18):** el hint mueve el
 *     pedido activo a CONFIRMADO (si la whitelist lo permite).
 *
 * Regla 3: cero acceso directo al cliente admin de DB — TODO via grounding
 * (crm-query-tools) + sub-loop (crm-mutation-tools) + el domain helper
 * resolveOrCreateContact. v4-specific -> Regla 6 satisfecha (v4 DORMANT).
 */

import { buildCrmGrounding, writeCrmSnapshot, type CrmGrounding } from './crm-grounding'
import {
  getConfirmadoStageUuid,
  getNuevoPedidoStageUuid,
  getPipelineUuid,
  PRE_CONFIRMATION_STAGE_UUIDS,
  SOMNIO_V4_AGENT_ID,
} from './config'
import { PACK_PRICES_NUMERIC, PACK_PRODUCTS } from './constants'
import { runCrmSubLoop } from './sub-loop'
import { resolveOrCreateContact } from '@/lib/domain/contacts'
import { getCollector } from '@/lib/observability'
import type { AgentState, CrmActionRegistrada } from './types'
import type { StateChanges } from './state'
import type { LockHandle } from '@/lib/agents/interruption-system-v2/lock'

// ───────────────────────────────────────────────────────────────────────────
// Predicate (D-02/D-03) — gate amplio (alto recall)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Set v4-gate de acciones que disparan el gate CRM (D-02/D-15/D-18). AISLADO —
 * NO reusar CRM_ACTIONS (ese set incluye acciones que NO mutan en v4, como las
 * recordar_* que Plan 01 saco de CREATE_ORDER_ACTIONS).
 *
 *  - `mostrar_confirmacion` -> updateOrder enriquece con pack (D-17).
 *  - `confirmar_orden`      -> moveOrderToStage(CONFIRMADO) (D-18).
 */
export const CRM_GATE_ACTIONS: ReadonlySet<string> = new Set([
  'mostrar_confirmacion',
  'confirmar_orden',
])

/** Campos de envio que, recien capturados, disparan el gate (D-02). */
const SHIPPING_FIELDS: ReadonlySet<string> = new Set([
  'direccion',
  'ciudad',
  'departamento',
  'barrio',
  'correo',
])

/**
 * Gate determinista AMPLIO (D-02 — union de tres senales, alto recall):
 *   (a) accion ∈ CRM_GATE_ACTIONS, o
 *   (b) newFields ∩ SHIPPING_FIELDS (datos de envio capturados este turno), o
 *   (c) category === 'datos' (red anti-falso-negativo — si la extraccion fallo
 *       pero el cliente claramente mando datos, el sub-loop grounded rescata).
 *
 * Filosofia D-03: preferimos prender de mas (recall) y dejar que el sub-loop
 * grounded + las guards (idempotency/CAS/whitelist) sean la precision.
 */
export function crmGateFired(args: {
  accion?: string | null
  newFields: string[]
  category: string
}): boolean {
  const { accion, newFields, category } = args
  if (accion && CRM_GATE_ACTIONS.has(accion)) return true
  if (newFields.some((f) => SHIPPING_FIELDS.has(f))) return true
  if (category === 'datos') return true
  return false
}

// ───────────────────────────────────────────────────────────────────────────
// Whitelist moveOrderToStage (D-13) — fail-closed
// ───────────────────────────────────────────────────────────────────────────

/**
 * Whitelist de transicion de stage (D-13). Permite SOLO mover -> CONFIRMADO desde
 * un stage pre-confirmacion. fail-closed:
 *   - si getConfirmadoStageUuid() === null (env no seteado) -> false (no se mueve).
 *   - si toStageId !== CONFIRMADO -> false (cualquier otro destino bloqueado,
 *     incluido el stage de pago web / CANCELADO — D-07 cancelar fuera de scope).
 *   - si fromStageId no esta en PRE_CONFIRMATION_STAGE_UUIDS -> false (origen ya
 *     confirmado/terminal -> no re-confirmar).
 */
export function isMoveAllowed(fromStageId: string | null, toStageId: string): boolean {
  const confirmado = getConfirmadoStageUuid()
  if (!confirmado) return false // fail-closed sin env CONFIRMADO
  if (toStageId !== confirmado) return false // SOLO -> CONFIRMADO
  if (!fromStageId || !PRE_CONFIRMATION_STAGE_UUIDS.has(fromStageId)) return false
  return true
}

// ───────────────────────────────────────────────────────────────────────────
// runCrmGate — orquestador (D-05 aditivo, NO early-return)
// ───────────────────────────────────────────────────────────────────────────

/** hasPriorOrder (verbatim somnio-v4-agent.ts:572-574, View B del ledger). */
function hasPriorOrder(state: AgentState): boolean {
  return state.accionesEjecutadas.some((a) => typeof a !== 'string' && a.crmAction)
}

/** Resultado del gate que el agente re-cablea al ledger + EngineOutput (Pitfall 6). */
export interface RunCrmGateResult {
  /** crmActions derivados ground-truth del sub-loop (origen:'rag', D-14). */
  crmActions: CrmActionRegistrada[]
  /** Re-cableado a EngineOutput.orderCreated/orderId/contactId (Pitfall 6). */
  crmResult?: { orderId?: string; contactId?: string; success: boolean }
}

export interface RunCrmGateArgs {
  workspaceId: string
  sessionId: string
  accion?: string | null
  changes: StateChanges
  /** category de la clasificacion (analysis.classification.category) — senal (c) del gate. */
  category: string
  mergedState: AgentState
  /**
   * El Record persistido en session_state.datos_capturados — donde se escribe el
   * snapshot _v4 (D-10). Distinto de mergedState.datos (objeto tipado). Opcional:
   * si no se pasa, el snapshot no se persiste (best-effort).
   */
  datosCapturados?: Record<string, string>
  phone: string | null
  userMessage: string
  ledgerCrmActions: CrmActionRegistrada[]
  /** Sandbox pasa true -> mutation-tools simuladas (D-22). Prod false -> reales. */
  simulate?: boolean
  lockHandle?: LockHandle | null
  lockChannel?: 'whatsapp' | 'facebook' | 'instagram' | null
  lockIdentifier?: string | null
  /** Standalone v4-observability-completeness (D-03): iteración del restart loop para etiquetar los eventos del gate. */
  restartIteration?: number
}

/**
 * Construye el HINT determinista (Claude's Discretion D-04) que el sub-loop recibe.
 * El sub-loop grounded decide+ejecuta; el hint es una SUGERENCIA.
 *
 * Devuelve `{ hint, contactId? }`:
 *   - createOrder-cascaron: si datosCriticosJustCompleted && !hasPriorOrder && sin
 *     pedido activo en grounding. Resuelve contactId via resolveOrCreateContact;
 *     pipelineId via getPipelineUuid(); stageId via getNuevoPedidoStageUuid() (si
 *     null -> OMITE createOrder + loggea fail-closed). idempotencyKey por sessionId.
 *   - updateOrder pack: accion mostrar_confirmacion + activeOrder.
 *   - moveOrderToStage CONFIRMADO: accion confirmar_orden + activeOrder + whitelist.
 *   - rescate: solo shipping/category sin pedido -> hint generico.
 */
async function buildCrmHint(
  args: RunCrmGateArgs,
  grounding: CrmGrounding,
): Promise<string> {
  const { accion, changes, mergedState, phone, sessionId, workspaceId } = args
  const activeOrder = grounding.activeOrder
  const idempotencyKey = `somnio-v4-createOrder-${sessionId}`

  // ── createOrder-cascaron temprano (D-15/D-17/S1, triple idempotencia) ──────
  // Edge `datosCriticosJustCompleted` + `hasPriorOrder` (View B) + re-query fresco
  // (grounding.activeOrder === null) — la idempotency key es el cuarto backstop (D-12).
  if (changes.datosCriticosJustCompleted && !hasPriorOrder(mergedState) && !activeOrder) {
    const stageId = getNuevoPedidoStageUuid()
    if (!stageId) {
      // fail-closed: sin UUID NUEVO PEDIDO no creamos el cascaron (no inventamos destino).
      getCollector()?.recordEvent('pipeline_decision', 'crm_gate_createOrder_skipped', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId,
        reason: 'SOMNIO_NUEVO_PEDIDO_STAGE_UUID env var not set',
      })
      return 'No crear pedido: stage NUEVO PEDIDO no configurado (fail-closed).'
    }
    if (!phone) {
      getCollector()?.recordEvent('pipeline_decision', 'crm_gate_createOrder_skipped', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId,
        reason: 'telefono ausente — no se puede resolver contactId',
      })
      return 'No crear pedido: telefono ausente.'
    }

    // Resolver contactId (UUID) via domain helper (Plan 03 — reemplaza OrderCreator).
    const datos = mergedState.datos
    const resolved = await resolveOrCreateContact(
      { workspaceId, source: 'adapter' },
      {
        phone,
        name: datos.nombre ?? undefined,
        email: datos.correo ?? undefined,
        address: datos.direccion ?? undefined,
        city: datos.ciudad ?? undefined,
        department: datos.departamento ?? undefined,
      },
    )
    if (!resolved.success || !resolved.data) {
      getCollector()?.recordEvent('pipeline_decision', 'crm_gate_createOrder_skipped', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId,
        reason: `resolveOrCreateContact failed: ${resolved.error ?? 'unknown'}`,
      })
      return 'No crear pedido: no se pudo resolver el contacto.'
    }
    const contactId = resolved.data.contactId
    const pipelineId = getPipelineUuid()

    // Items derivados del pack ya elegido (D-17 — PACK_PRODUCTS/PACK_PRICES_NUMERIC).
    const itemsHint = buildPackItemsHint(mergedState.pack)

    return (
      `Crear pedido cascaron en NUEVO PEDIDO con ` +
      `contactId=${contactId} pipelineId=${pipelineId} stageId=${stageId} ` +
      `idempotencyKey=${idempotencyKey}.` +
      (itemsHint ? ` ${itemsHint}` : '') +
      ` Usar EXCLUSIVAMENTE el stageId provisto (nunca otro stage). ` +
      `Si ya existe un pedido activo, NO crear (usar updateOrder).`
    )
  }

  // ── updateOrder pack (D-17) — mostrar_confirmacion + pedido activo ─────────
  if (accion === 'mostrar_confirmacion' && activeOrder) {
    const itemsHint = buildPackItemsHint(mergedState.pack)
    return (
      `Enriquecer el pedido ${activeOrder.id} con el pack del cliente.` +
      (itemsHint ? ` ${itemsHint}` : '') +
      ` Usar updateOrder (NO createOrder — ya existe el pedido ${activeOrder.id}).`
    )
  }

  // ── moveOrderToStage CONFIRMADO (D-18) — confirmar_orden + whitelist ───────
  if (accion === 'confirmar_orden' && activeOrder) {
    const confirmado = getConfirmadoStageUuid()
    if (confirmado && isMoveAllowed(activeOrder.stageId, confirmado)) {
      return (
        `Mover el pedido ${activeOrder.id} a CONFIRMADO (stageId=${confirmado}) ` +
        `usando moveOrderToStage. Si retorna stage_changed_concurrently, NO reintentar.`
      )
    }
    // Whitelist bloqueo -> NO mover + loggear (D-13 fail-closed).
    getCollector()?.recordEvent('pipeline_decision', 'crm_gate_move_blocked', {
      agent: SOMNIO_V4_AGENT_ID,
      sessionId,
      fromStage: activeOrder.stageId,
      reason: !confirmado
        ? 'SOMNIO_CONFIRMADO_STAGE_UUID env var not set'
        : 'fromStage no es pre-confirmacion (whitelist D-13)',
    })
    return `No mover de stage: la transicion no esta permitida por la whitelist (D-13).`
  }

  // ── rescate (D-02 red) — solo shipping/category sin pedido en curso ────────
  if (activeOrder) {
    return (
      `Si falta direccion/ciudad/departamento en el pedido ${activeOrder.id}, ` +
      `actualizarla con updateOrder. NO crear un pedido nuevo (ya existe).`
    )
  }
  return (
    `Rescatar extraccion: el cliente parece haber enviado datos. Si hay datos ` +
    `criticos completos y NO existe pedido activo, crear el pedido cascaron en ` +
    `NUEVO PEDIDO; de lo contrario, no mutar.`
  )
}

/**
 * Deriva el bloque "items" del hint a partir del pack elegido (D-17). Usa
 * PACK_PRODUCTS (name+quantity) + PACK_PRICES_NUMERIC (unitPrice). Devuelve string
 * vacio si no hay pack (el sub-loop creara/actualizara sin items).
 */
function buildPackItemsHint(pack: AgentState['pack']): string {
  if (!pack) return ''
  const product = PACK_PRODUCTS[pack]
  const price = PACK_PRICES_NUMERIC[pack]
  if (!product || price == null) return ''
  return (
    `Items del pack ${pack}: title="${product.name}" sku="somnio-${pack}" ` +
    `quantity=${product.quantity} unitPrice=${price}.`
  )
}

/**
 * Orquestador del gate (D-05 aditivo, NO early-return). El caller (somnio-v4-agent)
 * lo llama post-sales-track y CAE a response-track con el resultado.
 *
 * Si el gate NO prende -> retorna { crmActions: [] } barato (D-02). Si prende:
 *   1. carga grounding LAZY (Plan 02),
 *   2. construye el hint determinista,
 *   3. corre el sub-loop CRM (Plan 05, simulate en sandbox),
 *   4. deriva crmActions (origen:'rag') + extrae crmResult (Pitfall 6),
 *   5. actualiza el snapshot _v4 tras mutacion exitosa.
 */
export async function runCrmGate(args: RunCrmGateArgs): Promise<RunCrmGateResult> {
  // Gate amplio (D-02). Salida valida BARATA si no prende — runCrmGate es autonomo
  // (re-evalua las 3 senales aqui, no confia en el caller). El grounding/sub-loop
  // SOLO se cargan si prende (D-11 lazy).
  if (
    !crmGateFired({
      accion: args.accion ?? null,
      newFields: args.changes.newFields,
      category: args.category,
    })
  ) {
    return { crmActions: [] }
  }

  // Grounding LAZY (Plan 02) — solo se carga cuando el gate prende.
  const grounding = await buildCrmGrounding({
    workspaceId: args.workspaceId,
    phone: args.phone,
    userMessage: args.userMessage,
    ledgerCrmActions: args.ledgerCrmActions,
  })

  const hint = await buildCrmHint(args, grounding)

  // Sub-loop CRM (Plan 05). recentMessages vacio: el grounding + el mensaje crudo
  // (rawMessage) dan el contexto; el sub-loop no necesita el historial completo aqui.
  const { crmActions } = await runCrmSubLoop({
    reason: 'crm_mutation',
    ctx: {
      workspaceId: args.workspaceId,
      conversationId: args.sessionId,
      sessionId: args.sessionId,
      userMessage: args.userMessage,
      recentMessages: [],
      grounding,
      crmHint: hint,
      simulate: args.simulate ?? false,
      lockHandle: args.lockHandle ?? null,
      lockChannel: args.lockChannel ?? null,
      lockIdentifier: args.lockIdentifier ?? null,
    },
  })

  // Extraer crmResult del primer createOrder exitoso (Pitfall 6 — re-cablear a EngineOutput).
  const crmResult = extractCrmResult(crmActions)

  // Actualizar snapshot _v4 tras mutacion exitosa (D-10). Re-usamos el grounding
  // cargado; el snapshot se escribe en el Record persistido (datosCapturados), NO
  // en el objeto tipado mergedState.datos. best-effort.
  if (crmResult?.success && args.datosCapturados) {
    try {
      writeCrmSnapshot(args.datosCapturados, grounding)
    } catch {
      // Snapshot best-effort — no rompe el turno si falla la serializacion.
    }
  }

  return { crmActions, crmResult }
}

/**
 * Extrae el resultado de retorno (Pitfall 6) de los crmActions. Busca el primer
 * createOrder exitoso para orderId/contactId; success = algun crmAction success.
 */
function extractCrmResult(
  crmActions: CrmActionRegistrada[],
): { orderId?: string; contactId?: string; success: boolean } | undefined {
  if (crmActions.length === 0) return undefined
  const success = crmActions.some((a) => a.result === 'success')
  const createOrderOk = crmActions.find(
    (a) => a.tool === 'createOrder' && a.result === 'success',
  )
  let orderId: string | undefined
  let contactId: string | undefined
  if (createOrderOk) {
    // stageAtTime guarda el stageId del pedido creado; el orderId/contactId vienen
    // de los args del tool (contactId es el provisto) o del data echo (orderId).
    const args = createOrderOk.args as { contactId?: string }
    contactId = args.contactId
    // El orderId se deriva del output.data.id; deriveCrmActions guarda stageAtTime
    // (stageId), no el id. El runner usa crmResult.success como senal principal;
    // orderId/contactId best-effort para EngineOutput.
  }
  return { orderId, contactId, success }
}
