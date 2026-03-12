'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { sendTemplateMessage } from '@/lib/domain/messages'
import { findOrCreateConversation, linkContactToConversation } from '@/lib/domain/conversations'
import { assignTag } from '@/lib/domain/tags'
import { createContact } from '@/lib/domain/contacts'
import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/inngest/client'

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
const TEMPLATE_CONFIRMACION_CITA = 'confirmacion_cita'
const SEND_DELAY_MS = 500

const SUCURSAL_ADDRESSES: Record<string, string> = {
  'CABECERA': 'Calle 52 # 31-32 Edificio Elsita Piso 1',
  'JUMBO EL BOSQUE': 'Autopista Floridablanca # 24-26; CC Jumbo El Bosque, Floridablanca; Local 2030',
  'FLORIDABLANCA': 'Calle 4 # 3-06 Edificio Florida Plaza Condominio Local 1',
  'MEJORAS PUBLICAS': 'Calle 41 # 27-63 Edificio Ó41 Centro Empresarial Oficina 1002',
}

const SUCURSAL_TAGS: Record<string, string> = {
  'CABECERA': 'CAB',
  'FLORIDABLANCA': 'FLO',
  'JUMBO EL BOSQUE': 'JUM',
  'MEJORAS PUBLICAS': 'MEJ',
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

export interface ScrapeHistoryEntry {
  id: string
  scraped_date: string
  sucursales: string[]
  appointments: GodentistAppointment[]
  total_appointments: number
  send_results: SendResult | null
  sent_at: string | null
  created_at: string
}

export async function scrapeAppointments(sucursales?: string[], targetDate?: string): Promise<{ error?: string; data?: ScrapeResult; historyId?: string }> {
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
        ...(targetDate ? { targetDate } : {}),
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return { error: `Robot error (${res.status}): ${text}` }
    }

    const data: ScrapeResult = await res.json()

    // Save to history
    let savedHistoryId: string | undefined
    try {
      const admin = createAdminClient()
      const insertPayload = {
        workspace_id: workspaceId,
        scraped_date: data.date,
        sucursales: sucursales || ['CABECERA', 'FLORIDABLANCA', 'JUMBO EL BOSQUE', 'MEJORAS PUBLICAS'],
        appointments: JSON.parse(JSON.stringify(data.appointments)),
        total_appointments: data.appointments.length,
      }
      console.log('[godentist] Saving history, workspace:', workspaceId, 'date:', data.date, 'count:', data.appointments.length)
      const { data: historyRow, error: historyError } = await admin
        .from('godentist_scrape_history')
        .insert(insertPayload)
        .select('id')
        .single()

      if (historyError) {
        console.error('[godentist] History insert FAILED:', JSON.stringify(historyError))
      } else {
        savedHistoryId = historyRow?.id
        console.log('[godentist] History saved:', savedHistoryId)
      }
    } catch (histErr) {
      console.error('[godentist] History save threw:', histErr)
    }

    return { data, historyId: savedHistoryId }
  } catch (err) {
    return { error: `Error conectando al robot: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function sendConfirmations(
  appointments: GodentistAppointment[],
  date: string,
  historyId?: string
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
  const domainCtx = { workspaceId, source: 'server-action' }
  const result: SendResult = { total: appointments.length, sent: 0, failed: 0, excluded: 0, details: [] }

  for (const apt of appointments) {
    // Skip cancelled
    if (apt.estado.toLowerCase().includes('cancelada')) {
      result.excluded++
      result.details.push({ nombre: apt.nombre, telefono: apt.telefono, status: 'excluded' })
      continue
    }

    const address = SUCURSAL_ADDRESSES[apt.sucursal.toUpperCase()] || apt.sucursal
    const nombreTitleCase = toTitleCase(apt.nombre)
    const sucursalTitleCase = toTitleCase(apt.sucursal)
    // Normalize phone: ensure +57 prefix to match WhatsApp format
    const phone = apt.telefono.startsWith('+') ? apt.telefono : `+${apt.telefono}`

    // Rendered text for DB storage (what the client sees)
    const renderedText = `¡Hola, ${nombreTitleCase}! ☺️ Te esperamos en godentist®️ ${sucursalTitleCase} el ${fechaFormateada} a las ${apt.hora}. 📍Dirección: ${address} Llega 5 minutos antes con tu documento para el registro.`

    try {
      const tagName = SUCURSAL_TAGS[apt.sucursal.toUpperCase()]

      // Step 1: Find or create contact
      const contactId = await findOrCreateContact(domainCtx, phone, nombreTitleCase, tagName)

      // Step 2: Find or create conversation, link contact
      const convResult = await findOrCreateConversation(domainCtx, {
        phone,
        profileName: nombreTitleCase,
        contactId: contactId || undefined,
      })

      if (!convResult.success || !convResult.data) {
        result.failed++
        result.details.push({
          nombre: apt.nombre,
          telefono: apt.telefono,
          status: 'failed',
          error: convResult.error || 'No se pudo crear conversación',
        })
        continue
      }

      const conversationId = convResult.data.conversationId

      // Step 3: Link contact to conversation (if contact exists and conv already existed)
      if (contactId && !convResult.data.created) {
        await linkContactToConversation(domainCtx, { conversationId, contactId })
          .catch(err => console.error(`[godentist] Link contact error: ${err}`))
      }

      // Step 4: Assign tag to contact (contact is source of truth for tags)
      if (tagName && contactId) {
        await assignTag(domainCtx, {
          entityType: 'contact',
          entityId: contactId,
          tagName,
        }).catch(err => console.error(`[godentist] Contact tag error: ${err}`))
      }

      // Step 5: Send template via domain layer (sends + stores in DB)
      const sendResult = await sendTemplateMessage(domainCtx, {
        conversationId,
        contactPhone: phone,
        templateName: TEMPLATE_NAME,
        templateLanguage: 'es',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombreTitleCase },
              { type: 'text', text: sucursalTitleCase },
              { type: 'text', text: fechaFormateada },
              { type: 'text', text: apt.hora },
              { type: 'text', text: address },
            ],
          },
        ],
        renderedText,
        apiKey,
      })

      // Step 6: Send confirmacion_cita template (no variables)
      if (sendResult.success) {
        await sendTemplateMessage(domainCtx, {
          conversationId,
          contactPhone: phone,
          templateName: TEMPLATE_CONFIRMACION_CITA,
          templateLanguage: 'es',
          components: [],
          renderedText: '',
          apiKey,
        }).catch(err => console.error(`[godentist] confirmacion_cita error: ${err}`))
      }

      if (sendResult.success) {
        result.sent++
        result.details.push({ nombre: apt.nombre, telefono: apt.telefono, status: 'sent' })
      } else {
        result.failed++
        result.details.push({
          nombre: apt.nombre,
          telefono: apt.telefono,
          status: 'failed',
          error: sendResult.error || 'Error desconocido al enviar',
        })
      }
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

  // Save send results to history
  if (historyId) {
    const admin = createAdminClient()
    await admin
      .from('godentist_scrape_history')
      .update({
        send_results: result as unknown as Record<string, unknown>,
        sent_at: new Date().toISOString(),
      })
      .eq('id', historyId)
  }

  return { data: result }
}

// ── History Actions ──

export async function getScrapeHistory(): Promise<{ error?: string; data?: ScrapeHistoryEntry[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('godentist_scrape_history')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return { error: error.message }

  return {
    data: (data || []).map(row => ({
      id: row.id,
      scraped_date: row.scraped_date,
      sucursales: row.sucursales,
      appointments: row.appointments as unknown as GodentistAppointment[],
      total_appointments: row.total_appointments,
      send_results: row.send_results as unknown as SendResult | null,
      sent_at: row.sent_at,
      created_at: row.created_at,
    })),
  }
}

// ── Confirm Appointment Actions ──

function normalizePhone(phone: string): string {
  return phone.replace(/^\+/, '')
}

function convertDateToRobotFormat(yyyymmdd: string): string {
  const [year, month, day] = yyyymmdd.split('-')
  return `${day}-${month}-${year}`
}

export interface ConfirmAppointmentResult {
  error?: string
  success?: boolean
  data?: {
    patientName: string
    previousEstado?: string
    newEstado?: string
    screenshots?: string[]
  }
}

export interface AppointmentInfoResult {
  error?: string
  data?: {
    nombre: string
    hora: string
    sucursal: string
    estado: string
    scraped_date: string
  } | null
}

export async function getAppointmentForContact(contactPhone: string): Promise<AppointmentInfoResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  const admin = createAdminClient()
  const { data: latestScrape, error: scrapeError } = await admin
    .from('godentist_scrape_history')
    .select('appointments, scraped_date')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (scrapeError || !latestScrape) {
    return { data: null }
  }

  const appointments = latestScrape.appointments as unknown as GodentistAppointment[]
  const normalizedInput = normalizePhone(contactPhone)

  const match = appointments.find(apt =>
    normalizePhone(apt.telefono) === normalizedInput
  )

  if (!match) return { data: null }

  return {
    data: {
      nombre: match.nombre,
      hora: match.hora,
      sucursal: match.sucursal,
      estado: match.estado,
      scraped_date: latestScrape.scraped_date,
    },
  }
}

export async function confirmAppointment(
  contactPhone: string,
  contactName: string
): Promise<ConfirmAppointmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  const admin = createAdminClient()
  const { data: latestScrape, error: scrapeError } = await admin
    .from('godentist_scrape_history')
    .select('appointments, scraped_date')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (scrapeError || !latestScrape) {
    return { error: 'No se encontro historial de scrape reciente' }
  }

  const appointments = latestScrape.appointments as unknown as GodentistAppointment[]
  const normalizedInput = normalizePhone(contactPhone)

  const appointment = appointments.find(apt =>
    normalizePhone(apt.telefono) === normalizedInput
  )

  if (!appointment) {
    return { error: 'No se encontro cita para este contacto en el ultimo scrape' }
  }

  const estadoLower = appointment.estado.toLowerCase()
  if (estadoLower.includes('confirmada')) {
    return { error: 'La cita ya esta confirmada' }
  }
  if (estadoLower.includes('cancelada')) {
    return { error: 'La cita esta cancelada' }
  }

  const ddmmyyyy = convertDateToRobotFormat(latestScrape.scraped_date)

  try {
    const res = await fetch(`${ROBOT_URL}/api/confirm-appointment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        credentials: { username: 'JROMERO', password: '123456' },
        patientName: appointment.nombre,
        date: ddmmyyyy,
        sucursal: appointment.sucursal,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return { error: `Robot error (${res.status}): ${text}` }
    }

    const body = await res.json()

    if (body.success) {
      // Assign temporary tag "C" to contact and schedule removal in 48h
      const phone = contactPhone.startsWith('+') ? contactPhone : `+${contactPhone}`
      const { data: contact } = await admin
        .from('contacts')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('phone', phone)
        .single()

      if (contact) {
        const domainCtx = { workspaceId, source: 'server-action' }
        await assignTag(domainCtx, {
          entityType: 'contact',
          entityId: contact.id,
          tagName: 'C',
        }).catch(err => console.error('[godentist] Tag C assign error:', err))

        // Schedule tag removal in 48h via Inngest
        await (inngest.send as any)({
          name: 'godentist/tag.remove_scheduled',
          data: {
            workspaceId,
            contactId: contact.id,
            tagName: 'C',
            removeAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          },
        }).catch((err: Error) => console.error('[godentist] Inngest tag removal schedule error:', err))
      }

      return {
        success: true,
        data: {
          patientName: appointment.nombre,
          previousEstado: appointment.estado,
          newEstado: body.newEstado || 'Confirmada',
          screenshots: body.screenshots,
        },
      }
    }

    return {
      error: body.error || 'Error desconocido',
      data: body.screenshots ? { patientName: appointment.nombre, screenshots: body.screenshots } : undefined,
    }
  } catch (err) {
    return { error: `Error conectando al robot: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ── Reminder Helpers ──

function parseHora(hora: string): { hours: number; minutes: number } {
  // Handle "8:00 AM", "2:30 PM", "14:30" formats
  const match = hora.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!match) return { hours: 8, minutes: 0 } // fallback
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const period = match[3]?.toUpperCase()
  if (period === 'PM' && hours < 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0
  return { hours, minutes }
}

function calculateScheduledAt(fechaCita: string, hora: string): Date {
  const { hours, minutes } = parseHora(hora)
  // fechaCita is YYYY-MM-DD, hora is appointment time in Colombia
  const [y, m, d] = fechaCita.split('-').map(Number)
  // Colombia is UTC-5: add 5 hours to get UTC equivalent
  const citaUtc = new Date(Date.UTC(y, m - 1, d, hours + 5, minutes))
  // Subtract 1 hour for reminder (send 1h before appointment)
  const reminderUtc = new Date(citaUtc.getTime() - 60 * 60 * 1000)
  return reminderUtc
}

// ── Reminder Server Actions ──

export interface ScheduleResult {
  total: number
  scheduled: number
  skipped: number
  details: Array<{
    nombre: string
    telefono: string
    status: 'scheduled' | 'skipped'
    reason?: string
    scheduledAt?: string
  }>
}

export async function scheduleReminders(
  appointments: GodentistAppointment[],
  fechaCita: string,
  historyId?: string
): Promise<{ error?: string; data?: ScheduleResult }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  const admin = createAdminClient()
  const now = new Date()
  const fifteenMinFromNow = new Date(now.getTime() + 15 * 60 * 1000)

  const result: ScheduleResult = { total: appointments.length, scheduled: 0, skipped: 0, details: [] }

  for (const apt of appointments) {
    // Skip cancelled appointments
    if (apt.estado.toLowerCase().includes('cancelada')) {
      result.skipped++
      result.details.push({
        nombre: apt.nombre,
        telefono: apt.telefono,
        status: 'skipped',
        reason: 'Cita cancelada',
      })
      continue
    }

    const scheduledAt = calculateScheduledAt(fechaCita, apt.hora)

    // If scheduledAt is too close or already past
    if (scheduledAt < fifteenMinFromNow) {
      result.skipped++
      result.details.push({
        nombre: apt.nombre,
        telefono: apt.telefono,
        status: 'skipped',
        reason: 'Hora de envio ya paso o es muy pronto',
      })
      continue
    }

    try {
      // Insert reminder row
      const { data: reminderRow, error: insertError } = await admin
        .from('godentist_scheduled_reminders')
        .insert({
          workspace_id: workspaceId,
          nombre: apt.nombre,
          telefono: apt.telefono,
          hora_cita: apt.hora,
          sucursal: apt.sucursal,
          fecha_cita: fechaCita,
          scheduled_at: scheduledAt.toISOString(),
          status: 'pending',
          ...(historyId ? { scrape_history_id: historyId } : {}),
        })
        .select('id')
        .single()

      if (insertError || !reminderRow) {
        result.skipped++
        result.details.push({
          nombre: apt.nombre,
          telefono: apt.telefono,
          status: 'skipped',
          reason: `Error al guardar: ${insertError?.message || 'unknown'}`,
        })
        continue
      }

      // Send Inngest event
      const eventResult = await (inngest as any).send({
        name: 'godentist/reminder.send',
        data: {
          reminderId: reminderRow.id,
          workspaceId,
          nombre: apt.nombre,
          telefono: apt.telefono,
          hora: apt.hora,
          sucursal: apt.sucursal,
          fechaCita,
          scheduledAt: scheduledAt.toISOString(),
        },
      })

      // Update inngest_event_id if available
      const eventId = eventResult?.ids?.[0] || reminderRow.id
      await admin
        .from('godentist_scheduled_reminders')
        .update({ inngest_event_id: eventId })
        .eq('id', reminderRow.id)

      result.scheduled++
      result.details.push({
        nombre: apt.nombre,
        telefono: apt.telefono,
        status: 'scheduled',
        scheduledAt: scheduledAt.toISOString(),
      })
    } catch (err) {
      result.skipped++
      result.details.push({
        nombre: apt.nombre,
        telefono: apt.telefono,
        status: 'skipped',
        reason: `Error: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  return { data: result }
}

export interface ScheduledReminderEntry {
  id: string
  nombre: string
  telefono: string
  hora_cita: string
  sucursal: string
  fecha_cita: string
  scheduled_at: string
  status: string
  error: string | null
  sent_at: string | null
  created_at: string
}

export async function getScheduledReminders(): Promise<{ error?: string; data?: ScheduledReminderEntry[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('godentist_scheduled_reminders')
    .select('id, nombre, telefono, hora_cita, sucursal, fecha_cita, scheduled_at, status, error, sent_at, created_at')
    .eq('workspace_id', workspaceId)
    .order('scheduled_at', { ascending: false })
    .limit(50)

  if (error) return { error: error.message }

  return { data: data as ScheduledReminderEntry[] }
}

export async function cancelScheduledReminder(reminderId: string): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  const admin = createAdminClient()
  const { error, count } = await admin
    .from('godentist_scheduled_reminders')
    .update({ status: 'cancelled' })
    .eq('id', reminderId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')

  if (error) return { error: error.message }

  return { success: true }
}

// ── Contact Helper ──

/**
 * Find contact by phone or create a new one with the given name and tag.
 * Returns contactId or null if both create and lookup fail.
 */
async function findOrCreateContact(
  ctx: { workspaceId: string; source: string },
  phone: string,
  name: string,
  tagName?: string
): Promise<string | null> {
  // Try to create
  const createResult = await createContact(ctx, {
    name,
    phone,
    tags: tagName ? [tagName] : undefined,
  })

  if (createResult.success && createResult.data) {
    return createResult.data.contactId
  }

  // If duplicate (already exists), find the existing contact and assign tag
  if (createResult.error?.includes('Ya existe')) {
    const supabase = createAdminClient()
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('workspace_id', ctx.workspaceId)
      .eq('phone', phone)
      .single()

    if (existing) {
      // Update name
      await supabase
        .from('contacts')
        .update({ name })
        .eq('id', existing.id)
        .eq('workspace_id', ctx.workspaceId)

      // Assign tag if provided
      if (tagName) {
        await assignTag(ctx, {
          entityType: 'contact',
          entityId: existing.id,
          tagName,
        }).catch(err => console.error(`[godentist] Contact tag error: ${err}`))
      }

      return existing.id
    }
  }

  console.error(`[godentist] findOrCreateContact failed: ${createResult.error}`)
  return null
}
