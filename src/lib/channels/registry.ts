// ============================================================================
// Channel Registry
// Maps channel types to their sender implementations.
// Used by the domain layer to route messages to the correct external API.
//
// NOTE (godentist-fbig-meta-direct-cutover Plan 05): the legacy FB/IG transport was
// decommissioned. Facebook/Instagram now send EXCLUSIVELY via the Meta Direct senders,
// which are invoked directly in the domain send chokepoint (src/lib/domain/messages.ts) —
// NOT through this registry. Only WhatsApp remains mapped here. facebook/instagram
// fall back to the WhatsApp sender for back-compat safety, but the domain never
// calls getChannelSender for them anymore.
// ============================================================================

import type { ChannelType, ChannelSender } from './types'
import { whatsappSender } from './whatsapp-sender'

const senders: Partial<Record<ChannelType, ChannelSender>> = {
  whatsapp: whatsappSender,
}

/**
 * Get the channel sender for a given channel type.
 * Defaults to WhatsApp if channel is unknown (backward compat safety).
 */
export function getChannelSender(channel: ChannelType): ChannelSender {
  return senders[channel] || whatsappSender
}
