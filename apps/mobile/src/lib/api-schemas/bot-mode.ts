// Local copy of the POST /api/mobile/conversations/:id/bot-mode request +
// response contract.
//
// Source of truth: /shared/mobile-api/schemas.ts — this file MUST stay
// byte-compatible (same shape, same Zod rules). We duplicate it here
// because Metro (the Expo bundler) cannot resolve imports outside
// apps/mobile/ — see metro.config.js. tsc resolves the parent path via
// the monorepo tsconfig, which is why cross-boundary imports pass type
// checking but fail at bundle time (learned the hard way in Plan 07 when
// eas update rejected the bundle even though tsc was green).
//
// If you change either file, change both.

import { z } from 'zod';

export const MobileBotModeRequestSchema = z.object({
  mode: z.enum(['on', 'off', 'muted']),
  muteUntil: z
    .string()
    .datetime({ offset: true })
    .nullable(),
});
export type MobileBotModeRequest = z.infer<typeof MobileBotModeRequestSchema>;

export const MobileBotModeResponseSchema = z.object({
  conversation_id: z.string().uuid(),
  bot_mode: z.enum(['on', 'off', 'muted']),
  bot_mute_until: z.string().nullable(),
});
export type MobileBotModeResponse = z.infer<
  typeof MobileBotModeResponseSchema
>;
