// Local copy of the GET /api/mobile/conversations/:id/messages response
// contract AND the POST mark-read response.
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

export const MobileMessageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  direction: z.enum(['in', 'out']),
  body: z.string().nullable(),
  media_url: z.string().nullable(),
  media_type: z.enum(['image', 'audio', 'video', 'document']).nullable(),
  template_name: z.string().nullable(),
  sender_name: z.string().nullable(),
  status: z
    .enum(['pending', 'sent', 'delivered', 'read', 'failed'])
    .nullable(),
  idempotency_key: z.string().nullable(),
  created_at: z.string(),
});
export type MobileMessage = z.infer<typeof MobileMessageSchema>;

export const MobileMessagesListResponseSchema = z.object({
  messages: z.array(MobileMessageSchema),
  next_cursor: z.string().nullable(),
});
export type MobileMessagesListResponse = z.infer<
  typeof MobileMessagesListResponseSchema
>;

export const MarkReadResponseSchema = z.object({
  ok: z.literal(true),
});
export type MarkReadResponse = z.infer<typeof MarkReadResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/mobile/conversations/:id/messages — send path (Plan 09)
// ---------------------------------------------------------------------------

export const SendMessageRequestSchema = z.object({
  idempotencyKey: z.string().min(1),
  body: z.string().nullable(),
  mediaKey: z.string().nullable(),
  mediaType: z.enum(['image', 'audio']).nullable(),
  templateName: z.string().optional(),
  templateVariables: z.record(z.string(), z.string()).optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const SendMessageResponseSchema = z.object({
  message: MobileMessageSchema,
});
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/mobile/conversations/:id/media/upload — presigned PUT (Plan 09)
// ---------------------------------------------------------------------------

export const MediaUploadRequestSchema = z.object({
  mimeType: z.string().min(1),
  byteSize: z.number().int().positive(),
});
export type MediaUploadRequest = z.infer<typeof MediaUploadRequestSchema>;

export const MediaUploadResponseSchema = z.object({
  uploadUrl: z.string().url(),
  mediaKey: z.string().min(1),
  publicUrl: z.string().url(),
  expiresAt: z.string(),
});
export type MediaUploadResponse = z.infer<typeof MediaUploadResponseSchema>;
