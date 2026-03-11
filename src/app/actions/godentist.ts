'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { sendTemplateMessage } from '@/lib/whatsapp/api'

// ── Types ──

export interface GodentistAppointment {
  nombre: string
  telefono: string
  hora: string
  sucursal: string
  estado: string
}

interface ScrapeResult {
  success: boolean
  date: string
  totalAppointments: number
  appointments: GodentistAppointment[]
  errors?: string[]
}

export interface SendResult {
  total: number
  sent: number
  failed: number
  excluded: number
  details: Array<{
    nombre: string
    telefono: string
    status: 'sent' | 'failed' | 'excluded'
    error?: string
  }>
}

// ── Constants ──

const ROBOT_URL = 'https://godentist-production.up.railway.app'
const TEMPLATE_NAME = 'confirmacion_asist_godentist'
const SEND_DELAY_MS = 500

const SUCURSAL_ADDRESSES: Record<string, string> = {
  'CABECERA': 'Calle 52 # 31-32 Edificio Elsita Piso 1',
  'JUMBO EL BOSQUE': 'Autopista Floridablanca # 24-26; CC Jumbo El Bosque, Floridablanca; Local 2030',
  'FLORIDABLANCA': 'Calle 4 # 3-06 Edificio Florida Plaza Condominio Local 1',
  'MEJORAS PUBLICAS': 'Calle 41 # 27-63 Edificio Ó41 Centro Empresarial Oficina 1002',
}

// ── Helpers ──

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatDateSpanish(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${days[date.getDay()]} ${day} de ${months[date.getMonth()]}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Server Actions ──

export async function scrapeAppointments(sucursales?: string[]): Promise<{ error?: string; data?: ScrapeResult }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  try {
    const res = await fetch(`${ROBOT_URL}/api/scrape-appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        credentials: { username: 'JROMERO', password: '123456' },
        ...(sucursales?.length ? { sucursales } : {}),
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return { error: `Robot error (${res.status}): ${text}` }
    }

    const data: ScrapeResult = await res.json()
    return { data }
  } catch (err) {
    return { error: `Error conectando al robot: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function sendConfirmations(
  appointments: GodentistAppointment[],
  date: string
): Promise<{ error?: string; data?: SendResult }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  // Get workspace API key
  const { data: wsData } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()
  const apiKey = wsData?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
  if (!apiKey) return { error: 'API key de WhatsApp no configurada' }

  const fechaFormateada = formatDateSpanish(date)
  const result: SendResult = { total: appointments.length, sent: 0, failed: 0, excluded: 0, details: [] }

  for (const apt of appointments) {
    // Skip cancelled
    if (apt.estado.toLowerCase().includes('cancelada')) {
      result.excluded++
      result.details.push({ nombre: apt.nombre, telefono: apt.telefono, status: 'excluded' })
      continue
    }

    const address = SUCURSAL_ADDRESSES[apt.sucursal.toUpperCase()] || apt.sucursal

    try {
      await sendTemplateMessage(apiKey, apt.telefono, TEMPLATE_NAME, 'es', [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: toTitleCase(apt.nombre) },
            { type: 'text', text: toTitleCase(apt.sucursal) },
            { type: 'text', text: fechaFormateada },
            { type: 'text', text: apt.hora },
            { type: 'text', text: address },
          ],
        },
      ])
      result.sent++
      result.details.push({ nombre: apt.nombre, telefono: apt.telefono, status: 'sent' })
    } catch (err) {
      result.failed++
      result.details.push({
        nombre: apt.nombre,
        telefono: apt.telefono,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Rate limit delay
    await sleep(SEND_DELAY_MS)
  }

  return { data: result }
}
