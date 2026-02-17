/**
 * TEMPORARY ROUTE — Send templates to all orders in "AGENDADO" stage.
 * DELETE THIS FILE after use.
 *
 * GET  → Dry run: shows what would be sent
 * POST → Execute: actually sends the templates
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTemplateMessage } from '@/lib/domain/messages'
import type { DomainContext } from '@/lib/domain/types'

// City → Department mapping for Colombian municipalities
const CITY_DEPARTMENT: Record<string, string> = {
  'palmira': 'Valle del Cauca',
  'cali': 'Valle del Cauca',
  'bogota': 'Bogotá D.C.',
  'bogotá': 'Bogotá D.C.',
  'medellin': 'Antioquia',
  'medellín': 'Antioquia',
  'barranquilla': 'Atlántico',
  'cartagena': 'Bolívar',
  'bucaramanga': 'Santander',
  'pereira': 'Risaralda',
  'manizales': 'Caldas',
  'armenia': 'Quindío',
  'ibague': 'Tolima',
  'ibagué': 'Tolima',
  'neiva': 'Huila',
  'villavicencio': 'Meta',
  'pasto': 'Nariño',
  'popayan': 'Cauca',
  'popayán': 'Cauca',
  'tunja': 'Boyacá',
  'monteria': 'Córdoba',
  'montería': 'Córdoba',
  'santa marta': 'Magdalena',
  'valledupar': 'Cesar',
  'sincelejo': 'Sucre',
  'cucuta': 'Norte de Santander',
  'cúcuta': 'Norte de Santander',
  'floridablanca': 'Santander',
  'soacha': 'Cundinamarca',
  'bello': 'Antioquia',
  'envigado': 'Antioquia',
  'itagui': 'Antioquia',
  'itagüí': 'Antioquia',
  'dosquebradas': 'Risaralda',
  'tulua': 'Valle del Cauca',
  'tuluá': 'Valle del Cauca',
  'buga': 'Valle del Cauca',
  'cartago': 'Valle del Cauca',
  'jamundi': 'Valle del Cauca',
  'jamundí': 'Valle del Cauca',
  'yumbo': 'Valle del Cauca',
  'zipaquira': 'Cundinamarca',
  'zipaquirá': 'Cundinamarca',
  'girardot': 'Cundinamarca',
  'fusagasuga': 'Cundinamarca',
  'fusagasugá': 'Cundinamarca',
  'chia': 'Cundinamarca',
  'chía': 'Cundinamarca',
  'pueblo bello': 'Cesar',
  'neiva huila': 'Huila',
  'flandesparquevictoria': 'Tolima',
  'flandes': 'Tolima',
  'el cocuy': 'Boyacá',
}

function getDepartment(city: string | null): string {
  if (!city) return 'Colombia'
  const normalized = city.toLowerCase().trim()
  return CITY_DEPARTMENT[normalized] || 'Colombia'
}

function getMultiplier(totalValue: number): string {
  if (totalValue <= 77900) return '1X'
  if (totalValue <= 109900) return '2X'
  return '3X'
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value)
}

async function getAgendadoOrders() {
  const supabase = createAdminClient()

  // Find the "AGENDADO" stage
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, name, pipeline_id')
    .ilike('name', '%agendado%')

  if (!stages || stages.length === 0) {
    return { error: 'No se encontró stage AGENDADO', orders: [] }
  }

  const stageIds = stages.map(s => s.id)

  // Get all orders in AGENDADO with contact and products
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id,
      workspace_id,
      total_value,
      shipping_address,
      shipping_city,
      contact_id,
      contacts!orders_contact_id_fkey (
        id,
        name,
        phone
      ),
      order_products (
        id,
        title,
        unit_price,
        quantity,
        subtotal
      )
    `)
    .in('stage_id', stageIds)

  if (error) {
    return { error: error.message, orders: [] }
  }

  // Get conversations for each contact
  const enriched = []
  for (const order of orders || []) {
    const contact = order.contacts as unknown as { id: string; name: string; phone: string } | null
    if (!contact?.phone) continue

    const { data: conversation } = await supabase
      .from('conversations')
      .select('id, phone')
      .eq('workspace_id', order.workspace_id)
      .eq('contact_id', contact.id)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    enriched.push({
      orderId: order.id,
      workspaceId: order.workspace_id,
      totalValue: Number(order.total_value),
      shippingAddress: order.shipping_address,
      shippingCity: order.shipping_city,
      department: getDepartment(order.shipping_city),
      contact: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
      },
      conversationId: conversation?.id || null,
      products: order.order_products,
      multiplier: getMultiplier(Number(order.total_value)),
    })
  }

  return { error: null, orders: enriched }
}

// GET = dry run
export async function GET() {
  const { error, orders } = await getAgendadoOrders()

  if (error) {
    return NextResponse.json({ error }, { status: 500 })
  }

  const preview = orders.map(o => ({
    orderId: o.orderId,
    contact: o.contact.name,
    phone: o.contact.phone,
    hasConversation: !!o.conversationId,
    totalValue: formatCurrency(o.totalValue),
    templates: {
      pedido_recibido: {
        '{{1}}': o.contact.name,
        '{{2}}': o.multiplier,
        '{{3}}': formatCurrency(o.totalValue),
      },
      direccion_entrega: {
        '{{1}}': o.shippingAddress || '(SIN DIRECCIÓN)',
        '{{2}}': o.shippingCity || '(SIN CIUDAD)',
        '{{3}}': o.department,
      },
      confirmar_compra: '(sin variables)',
    },
  }))

  return NextResponse.json({
    total: orders.length,
    sinConversacion: orders.filter(o => !o.conversationId).length,
    sinDireccion: orders.filter(o => !o.shippingAddress).length,
    orders: preview,
  })
}

// POST = execute send
export async function POST() {
  const { error, orders } = await getAgendadoOrders()

  if (error) {
    return NextResponse.json({ error }, { status: 500 })
  }

  // Get API key
  const supabase = createAdminClient()
  const firstOrder = orders[0]
  if (!firstOrder) {
    return NextResponse.json({ error: 'No hay órdenes en AGENDADO' }, { status: 404 })
  }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', firstOrder.workspaceId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = workspace?.settings as any
  const apiKey = settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'No hay API key de WhatsApp' }, { status: 500 })
  }

  const results: Array<{ orderId: string; contact: string; status: string; errors: string[] }> = []

  for (const order of orders) {
    const orderResult = { orderId: order.orderId, contact: order.contact.name, status: 'ok', errors: [] as string[] }

    if (!order.conversationId) {
      orderResult.status = 'skipped'
      orderResult.errors.push('Sin conversación WhatsApp')
      results.push(orderResult)
      continue
    }

    const ctx: DomainContext = { workspaceId: order.workspaceId, source: 'automation' }

    // Template 1: pedido_recibido
    try {
      await sendTemplateMessage(ctx, {
        conversationId: order.conversationId,
        contactPhone: order.contact.phone,
        templateName: 'pedido_recibido',
        templateLanguage: 'es',
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: order.contact.name },
            { type: 'text', text: order.multiplier },
            { type: 'text', text: formatCurrency(order.totalValue) },
          ],
        }],
        renderedText: `Pedido recibido - ${order.contact.name}, ${order.multiplier}, ${formatCurrency(order.totalValue)}`,
        apiKey,
      })
    } catch (e) {
      orderResult.errors.push(`pedido_recibido: ${e instanceof Error ? e.message : String(e)}`)
    }

    // Template 2: direccion_entrega
    try {
      await sendTemplateMessage(ctx, {
        conversationId: order.conversationId,
        contactPhone: order.contact.phone,
        templateName: 'direccion_entrega',
        templateLanguage: 'es',
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: order.shippingAddress || 'Sin dirección' },
            { type: 'text', text: order.shippingCity || 'Sin ciudad' },
            { type: 'text', text: order.department },
          ],
        }],
        renderedText: `Dirección de entrega: ${order.shippingAddress || 'N/A'}, ${order.shippingCity || 'N/A'}, ${order.department}`,
        apiKey,
      })
    } catch (e) {
      orderResult.errors.push(`direccion_entrega: ${e instanceof Error ? e.message : String(e)}`)
    }

    // Template 3: confirmar_compra (no variables)
    try {
      await sendTemplateMessage(ctx, {
        conversationId: order.conversationId,
        contactPhone: order.contact.phone,
        templateName: 'confirmar_compra',
        templateLanguage: 'es',
        renderedText: 'Confirmar compra',
        apiKey,
      })
    } catch (e) {
      orderResult.errors.push(`confirmar_compra: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (orderResult.errors.length > 0) {
      orderResult.status = 'partial'
    }
    results.push(orderResult)
  }

  return NextResponse.json({
    total: results.length,
    ok: results.filter(r => r.status === 'ok').length,
    partial: results.filter(r => r.status === 'partial').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    results,
  })
}
