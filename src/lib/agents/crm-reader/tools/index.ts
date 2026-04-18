/**
 * CRM Reader — Aggregated Tool Registry
 * Phase 44 Plan 04.
 *
 * Entry point consumed by processReaderMessage. Merges the 4 tool categories
 * (contacts, orders, pipelines+stages, tags) into a single AI SDK v6 tools
 * object. Each sub-factory reads ONLY from '@/lib/domain/*' — this file
 * inherits that invariant (Blocker 1).
 */

import type { ReaderContext } from '../types'
import { makeContactReadTools } from './contacts'
import { makeOrderReadTools } from './orders'
import { makePipelineReadTools } from './pipelines'
import { makeTagReadTools } from './tags'

export function createReaderTools(ctx: ReaderContext) {
  return {
    ...makeContactReadTools(ctx),
    ...makeOrderReadTools(ctx),
    ...makePipelineReadTools(ctx),
    ...makeTagReadTools(ctx),
  }
}
