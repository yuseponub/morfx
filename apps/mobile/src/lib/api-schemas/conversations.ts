// Local copy of the GET /api/mobile/conversations response contract.
//
// Source of truth: /shared/mobile-api/schemas.ts — this file MUST stay
// byte-compatible (same shape, same Zod rules). We duplicate it here
// because Metro (the Expo bundler) cannot resolve imports outside
// apps/mobile/ — see metro.config.js. tsc resolves the parent path via
// the monorepo tsconfig, which is why the original cross-boundary import
// passed type checking but failed at bundle time.
//
// If you change either file, change both.

import { z } from 'zod';

export const MobileConversationSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  contact_name: z.string().nullable(),
  contact_phone: z.string(),
  contact_profile_name: z.string().nullable(),
  last_message_body: z.string().nullable(),
  last_message_at: z.string().nullable(),
  last_customer_message_at: z.string().nullable(),
  unread_count: z.number().int().nonnegative(),
  tags: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      color: z.string(),
    })
  ),
  pipeline_stage_id: z.string().uuid().nullable(),
  pipeline_stage_name: z.string().nullable(),
  pipeline_stage_color: z.string().nullable(),
  bot_mode: z.enum(['on', 'off', 'muted']),
  bot_mute_until: z.string().nullable(),
  avatar_url: z.string().nullable(),
});
export type MobileConversation = z.infer<typeof MobileConversationSchema>;

export const MobileConversationsListResponseSchema = z.object({
  conversations: z.array(MobileConversationSchema),
  next_cursor: z.string().nullable(),
});
export type MobileConversationsListResponse = z.infer<
  typeof MobileConversationsListResponseSchema
>;
