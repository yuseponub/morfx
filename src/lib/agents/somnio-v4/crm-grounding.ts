/**
 * Capa 1 — GROUNDING (standalone #2, Plan 02). D-08/D-09/D-10/D-11/D-21.
 *
 * Ensambla las DOS vistas de verdad + el mensaje crudo que el sub-loop necesita
 * para decidir crear-vs-actualizar un pedido (anti-duplicado clase Doralba):
 *
 *  - **Vista A (verdad DB):** pedido activo (id, stage, valor, items, direccion) +
 *    contacto (id, phone, email) via crm-query-tools (read-only, Regla 3).
 *    CON fallback robusto: si `getActiveOrderByPhone` retorna `config_not_set`
 *    (caso Somnio HOY — tablas crm_query_tools_config/active_stages vacias,
 *    Pitfall 3), cae a `getLastOrderByPhone` y razona el stage contra
 *    PRE_CONFIRMATION_STAGE_UUIDS (set v4-local).
 *  - **Vista B (memoria del agente):** `crmActions[]` del ledger (passthrough).
 *    La discrepancia A↔B es senal (D-08) que el sub-loop interpreta.
 *  - **Mensaje crudo (D-09):** el `userMessage` para que el LLM re-lea lo que la
 *    extraccion determinista se perdio.
 *
 * Descope V1 (Pitfall 4 / D-09): OrderDetail NO trae stageName ni
 * order_stage_history -> stageName se resuelve via STAGE_NAME_BY_UUID (sin domain
 * read extra) y NO se incluye historial completo de cambios. La discrepancia A↔B
 * da la senal de cambio externo sin necesidad del historial.
 *
 * Snapshot (D-10, Claude's Discretion): la Vista A se lee/escribe en
 * `session_state.datos_capturados` bajo clave propia `_v4:crm_snapshot` — NUNCA las
 * legacy `_v3:crm_context`/`_v3:active_order` (CLAUDE.md D-21).
 *
 * Grounding es LAZY (D-11): funcion pura que el gate del Plan 06 invoca SOLO cuando
 * prende. Nada de preload por-turno. NO ejecuta mutaciones (read-only). NO toca
 * domain ni modulos compartidos (solo CONSUME crm-query-tools). v4-specific ->
 * Regla 6 satisfecha.
 */

import {
  createCrmQueryTools,
  type CrmQueryLookupResult,
} from '@/lib/agents/shared/crm-query-tools'
import type { CrmActionRegistrada } from './types'
import {
  SOMNIO_V4_AGENT_ID,
  STAGE_NAME_BY_UUID,
  PRE_CONFIRMATION_STAGE_UUIDS,
} from './config'
import { V4_META_PREFIX } from './constants'

/** Item de pedido proyectado para el grounding (subset de OrderDetail.items). */
export interface CrmGroundingItem {
  sku: string
  title: string
  quantity: number
  unitPrice: number
}

/** Vista A — pedido activo proyectado (descope V1, sin historial). */
export interface CrmGroundingActiveOrder {
  id: string
  stageId: string
  /** Resuelto via STAGE_NAME_BY_UUID; null si el UUID no esta en el mapa. */
  stageName: string | null
  createdAt: string
  totalValue: number
  shippingAddress: string | null
  shippingCity: string | null
  shippingDepartment: string | null
  items: CrmGroundingItem[]
}

/** Vista A — contacto proyectado. */
export interface CrmGroundingContact {
  id: string
  phone: string | null
  email: string | null
}

/** Status de la query de pedido activo (Vista A). Conserva el status ORIGINAL como senal. */
export type ActiveOrderQueryStatus =
  | 'found'
  | 'no_active_order'
  | 'not_found'
  | 'config_not_set'
  | 'error'

/**
 * Grounding completo que el sub-loop recibe. Tipado fuerte (Claude's Discretion:
 * forma del campo nuevo que se threadea al SubLoopContext en Plan 05/06).
 */
