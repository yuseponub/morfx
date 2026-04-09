// Contract between src/app/api/mobile/* and apps/mobile/.
// Pure Zod — no runtime deps. Mobile imports via relative path traversal
// (apps/mobile does not share tsconfig paths with the web app, so path
// aliases like @shared/* are intentionally avoided here).
//
// Keep this file side-effect free and dependency-free (only `zod`) so it
// can be dropped into the React Native bundle without pulling Next.js,
// Supabase, or Node-only modules into the mobile build.

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------

export const ErrorResponseSchema = z.object({
  error: z.string(),
})
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

// ---------------------------------------------------------------------------
// GET /api/mobile/health
// ---------------------------------------------------------------------------

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  ts: z.string(),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

// ---------------------------------------------------------------------------
// Workspace primitives
// ---------------------------------------------------------------------------

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string().nullable(),
})
export type Workspace = z.infer<typeof WorkspaceSchema>

export const WorkspaceMembershipSchema = z.object({
  workspace_id: z.string().uuid(),
  role: z.string(),
  workspace: WorkspaceSchema,
})
export type WorkspaceMembership = z.infer<typeof WorkspaceMembershipSchema>

// ---------------------------------------------------------------------------
// GET /api/mobile/me
// ---------------------------------------------------------------------------

export const MeUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  created_at: z.string().nullable(),
})
export type MeUser = z.infer<typeof MeUserSchema>

export const MeResponseSchema = z.object({
  user: MeUserSchema,
  memberships: z.array(WorkspaceMembershipSchema),
})
export type MeResponse = z.infer<typeof MeResponseSchema>

// ---------------------------------------------------------------------------
// GET /api/mobile/workspaces
// ---------------------------------------------------------------------------

export const WorkspacesResponseSchema = z.object({
  workspaces: z.array(WorkspaceSchema),
})
export type WorkspacesResponse = z.infer<typeof WorkspacesResponseSchema>
