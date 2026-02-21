// ============================================================================
// Robot Coordinadora - Shared Types
// Mirrors MorfX contracts (PedidoInput from src/lib/logistics/constants.ts)
// and defines the HTTP API contract.
// ============================================================================

/**
 * PedidoInput -- Data needed to create a Coordinadora shipment.
 * MUST stay in sync with MorfX's PedidoInput (src/lib/logistics/constants.ts).
 */
export interface PedidoInput {
  identificacion: string
  nombres: string
  apellidos: string
  direccion: string
  /** Coordinadora city format: "CITY (DEPT)" */
  ciudad: string
  /** Department abbreviation */
  departamento: string
  celular: string
  email: string
  /** Order reference / name */
  referencia: string
  unidades: number
  totalConIva: number
  valorDeclarado: number
  esRecaudoContraentrega: boolean
  peso: number
  alto: number
  largo: number
  ancho: number
}

/** Portal credentials for Coordinadora ff.coordinadora.com */
export interface Credentials {
  username: string
  password: string
}

/** Single order within a batch request */
export interface OrderInput {
  /** robot_job_items.id from MorfX */
  itemId: string
  /** orders.id from MorfX */
  orderId: string
  /** The shipment data to fill in the portal form */
  pedidoInput: PedidoInput
}

/** Incoming batch request from MorfX (via Inngest orchestrator) */
export interface BatchRequest {
  workspaceId: string
  credentials: Credentials
  callbackUrl: string
  /** Shared secret to include in callback headers for authentication */
  callbackSecret?: string
  jobId: string
  orders: OrderInput[]
}

/** Result reported back to MorfX callback URL per order */
export interface BatchItemResult {
  itemId: string
  status: 'success' | 'error'
  trackingNumber?: string
  errorType?: 'validation' | 'portal' | 'timeout' | 'unknown'
  errorMessage?: string
}

/** Response from the robot's batch endpoint (immediate acknowledgement) */
export interface BatchResponse {
  success: boolean
  jobId?: string
  message: string
  error?: string
}

/** Health check response */
export interface HealthResponse {
  status: 'ok'
  uptime: number
  timestamp: string
}

/** Result from creating a single guia (adapter return) */
export interface GuiaResult {
  success: boolean
  /** Pedido/tracking number from Coordinadora */
  numeroPedido?: string
  error?: string
}
