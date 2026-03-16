// ============================================================================
// Multi-Channel Abstraction Types
// Defines the interface for sending messages across different channels
// (WhatsApp via 360dialog, Facebook/Instagram via ManyChat).
// ============================================================================

export type ChannelType = 'whatsapp' | 'facebook' | 'instagram'

/**
 * Result from sending a message through any channel.
 */
export interface ChannelSendResult {
  /** External message ID from the channel provider */
  externalMessageId?: string
  /** Whether the send was successful */
  success: boolean
  /** Error message if failed */
  error?: string
}

/**
 * Interface that all channel senders must implement.
 * Each channel (WhatsApp, Facebook, Instagram) has its own sender
 * that knows how to call the correct external API.
 */
export interface ChannelSender {
  sendText(apiKey: string, to: string, text: string): Promise<ChannelSendResult>
  sendImage(apiKey: string, to: string, imageUrl: string, caption?: string): Promise<ChannelSendResult>
}
