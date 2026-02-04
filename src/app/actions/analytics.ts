'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { startOfDay, subDays, startOfMonth, endOfDay, format, eachDayOfInterval } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Period, OrderMetrics, SalesTrend, TrendDataPoint } from '@/lib/analytics/types'

function getDateRange(period: Period): { start: Date; end: Date } {
  const now = new Date()
  const end = endOfDay(now)

  switch (period) {
    case 'today':
      return { start: startOfDay(now), end }
    case '7days':
      return { start: startOfDay(subDays(now, 6)), end }
    case '30days':
      return { start: startOfDay(subDays(now, 29)), end }
    case 'month':
      return { start: startOfMonth(now), end }
  }
}

export async function getOrderMetrics(period: Period): Promise<OrderMetrics> {
  const supabase = await createClient()

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { totalOrders: 0, totalValue: 0, conversionRate: 0, avgTicket: 0 }
  }

  const { start, end } = getDateRange(period)

  // Fetch orders with stage info for conversion calculation
  const { data: orders } = await supabase
    .from('orders')
    .select('id, total_value, stage:pipeline_stages(is_closed)')
    .eq('workspace_id', workspaceId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())

  const totalOrders = orders?.length ?? 0
  const totalValue = orders?.reduce((sum, o) => sum + (o.total_value || 0), 0) ?? 0

  // Conversion: orders in closed stages / total orders
  const closedOrders = orders?.filter(o => {
    // Stage is returned as an object (single relation via stage_id FK)
    const stage = o.stage as unknown as { is_closed: boolean } | null
    return stage?.is_closed === true
  }).length ?? 0
  const conversionRate = totalOrders > 0 ? (closedOrders / totalOrders) * 100 : 0

  // Average ticket
  const avgTicket = totalOrders > 0 ? totalValue / totalOrders : 0

  return {
    totalOrders,
    totalValue,
    conversionRate: Math.round(conversionRate * 10) / 10, // 1 decimal
    avgTicket: Math.round(avgTicket)
  }
}

export async function getSalesTrend(period: Period): Promise<SalesTrend> {
  const supabase = await createClient()

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { data: [], totalOrders: 0, totalValue: 0 }
  }

  const { start, end } = getDateRange(period)

  // Fetch orders in period
  const { data: orders } = await supabase
    .from('orders')
    .select('id, total_value, created_at')
    .eq('workspace_id', workspaceId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: true })

  // Generate all days in range
  const days = eachDayOfInterval({ start, end })

  // Group orders by day
  const ordersByDay = new Map<string, { orders: number; value: number }>()

  orders?.forEach(order => {
    const dateKey = format(new Date(order.created_at), 'yyyy-MM-dd')
    const existing = ordersByDay.get(dateKey) || { orders: 0, value: 0 }
    ordersByDay.set(dateKey, {
      orders: existing.orders + 1,
      value: existing.value + (order.total_value || 0)
    })
  })

  // Build data points for all days
  const data: TrendDataPoint[] = days.map(day => {
    const dateKey = format(day, 'yyyy-MM-dd')
    const dayData = ordersByDay.get(dateKey) || { orders: 0, value: 0 }

    return {
      date: dateKey,
      label: format(day, 'EEE d', { locale: es }), // "lun. 3"
      orders: dayData.orders,
      value: dayData.value
    }
  })

  const totalOrders = orders?.length ?? 0
  const totalValue = orders?.reduce((sum, o) => sum + (o.total_value || 0), 0) ?? 0

  return { data, totalOrders, totalValue }
}
