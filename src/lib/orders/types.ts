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
  carrier: string | null
  tracking_number: string | null
  shipping_address: string | null
  shipping_city: string | null
  linked_order_id: string | null
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface OrderFormData {
  contact_id?: string | null
  pipeline_id: string
  stage_id: string
  closing_date?: string | null
  description?: string | null
  carrier?: string | null
  tracking_number?: string | null
  shipping_address?: string | null
  shipping_city?: string | null
  linked_order_id?: string | null
  custom_fields?: Record<string, unknown>
}

/**
 * Order with contact and stage details loaded.
 */
export interface OrderWithDetails extends Order {
  contact: {
    id: string
    name: string
    phone: string
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
