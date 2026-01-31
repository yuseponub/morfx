// src/lib/tools/init.ts
import { toolRegistry } from './registry'
import { crmToolSchemas } from './schemas/crm.tools'
import { whatsappToolSchemas } from './schemas/whatsapp.tools'
import { crmHandlers } from './handlers/crm'
import { whatsappHandlers } from './handlers/whatsapp'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('tools-init')

let initialized = false

/**
 * Initialize the Tool Registry with all available tools
 *
 * Call this once at app startup via instrumentation.ts (see Task 4)
 *
 * @example
 * // In src/instrumentation.ts
 * export async function register() {
 *   if (process.env.NEXT_RUNTIME === 'nodejs') {
 *     const { initializeTools } = await import('@/lib/tools/init')
 *     initializeTools()
 *   }
 * }
 */
export function initializeTools(): void {
  if (initialized) {
    logger.warn({ event: 'tools_already_initialized' })
    return
  }

  const startTime = Date.now()

  // Register CRM tools
  let crmRegistered = 0
  for (const schema of crmToolSchemas) {
    const handler = crmHandlers[schema.name]
    if (!handler) {
      logger.error({
        event: 'missing_handler',
        tool_name: schema.name,
        module: 'crm',
      })
      continue
    }
    toolRegistry.register(schema, handler)
    crmRegistered++
  }

  // Register WhatsApp tools
  let whatsappRegistered = 0
  for (const schema of whatsappToolSchemas) {
    const handler = whatsappHandlers[schema.name]
    if (!handler) {
      logger.error({
        event: 'missing_handler',
        tool_name: schema.name,
        module: 'whatsapp',
      })
      continue
    }
    toolRegistry.register(schema, handler)
    whatsappRegistered++
  }

  initialized = true

  logger.info({
    event: 'tools_initialized',
    total_tools: toolRegistry.size,
    crm_tools: crmRegistered,
    whatsapp_tools: whatsappRegistered,
    duration_ms: Date.now() - startTime,
  })
}

/**
 * Check if tools are initialized
 */
export function areToolsInitialized(): boolean {
  return initialized
}

/**
 * Reset initialization (for testing)
 * @internal
 */
export function resetToolsInitialization(): void {
  initialized = false
  toolRegistry._clear()
}
