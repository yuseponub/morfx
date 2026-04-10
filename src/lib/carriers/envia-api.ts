// ============================================================================
// Envia Status API Client
// Thin fetch wrapper for consulting shipment status via Envia's REST API.
// No new npm packages — uses native fetch with AbortSignal.timeout.
// ============================================================================

const ENVIA_STATUS_URL =
  'https://hub.envia.co/ServicioRestConsultaEstados/Service1Consulta.svc/ConsultaEstadoGuia'

export interface EnviaStatusNovedad {
  cod_novedad: number
  novedad: string
  fecha: string
  mca_estado: string
  detalle?: string
}

export interface EnviaStatusResponse {
  estado: string
  cod_estadog: number
  fec_recoleccion: string | null
  fec_despacho: string | null
  fec_bodega_destino: string | null
  fec_reparto: string | null
  fec_entrega: string | null
  novedades: EnviaStatusNovedad[]
  [key: string]: unknown
}

/**
 * Fetch the current status for an Envia guide number.
 * Returns null on any error (network, timeout, non-OK status).
 * Timeout: 10s per request.
 */
export async function fetchEnviaStatus(
  guia: string
): Promise<EnviaStatusResponse | null> {
  try {
    const res = await fetch(`${ENVIA_STATUS_URL}/${guia}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    return (await res.json()) as EnviaStatusResponse
  } catch {
    return null
  }
}
