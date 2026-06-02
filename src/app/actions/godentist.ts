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
  // Plan 05: robot returns total citas observed por sede (audit D-15)
  totalCitas?: number | null
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

export interface FollowupResult {
  nombre: string
  telefono: string
  status: 'sent' | 'skipped' | 'failed'
  reason?: string
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

// Robot v2 captura el rango ("8:00 AM - 8:30 AM") en apt.hora.
// Guardrail: dejamos solo la hora de inicio para mensajes al paciente.
function stripTimeRange(hora: string): string {
  return hora.split(/\s*-\s*/)[0].trim()
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
  followup_results: FollowupResult[] | null
  followup_sent_at: string | null
  created_at: string
}

export async function scrapeAppointments(sucursales?: string[], targetDate?: string): Promise<{ error?: string; data?: ScrapeResult; historyId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  // ── D-10: feature flag with kill-switch semantics (Option A) ──
  // Per CONTEXT.md D-10 + PATTERNS.md §3 + RESEARCH.md §"Implementation Roadmap" Wave 2.
  // fallback=true is MANDATORY (D-10 default ON). If platform_config row missing,
  // helper returns fallback => paradigm F endpoint is used.
  //
  // SEMANTICA: flag=true => paradigm F (default). flag=false => ABORT con error explicito,
  // NO fetch a ningun endpoint. Razon: paradigma A fue borrado del adapter en Plan 05;
  // no existe endpoint legacy en server.ts. Fetchear uno produciria 404 que
  // confundiria al operador (rollback aparente que no funciona). El kill-switch correcto
  // es "abortar nuevos scrapes" hasta que se decida el path de rollback.
  //
  // ROLLBACK REAL a paradigma A: `git revert HEAD del commit del standalone + git push`.
  // Vercel + Railway redeployan; paradigma A vuelve a main. Flag se queda en false hasta
  // que el operador la flipee back a true en el deployment con paradigma A.
  //
  // ROLLBACK SOFT (preventivo, mientras se diagnostica un bug nuevo de paradigma F):
  //   UPDATE platform_config SET value='false'::jsonb WHERE key='use_new_godentist_scraping'
  //   → bloquea nuevos scrapes con error explicito en ≤30s (cache TTL).
  const { getPlatformConfig } = await import('@/lib/domain/platform-config')
  const useNewScraping = await getPlatformConfig<boolean>('use_new_godentist_scraping', true)
  console.log(`[godentist] scrapeAppointments: useNewScraping=${useNewScraping}`)

  if (!useNewScraping) {
    console.error('[godentist] FLAG OFF: aborting scrape (paradigm A removed in standalone godentist-scraping-structural-v2)')
    return {
      error: 'Feature flag use_new_godentist_scraping=false. Paradigm A removed in standalone godentist-scraping-structural-v2. To rollback to paradigm A, git revert the standalone + redeploy.'
    }
  }

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

    // ── D-12: dedupe by (sucursal|telefono|hora) ──
    // Per CONTEXT.md D-12 + RESEARCH.md §Pattern 3: portal Dentos intermitently serves
    // duplicate rows in CABECERA (1-2 per scrape). Silent defense: descarta exactos
    // antes de persistir. NO alarma (es safety net barato, no canary).
    const seen = new Set<string>()
    const dedupedAppointments: GodentistAppointment[] = []
    let dedupedCount = 0
    for (const apt of data.appointments) {
      const key = `${apt.sucursal}|${apt.telefono}|${apt.hora}`
      if (seen.has(key)) {
        dedupedCount++
        continue
      }
      seen.add(key)
      dedupedAppointments.push(apt)
    }
    if (dedupedCount > 0) {
      console.log(`[godentist] D-12 dedupe: removed ${dedupedCount} duplicates from ${data.appointments.length} raw appointments`)
    }
    data.appointments = dedupedAppointments

    // ── D-08: cross-sede canary detector (refined 2026-05-15) ──
    // A phone+nombre appearing in >1 sede within the same scrape = paradigm F
    // invariant violated (same patient cannot be in 2 sedes the same day).
    // Distinct nombres sharing a phone (family sharing contact number) is legitimate
    // and must NOT fire the canary — was causing false positives in prod.
    const normalizeName = (n: string) =>
      (n || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim()
    const keyToInfo = new Map<string, { phone: string; nombre: string; sedes: Set<string> }>()
    for (const apt of data.appointments) {
      const k = `${apt.telefono}|${normalizeName(apt.nombre)}`
      if (!keyToInfo.has(k)) keyToInfo.set(k, { phone: apt.telefono, nombre: apt.nombre, sedes: new Set() })
      keyToInfo.get(k)!.sedes.add(apt.sucursal)
    }
    const crossSedePhones = [...keyToInfo.values()]
      .filter(v => v.sedes.size > 1)
      .map(v => ({ phone: v.phone, nombre: v.nombre, sedes: [...v.sedes] }))
    const isInconsistent = crossSedePhones.length > 0

    let inconsistencyDetails: Record<string, unknown> | null = null
    if (isInconsistent) {
      inconsistencyDetails = {
        crossSedePhones,
        detectedAt: new Date().toISOString(),
        totalAppointments: data.appointments.length,
      }
      console.error(`[godentist] D-08 CROSS-SEDE CANARY FIRED: ${crossSedePhones.length} phones in >1 sede`, JSON.stringify(crossSedePhones))

      // CRITICAL Pitfall (per CLAUDE.md MEMORY): ALWAYS await inngest.send in serverless.
      // Vercel terminates lambda right after res.json(); in-flight unawaited
      // inngest.send Promises are DROPPED.
      await (inngest.send as any)({
        name: 'godentist/scrape.inconsistent',
        data: {
          workspaceId,
          scrapedDate: data.date,
          crossSedePhones,
          detectedAt: new Date().toISOString(),
        },
      })
    }

    // ── Save to history with new columns ──
    let savedHistoryId: string | undefined
    try {
      const admin = createAdminClient()
      const insertPayload = {
        workspace_id: workspaceId,
        scraped_date: data.date,
        sucursales: sucursales || ['CABECERA', 'FLORIDABLANCA', 'JUMBO EL BOSQUE', 'MEJORAS PUBLICAS'],
        appointments: JSON.parse(JSON.stringify(data.appointments)),
        total_appointments: data.appointments.length,
        // ── D-08 columns (Plan 01 migration applied) ──
        inconsistent: isInconsistent,
        inconsistency_details: inconsistencyDetails,
        // ── D-15 audit (Plan 01 migration applied + Plan 05 robot returns) ──
        total_citas: data.totalCitas ?? null,
      }
      console.log('[godentist] Saving history, workspace:', workspaceId, 'date:', data.date, 'count:', data.appointments.length, 'inconsistent:', isInconsistent)
      const { data: historyRow, error: historyError } = await admin
        .from('godentist_scrape_history')
        .insert(insertPayload)
        .select('id')
        .single()

      if (historyError) {
        console.error('[godentist] History insert FAILED:', JSON.stringify(historyError))
      } else {
        savedHistoryId = historyRow?.id
        console.log('[godentist] History saved:', savedHistoryId, 'inconsistent:', isInconsistent)
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

  // ── D-08 (relaxed 2026-06-02): cross-sede canary is WARN-ONLY, never blocks ──
  // El canary genera falsos positivos (un mismo paciente con citas en 2 sedes a horas
  // distintas el mismo día es legítimo — p.ej. CABECERA AM + FLORIDABLANCA PM). Bloquear
  // el envío por eso dejaba sin recordatorios a toda la operación del día. Decisión del
  // operador: "no crees bloqueos, solo reintentos". Conservamos la detección (badge UI +
  // inconsistency_details + evento Inngest godentist/scrape.inconsistent) como señal de
  // auditoría, pero NO abortamos el envío.
  if (historyId) {
    const adminGate = createAdminClient()
    const { data: scrapeRow } = await adminGate
      .from('godentist_scrape_history')
      .select('inconsistent')
      .eq('id', historyId)
      .eq('workspace_id', workspaceId)
      .single()
    if (scrapeRow?.inconsistent) {
      console.warn(`[godentist] sendConfirmations: scrape ${historyId} marked inconsistent (WARN-ONLY, proceeding)`)
    }
  }

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

    const horaInicio = stripTimeRange(apt.hora)

    // Rendered text for DB storage (what the client sees)
    const renderedText = `¡Hola, ${nombreTitleCase}! ☺️ Te esperamos en godentist®️ ${sucursalTitleCase} el ${fechaFormateada} a las ${horaInicio}. 📍Dirección: ${address} Llega 5 minutos antes con tu documento para el registro.`

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
              { type: 'text', text: horaInicio },
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
          renderedText: '¿Deseas confirmar tu cita?',
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

  // Schedule 2pm followup check (only if sent before 2pm Colombia time)
  if (historyId && result.sent > 0) {
    try {
      // Calculate 2pm Colombia today = 19:00 UTC same day
      // Get current Colombia date/hour
      const nowColombia = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
      const colombiaHour = nowColombia.getHours()

      if (colombiaHour < 14) {
        // Build 2pm Colombia today in UTC: take today's date in Colombia, set to 19:00 UTC
        const todayColombia = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })
        const [y, m, d] = todayColombia.split('-').map(Number)
        // 2pm Colombia = 19:00 UTC (Colombia is UTC-5, no DST)
        const scheduledAt = new Date(Date.UTC(y, m - 1, d, 19, 0, 0)).toISOString()

        await (inngest.send as any)({
          name: 'godentist/followup.check',
          data: {
            historyId,
            workspaceId,
            scheduledAt,
          },
        })
        console.log(`[godentist] Followup check scheduled for ${scheduledAt}`)
      } else {
        console.log(`[godentist] Skipping followup — sent after 2pm Colombia (hour=${colombiaHour})`)
      }
    } catch (err) {
      console.error('[godentist] Failed to schedule followup:', err)
      // Non-blocking — confirmations were already sent successfully
    }
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
      followup_results: (row.followup_results as unknown as FollowupResult[]) || null,
      followup_sent_at: row.followup_sent_at,
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
  const { data: scrapes, error: scrapeError } = await admin
    .from('godentist_scrape_history')
    .select('appointments, scraped_date')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (scrapeError || !scrapes?.length) {
    return { data: null }
  }

  const normalizedInput = normalizePhone(contactPhone)

  for (const scrape of scrapes) {
    const appointments = scrape.appointments as unknown as GodentistAppointment[]
    const match = appointments.find(apt =>
      normalizePhone(apt.telefono) === normalizedInput
    )
    if (match) {
      return {
        data: {
          nombre: match.nombre,
          hora: match.hora,
          sucursal: match.sucursal,
          estado: match.estado,
          scraped_date: scrape.scraped_date,
        },
      }
    }
  }

  return { data: null }
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
  const { data: scrapes, error: scrapeError } = await admin
    .from('godentist_scrape_history')
    .select('appointments, scraped_date')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (scrapeError || !scrapes?.length) {
    return { error: 'No se encontro historial de scrape reciente' }
  }

  const normalizedInput = normalizePhone(contactPhone)
  let appointment: GodentistAppointment | undefined
  let scrapedDate: string = ''

  for (const scrape of scrapes) {
    const appointments = scrape.appointments as unknown as GodentistAppointment[]
    const match = appointments.find(apt =>
      normalizePhone(apt.telefono) === normalizedInput
    )
    if (match) {
      appointment = match
      scrapedDate = scrape.scraped_date
      break
    }
  }

  if (!appointment) {
    return { error: 'No se encontro cita para este contacto en los scrapes recientes' }
  }

  const estadoLower = appointment.estado.toLowerCase()
  if (estadoLower.includes('confirmada')) {
    return { error: 'La cita ya esta confirmada' }
  }
  if (estadoLower.includes('cancelada')) {
    return { error: 'La cita esta cancelada' }
  }

  const ddmmyyyy = convertDateToRobotFormat(scrapedDate)

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

  // ── D-08 (relaxed 2026-06-02): cross-sede canary is WARN-ONLY, never blocks ──
  // Mismo criterio que sendConfirmations: el canary advierte pero no bloquea la
  // programación. Ver nota en sendConfirmations. La detección sigue activa (badge UI +
  // inconsistency_details + evento Inngest) para auditoría posterior.
  if (historyId) {
    const adminGate = createAdminClient()
    const { data: scrapeRow } = await adminGate
      .from('godentist_scrape_history')
      .select('inconsistent')
      .eq('id', historyId)
      .eq('workspace_id', workspaceId)
      .single()
    if (scrapeRow?.inconsistent) {
      console.warn(`[godentist] scheduleReminders: scrape ${historyId} marked inconsistent (WARN-ONLY, proceeding)`)
    }
  }

  const admin = createAdminClient()
  const now = new Date()

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

    // Calculate appointment time in UTC for comparison
    const { hours, minutes } = parseHora(apt.hora)
    const [y, m, d] = fechaCita.split('-').map(Number)
    const citaUtc = new Date(Date.UTC(y, m - 1, d, hours + 5, minutes))
    const minUntilCita = (citaUtc.getTime() - now.getTime()) / (60 * 1000)

    // Rule: reject if less than 45 min before appointment
    if (minUntilCita < 45) {
      result.skipped++
      result.details.push({
        nombre: apt.nombre,
        telefono: apt.telefono,
        status: 'skipped',
        reason: 'Faltan menos de 45 min para la cita',
      })
      continue
    }

    // If 45-60 min before appointment → send immediately (now + 10s buffer)
    // If >60 min → send 1h before appointment (as before)
    const scheduledAt = minUntilCita <= 60
      ? new Date(now.getTime() + 10 * 1000) // send immediately
      : new Date(citaUtc.getTime() - 60 * 60 * 1000) // 1h before

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
          horaCita: apt.hora,
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
  // Plan 08 (godentist-scraping-structural-v2): FK al scrape origen.
  // Nullable para data legacy pre-Plan 01 + reminders insertados sin historyId.
  scrape_history_id?: string | null
}

/**
 * Per CONTEXT.md D-04 + PATTERNS.md §4: shape consumed by UI tab "programacion" (Plan 09).
 * Replicates the cards-por-scrape pattern of tab "Historial Confirmaciones"
 * (confirmaciones-panel.tsx lines 680-792).
 *
 * Includes the inconsistent flag + inconsistency_details so the UI can render
 * a red AlertTriangle badge when D-08 canary fired (also blocks downstream sends).
 */
export interface ScrapeWithReminders {
  scrape: {
    id: string
    scraped_date: string
    sucursales: string[]
    total_appointments: number
    created_at: string
    inconsistent: boolean
    inconsistency_details: Record<string, unknown> | null
    total_citas: number | null
  }
  reminders: ScheduledReminderEntry[]
  stats: {
    pending: number
    sent: number
    failed: number
    cancelled: number
  }
}

export async function getScheduledReminders(fechaCita?: string): Promise<{ error?: string; data?: ScheduledReminderEntry[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  const admin = createAdminClient()
  let query = admin
    .from('godentist_scheduled_reminders')
    .select('id, nombre, telefono, hora_cita, sucursal, fecha_cita, scheduled_at, status, error, sent_at, created_at')
    .eq('workspace_id', workspaceId)

  // Filter by date if provided, otherwise show today
  if (fechaCita) {
    query = query.eq('fecha_cita', fechaCita)
  }

  const { data, error } = await query
    .order('scheduled_at', { ascending: true })
    .limit(500)

  if (error) return { error: error.message }

  return { data: data as ScheduledReminderEntry[] }
}

/**
 * Per CONTEXT.md D-04 + PATTERNS.md §4: returns reminders grouped by their
 * source scrape, with per-scrape stats and the inconsistent flag. UI tab
 * "programacion" (Plan 09) consumes this to render cards-per-scrape replicating
 * the tab "Historial Confirmaciones" pattern.
 *
 * Workspace-scoped (CLAUDE.md REGLA 3). Returns orphans bucket for reminders
 * with scrape_history_id IS NULL (legacy data pre-Plan 01).
 *
 * @param dateFilter — optional YYYY-MM-DD filter on godentist_scheduled_reminders.fecha_cita.
 *                     If omitted, returns ALL workspace reminders up to limit.
 */
export async function getScheduledRemindersGroupedByScrape(
  dateFilter?: string,
): Promise<{ error?: string; data?: ScrapeWithReminders[]; orphans?: ScheduledReminderEntry[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  const admin = createAdminClient()

  // Step 1: fetch reminders, workspace-scoped, optionally date-filtered.
  let remQuery = admin
    .from('godentist_scheduled_reminders')
    .select('id, nombre, telefono, hora_cita, sucursal, fecha_cita, scheduled_at, status, error, sent_at, created_at, scrape_history_id')
    .eq('workspace_id', workspaceId)
  if (dateFilter) remQuery = remQuery.eq('fecha_cita', dateFilter)
  const { data: rems, error: remErr } = await remQuery
    .order('scheduled_at', { ascending: true })
    .limit(2000) // wider than flat getScheduledReminders (500) since grouped covers wider date range
  if (remErr) return { error: remErr.message }

  // Step 2: collect distinct scrape_history_ids, fetch scrape rows in one batch.
  const scrapeIds = [...new Set((rems || [])
    .map(r => r.scrape_history_id)
    .filter((id): id is string => Boolean(id))
  )]

  let scrapes: Array<{
    id: string
    scraped_date: string
    sucursales: string[]
    total_appointments: number
    created_at: string
    inconsistent: boolean
    inconsistency_details: Record<string, unknown> | null
    total_citas: number | null
  }> = []

  if (scrapeIds.length > 0) {
    const { data: scrapeRows, error: scrapeErr } = await admin
      .from('godentist_scrape_history')
      .select('id, scraped_date, sucursales, total_appointments, created_at, inconsistent, inconsistency_details, total_citas')
      .in('id', scrapeIds)
      .eq('workspace_id', workspaceId)
    if (scrapeErr) return { error: scrapeErr.message }
    scrapes = (scrapeRows || []) as typeof scrapes
  }

  // Step 3: group reminders by scrape_history_id; collect orphans (NULL FK).
  const byScrapeId = new Map<string, ScheduledReminderEntry[]>()
  const orphans: ScheduledReminderEntry[] = []
  for (const r of (rems || []) as ScheduledReminderEntry[]) {
    if (!r.scrape_history_id) {
      orphans.push(r)
      continue
    }
    if (!byScrapeId.has(r.scrape_history_id)) byScrapeId.set(r.scrape_history_id, [])
    byScrapeId.get(r.scrape_history_id)!.push(r)
  }

  // Step 4: build ScrapeWithReminders entries with stats per scrape.
  const grouped: ScrapeWithReminders[] = []
  for (const scrape of scrapes) {
    const scrapeReminders = byScrapeId.get(scrape.id) || []
    const stats = { pending: 0, sent: 0, failed: 0, cancelled: 0 }
    for (const r of scrapeReminders) {
      if (r.status === 'pending') stats.pending++
      else if (r.status === 'sent') stats.sent++
      else if (r.status === 'failed') stats.failed++
      else if (r.status === 'cancelled') stats.cancelled++
    }
    grouped.push({ scrape, reminders: scrapeReminders, stats })
  }

  // Step 5: sort by scrape.created_at DESC (most recent first).
  grouped.sort((a, b) => b.scrape.created_at.localeCompare(a.scrape.created_at))

  return { data: grouped, orphans }
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

// ── Followup Preview ──

export async function getFollowupPreview(historyId: string): Promise<{ error?: string; data?: FollowupResult[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  const admin = createAdminClient()
  const { data: history } = await admin
    .from('godentist_scrape_history')
    .select('send_results, sent_at, appointments')
    .eq('id', historyId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!history?.send_results || !history?.sent_at) {
    return { error: 'No hay resultados de envío' }
  }

  const sendResults = history.send_results as unknown as SendResult
  const sentAt = history.sent_at
  const sentPatients = sendResults.details.filter(d => d.status === 'sent')

  const results: FollowupResult[] = []

  for (const patient of sentPatients) {
    const phone = patient.telefono.startsWith('+') ? patient.telefono : `+${patient.telefono}`

    // Find conversation
    const { data: conv } = await admin
      .from('conversations')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('phone', phone)
      .single()

    if (!conv) {
      results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'failed', reason: 'sin conversación' })
      continue
    }

    // Check inbound messages after sent_at
    const { data: inbound } = await admin
      .from('messages')
      .select('id')
      .eq('conversation_id', conv.id)
      .eq('direction', 'inbound')
      .gt('created_at', sentAt)
      .limit(1)

    if (inbound && inbound.length > 0) {
      results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'skipped', reason: 'ya respondió' })
    } else {
      results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'sent', reason: 'pendiente de seguimiento' })
    }
  }

  return { data: results }
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
