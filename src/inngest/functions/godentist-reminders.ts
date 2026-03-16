/**
 * GoDentist Reminder Functions
 * Standalone: Scraping General - Plan 01
 *
 * Inngest function that sleeps until the scheduled reminder time,
 * then sends a WhatsApp template message for the appointment.
 *
 * Flow:
 * 1. sleepUntil(scheduledAt) — wait until the right time
 * 2. Check if reminder is still 'pending' (may have been cancelled)
 * 3. Find/create contact, find/create conversation, assign tag
 * 4. Send WhatsApp template via sendTemplateMessage domain function
 * 5. Update DB status to 'sent' or 'failed'
 */

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTemplateMessage } from '@/lib/domain/messages'
import { findOrCreateConversation, linkContactToConversation } from '@/lib/domain/conversations'
import { createContact } from '@/lib/domain/contacts'
import { assignTag, removeTag } from '@/lib/domain/tags'
import type { DomainContext } from '@/lib/domain/types'

// ============================================================================
// Constants
// ============================================================================

const TEMPLATE_NAME = 'confirmacion_asist_godentist'

const SUCURSAL_ADDRESSES: Record<string, string> = {
  'CABECERA': 'Calle 52 # 31-32 Edificio Elsita Piso 1',
  'JUMBO EL BOSQUE': 'Autopista Floridablanca # 24-26; CC Jumbo El Bosque, Floridablanca; Local 2030',
  'FLORIDABLANCA': 'Calle 4 # 3-06 Edificio Florida Plaza Condominio Local 1',
  'MEJORAS PUBLICAS': 'Calle 41 # 27-63 Edificio O41 Centro Empresarial Oficina 1002',
}

const SUCURSAL_TAGS: Record<string, string> = {
  'CABECERA': 'CAB',
  'FLORIDABLANCA': 'FLO',
  'JUMBO EL BOSQUE': 'JUM',
  'MEJORAS PUBLICAS': 'MEJ',
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert string to Title Case (lowercase then capitalize first letter of each word).
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Format a YYYY-MM-DD date string to Spanish format: "lunes 12 de marzo".
 */
function formatDateSpanish(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  return `${days[date.getDay()]} ${day} de ${months[date.getMonth()]}`
}

// ============================================================================
// Inngest Function: GoDentist Reminder Send
// ============================================================================

const godentistReminderSend = inngest.createFunction(
  {
    id: 'godentist-reminder-send',
    name: 'GoDentist: Send Scheduled Reminder',
    retries: 3,
  },
  { event: 'godentist/reminder.send' },
  async ({ event, step }) => {
    const {
      reminderId,
      workspaceId,
      nombre,
      telefono,
      horaCita,
      sucursal,
      fechaCita,
      scheduledAt,
    } = event.data

    // Step 1: Sleep until scheduled time
    await step.sleepUntil('wait-until-send-time', new Date(scheduledAt))

    // Step 2: Check if still pending (may have been cancelled)
    const shouldSend = await step.run('check-status', async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('godentist_scheduled_reminders')
        .select('status')
        .eq('id', reminderId)
        .single()
      return data?.status === 'pending'
    })

    if (!shouldSend) {
      return { skipped: true, reason: 'cancelled or already sent' }
    }

    // Step 3: Send the template message
    const sendResult = await step.run('send-template', async () => {
      const admin = createAdminClient()
      const domainCtx: DomainContext = { workspaceId, source: 'inngest-godentist' }
      const phone = telefono.startsWith('+') ? telefono : `+${telefono}`
      const nombreTitleCase = toTitleCase(nombre)
      const sucursalTitleCase = toTitleCase(sucursal)
      const address = SUCURSAL_ADDRESSES[sucursal.toUpperCase()] || sucursal
      const fechaFormateada = formatDateSpanish(fechaCita)
      const tagName = SUCURSAL_TAGS[sucursal.toUpperCase()]

      // Find or create contact
      let contactId: string | null = null
      const createResult = await createContact(domainCtx, {
        name: nombreTitleCase,
        phone,
        tags: tagName ? [tagName] : undefined,
      })
      if (createResult.success && createResult.data) {
        contactId = createResult.data.contactId
      } else if (createResult.error?.includes('Ya existe')) {
        // Contact already exists — look it up by phone
        const { data: existing } = await admin
          .from('contacts')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('phone', phone)
          .single()
        contactId = existing?.id || null
      }

      // Find or create conversation
      const convResult = await findOrCreateConversation(domainCtx, {
        phone,
        profileName: nombreTitleCase,
        contactId: contactId || undefined,
      })

      if (!convResult.success || !convResult.data) {
        throw new Error(`Failed to create conversation: ${convResult.error}`)
      }

      const conversationId = convResult.data.conversationId

      // Link contact to conversation if needed
      if (contactId && !convResult.data.created) {
        await linkContactToConversation(domainCtx, { conversationId, contactId }).catch(() => {
          // Non-critical: contact may already be linked
        })
      }

      // Assign sucursal tag to contact
      if (tagName && contactId) {
        await assignTag(domainCtx, {
          entityType: 'contact',
          entityId: contactId,
          tagName,
        }).catch(() => {
          // Non-critical: tag may already be assigned
        })
      }

      // Get workspace WhatsApp API key
      const { data: wsData } = await admin
        .from('workspaces')
        .select('settings')
        .eq('id', workspaceId)
        .single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const settings = wsData?.settings as any
      const apiKey = settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
      if (!apiKey) {
        throw new Error('WhatsApp API key not configured')
      }

      // Build rendered text for DB storage
      const renderedText = `Hola, ${nombreTitleCase}! Te recordamos tu cita en godentist ${sucursalTitleCase} hoy ${fechaFormateada} a las ${horaCita}. Direccion: ${address}. Te esperamos!`

      // Send template via domain function
      const result = await sendTemplateMessage(domainCtx, {
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
              { type: 'text', text: horaCita },
              { type: 'text', text: address },
            ],
          },
        ],
        renderedText,
        apiKey,
      })

      return result
    })

    // Step 4: Update DB status
    await step.run('update-status', async () => {
      const admin = createAdminClient()
      if (sendResult.success) {
        await admin
          .from('godentist_scheduled_reminders')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', reminderId)
      } else {
        await admin
          .from('godentist_scheduled_reminders')
          .update({ status: 'failed', error: sendResult.error || 'Unknown error' })
          .eq('id', reminderId)
      }
    })

    return { sent: sendResult.success, reminderId }
  }
)

