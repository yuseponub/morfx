// ============================================================================
// Phase 6: Orders Module Types
// Types for products, pipelines, orders, and related entities
// ============================================================================

// ============================================================================
// PRODUCT TYPES
// ============================================================================

/**
 * Product in the workspace catalog.
 */
export interface Product {
  id: string
  workspace_id: string
  sku: string
  title: string
  price: number
  shopify_product_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductFormData {
  sku: string
  title: string
  price: number
  shopify_product_id?: string | null
  is_active?: boolean
}

// ============================================================================
// PIPELINE TYPES
// ============================================================================

/**
 * Pipeline for organizing orders (e.g., "Ventas", "Devoluciones").
 */
export interface Pipeline {
  id: string
  workspace_id: string
  name: string
  description: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface PipelineFormData {
  name: string
  description?: string | null
  is_default?: boolean
}

/**
 * Stage within a pipeline (e.g., "Nuevo", "En proceso", "Ganado").
 */
export interface PipelineStage {
  id: string
  pipeline_id: string
  name: string
  color: string
  position: number
  wip_limit: number | null
  is_closed: boolean
  order_state_id?: string | null
  created_at: string
}

export interface PipelineStageFormData {
  name: string
  color?: string
  position?: number
  wip_limit?: number | null
  is_closed?: boolean
}

/**
 * Pipeline with its stages loaded.
 */
export interface PipelineWithStages extends Pipeline {
  stages: PipelineStage[]
}

// ============================================================================
// ORDER STATE TYPES
// ============================================================================

/**
 * Configurable order state that groups pipeline stages.
 * Each state has a name and emoji (displayed as indicator in WhatsApp).
 */
export interface OrderState {
  id: string
  workspace_id: string
  name: string
  emoji: string
  position: number
  created_at: string
  updated_at: string
}

/**
 * Form data for creating/updating an order state.
 */
export interface OrderStateFormData {
  name: string
  emoji: string
}

/**
 * Order state with its assigned stages loaded.
 */
export interface OrderStateWithStages extends OrderState {
  stages: Pick<PipelineStage, 'id' | 'name' | 'color' | 'pipeline_id'>[]
}

// ============================================================================
// ORDER TYPES
// ============================================================================

/**
 * Core order/deal entity.
 */
export interface Order {
  id: string
  workspace_id: string
  contact_id: string | null
  pipeline_id: string
  stage_id: string
  total_value: number
  closing_date: string | null
  description: string | null
  name: string | null
  carrier: string | null
  tracking_number: string | null
  shipping_address: string | null
  shipping_city: string | null
  shipping_department: string | null
  linked_order_id: string | null
  source_order_id: string | null
  custom_fields: Record<string, unknown>
  email: string | null
  created_at: string
  updated_at: string
}

export interface OrderFormData {
  contact_id?: string | null
  pipeline_id: string
  stage_id: string
  closing_date?: string | null
  description?: string | null
  name?: string | null
  carrier?: string | null
  tracking_number?: string | null
  shipping_address?: string | null
  shipping_city?: string | null
  shipping_department?: string | null
  linked_order_id?: string | null
  source_order_id?: string | null
  custom_fields?: Record<string, unknown>
  email?: string | null
}

/**
 * Related order info for bidirectional navigation.
 * Used by the order detail page to show connected orders.
 */
export interface RelatedOrder {
  id: string
  pipeline_name: string
  stage_name: string
  stage_color: string
  contact_name: string | null
  total_value: number
  created_at: string
  relationship: 'source' | 'derived'
}

/**
 * Order with contact and stage details loaded.
 */
export interface OrderWithDetails extends Order {
  contact: {
    id: string
    name: string
    phone: string
    address: string | null
    city: string | null
  } | null
  stage: {
    id: string
    name: string
    color: string
    is_closed: boolean
  }
  pipeline: {
    id: string
    name: string
  }
  tags: Array<{
    id: string
    name: string
    color: string
  }>
  products: OrderProduct[]
  /** True when other orders reference this one as source_order_id */
  has_derived_orders?: boolean
}

// ============================================================================
// ORDER PRODUCT TYPES
// ============================================================================

/**
 * Line item in an order with snapshot pricing.
 */
export interface OrderProduct {
  id: string
  order_id: string
  product_id: string | null
  sku: string
  title: string
  unit_price: number
  quantity: number
  subtotal: number
  created_at: string
}

export interface OrderProductFormData {
  product_id?: string | null
  sku: string
  title: string
  unit_price: number
  quantity: number
}

// ============================================================================
// DUPLICATE ERROR MARKER
// Standalone: crm-duplicate-order-products-integrity
// ============================================================================

/**
 * Marker persisted to `orders.custom_fields.duplicate_error` when
 * `duplicateOrder` cannot copy products from source. Surfaced in Kanban badge.
 *
 * D-01 + D-pre-06: keep destination order empty + visible, don't rollback.
 * Shape is stable; if a future consumer needs versioning, add `version: 1` then.
 */
export interface DuplicateError {
  /** PostgreSQL SQLSTATE: '23503' (FK), '23514' (CHECK), '23502' (NOT NULL), etc. */
  errorCode: string
  /** Raw Postgres error message — surfaced verbatim in UI (truncated to 80 chars in Popover) */
  errorMessage: string
  /** ISO timestamp when the failure occurred */
  failedAt: string
  /** Duplicates orders.source_order_id for accessibility in UI without re-fetching */
  sourceOrderId: string
  /** Snapshot of products the source had at the moment of the failed duplication */
  attemptedProducts: Array<{
    sku: string
    title: string
    unit_price: number
    quantity: number
  }>
}

/**
 * Type-safe accessor for the marker. Returns null when absent or malformed.
 * Use in KanbanCard render to gate the badge.
 */
export function getDuplicateError(
  order: { custom_fields: Record<string, unknown> }
): DuplicateError | null {
  const raw = order.custom_fields?.duplicate_error
  if (!raw || typeof raw !== 'object') return null
  // Minimal shape validation — if the marker is present we trust the writer
  const candidate = raw as Partial<DuplicateError>
  if (
    typeof candidate.errorCode !== 'string' ||
    typeof candidate.errorMessage !== 'string' ||
    typeof candidate.failedAt !== 'string' ||
    typeof candidate.sourceOrderId !== 'string' ||
    !Array.isArray(candidate.attemptedProducts)
  ) {
    return null
  }
  return candidate as DuplicateError
}

// ============================================================================
// ORDER TAG TYPES
// ============================================================================

export interface OrderTag {
  id: string
  order_id: string
  tag_id: string
  created_at: string
}

// ============================================================================
// SAVED VIEW TYPES
// ============================================================================

export type SavedViewEntityType = 'contact' | 'order'

/**
 * Saved filter/view for contacts or orders.
 */
export interface SavedView {
  id: string
  workspace_id: string
  user_id: string
  name: string
  entity_type: SavedViewEntityType
  filters: Record<string, unknown>
  is_shared: boolean
  created_at: string
  updated_at: string
}

export interface SavedViewFormData {
  name: string
  entity_type: SavedViewEntityType
  filters: Record<string, unknown>
  is_shared?: boolean
}

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * Filter criteria for orders list.
 */
export interface OrderFilters {
  search?: string
  pipeline_id?: string
  stage_id?: string
  tag_ids?: string[]
  contact_id?: string
  carrier?: string
  has_tracking?: boolean
  date_from?: string
  date_to?: string
  closing_date_from?: string
  closing_date_to?: string
  value_min?: number
  value_max?: number
}

// ============================================================================
// KANBAN STATE TYPES
// ============================================================================

/**
 * Orders grouped by stage for Kanban board.
 */
export interface OrdersByStage {
  [stageId: string]: OrderWithDetails[]
}

/**
 * Kanban board state with pipeline and orders.
 */
export interface KanbanState {
  pipeline: PipelineWithStages
  ordersByStage: OrdersByStage
  isLoading: boolean
}

// ============================================================================
// MOVE OPERATIONS
// ============================================================================

/**
 * Payload for moving an order to a different stage.
 */
export interface MoveOrderPayload {
  orderId: string
  targetStageId: string
  /** Position within the target column (for ordering) */
  position?: number
}

/**
 * Payload for reordering stages within a pipeline.
 */
export interface ReorderStagesPayload {
  pipelineId: string
  stageIds: string[]
}

// ============================================================================
// ORDER NOTE TYPES
// ============================================================================

/**
 * Note attached to an order.
 * All workspace members can see notes; author (or admin/owner) can edit/delete.
 */
export interface OrderNote {
  id: string
  order_id: string
  workspace_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
}

/**
 * Note with user profile info for display.
 */
export interface OrderNoteWithUser extends OrderNote {
  user: {
    id: string
    email: string
  }
}
