// ============================================================================
// Phase 11: Shopify Integration Types
// Types for integrations, webhooks, and Shopify order payloads
// ============================================================================

// ============================================================================
// INTEGRATION TYPES
// ============================================================================

/**
 * Base integration record from the database.
 * Represents a third-party integration configuration for a workspace.
 */
export interface Integration {
  id: string
  workspace_id: string
  type: string
  name: string
  config: Record<string, unknown>
  is_active: boolean
  last_sync_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Configuration specific to Shopify integrations.
 * Stored in the `config` JSONB field of the integrations table.
 */
export interface ShopifyConfig {
  /** Shopify store domain (e.g., "mystore.myshopify.com") */
  shop_domain: string
  /** Admin API access token (encrypted at rest) */
  access_token: string
  /** API secret key for HMAC webhook verification (encrypted at rest) */
  api_secret: string
  /** Default pipeline for imported orders */
  default_pipeline_id: string
  /** Default stage within the pipeline for new orders */
  default_stage_id: string
  /** Enable fuzzy matching for contacts by name+city */
  enable_fuzzy_matching: boolean
  /** Product matching strategy: 'sku', 'name', or 'value' */
  product_matching: 'sku' | 'name' | 'value'
  /** Optional field mappings from Shopify fields to MorfX fields */
  field_mappings?: Record<string, string>
  /** Auto-create contacts+orders from webhooks (default: true for backward compatibility) */
  auto_sync_orders?: boolean
}

/**
 * Shopify integration with typed configuration.
 * Use this type when working with Shopify-specific integration data.
 */
export interface ShopifyIntegration extends Omit<Integration, 'type' | 'config'> {
  type: 'shopify'
  config: ShopifyConfig
}

// ============================================================================
// WEBHOOK EVENT TYPES
// ============================================================================

/**
 * Webhook event record from the database.
 * Used for idempotency checking and debugging webhook deliveries.
 */
export interface WebhookEvent {
  id: string
  integration_id: string
  /** External webhook ID (X-Shopify-Webhook-Id) for idempotency */
  external_id: string
  /** Webhook topic (e.g., 'orders/create') */
  topic: string
  /** Raw webhook payload */
  payload: ShopifyOrderWebhook
  /** Processing status */
  status: 'pending' | 'processed' | 'failed'
  /** Error message if processing failed */
  error_message: string | null
  /** Number of retry attempts */
  retry_count: number
  /** Timestamp when webhook was processed */
  processed_at: string | null
  /** Timestamp when webhook was received */
  created_at: string
}

// ============================================================================
// SHOPIFY ORDER WEBHOOK PAYLOAD TYPES
// Based on Shopify's orders/create webhook format
// ============================================================================

/**
 * Main Shopify order webhook payload.
 * Received when an order is created in Shopify.
 */
export interface ShopifyOrderWebhook {
  /** Unique order ID in Shopify */
  id: number
  /** Order name/number as displayed in Shopify (e.g., "#1001") */
  name: string
  /** Numeric order number */
  order_number: number
  /** Customer email (may be null) */
  email: string | null
  /** Customer phone (may be null) */
  phone: string | null
  /** ISO 8601 timestamp of order creation */
  created_at: string
  /** Total price as string (e.g., "99.99") */
  total_price: string
  /** Subtotal price before taxes/shipping */
  subtotal_price: string
  /** Total tax amount */
  total_tax: string
  /** Currency code (e.g., "COP", "USD") */
  currency: string
  /** Payment status: "paid", "pending", "refunded", etc. */
  financial_status: string
  /** Fulfillment status: "fulfilled", "partial", null (unfulfilled) */
  fulfillment_status: string | null
  /** Customer information */
  customer: ShopifyCustomer | null
  /** Billing address */
  billing_address: ShopifyAddress | null
  /** Shipping address */
  shipping_address: ShopifyAddress | null
  /** Order line items */
  line_items: ShopifyLineItem[]
  /** Order note from customer */
  note: string | null
  /** Additional attributes from cart/checkout (e.g. Releasit COD form fields) */
  note_attributes: Array<{ name: string; value: string }> | null
  /** Comma-separated tags on the order */
  tags: string | null
}

/**
 * Main Shopify draft order webhook payload.
 * Received when a draft order is created in Shopify (topic: draft_orders/create).
 * Shares most fields with ShopifyOrderWebhook but uses `status` instead of
 * `financial_status` and has an optional `invoice_url` field.
 */
export interface ShopifyDraftOrderWebhook {
  /** Unique draft order ID in Shopify */
  id: number
  /** Draft order name as displayed in Shopify (e.g., "#D1") */
  name: string
  /** Numeric order number */
  order_number: number
  /** Customer email (may be null) */
  email: string | null
  /** Customer phone (may be null) */
  phone: string | null
  /** ISO 8601 timestamp of draft order creation */
  created_at: string
  /** Total price as string (e.g., "99.99") */
  total_price: string
  /** Subtotal price before taxes/shipping */
  subtotal_price: string
  /** Total tax amount */
  total_tax: string
  /** Currency code (e.g., "COP", "USD") */
  currency: string
  /** Draft order status: "open", "invoice_sent", "completed" */
  status: string
  /** Fulfillment status is always null for draft orders */
  fulfillment_status: null
  /** Customer information */
  customer: ShopifyCustomer | null
  /** Billing address */
  billing_address: ShopifyAddress | null
  /** Shipping address */
  shipping_address: ShopifyAddress | null
  /** Order line items */
  line_items: ShopifyLineItem[]
  /** Draft order note */
  note: string | null
  /** Additional attributes from cart/checkout (e.g. Releasit COD form fields) */
  note_attributes: Array<{ name: string; value: string }> | null
  /** Invoice URL for the draft order (null if no invoice sent) */
  invoice_url: string | null
}

/**
 * Shopify customer data embedded in order webhook.
 */
export interface ShopifyCustomer {
  /** Unique customer ID in Shopify */
  id: number
  /** Customer email */
  email: string | null
  /** Customer phone number */
  phone: string | null
  /** Customer first name */
  first_name: string | null
  /** Customer last name */
  last_name: string | null
  /** Customer's default address */
  default_address: ShopifyAddress | null
}

/**
 * Shopify address data (billing or shipping).
 */
export interface ShopifyAddress {
  /** First name on address */
  first_name: string | null
  /** Last name on address */
  last_name: string | null
  /** Street address line 1 */
  address1: string | null
  /** Street address line 2 */
  address2: string | null
  /** City */
  city: string | null
  /** Province/State */
  province: string | null
  /** Country */
  country: string | null
  /** Postal/ZIP code */
  zip: string | null
  /** Phone number on address */
  phone: string | null
}

/**
 * Shopify line item (product) in an order.
 */
export interface ShopifyLineItem {
  /** Unique line item ID */
  id: number
  /** Product ID (null if product deleted) */
  product_id: number | null
  /** Variant ID (null if variant deleted) */
  variant_id: number | null
  /** Product SKU */
  sku: string
  /** Full product name including variant */
  name: string
  /** Product title without variant */
  title: string
  /** Quantity ordered */
  quantity: number
  /** Unit price as string */
  price: string
  /** Total discount applied to this line item */
  total_discount: string
}

// ============================================================================
// FORM DATA TYPES
// ============================================================================

/**
 * Form data for creating/updating a Shopify integration.
 * Used in the integration settings UI.
 */
export interface IntegrationFormData {
  /** Display name for the integration */
  name: string
  /** Shopify store domain */
  shop_domain: string
  /** Admin API access token */
  access_token: string
  /** API secret key for webhook verification */
  api_secret: string
  /** Default pipeline for imported orders */
  default_pipeline_id: string
  /** Default stage for imported orders */
  default_stage_id: string
  /** Enable fuzzy matching for contacts */
  enable_fuzzy_matching: boolean
  /** Product matching strategy */
  product_matching: 'sku' | 'name' | 'value'
}

// ============================================================================
// CONTACT MATCHING TYPES
// ============================================================================

/**
 * Result of attempting to match a Shopify customer to an existing contact.
 * Used by the contact matching logic during order import.
 */
export interface ContactMatchResult {
  /** Matched contact (null if no match found) */
  contact: {
    id: string
    name: string
    phone: string
  } | null
  /** How the contact was matched */
  matchType: 'phone' | 'fuzzy' | 'none'
  /** Confidence score (0-1) for the match */
  confidence: number
  /** Whether the match needs human verification (always true for fuzzy matches) */
  needsVerification: boolean
}

// ============================================================================
// WEBHOOK PROCESSING TYPES
// ============================================================================

/**
 * Result of processing a Shopify order webhook.
 */
export interface WebhookProcessingResult {
  /** Whether processing succeeded */
  success: boolean
  /** Created/updated order ID (if successful) */
  orderId?: string
  /** Created/matched contact ID (if applicable) */
  contactId?: string
  /** Whether the contact match needs verification */
  needsContactVerification?: boolean
  /** Error message (if failed) */
  error?: string
}

/**
 * Headers from Shopify webhook request.
 * Used for HMAC verification and idempotency.
 */
export interface ShopifyWebhookHeaders {
  /** HMAC signature for verification */
  'x-shopify-hmac-sha256': string
  /** Unique webhook ID for idempotency */
  'x-shopify-webhook-id': string
  /** Shop domain that sent the webhook */
  'x-shopify-shop-domain': string
  /** Webhook topic (e.g., 'orders/create') */
  'x-shopify-topic': string
  /** API version used */
  'x-shopify-api-version': string
}

// ============================================================================
// INTEGRATION STATUS TYPES
// ============================================================================

/**
 * Status information displayed in the integration settings UI.
 */
export interface IntegrationStatus {
  /** Whether the integration is active */
  isActive: boolean
  /** Whether credentials are valid */
  isConnected: boolean
  /** Last successful sync timestamp */
  lastSyncAt: string | null
  /** Number of orders imported today */
  ordersImportedToday: number
  /** Recent errors (if any) */
  recentErrors: Array<{
    message: string
    timestamp: string
  }>
}
