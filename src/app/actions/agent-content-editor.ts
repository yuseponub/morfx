'use server'

// ============================================================================
// Server Actions — Agent Content Editor (templates + KB)
//
// Standalone: ui-agent-content-editor — Plan 05 (Wave 3).
//
// Layer contract:
//   - Regla 3: this file never instantiates the admin Supabase client. ALL DB
//     access is delegated to the domain layer (agent-templates.ts + agent-knowledge-base.ts,
//     Plans 03/04). The actions are the auth/zod boundary; the domain is the
//     mutation gateway.
//   - D-07: every MUTATING action requires the caller to be a workspace admin
//     (owner/admin role). Reads require auth + a selected workspace but no admin
//     role (any member may view).
//   - V5: every mutating input is validated with zod (safeParse) BEFORE the
//     domain delegation. Malformed input is rejected at the entry point.
//   - Spoofing defense (T-UICE05-04): workspaceId comes from the morfx_workspace
//     cookie + authenticated session, NEVER from client input. agentId is passed
//     through to the domain, which re-scopes/gates (D-02 — only somnio-sales-v4
//     is mutable).
// ============================================================================

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  listTemplatesByAgent,
  listIntents,
  updateTemplateContent,
  addTemplate,
  deleteTemplate,
  reorderTemplates,
} from '@/lib/domain/agent-templates'
import type { DomainContext } from '@/lib/domain/types'
import type { AgentTemplateRow } from '@/lib/domain/agent-templates'

// ============================================================================
// Helpers (re-declared from agent-config.ts — module-private there, same code)
// ============================================================================

const EDITOR_PATH = '/agentes/content-editor'
const ADMIN_DENIED =
  'Solo el propietario o administrador puede editar el contenido del agente.'

/**
 * Current user + workspace from the authenticated session + morfx_workspace
 * cookie. Returns null when not authenticated or no workspace is selected.
 * Mirrors agent-config.ts:getAuthContext verbatim.
 */
async function getAuthContext() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return null

  return { user, workspaceId, supabase }
}

/**
 * True when the user has owner/admin role in the workspace (D-07 gate).
 * Mirrors agent-config.ts:isWorkspaceAdmin verbatim.
 */
async function isWorkspaceAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single()

  return data?.role === 'owner' || data?.role === 'admin'
}

/** Build the DomainContext for a server-action caller. */
function buildCtx(workspaceId: string, userId: string): DomainContext {
  return {
    workspaceId,
    source: 'server-action',
    actorLabel: `user:${userId}`,
  }
}

export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string }

// ============================================================================
// Zod schemas — template inputs (V5)
// ============================================================================

const contentTypeEnum = z.enum(['texto', 'template', 'imagen'])
const priorityEnum = z.enum(['CORE', 'COMPLEMENTARIA', 'OPCIONAL'])
const visitTypeEnum = z.enum(['primera_vez', 'siguientes'])

const updateTemplateSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string(),
  content: z.string(),
  content_type: contentTypeEnum,
  delay_s: z.number().int().min(0),
  priority: priorityEnum,
  minifrase: z.string().nullable(),
})

const addTemplateSchema = z.object({
  agentId: z.string(),
  intent: z.string().min(1),
  visit_type: visitTypeEnum,
  orden: z.number().int().min(0),
  content_type: contentTypeEnum,
  content: z.string(),
  delay_s: z.number().int().min(0),
  priority: priorityEnum,
  minifrase: z.string().nullable(),
})

const deleteTemplateSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string(),
})

const reorderTemplatesSchema = z.object({
  agentId: z.string(),
  intent: z.string(),
  visit_type: z.string(),
  orderedIds: z.array(z.string().uuid()),
})

// ============================================================================
// Template READ actions (any authenticated member — no admin gate)
// ============================================================================

export async function getTemplatesAction(
  agentId: string,
): Promise<ActionResult<AgentTemplateRow[]>> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }

  const result = await listTemplatesByAgent(
    buildCtx(ctx.workspaceId, ctx.user.id),
    agentId,
  )
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  return { success: true, data: result.data }
}

export async function getIntentsAction(
  agentId: string,
): Promise<ActionResult<string[]>> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }

  const result = await listIntents(buildCtx(ctx.workspaceId, ctx.user.id), agentId)
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  return { success: true, data: result.data }
}

// ============================================================================
// Template MUTATING actions (admin only — D-07)
// ============================================================================

export async function updateTemplateAction(
  input: z.infer<typeof updateTemplateSchema>,
): Promise<ActionResult> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }
  if (!(await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.user.id)))
    return { success: false, error: ADMIN_DENIED }

  const v = updateTemplateSchema.safeParse(input)
  if (!v.success)
    return {
      success: false,
      error: `Validación fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
    }

  const result = await updateTemplateContent(
    buildCtx(ctx.workspaceId, ctx.user.id),
    v.data,
  )
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  revalidatePath(EDITOR_PATH)
  return { success: true }
}

export async function addTemplateAction(
  input: z.infer<typeof addTemplateSchema>,
): Promise<ActionResult<AgentTemplateRow>> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }
  if (!(await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.user.id)))
    return { success: false, error: ADMIN_DENIED }

  const v = addTemplateSchema.safeParse(input)
  if (!v.success)
    return {
      success: false,
      error: `Validación fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
    }

  const result = await addTemplate(buildCtx(ctx.workspaceId, ctx.user.id), v.data)
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  revalidatePath(EDITOR_PATH)
  return { success: true, data: result.data }
}

export async function deleteTemplateAction(
  input: z.infer<typeof deleteTemplateSchema>,
): Promise<ActionResult> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }
  if (!(await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.user.id)))
    return { success: false, error: ADMIN_DENIED }

  const v = deleteTemplateSchema.safeParse(input)
  if (!v.success)
    return {
      success: false,
      error: `Validación fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
    }

  const result = await deleteTemplate(buildCtx(ctx.workspaceId, ctx.user.id), v.data)
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  revalidatePath(EDITOR_PATH)
  return { success: true }
}

export async function reorderTemplatesAction(
  input: z.infer<typeof reorderTemplatesSchema>,
): Promise<ActionResult> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }
  if (!(await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.user.id)))
    return { success: false, error: ADMIN_DENIED }

  const v = reorderTemplatesSchema.safeParse(input)
  if (!v.success)
    return {
      success: false,
      error: `Validación fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
    }

  const result = await reorderTemplates(buildCtx(ctx.workspaceId, ctx.user.id), v.data)
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  revalidatePath(EDITOR_PATH)
  return { success: true }
}