// ============================================================================
// Inngest Function: GoDentist Tag Removal (48h expiry)
// ============================================================================

const godentistTagRemove = inngest.createFunction(
  {
    id: 'godentist-tag-remove',
    name: 'GoDentist: Remove Temporary Tag',
    retries: 3,
  },
  { event: 'godentist/tag.remove_scheduled' },
  async ({ event, step }) => {
    const { workspaceId, contactId, tagName, removeAt } = event.data

    // Sleep until removal time
    await step.sleepUntil('wait-until-remove', new Date(removeAt))

    // Remove the tag
    const result = await step.run('remove-tag', async () => {
      const ctx: DomainContext = { workspaceId, source: 'inngest-godentist' }
      return removeTag(ctx, {
        entityType: 'contact',
        entityId: contactId,
        tagName,
      })
    })

    return { removed: result.success, tagName, contactId }
  }
)

// ============================================================================
// Types (local — avoid importing from server action files)
// ============================================================================

/**
 * Shape of send_results stored in godentist_scrape_history.
 * Matches the output of the scrape+send server action.
 */
interface SendResult {
  total: number
  sent: number
  failed: number
  excluded: number
  details: Array<{
    nombre: string
    telefono: string
    status: string
    error?: string
  }>
}

/**
 * Shape of a scraped appointment stored in godentist_scrape_history.appointments.
 */
interface ScrapedAppointment {
  nombre: string
  telefono: string
  hora: string
  sucursal: string
  estado: string
}

// ============================================================================
// Inngest Function: GoDentist 2PM Followup Check
// ============================================================================

