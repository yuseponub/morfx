/**
 * Engine Adapters - Barrel Export
 * Phase 16.1: Engine Unification - Plan 03
 *
 * Re-exports both adapter factories for sandbox and production environments.
 */

export { createSandboxAdapters } from './sandbox'
export { createProductionAdapters } from './production'
