// Local copy of the CRM drawer contracts in /shared/mobile-api/schemas.ts.
//
// Metro (the Expo bundler) cannot resolve imports outside apps/mobile/ —
// see metro.config.js — so every shared schema MUST be duplicated here in
// byte-compatible form. If you change the server shape, change both.
//
// Consumed by:
//   - src/hooks/useContactPanel.ts
//   - src/components/crm-panel/*.tsx
//
// See also:
//   - src/lib/api-schemas/conversations.ts  (Plan 07 schema dupe)
//   - src/lib/api-schemas/messages.ts       (Plan 08/09 schema dupe)
//   - src/lib/api-schemas/quick-replies.ts  (Plan 09 schema dupe)

import { z } from 'zod';

// Shared primitives ---------------------------------------------------------

export const MobileTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string(),
});
export type MobileTag = z.infer<typeof MobileTagSchema>;

export const MobilePipelineStageSchema = z.object({
  id: z.string().uuid(),
  pipeline_id: z.string().uuid(),
  pipeline_name: z.string(),
  name: z.string(),
  color: z.string(),
  position: z.number().int().nonnegative(),
});
export type MobilePipelineStage = z.infer<typeof MobilePipelineStageSchema>;

// Contact + window ---------------------------------------------------------

export const MobileContactSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  avatar_url: z.string().nullable(),
  tags: z.array(MobileTagSchema),
  created_at: z.string(),
});
export type MobileContact = z.infer<typeof MobileContactSchema>;

export const WindowIndicatorSchema = z.object({
  within_window: z.boolean(),
  last_customer_message_at: z.string().nullable(),
  hours_remaining: z.number().nullable(),
});
export type WindowIndicator = z.infer<typeof WindowIndicatorSchema>;

export const MobileContactPanelResponseSchema = z.object({
  contact: MobileContactSchema.nullable(),
  conversation_tags: z.array(MobileTagSchema),
  window: WindowIndicatorSchema,
  profile_name: z.string().nullable(),
  phone: z.string(),
});
export type MobileContactPanelResponse = z.infer<
  typeof MobileContactPanelResponseSchema
>;

// Recent orders -----------------------------------------------------------

export const MobileOrderSchema = z.object({
  id: z.string().uuid(),
  total: z.number(),
  currency: z.literal('COP'),
  stage_id: z.string().uuid(),
  stage_name: z.string(),
  stage_color: z.string(),
  pipeline_id: z.string().uuid(),
  pipeline_name: z.string(),
  created_at: z.string(),
  tags: z.array(MobileTagSchema),
  name: z.string().nullable(),
});
export type MobileOrder = z.infer<typeof MobileOrderSchema>;

export const MobileRecentOrdersResponseSchema = z.object({
  orders: z.array(MobileOrderSchema),
});
export type MobileRecentOrdersResponse = z.infer<
  typeof MobileRecentOrdersResponseSchema
>;

// Pipeline stages + tags list ---------------------------------------------

export const MobilePipelineStagesResponseSchema = z.object({
  stages: z.array(MobilePipelineStageSchema),
});
export type MobilePipelineStagesResponse = z.infer<
  typeof MobilePipelineStagesResponseSchema
>;

export const MobileTagsResponseSchema = z.object({
  tags: z.array(MobileTagSchema),
});
export type MobileTagsResponse = z.infer<typeof MobileTagsResponseSchema>;

// Writes --------------------------------------------------------------------

export const UpdateContactNameRequestSchema = z.object({
  name: z.string().min(1),
});
export type UpdateContactNameRequest = z.infer<
  typeof UpdateContactNameRequestSchema
>;

export const CreateOrderRequestSchema = z.object({
  contactId: z.string().uuid(),
  conversationId: z.string().uuid().nullable().optional(),
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  name: z.string().optional(),
  total: z.number().optional(),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

export const CreateOrderResponseSchema = z.object({
  order: MobileOrderSchema,
});
export type CreateOrderResponse = z.infer<typeof CreateOrderResponseSchema>;

export const MoveOrderStageRequestSchema = z.object({
  stageId: z.string().uuid(),
});
export type MoveOrderStageRequest = z.infer<typeof MoveOrderStageRequestSchema>;

export const MoveOrderStageResponseSchema = z.object({
  ok: z.literal(true),
  order_id: z.string().uuid(),
  previous_stage_id: z.string().uuid(),
  new_stage_id: z.string().uuid(),
});
export type MoveOrderStageResponse = z.infer<
  typeof MoveOrderStageResponseSchema
>;

export const AddTagRequestSchema = z.object({
  tagId: z.string().uuid(),
});
export type AddTagRequest = z.infer<typeof AddTagRequestSchema>;

export const TagMutationResponseSchema = z.object({
  ok: z.literal(true),
  tag_id: z.string().uuid(),
});
export type TagMutationResponse = z.infer<typeof TagMutationResponseSchema>;

export const RecompraOrderRequestSchema = z.object({
  targetStageId: z.string().uuid().optional(),
});
export type RecompraOrderRequest = z.infer<typeof RecompraOrderRequestSchema>;

export const RecompraOrderResponseSchema = z.object({
  order: MobileOrderSchema,
});
export type RecompraOrderResponse = z.infer<typeof RecompraOrderResponseSchema>;
