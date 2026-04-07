export type Period = 'today' | 'yesterday' | '7days' | '30days' | { start: string; end: string }

export interface DailyMetric {
  date: string // ISO date YYYY-MM-DD
  label: string // e.g. "lun 6"
  nuevas: number
  reabiertas: number
  agendadas: number
}

export interface MetricTotals {
  nuevas: number
  reabiertas: number
  agendadas: number
}

export interface MetricsPayload {
  totals: MetricTotals
  daily: DailyMetric[]
}

export interface MetricsSettings {
  enabled: boolean
  reopen_window_days: number
  scheduled_tag_name: string
}

export const DEFAULT_METRICS_SETTINGS: MetricsSettings = {
  enabled: false,
  reopen_window_days: 7,
  scheduled_tag_name: 'VAL',
}
