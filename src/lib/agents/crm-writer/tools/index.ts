/**
 * CRM Writer — Tool Registry Aggregator
 * Phase 44 Plan 05. Task 2.
 *
 * Builds the AI SDK v6 tool registry by merging the 4 tool factories.
 * Every tool is propose-only — no writer tool mutates directly; all go through
 * proposeAction → confirmAction (two-step lifecycle).
 */

import type { WriterContext } from '../types'
import { makeContactWriteTools } from './contacts'
import { makeOrderWriteTools } from './orders'
import { makeNoteWriteTools } from './notes'
import { makeTaskWriteTools } from './tasks'

export function createWriterTools(ctx: WriterContext) {
  return {
    ...makeContactWriteTools(ctx),
    ...makeOrderWriteTools(ctx),
    ...makeNoteWriteTools(ctx),
    ...makeTaskWriteTools(ctx),
  }
}
