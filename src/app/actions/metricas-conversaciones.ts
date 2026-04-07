'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type {
  Period,
  DailyMetric,
  MetricTotals,
  MetricsPayload,
} from '@/lib/metricas-conversaciones/types'

/**
 * Compute [start, endExclusive) anchored to America/Bogota midnights.
 *
 * BUG FIX: La version anterior usaba `new Date(new Date().toLocaleString('en-US', {tz}))`
 * + `startOfDay()` de date-fns. Eso produce UTC midnights (porque Vercel corre en UTC),
 * NO Bogota midnights. Resultado: el rango "hoy" cubria [Bogota Apr 5 19:00, Apr 6 19:00)
 * en lugar de [Apr 6 00:00, Apr 7 00:00), perdiendo cualquier evento entre las 19:00 y
 * 23:59 hora Colombia.
 *
 * FIX: derivar la fecha calendario de Bogota via Intl.DateTimeFormat (en-CA → YYYY-MM-DD)
 * y construir Date instants con offset explicito "-05:00" (Colombia no observa DST).
 *
 * Pattern from CLAUDE.md Rule 2.
 */
const BOGOTA_OFFSET = '-05:00'

function todayInBogota(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function bogotaMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00${BOGOTA_OFFSET}`)
}

/** Add (or subtract) calendar days to a YYYY-MM-DD string. CO has no DST, safe in UTC. */
function shiftBogotaDate(dateStr: string, days: number): string {
  const d = bogotaMidnight(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  // The result is still at Bogota midnight (05:00 UTC), so the UTC calendar date
  // matches the Bogota calendar date. slice(0,10) extracts YYYY-MM-DD safely.
  return d.toISOString().slice(0, 10)
}

function getRange(period: Period): { start: Date; endExclusive: Date } {
  // Custom range object: dates already in YYYY-MM-DD form from the date picker
  if (typeof period === 'object' && period !== null) {
    return {
      start: bogotaMidnight(period.start),
      endExclusive: bogotaMidnight(shiftBogotaDate(period.end, 1)),
    }
  }

  const today = todayInBogota()
  const tomorrow = shiftBogotaDate(today, 1)

  switch (period) {
    case 'today':
      return {
        start: bogotaMidnight(today),
        endExclusive: bogotaMidnight(tomorrow),
      }
    case 'yesterday':
      return {
        start: bogotaMidnight(shiftBogotaDate(today, -1)),
        endExclusive: bogotaMidnight(today),
      }
    case '7days':
      // Last 7 days inclusive of today
      return {
        start: bogotaMidnight(shiftBogotaDate(today, -6)),
        endExclusive: bogotaMidnight(tomorrow),
      }
    case '30days':
      return {
        start: bogotaMidnight(shiftBogotaDate(today, -29)),
        endExclusive: bogotaMidnight(tomorrow),
      }
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