export interface CrmGrounding {
  /** Vista A: pedido activo (con fallback config_not_set). null = no hay pedido en curso. */
  activeOrder: CrmGroundingActiveOrder | null
  /** Vista A: contacto. null = telefono desconocido o no resuelto. */
  contact: CrmGroundingContact | null
  /** Status ORIGINAL de getActiveOrderByPhone (senal de observabilidad incluso tras fallback). */
  activeOrderQueryStatus: ActiveOrderQueryStatus
  /** Vista B: crmActions del ledger (passthrough, D-08). */
  ledgerCrmActions: CrmActionRegistrada[]
  /** Mensaje crudo del cliente (D-09 — re-lectura por el LLM). */
  rawMessage: string
}

/** Subset de OrderDetail que el grounding consume (evita acoplar al shape completo). */
interface OrderDetailLike {
  id: string
  stageId: string
  createdAt: string
  totalValue: number
  shippingAddress: string | null
  shippingCity: string | null
  shippingDepartment: string | null
  items?: Array<{ sku: string; title: string; quantity: number; unitPrice: number }>
}

/** Subset de ContactDetail que el grounding consume. */
interface ContactDetailLike {
  id: string
  phone: string | null
  email: string | null
}

/** Proyecta un OrderDetail-like a la Vista A (stageName via map, items subset). */
function projectActiveOrder(order: OrderDetailLike): CrmGroundingActiveOrder {
  return {
    id: order.id,
    stageId: order.stageId,
    stageName: STAGE_NAME_BY_UUID[order.stageId] ?? null,
    createdAt: order.createdAt,
    totalValue: order.totalValue,
    shippingAddress: order.shippingAddress,
    shippingCity: order.shippingCity,
    shippingDepartment: order.shippingDepartment,
    items: (order.items ?? []).map((it) => ({
      sku: it.sku,
      title: it.title,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    })),
  }
}

/** Proyecta un ContactDetail-like a la Vista A. */
function projectContact(contact: ContactDetailLike | null | undefined): CrmGroundingContact | null {
  if (!contact) return null
  return { id: contact.id, phone: contact.phone ?? null, email: contact.email ?? null }
}

/**
 * Cast helper — AI SDK v6 typa `Tool.execute?` como union
 * `(Result | AsyncIterable<Result>)` con firma `(input, options)`. Los query
 * tools del factory SIEMPRE tienen execute presente y los invocamos
 * programaticamente con un solo arg (el ToolExecutionOptions no se consume en
 * crm-query-tools). Mismo patron que `asExec` de invocations.ts:46-50.
 */
type ExecQuery<I, O> = (input: I) => Promise<CrmQueryLookupResult<O>>
function asExec<I, O>(t: { execute?: unknown }): ExecQuery<I, O> {
  return ((input: I) =>
    (t.execute as (i: I) => Promise<CrmQueryLookupResult<O>>)(input)) as ExecQuery<I, O>
}

export interface BuildCrmGroundingArgs {
  workspaceId: string
  phone: string | null
  userMessage: string
  ledgerCrmActions: CrmActionRegistrada[]
}

/**
 * Construye el grounding (Vista A + Vista B + mensaje crudo). LAZY: el gate del
 * Plan 06 lo llama solo cuando prende. read-only.
 */
