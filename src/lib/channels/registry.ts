// ============================================================================
// Channel Registry
// Maps channel types to their sender implementations.
// Used by the domain layer to route messages to the correct external API.
// ============================================================================

import type { ChannelType, ChannelSender } from './types'
import { whatsappSender } from './whatsapp-sender'
import { manychatSender } from './manychat-sender'

const senders: Record<ChannelType, ChannelSender> = {
  whatsapp: whatsappSender,
  facebook: manychatSender,
  instagram: manychatSender,
}

/**
 * Get the channel sender for a given channel type.
 * Defaults to WhatsApp if channel is unknown (backward compat safety).
 */
export function getChannelSender(channel: ChannelType): ChannelSender {
  return senders[channel] || senders.whatsapp
}
