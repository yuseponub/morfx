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
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getRequestAuth } from '@/lib/auth/request-auth'
import {
  listTemplatesByAgent,
  listIntents,
  updateTemplateContent,
  addTemplate,
  deleteTemplate,
  reorderTemplates,
} from '@/lib/domain/agent-templates'
import {
  listKbByAgent,
  getKbTopic,
  createKbTopic,
  updateKbTopic,
  deleteKbTopic,
  listKbVersions,
  searchKbVersions,
  restoreKbVersion,
} from '@/lib/domain/agent-knowledge-base'
import type { DomainContext } from '@/lib/domain/types'
import type { AgentTemplateRow } from '@/lib/domain/agent-templates'
import type {
  AgentKbRow,
  KbVersionRow,
} from '@/lib/domain/agent-knowledge-base'

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
  const auth = await getRequestAuth()
  if (!auth) return null

  const supabase = await createClient()

  return { userId: auth.userId, workspaceId: auth.workspaceId, supabase }
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
    buildCtx(ctx.workspaceId, ctx.userId),
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

  const result = await listIntents(buildCtx(ctx.workspaceId, ctx.userId), agentId)
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
  if (!(await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.userId)))
    return { success: false, error: ADMIN_DENIED }

  const v = updateTemplateSchema.safeParse(input)
  if (!v.success)
    return {
      success: false,
      error: `Validación fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
    }

  const result = await updateTemplateContent(
    buildCtx(ctx.workspaceId, ctx.userId),
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
  if (!(await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.userId)))
    return { success: false, error: ADMIN_DENIED }

  const v = addTemplateSchema.safeParse(input)
  if (!v.success)
    return {
      success: false,
      error: `Validación fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
    }

  const result = await addTemplate(buildCtx(ctx.workspaceId, ctx.userId), v.data)
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  revalidatePath(EDITOR_PATH)
  return { success: true, data: result.data }
}

export async function deleteTemplateAction(
  input: z.infer<typeof deleteTemplateSchema>,
): Promise<ActionResult> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }
  if (!(await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.userId)))
    return { success: false, error: ADMIN_DENIED }

  const v = deleteTemplateSchema.safeParse(input)
  if (!v.success)
    return {
      success: false,
      error: `Validación fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
    }

  const result = await deleteTemplate(buildCtx(ctx.workspaceId, ctx.userId), v.data)
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  revalidatePath(EDITOR_PATH)
  return { success: true }
}

export async function reorderTemplatesAction(
  input: z.infer<typeof reorderTemplatesSchema>,
): Promise<ActionResult> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }
  if (!(await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.userId)))
    return { success: false, error: ADMIN_DENIED }

  const v = reorderTemplatesSchema.safeParse(input)
  if (!v.success)
    return {
      success: false,
      error: `Validación fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
    }

  const result = await reorderTemplates(buildCtx(ctx.workspaceId, ctx.userId), v.data)
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  revalidatePath(EDITOR_PATH)
  return { success: true }
}

// ============================================================================
// Zod schemas — KB inputs (V5)
// ============================================================================

const kbCategoryEnum = z.enum([
  'product',
  'policies',
  'edge-cases',
  'faqs-no-templated',
])

/** Shared editable content fields for create/update KB topics. */
const kbEditableSchema = z.object({
  topic: z.string().min(1),
  category: kbCategoryEnum,
  keywords: z.array(z.string()),
  scope_summary: z.string().nullable(),
  hechos_del_producto: z.string().nullable(),
  posicion_del_negocio: z.string().nullable(),
  debe_contener: z.array(z.string()),
  nunca_decir: z.array(z.string()),
  cuando_escalar: z.array(z.string()),
  tone_override: z.string().nullable(),
  escalate_triggers: z.array(z.string()),
  related_topics: z.array(z.string()),
})

const createKbSchema = kbEditableSchema.extend({
  agentId: z.string(),
})

const updateKbSchema = kbEditableSchema.extend({
  kbId: z.string().uuid(),
  agentId: z.string(),
})

const deleteKbSchema = z.object({
  kbId: z.string().uuid(),
  agentId: z.string(),
})

const restoreKbSchema = z.object({
  kbId: z.string().uuid(),
  versionId: z.string().uuid(),
  agentId: z.string(),
})

const searchKbVersionsSchema = z.object({
  agentId: z.string(),
  topic: z.string(),
})

// ============================================================================
// KB READ actions (any authenticated member — no admin gate)
// ============================================================================

