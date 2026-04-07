'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { startOfDay, subDays, addDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type {
  Period,
  DailyMetric,
  MetricTotals,
  MetricsPayload,
} from '@/lib/metricas-conversaciones/types'

/**
 * Compute [start, endExclusive) in America/Bogota timezone.
 *
 * Vercel serverless runs in UTC, so `new Date()` returns the current UTC instant.
 * To get "today in Bogota", we re-parse the locale string in en-US format (which
 * yields a string the Date constructor can parse) with timeZone: 'America/Bogota'.
 * This produces a Date whose calendar fields match Bogota wall-clock time.
 *
 * Pattern from CLAUDE.md Rule 2.
 */
function getRange(period: Period): { start: Date; endExclusive: Date } {
  // Custom range object
  if (typeof period === 'object' && period !== null) {
    const start = startOfDay(parseISO(period.start))
    const endExclusive = addDays(startOfDay(parseISO(period.end)), 1)
    return { start, endExclusive }
  }

  const nowBogota = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })
  )
  const todayStart = startOfDay(nowBogota)
  const tomorrowStart = addDays(todayStart, 1)

  switch (period) {
    case 'today':
      return { start: todayStart, endExclusive: tomorrowStart }
    case 'yesterday':
      return { start: startOfDay(subDays(nowBogota, 1)), endExclusive: todayStart }
    case '7days':
      // Last 7 days inclusive of today
      return { start: startOfDay(subDays(nowBogota, 6)), endExclusive: tomorrowStart }
    case '30days':
      return { start: startOfDay(subDays(nowBogota, 29)), endExclusive: tomorrowStart }
  }
}

const EMPTY: MetricsPayload = {
  totals: { nuevas: 0, reabiertas: 0, agendadas: 0 },
  daily: [],
}

export async function getConversationMetrics(period: Period): Promise<MetricsPayload> {
  const supabase = await createClient()

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return EMPTY

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return EMPTY

  // Read per-workspace settings (reopen_window_days, scheduled_tag_name)
  const { data: ws } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()

  const cfg = ((ws?.settings as Record<string, unknown> | null)?.conversation_metrics ?? {}) as {
    reopen_window_days?: unknown
    scheduled_tag_name?: unknown
  }
  const reopenDays =
    typeof cfg.reopen_window_days === 'number' ? cfg.reopen_window_days : 7
  const tagName =
    typeof cfg.scheduled_tag_name === 'string' ? cfg.scheduled_tag_name : 'VAL'

  const { start, endExclusive } = getRange(period)

  // Call RPC from Plan 01 migration
  const { data, error } = await supabase.rpc('get_conversation_metrics', {
    p_workspace_id: workspaceId,
    p_start: start.toISOString(),
    p_end: endExclusive.toISOString(),
    p_reopen_days: reopenDays,
    p_tag_name: tagName,
  })

  if (error) {
    console.error('[metricas-conversaciones] RPC error:', error)
    return EMPTY
  }

  const rows = (data ?? []) as Array<{
    day: string
    nuevas: number | string | null
    reabiertas: number | string | null
    agendadas: number | string | null
  }>

  const daily: DailyMetric[] = rows.map((r) => ({
    date: r.day,
    label: format(parseISO(r.day), 'EEE d', { locale: es }),
    nuevas: Number(r.nuevas) || 0,
    reabiertas: Number(r.reabiertas) || 0,
    agendadas: Number(r.agendadas) || 0,
  }))

  const totals: MetricTotals = daily.reduce<MetricTotals>(
    (acc, d) => ({
      nuevas: acc.nuevas + d.nuevas,
      reabiertas: acc.reabiertas + d.reabiertas,
      agendadas: acc.agendadas + d.agendadas,
    }),
    { nuevas: 0, reabiertas: 0, agendadas: 0 }
  )

  return { totals, daily }
}
