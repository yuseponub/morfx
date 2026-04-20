// Local copy of the GET /api/mobile/templates response contract.
//
// Source of truth: /shared/mobile-api/schemas.ts — this file MUST stay
// byte-compatible (same shape, same Zod rules). We duplicate it here
// because Metro (the Expo bundler) cannot resolve imports outside
// apps/mobile/ — see metro.config.js. Cross-boundary imports pass tsc
// (monorepo tsconfig resolves them) but fail at eas update bundle time.
//
// If you change either file, change both.

import { z } from 'zod';

export const MobileTemplateComponentSchema = z.object({
  type: z.enum(['HEADER', 'BODY', 'FOOTER', 'BUTTONS']),
  format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).optional(),
  text: z.string().optional(),
});
export type MobileTemplateComponent = z.infer<typeof MobileTemplateComponentSchema>;

export const MobileTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  language: z.string(),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  components: z.array(MobileTemplateComponentSchema),
  variable_count: z.number().int().nonnegative(),
  variable_mapping: z.record(z.string(), z.string()),
});
export type MobileTemplate = z.infer<typeof MobileTemplateSchema>;

export const MobileTemplatesListResponseSchema = z.object({
  templates: z.array(MobileTemplateSchema),
});
export type MobileTemplatesListResponse = z.infer<
  typeof MobileTemplatesListResponseSchema
>;
