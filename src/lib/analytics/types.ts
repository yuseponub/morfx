export type Period = 'today' | '7days' | '30days' | 'month'

export interface OrderMetrics {
  totalOrders: number
  totalValue: number
  conversionRate: number  // percentage
  avgTicket: number
  // Comparison to previous period
  ordersDelta?: number    // percentage change
  valueDelta?: number     // percentage change
}

export interface TrendDataPoint {
  date: string           // ISO date string
  label: string          // Display label (e.g., "Lun 3")
  orders: number
  value: number
}

export interface SalesTrend {
  data: TrendDataPoint[]
  totalOrders: number
  totalValue: number
}
