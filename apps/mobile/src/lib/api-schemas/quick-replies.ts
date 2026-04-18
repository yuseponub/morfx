// Local copy of the GET /api/mobile/quick-replies response contract.
//
// Source of truth: /shared/mobile-api/schemas.ts — this file MUST stay
// byte-compatible (same shape, same Zod rules). We duplicate it here
// because Metro (the Expo bundler) cannot resolve imports outside
// apps/mobile/ — see metro.config.js. Cross-boundary imports pass tsc
// (monorepo tsconfig resolves them) but fail at eas update bundle time.
//
// If you change either file, change both.

import { z } from 'zod';

export const MobileQuickReplySchema = z.object({
  id: z.string().uuid(),
  trigger: z.string(),
  body: z.string(),
  category: z.string().nullable(),
  mediaUrl: z.string().nullable(),
  mediaType: z.enum(['image', 'video', 'audio', 'document']).nullable(),
});
export type MobileQuickReply = z.infer<typeof MobileQuickReplySchema>;

export const MobileQuickRepliesListResponseSchema = z.object({
  quickReplies: z.array(MobileQuickReplySchema),
});
export type MobileQuickRepliesListResponse = z.infer<
  typeof MobileQuickRepliesListResponseSchema
>;