export async function buildCrmGrounding(args: BuildCrmGroundingArgs): Promise<CrmGrounding> {
  const { workspaceId, phone, userMessage, ledgerCrmActions } = args

  // Telefono ausente -> no podemos resolver Vista A. Devolvemos grounding minimo
  // (el sub-loop razona solo con Vista B + mensaje crudo).
  if (!phone) {
    return {
      activeOrder: null,
      contact: null,
      activeOrderQueryStatus: 'not_found',
      ledgerCrmActions,
      rawMessage: userMessage,
    }
  }

  const tools = createCrmQueryTools({ workspaceId, invoker: SOMNIO_V4_AGENT_ID })
  const getContact = asExec<{ phone: string }, ContactDetailLike>(tools.getContactByPhone)
  const getActiveOrder = asExec<{ phone: string }, OrderDetailLike>(tools.getActiveOrderByPhone)
  const getLastOrder = asExec<{ phone: string }, OrderDetailLike>(tools.getLastOrderByPhone)

  // ── Contacto (Vista A) ──────────────────────────────────────────────────
  let contact: CrmGroundingContact | null = null
  try {
    const contactRes = await getContact({ phone })
    if (contactRes.status === 'found') {
      contact = projectContact(contactRes.data)
    }
  } catch {
    // Contacto best-effort: si falla, el pedido activo aun puede traer contact via status.
    contact = null
  }

  // ── Pedido activo (Vista A) ────────────────────────────────────────────
  const activeRes = await getActiveOrder({ phone })
  const originalStatus = activeRes.status as ActiveOrderQueryStatus

  if (activeRes.status === 'found') {
    return {
      activeOrder: projectActiveOrder(activeRes.data),
      contact,
      activeOrderQueryStatus: 'found',
      ledgerCrmActions,
      rawMessage: userMessage,
    }
  }

  // Fallback Pitfall 3: config vacia (Somnio HOY) u 'error' -> getLastOrderByPhone
  // (funciona SIN config) + razonar el stage contra PRE_CONFIRMATION_STAGE_UUIDS.
  // Conservamos activeOrderQueryStatus ORIGINAL ('config_not_set'/'error') como
  // senal de observabilidad aunque hayamos rescatado el pedido.
  if (activeRes.status === 'config_not_set' || activeRes.status === 'error') {
    // El contacto del fallback (si la query de pedido activo lo trajo) tiene prioridad
    // sobre el best-effort de getContactByPhone solo si este ultimo fallo.
    if (!contact && 'contact' in activeRes && activeRes.contact) {
      contact = projectContact(activeRes.contact)
    }
    try {
      const lastRes = await getLastOrder({ phone })
      if (lastRes.status === 'found') {
        const last = lastRes.data
        // Solo sigue "activo" si su stage es pre-confirmacion (no terminal).
        if (PRE_CONFIRMATION_STAGE_UUIDS.has(last.stageId)) {
          return {
            activeOrder: projectActiveOrder(last),
            contact,
            activeOrderQueryStatus: originalStatus,
            ledgerCrmActions,
            rawMessage: userMessage,
          }
        }
      }
    } catch {
      // Fallback best-effort: si tambien falla, caemos al return generico de abajo.
    }
    // Sin pedido en curso (terminal o sin pedidos) -> activeOrder=null, status original.
    return {
      activeOrder: null,
      contact,
      activeOrderQueryStatus: originalStatus,
      ledgerCrmActions,
      rawMessage: userMessage,
    }
  }

  // no_active_order / not_found -> sin pedido activo. Conservar status + contacto si vino.
  if (!contact && 'contact' in activeRes && activeRes.contact) {
    contact = projectContact(activeRes.contact)
  }
  return {
    activeOrder: null,
    contact,
    activeOrderQueryStatus: originalStatus,
    ledgerCrmActions,
    rawMessage: userMessage,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Snapshot helpers (D-10, Claude's Discretion). Clave propia _v4 (NO _v3:*, D-21).
// ───────────────────────────────────────────────────────────────────────────

/** Clave del snapshot de Vista A en session_state.datos_capturados. = '_v4:crm_snapshot'. */
export const CRM_SNAPSHOT_KEY = `${V4_META_PREFIX}crm_snapshot`

/** Subset persistido del grounding (solo Vista A; Vista B vive en el ledger). */
export type CrmSnapshot = Pick<
  CrmGrounding,
  'activeOrder' | 'contact' | 'activeOrderQueryStatus'
>

/**
 * Escribe el snapshot de Vista A bajo CRM_SNAPSHOT_KEY (serializado JSON). NUNCA
 * escribe keys `_v3:*` (D-21). datos_capturados es Record<string,string>.
 */
export function writeCrmSnapshot(
  datosCapturados: Record<string, string>,
  g: CrmGrounding,
): void {
  const snapshot: CrmSnapshot = {
    activeOrder: g.activeOrder,
    contact: g.contact,
    activeOrderQueryStatus: g.activeOrderQueryStatus,
  }
  datosCapturados[CRM_SNAPSHOT_KEY] = JSON.stringify(snapshot)
}

/**
 * Lee el snapshot de Vista A. null graceful si la key esta ausente o el JSON es
 * invalido (no lanza).
 */
export function readCrmSnapshot(datosCapturados: Record<string, string>): CrmSnapshot | null {
  const raw = datosCapturados[CRM_SNAPSHOT_KEY]
  if (!raw) return null
  try {
    return JSON.parse(raw) as CrmSnapshot
  } catch {
    return null
  }
}
