// ============================================================================
// src/lib/domain/index.ts — Barrel export for domain layer
// Each entity module is added as it's implemented in Plans 02-09
// ============================================================================

export * from './orders'           // Plan 02
export * from './contacts'         // Plan 04
export * from './tags'             // Plan 04
export * from './messages'         // Plan 06
export * from './tasks'            // Plan 07
// export * from './notes'         // Plan 08
// export * from './custom-fields' // Plan 08
// export * from './conversations' // Plan 09

export type { DomainContext, DomainResult } from './types'
