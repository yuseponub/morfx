/**
 * Sandbox Messaging Adapter
 * Phase 16.1: Engine Unification - Plan 03
 *
 * No-op implementation of MessagingAdapter for sandbox environment.
 * In sandbox, messages are collected as strings and returned in EngineOutput.
 * The frontend applies delays based on responseSpeed preset.
 * No actual WhatsApp message sending occurs.
 */

import type { MessagingAdapter } from '../../engine/types'

export class SandboxMessagingAdapter implements MessagingAdapter {
  /**
   * No-op: sandbox does not send real messages.
   * Messages are returned via EngineOutput.messages for frontend rendering.
   */
  async send(_params: {
    sessionId: string
    conversationId: string
    messages: string[]
    templates?: unknown[]
    intent?: string
    workspaceId: string
    contactId?: string
    phoneNumber?: string
  }): Promise<{ messagesSent: number }> {
    return { messagesSent: 0 }
  }
}
