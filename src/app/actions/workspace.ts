'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { CreateWorkspaceInput, Workspace, WorkspaceWithRole } from '@/lib/types/database'

/**
 * Resolve the authenticated user id WITHOUT a network round-trip to GoTrue —
 * uses getClaims() (local ES256 verify against the cached JWKS), the same
 * primitive as getRequestAuth() (src/lib/auth/request-auth.ts).
 *
 * Deliberately NOT getRequestAuth(): that helper also requires the
 * `morfx_workspace` cookie and returns null when it is absent. Several flows
 * here (getActiveWorkspaceId bootstrap fallback, createWorkspace,
 * getUserWorkspaces) run for users that have NOT selected a workspace yet —
 * the cookie is absent by design. Coupling identity to the workspace cookie
 * would break first-login / create-workspace bootstrap (Warning 1).
 */
async function getAuthUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  return sub ?? null
}

/**
 * Set the active workspace cookie from the server side.
 * httpOnly: false so document.cookie can read it (prevents infinite reload).
 */
export async function setWorkspaceCookie(workspaceId: string) {
  const cookieStore = await cookies()
  cookieStore.set('morfx_workspace', workspaceId, {
    path: '/',
    maxAge: 31536000,
    httpOnly: false,
  })
}

/**
 * Get the active workspace ID from cookie, with DB fallback for new users.
 * If no cookie exists, looks up the user's first workspace membership.
 */
export async function getActiveWorkspaceId(): Promise<string | null> {
  const cookieStore = await cookies()
  const fromCookie = cookieStore.get('morfx_workspace')?.value
  if (fromCookie) return fromCookie

  // Fallback: look up user's first workspace
  const supabase = await createClient()
  const userId = await getAuthUserId(supabase)
  if (!userId) return null

  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (data?.workspace_id) {
    // Set the cookie for future requests (try/catch: .set() throws in Server Components)
    try {
      cookieStore.set('morfx_workspace', data.workspace_id, {
        path: '/',
        maxAge: 31536000,
        httpOnly: false,
      })
    } catch {
      // Called from Server Component — cookie can't be set here,
      // WorkspaceProvider will handle it on the client side
    }
    return data.workspace_id
  }

  return null
}

export async function createWorkspace(input: CreateWorkspaceInput) {
  const supabase = await createClient()

  const userId = await getAuthUserId(supabase)
  if (!userId) {
    return { error: 'No autenticado' }
  }

  // Validate slug format
  const slugRegex = /^[a-z0-9-]+$/
  if (!slugRegex.test(input.slug)) {
    return { error: 'El slug solo puede contener letras minusculas, numeros y guiones' }
  }

  // Check if slug is available
  const { data: existing } = await supabase
    .from('workspaces')
    .select('id')
    .eq('slug', input.slug)
    .single()

  if (existing) {
    return { error: 'Este slug ya esta en uso' }
  }

  // Create workspace using the database function
  const { data, error } = await supabase
    .rpc('create_workspace_with_owner', {
      workspace_name: input.name,
      workspace_slug: input.slug,
      workspace_business_type: input.business_type || null
    })

  if (error) {
    console.error('Error creating workspace:', error)
    return { error: 'Error al crear el workspace' }
  }

  // Dejar el workspace recién creado como activo ANTES de navegar — evita que
  // el bootstrap de getActiveWorkspaceId tenga que resolver vía DB en el
  // próximo render (server action SÍ puede setear cookies).
  await setWorkspaceCookie(data)

  // 'layout' invalida el árbol completo (T1.4): el siguiente router.push('/crm')
  // del form renderiza el dashboard con el workspace nuevo ya visible.
  revalidatePath('/', 'layout')
  return { success: true, workspaceId: data }
}

export async function getUserWorkspaces(): Promise<WorkspaceWithRole[]> {
  const supabase = await createClient()

  const userId = await getAuthUserId(supabase)
  if (!userId) {
    return []
  }

  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      role,
      workspace:workspaces (
        id,
        name,
        slug,
        business_type,
        owner_id,
        settings,
        created_at,
        updated_at
      )
    `)
    .eq('user_id', userId)

  if (error) {
    console.error('Error fetching workspaces:', error)
    return []
  }

  return (data || []).map((item) => ({
    ...(item.workspace as unknown as Workspace),
    role: item.role as WorkspaceWithRole['role']
  }))
}

export async function getWorkspaceBySlug(slug: string): Promise<WorkspaceWithRole | null> {
  const supabase = await createClient()

  const userId = await getAuthUserId(supabase)
  if (!userId) {
    return null
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select(`
      *,
      workspace_members!inner (
        role
      )
    `)
    .eq('slug', slug)
    .eq('workspace_members.user_id', userId)
    .single()

  if (error || !data) {
    return null
  }

  const { workspace_members, ...workspace } = data
  return {
    ...workspace,
    role: (workspace_members as { role: string }[])[0]?.role as WorkspaceWithRole['role']
  }
}

export async function updateWorkspace(workspaceId: string, updates: Partial<Pick<Workspace, 'name' | 'business_type'>>) {
  const supabase = await createClient()

  const userId = await getAuthUserId(supabase)
  if (!userId) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('workspaces')
    .update(updates)
    .eq('id', workspaceId)
    .eq('owner_id', userId)

  if (error) {
    console.error('Error updating workspace:', error)
    return { error: 'Error al actualizar el workspace' }
  }

  revalidatePath('/')
  return { success: true }
}

export async function deleteWorkspace(workspaceId: string) {
  const supabase = await createClient()

  const userId = await getAuthUserId(supabase)
  if (!userId) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId)
    .eq('owner_id', userId)

  if (error) {
    console.error('Error deleting workspace:', error)
    return { error: 'Error al eliminar el workspace' }
  }

  revalidatePath('/')
  redirect('/create-workspace')
}

export async function switchWorkspace(slug: string) {
  // This just validates the workspace exists and user has access
  const workspace = await getWorkspaceBySlug(slug)
  if (!workspace) {
    return { error: 'Workspace no encontrado' }
  }

  // In a more complete implementation, you might store the active workspace
  // in a cookie or user metadata. For now, we just validate access.
  return { success: true, workspace }
}
