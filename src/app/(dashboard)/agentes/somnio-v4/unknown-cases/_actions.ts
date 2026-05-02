/**
 * Server actions — /agentes/somnio-v4/unknown-cases.
 *
 * Standalone somnio-sales-v4 / Plan 10.
 *
 * Regla 3 invariant: este archivo NO importa el admin Supabase client. Toda
 * mutación pasa por `src/lib/domain/unknown-cases.ts` (verificable via grep —
 * cero matches del helper de admin esperados).
 *
 * Auth gate:
 *  - getActiveWorkspaceId() del cookie (mismo patrón que crm-tools/_actions.ts)
 *  - workspaceId !== SOMNIO_WORKSPACE_ID → return error (D-23, Regla 6)
 *  - workspace_members membership check (defense-in-depth, mismo patrón que page.tsx)
 *
 * revalidatePath('/agentes/somnio-v4/unknown-cases') tras cada mutación exitosa.
 */

'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { dismissCluster, markPromoted } from '@/lib/domain/unknown-cases'
import { SOMNIO_WORKSPACE_ID } from '@/lib/agents/somnio-v4/config'

const ClusterIdSchema = z.object({ clusterId: z.string().uuid() })

export type ClusterMutationInput = z.infer<typeof ClusterIdSchema>

export type ClusterMutationResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Resuelve workspaceId desde cookie + valida membresía + scope Somnio.
 * Retorna null si el usuario no debería poder mutar.
 */
async function authorizeSomnioWorkspace(): Promise<
  { ok: true; workspaceId: string } | { ok: false; error: string }
> {
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { ok: false, error: 'No hay workspace activo.' }
  }
  if (workspaceId !== SOMNIO_WORKSPACE_ID) {
    return { ok: false, error: 'Esta operación solo está disponible en el workspace Somnio.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: 'No autenticado.' }
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return { ok: false, error: 'No eres miembro del workspace Somnio.' }
  }

  if (membership.role === 'agent') {
    return { ok: false, error: 'Los agentes no pueden modificar unknown cases.' }
  }

  return { ok: true, workspaceId }
}

export async function dismissClusterAction(
  input: ClusterMutationInput,
): Promise<ClusterMutationResult> {
  const auth = await authorizeSomnioWorkspace()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = ClusterIdSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: `Validación fallida: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    }
  }

  try {
    await dismissCluster({ workspaceId: auth.workspaceId }, parsed.data.clusterId)
    revalidatePath('/agentes/somnio-v4/unknown-cases')
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function markPromotedAction(
  input: ClusterMutationInput,
): Promise<ClusterMutationResult> {
  const auth = await authorizeSomnioWorkspace()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = ClusterIdSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: `Validación fallida: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    }
  }

  try {
    await markPromoted({ workspaceId: auth.workspaceId }, parsed.data.clusterId)
    revalidatePath('/agentes/somnio-v4/unknown-cases')
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
