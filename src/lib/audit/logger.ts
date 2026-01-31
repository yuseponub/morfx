/**
 * Base Pino Logger with Security-Focused Redaction
 * Phase 3: Action DSL Core - Plan 02, Task 1
 *
 * Provides structured logging with automatic redaction of sensitive data
 * for GDPR compliance and security best practices.
 */

import pino from 'pino'

/**
 * Base Pino logger instance with sensitive data redaction
 *
 * Usage:
 * - logger.info({ event: 'tool_execution', tool: 'crm.contact.create' })
 * - logger.error({ event: 'tool_error', error: err.message })
 *
 * Sensitive fields are automatically removed from logs:
 * - Passwords, tokens, API keys
 * - Personal data (email, phone) for GDPR
 * - Request headers (authorization, cookies)
 */
export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',

  // Format level as string (easier to read in logs)
  formatters: {
    level: (label) => ({ level: label }),
  },

  // Redact sensitive fields (CRITICAL for security)
  redact: {
    paths: [
      // Auth tokens
      '*.password',
      '*.token',
      '*.apiKey',
      '*.api_key',
      '*.accessToken',
      '*.refreshToken',
      '*.secret',
      '*.key',
      // Personal data (GDPR compliance)
      '*.email',
      '*.phone',
      '*.cedula',
      '*.documento',
      // Request headers
      '*.authorization',
      '*.cookie',
      '*.Authorization',
      '*.Cookie',
      // Nested input paths
      'inputs.password',
      'inputs.token',
      'inputs.apiKey',
      'inputs.api_key',
      'inputs.email',
      'inputs.phone',
      // Request context
      'request_context.authorization',
      'request_context.cookie',
      'requestContext.authorization',
      'requestContext.cookie',
    ],
    remove: true, // Remove entirely instead of replacing with [REDACTED]
  },

  // Add base context
  base: {
    app: 'morfx',
    env: process.env.NODE_ENV || 'development',
  },

  // Timestamp format (ISO 8601 for forensics)
  timestamp: pino.stdTimeFunctions.isoTime,
})

/**
 * Create child logger for specific module
 *
 * @example
 * const toolLogger = createModuleLogger('tools')
 * toolLogger.info({ event: 'tool_registered', name: 'crm.contact.create' })
 */
export function createModuleLogger(module: string) {
  return logger.child({ module })
}

/**
 * Create child logger with additional context
 * Useful for request-scoped logging
 *
 * @example
 * const reqLogger = createContextLogger({ requestId: 'req-123', userId: 'user-456' })
 */
export function createContextLogger(context: Record<string, unknown>) {
  return logger.child(context)
}
