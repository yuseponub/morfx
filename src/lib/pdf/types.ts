/** Input order data from domain layer (OrderForGuideGen shape) */
export interface GuideGenOrder {
  id: string
  name: string | null
  contactName: string | null
  contactPhone: string | null
  shippingAddress: string | null
  shippingCity: string | null
  shippingDepartment: string | null
  totalValue: number
  products: Array<{ sku: string | null; title: string | null; quantity: number }>
  customFields: Record<string, unknown>
  tags: string[]
}

/** Normalized order data (output of Claude AI) */
export interface NormalizedOrder {
  orderId: string       // Original order ID for mapping
  numero: string        // Shipping number (order name)
  nombre: string        // First name UPPERCASE
  apellido: string      // Last name UPPERCASE
  direccion: string     // Full address
  barrio: string        // Neighborhood
  ciudad: string        // "BUCARAMANGA (STDER)"
  telefono: string      // 10-digit phone
  valorCobrar: string   // "$77.900"
  valorNumerico: number // Raw numeric value for Excel
  pagoAnticipado: boolean
  unidades: number
}

/** Envia Excel row data */
export interface EnviaOrderData {
  valor: number
  nombre: string
  telefono: string
  direccion: string
  municipio: string
  departamento: string
  /** Opcional: true si la orden contiene productos que NO son Elixir puro.
   *  Usado por generateEnviaExcel para pintar la fila en amarillo. */
  isMixed?: boolean
  /** Opcional: labels UPPERCASE de los productos (ej "ELIXIR + ASHWAGANDHA")
   *  o string vacio si la orden es safe. Renderizado en la columna COMBINACION. */
  combinacion?: string
}
