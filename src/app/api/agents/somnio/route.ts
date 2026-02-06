/**
 * Somnio Agent API Route
 * Phase 14: Agente Ventas Somnio - Plan 06
 *
 * POST /api/agents/somnio - Process a message through the Somnio sales agent
 *
 * This endpoint receives webhook messages and processes them through
 * the SomnioEngine for automated sales conversations.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { SomnioEngine, type SomnioEngineResult } from '@/lib/agents/somnio/somnio-engine'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('somnio-api')

// ============================================================================
// Request Schema
// ============================================================================

/**
 * Request body schema for Somnio agent endpoint.
 */
const SomnioRequestSchema = z.object({
  /** Conversation ID for session management */
  conversationId: z.string().min(1, 'conversationId is required'),
  /** Contact ID for the customer */
  contactId: z.string().optional(),
  /** Customer message content */
  messageContent: z.string().min(1, 'messageContent is required'),
  /** Workspace ID for multi-tenant isolation */
  workspaceId: z.string().min(1, 'workspaceId is required'),
  /** Phone number for message sending (optional) */
  phoneNumber: z.string().optional(),
})

type SomnioRequest = z.infer<typeof SomnioRequestSchema>

// ============================================================================
// Error Response Helper
// ============================================================================

interface ErrorResponse {
  error: string
  code: string
  details?: unknown
}

function errorResponse(
  message: string,
  code: string,
  status: number,
  details?: unknown
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      error: message,
      code,
      details,
    },
    { status }
  )
}

// ============================================================================
// POST Handler
// ============================================================================

/**
 * POST /api/agents/somnio
 *
 * Process a customer message through the Somnio sales agent.
 *
 * Request body:
 * {
 *   conversationId: string,  // Required - conversation identifier
 *   contactId?: string,      // Optional - contact identifier
 *   messageContent: string,  // Required - customer message
 *   workspaceId: string,     // Required - workspace for isolation
 *   phoneNumber?: string,    // Optional - phone for message sending
 * }
 *
 * Response (success):
 * {
 *   success: true,
 *   response: string,        // Agent response text
 *   messagesSent: number,    // Number of messages sent
 *   orderCreated: boolean,   // Whether order was created
 *   orderId?: string,        // Created order ID
 *   contactId?: string,      // Contact ID (new or existing)
 *   newMode?: string,        // New session mode
 *   tokensUsed?: number,     // Total tokens used
 *   sessionId: string,       // Session ID
 * }
 *
 * Response (error):
 * {
 *   error: string,
 *   code: string,
 *   details?: unknown,
 * }
 */
export async function POST(request: Request): Promise<NextResponse<SomnioEngineResult | ErrorResponse>> {
  const startTime = Date.now()

  try {
    // Parse and validate request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid JSON body', 'INVALID_JSON', 400)
    }

    const parseResult = SomnioRequestSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.flatten()
      return errorResponse(
        'Validation failed',
        'VALIDATION_ERROR',
        400,
        errors.fieldErrors
      )
    }

    const { conversationId, contactId, messageContent, workspaceId, phoneNumber } = parseResult.data

    logger.info(
      {
        conversationId,
        workspaceId,
        messageLength: messageContent.length,
      },
      'Processing Somnio agent request'
    )

    // Create engine and process message
    const engine = new SomnioEngine(workspaceId)

    const result = await engine.processMessage({
      conversationId,
      contactId: contactId ?? conversationId, // Use conversationId as contactId if not provided
      messageContent,
      workspaceId,
      phoneNumber,
    })

    const duration = Date.now() - startTime

    if (result.success) {
      logger.info(
        {
          conversationId,
          sessionId: result.sessionId,
          messagesSent: result.messagesSent,
          orderCreated: result.orderCreated,
          duration,
        },
        'Somnio agent request completed successfully'
      )

      return NextResponse.json(result)
    } else {
      logger.warn(
        {
          conversationId,
          error: result.error,
          duration,
        },
        'Somnio agent request failed'
      )

      // Map error to HTTP status
      const status = result.error?.retryable ? 503 : 500

      return NextResponse.json(result, { status })
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error(
      {
        error: errorMessage,
        duration,
      },
      'Unexpected error processing Somnio agent request'
    )

    return errorResponse(
      'Internal server error',
      'INTERNAL_ERROR',
      500,
      process.env.NODE_ENV === 'development' ? errorMessage : undefined
    )
  }
}
