// ============================================================================
// Domain Layer — Shared Types
// ZERO project imports (prevents circular dependencies)
// ============================================================================

/**
 * DomainContext — passed by every caller to domain functions.
 *
 * Each caller is responsible for validating auth BEFORE calling domain:
 * - Server Actions: getAuthContext() verifies user + workspace membership
 * - Tool Handlers: context.workspaceId pre-validated by agent session
 * - Automations: workspaceId from Inngest event (originated by verified trigger)
 * - Webhooks: HMAC validation + workspace from integration config
 */
export interface DomainContext {
  workspaceId: string
  /** Who initiated: 'server-action' | 'tool-handler' | 'automation' | 'webhook' | 'adapter' */
  source: string
  /** Cascade depth for automation trigger chain protection */
  cascadeDepth?: number
}

/**
 * DomainResult — returned by every domain function.
 *
 * Discriminated on `success`:
 * - success=true  → data is present (if T is not void)
 * - success=false → error is present
 */
export interface DomainResult<T = void> {
  success: boolean
  data?: T
  error?: string
}
