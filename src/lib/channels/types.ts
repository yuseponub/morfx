// ============================================================================
// Multi-Channel Abstraction Types
// Defines the interface for sending messages across different channels.
// WhatsApp via 360dialog (or Meta Cloud API for meta_direct workspaces).
// Facebook/Instagram send via the Meta Direct senders (invoked directly in the
// domain send chokepoint, not through this registry).
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