export async function getKbListAction(
  agentId: string,
): Promise<ActionResult<AgentKbRow[]>> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }

  const result = await listKbByAgent(buildCtx(ctx.workspaceId, ctx.userId), agentId)
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  return { success: true, data: result.data }
}

export async function getKbTopicAction(
  kbId: string,
  agentId: string,
): Promise<ActionResult<AgentKbRow>> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }

  const result = await getKbTopic(
    buildCtx(ctx.workspaceId, ctx.userId),
    kbId,
    agentId,
  )
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  return { success: true, data: result.data }
}

export async function listKbVersionsAction(
  kbId: string,
  agentId: string,
): Promise<ActionResult<KbVersionRow[]>> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }

  const result = await listKbVersions(buildCtx(ctx.workspaceId, ctx.userId), {
    kbId,
    agentId,
  })
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  return { success: true, data: result.data }
}

export async function searchKbVersionsAction(
  input: z.infer<typeof searchKbVersionsSchema>,
): Promise<ActionResult<KbVersionRow[]>> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }

  const v = searchKbVersionsSchema.safeParse(input)
  if (!v.success)
    return {
      success: false,
      error: `Validación fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
    }

  const result = await searchKbVersions(
    buildCtx(ctx.workspaceId, ctx.userId),
    v.data,
  )
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  return { success: true, data: result.data }
}

// ============================================================================
// KB MUTATING actions (admin only — D-07)
//
// D-06: the domain re-embeds synchronously before the DB write; on an OpenAI
// failure it returns { success:false, error:'Re-embed falló (OpenAI). Reintenta…' }.
// We surface that domain error VERBATIM so the UI can show "reintenta".
// ============================================================================

export async function createKbTopicAction(
  input: z.infer<typeof createKbSchema>,
): Promise<ActionResult<AgentKbRow>> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }
  if (!(await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.userId)))
    return { success: false, error: ADMIN_DENIED }

  const v = createKbSchema.safeParse(input)
  if (!v.success)
    return {
      success: false,
      error: `Validación fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
    }

  const result = await createKbTopic(buildCtx(ctx.workspaceId, ctx.userId), {
    ...v.data,
    reviewedBy: `user:${ctx.userId}`,
  })
  // D-06: surface the domain error (incl. OpenAI re-embed failure) verbatim.
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  revalidatePath(EDITOR_PATH)
  return { success: true, data: result.data }
}

export async function updateKbTopicAction(
  input: z.infer<typeof updateKbSchema>,
): Promise<ActionResult<AgentKbRow>> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }
  if (!(await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.userId)))
    return { success: false, error: ADMIN_DENIED }

  const v = updateKbSchema.safeParse(input)
  if (!v.success)
    return {
      success: false,
      error: `Validación fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
    }

  const result = await updateKbTopic(buildCtx(ctx.workspaceId, ctx.userId), {
    ...v.data,
    reviewedBy: `user:${ctx.userId}`,
  })
  // D-06: surface the domain error (incl. OpenAI re-embed failure) verbatim.
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  revalidatePath(EDITOR_PATH)
  return { success: true, data: result.data }
}

export async function deleteKbTopicAction(
  input: z.infer<typeof deleteKbSchema>,
): Promise<ActionResult> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }
  if (!(await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.userId)))
    return { success: false, error: ADMIN_DENIED }

  const v = deleteKbSchema.safeParse(input)
  if (!v.success)
    return {
      success: false,
      error: `Validación fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
    }

  const result = await deleteKbTopic(buildCtx(ctx.workspaceId, ctx.userId), v.data)
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  revalidatePath(EDITOR_PATH)
  return { success: true }
}

export async function restoreKbVersionAction(
  input: z.infer<typeof restoreKbSchema>,
): Promise<ActionResult<AgentKbRow>> {
  const ctx = await getAuthContext()
  if (!ctx) return { success: false, error: 'No autenticado' }
  if (!(await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.userId)))
    return { success: false, error: ADMIN_DENIED }

  const v = restoreKbSchema.safeParse(input)
  if (!v.success)
    return {
      success: false,
      error: `Validación fallida: ${v.error.issues.map((i) => i.message).join('; ')}`,
    }

  const result = await restoreKbVersion(buildCtx(ctx.workspaceId, ctx.userId), {
    ...v.data,
    reviewedBy: `user:${ctx.userId}`,
  })
  // D-06: surface the domain error (incl. OpenAI re-embed failure) verbatim.
  if (!result.success) return { success: false, error: result.error ?? 'Error' }
  revalidatePath(EDITOR_PATH)
  return { success: true, data: result.data }
}
