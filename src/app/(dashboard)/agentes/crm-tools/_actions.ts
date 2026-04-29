/**
 * Server actions — /agentes/crm-tools.
 *
 * Standalone crm-query-tools Wave 4 (Plan 05).
 *
 * Regla 3 invariant: this file does NOT import the admin Supabase client.
 * Mutation goes through `updateCrmQueryToolsConfig` in domain layer.
 * Verifiable via grep (zero matches expected).
 */

'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getActiveWorkspaceId } from '@/app/actions/workspace'
import {
  updateCrmQueryToolsConfig,
  type CrmQueryToolsConfig,
} from '@/lib/domain/crm-query-tools-config'

const SaveInputSchema = z.object({
  pipelineId: z.string().uuid().nullable(),
  activeStageIds: z.array(z.string().uuid()),
})

export type SaveCrmQueryToolsConfigInput = z.infer<typeof SaveInputSchema>

export type SaveCrmQueryToolsConfigResult =
  | { success: true; data: CrmQueryToolsConfig }
  | { success: false; error: string }

export async function saveCrmQueryToolsConfigAction(
  input: SaveCrmQueryToolsConfigInput,
): Promise<SaveCrmQueryToolsConfigResult> {
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) {
    return { success: false, error: 'No hay workspace seleccionado.' }
  }

  // Defense-in-depth: validate again on server (UI also validates).
  const v = SaveInputSchema.safeParse(input)
  if (!v.success) {
    return {
      success: false,
      error: `Validacion fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
    }
  }

  const result = await updateCrmQueryToolsConfig(
    { workspaceId, source: 'server-action' as const },
    {
      pipelineId: v.data.pipelineId,
      activeStageIds: v.data.activeStageIds,
    },
  )

  if (!result.success) {
    return { success: false, error: result.error ?? 'Unknown error' }
  }

  revalidatePath('/agentes/crm-tools')
  if (!result.data) {
    return { success: false, error: 'Domain returned success but no data.' }
  }
  return { success: true, data: result.data }
}