const godentistFollowupCheck = inngest.createFunction(
  {
    id: 'godentist-followup-check',
    name: 'GoDentist: 2PM Followup Check',
    retries: 2,
  },
  { event: 'godentist/followup.check' },
  async ({ event, step }) => {
    const { historyId, workspaceId, scheduledAt } = event.data

    // Step 1: Sleep until 2pm Colombia time
    await step.sleepUntil('wait-until-2pm', new Date(scheduledAt))

    // Step 2: Load history entry and get patients with status='sent'
    const patients = await step.run('load-sent-patients', async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('godentist_scrape_history')
        .select('send_results, scraped_date')
        .eq('id', historyId)
        .single()

      if (!data?.send_results) return []

      const sendResults = data.send_results as unknown as SendResult
      // Only patients with status='sent' (skip excluded/failed)
      return sendResults.details
        .filter(d => d.status === 'sent')
        .map(d => ({
          nombre: d.nombre,
          telefono: d.telefono,
          scrapedDate: data.scraped_date,
        }))
    })

    if (!patients || patients.length === 0) {
      return { skipped: true, reason: 'no sent patients found' }
    }

    // Step 3: Check each patient for inbound messages and send ultimatum if no response
    const followupResults = await step.run('check-and-send-ultimatums', async () => {
      const admin = createAdminClient()
      const domainCtx: DomainContext = { workspaceId, source: 'inngest-godentist' }
      const results: Array<{
        nombre: string
        telefono: string
        status: 'sent' | 'skipped' | 'failed'
        reason?: string
      }> = []

      // Get workspace API key
      const { data: wsData } = await admin
        .from('workspaces')
        .select('settings')
        .eq('id', workspaceId)
        .single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const settings = wsData?.settings as any
      const apiKey = settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
      if (!apiKey) throw new Error('WhatsApp API key not configured')

      // Fetch sent_at and appointments ONCE (outside loop)
      const { data: history } = await admin
        .from('godentist_scrape_history')
        .select('sent_at, appointments')
        .eq('id', historyId)
        .single()

      if (!history?.sent_at) {
        return [{ nombre: 'N/A', telefono: 'N/A', status: 'failed' as const, reason: 'no sent_at timestamp' }]
      }

      const sentAt = history.sent_at
      const appointments = (history.appointments as unknown as ScrapedAppointment[]) || []

      for (const patient of patients) {
        const phone = patient.telefono.startsWith('+') ? patient.telefono : `+${patient.telefono}`

        // Find conversation by phone
        const { data: conv } = await admin
          .from('conversations')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('phone', phone)
          .single()

        if (!conv) {
          results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'failed', reason: 'no conversation found' })
          continue
        }

        // Check for inbound messages after sent_at
        const { data: inboundMessages } = await admin
          .from('messages')
          .select('id')
          .eq('conversation_id', conv.id)
          .eq('direction', 'inbound')
          .gt('created_at', sentAt)
          .limit(1)

        if (inboundMessages && inboundMessages.length > 0) {
          // Patient responded — skip
          results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'skipped', reason: 'patient responded' })
          continue
        }

        // Find matching appointment for hora
        const matchedApt = appointments.find(a => a.telefono === patient.telefono)

        if (!matchedApt) {
          results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'failed', reason: 'appointment not found in history' })
          continue
        }

        // Skip cancelled appointments
        if (matchedApt.estado.toLowerCase().includes('cancelada')) {
          results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'skipped', reason: 'cancelled appointment' })
          continue
        }

        // Format: "MARTES 17 de marzo a las 2:30 PM"
        const dateStr = formatDateSpanish(patient.scrapedDate)
        const dayUpper = dateStr.split(' ')[0].toUpperCase()
        const dateFormatted = dayUpper + dateStr.substring(dateStr.indexOf(' ')) + ' a las ' + matchedApt.hora

        const nombreTC = toTitleCase(patient.nombre)

        try {
          const sendResult = await sendTemplateMessage(domainCtx, {
            conversationId: conv.id,
            contactPhone: phone,
            templateName: 'conservacion_cita',
            templateLanguage: 'es',
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: nombreTC },
                  { type: 'text', text: dateFormatted },
                ],
              },
            ],
            renderedText: `Hola ${nombreTC}, te contactamos nuevamente de godentist, responde este mensaje para CONFIRMAR tu cita del dia ${dateFormatted}. Para que puedas CONSERVAR tu espacio.`,
            apiKey,
          })

          if (sendResult.success) {
            results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'sent' })
          } else {
            results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'failed', reason: sendResult.error || 'send failed' })
          }
        } catch (err) {
          results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'failed', reason: err instanceof Error ? err.message : String(err) })
        }

        // Rate limit between sends
        await new Promise(r => setTimeout(r, 500))
      }

      return results
    })

    // Step 4: Save followup results to history
    await step.run('save-followup-results', async () => {
      const admin = createAdminClient()
      await admin
        .from('godentist_scrape_history')
        .update({
          followup_results: followupResults as unknown as Record<string, unknown>,
          followup_sent_at: new Date().toISOString(),
        })
        .eq('id', historyId)
    })

    const sent = followupResults.filter(r => r.status === 'sent').length
    const skipped = followupResults.filter(r => r.status === 'skipped').length
    const failed = followupResults.filter(r => r.status === 'failed').length

    return { historyId, sent, skipped, failed, total: followupResults.length }
  }
)

// ============================================================================
// Export
// ============================================================================

export const godentistReminderFunctions = [godentistReminderSend, godentistTagRemove, godentistFollowupCheck]
