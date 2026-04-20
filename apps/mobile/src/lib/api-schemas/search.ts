// Local copy of the GET /api/mobile/search response contract.
//
// Source of truth: /shared/mobile-api/schemas.ts — this file MUST stay
// byte-compatible (same shape, same Zod rules). We duplicate it here
// because Metro (the Expo bundler) cannot resolve imports outside
// apps/mobile/ — see metro.config.js. Cross-boundary imports pass tsc
// (monorepo tsconfig resolves them) but fail at eas update bundle time.
//
// If you change either file, change both.

import { z } from 'zod';

export const MobileSearchResultSchema = z.object({
  message_id: z.string().uuid().nullable(),
  conversation_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  contact_name: z.string().nullable(),
  contact_phone: z.string(),
  snippet_before: z.string(),
  snippet_match: z.string(),
  snippet_after: z.string(),
  created_at: z.string(),
  source: z.enum(['message', 'contact']),
});
export type MobileSearchResult = z.infer<typeof MobileSearchResultSchema>;

export const MobileSearchResponseSchema = z.object({
  results: z.array(MobileSearchResultSchema),
});
export type MobileSearchResponse = z.infer<typeof MobileSearchResponseSchema>;

export const MobileSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, 'query must be at least 2 characters')
    .max(200, 'query too long'),
});
export type MobileSearchQuery = z.infer<typeof MobileSearchQuerySchema>;
