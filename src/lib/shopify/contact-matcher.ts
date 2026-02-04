import Fuse from 'fuse.js'
import doubleMetaphone from 'talisman/phonetics/double-metaphone'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  normalizeShopifyPhone,
  extractPhoneFromOrder,
} from './phone-normalizer'
import type { ShopifyOrderWebhook, ContactMatchResult } from './types'

/**
 * Attempts to match a Shopify order customer to an existing contact.
 *
 * MATCHING STRATEGY (Tiered approach per CONTEXT.md):
 *
 * 1. EXACT PHONE MATCH (Highest confidence)
 *    - Extract phone from order (checks order.phone, customer.phone, addresses)
 *    - Normalize to E.164 format
 *    - Query contacts by exact phone match
 *    - If found: confidence=1.0, needsVerification=false
 *
 * 2. FUZZY NAME+CITY MATCH (If enabled and phone fails)
 *    - Build full name from customer.first_name + customer.last_name
 *    - Get city from shipping_address or billing_address
 *    - Use Fuse.js for fuzzy string matching on "name city" combination
 *    - Use Double Metaphone for phonetic similarity (handles "sounds like" names)
 *    - Combined confidence score from both algorithms
 *    - ALWAYS flags for human verification (needsVerification=true)
 *
 * IMPORTANT DESIGN DECISIONS:
 * - Fuzzy matches are NEVER auto-assigned without human review
 * - Phonetic matching uses Double Metaphone (better than Soundex for non-English)
 * - Confidence threshold of 40% to avoid false positives
 * - Phone match is always preferred over fuzzy match
 *
 * @param order - Shopify order webhook payload
 * @param workspaceId - Target workspace to search contacts in
 * @param options - Matching configuration (enableFuzzyMatching toggle)
 * @returns Match result with contact (if found), confidence, and verification flag
 *
 * @example
 * // Phone match (high confidence, no verification needed)
 * const result = await matchContact(order, workspaceId, { enableFuzzyMatching: true })
 * // { contact: {...}, matchType: 'phone', confidence: 1.0, needsVerification: false }
 *
 * // Fuzzy match (needs human verification)
 * const result = await matchContact(order, workspaceId, { enableFuzzyMatching: true })
 * // { contact: {...}, matchType: 'fuzzy', confidence: 0.75, needsVerification: true }
 */
export async function matchContact(
  order: ShopifyOrderWebhook,
  workspaceId: string,
  options: { enableFuzzyMatching: boolean }
): Promise<ContactMatchResult> {
  const supabase = createAdminClient()

  // ============================================================================
  // STEP 1: Try exact phone match (highest confidence)
  // ============================================================================
  const phone = extractPhoneFromOrder(order)
  if (phone) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, name, phone')
      .eq('workspace_id', workspaceId)
      .eq('phone', phone)
      .single()

    if (contact) {
      return {
        contact,
        matchType: 'phone',
        confidence: 1.0,
        needsVerification: false,
      }
    }
  }

  // ============================================================================
  // STEP 2: Fuzzy name+city matching (if enabled)
  // ============================================================================
  if (options.enableFuzzyMatching && order.customer?.first_name) {
    const customerName = buildCustomerName(order.customer)
    const customerCity =
      order.shipping_address?.city || order.billing_address?.city || ''

    if (customerName) {
      // Get all contacts in workspace for fuzzy matching
      // Limit to 1000 for performance (reasonable for most workspaces)
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name, phone, city')
        .eq('workspace_id', workspaceId)
        .limit(1000)

      if (contacts && contacts.length > 0) {
        const match = findFuzzyMatch(customerName, customerCity, contacts)
        if (match) {
          return match
        }
      }
    }
  }

  // ============================================================================
  // NO MATCH FOUND
  // ============================================================================
  return {
    contact: null,
    matchType: 'none',
    confidence: 0,
    needsVerification: false,
  }
}

/**
 * Builds full customer name from Shopify customer data.
 * Handles null/undefined values gracefully.
 *
 * @param customer - Shopify customer object
 * @returns Full name string or empty string if no name parts available
 */
function buildCustomerName(customer: {
  first_name?: string | null
  last_name?: string | null
}): string {
  const parts = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .map((s) => s!.trim())
  return parts.join(' ')
}

/**
 * Finds best fuzzy match using Fuse.js and phonetic algorithms.
 *
 * ALGORITHM:
 * 1. Generate phonetic codes for customer name using Double Metaphone
 * 2. Prepare contacts with combined "name city" for Fuse.js search
 * 3. Run Fuse.js fuzzy search with threshold 0.4
 * 4. For top match, check phonetic similarity
 * 5. Combine Fuse.js score (inverted) with phonetic boost
 * 6. Only return if confidence > 40%
 *
 * WHY DOUBLE METAPHONE:
 * - Better than Soundex for non-English names (common in LATAM)
 * - Returns two encodings (primary and alternate) for better matching
 * - Handles Spanish pronunciation patterns well
 *
 * @param customerName - Full customer name from Shopify
 * @param customerCity - Customer city from Shopify address
 * @param contacts - List of contacts to search
 * @returns Match result or null if no good match found
 */
function findFuzzyMatch(
  customerName: string,
  customerCity: string,
  contacts: Array<{
    id: string
    name: string
    phone: string
    city: string | null
  }>
): ContactMatchResult | null {
  // Get phonetic codes for customer name
  // Double Metaphone returns [primary, alternate] codes
  const customerPhonetic = doubleMetaphone(customerName.toLowerCase())

  // Prepare contacts with phonetic codes and combined name+city
  const contactsWithMeta = contacts.map((c) => ({
    ...c,
    phonetic: doubleMetaphone(c.name.toLowerCase()),
    nameCity: `${c.name} ${c.city || ''}`.toLowerCase(),
  }))

  // Fuse.js configuration for fuzzy string matching
  // threshold: 0 = exact match, 1 = match anything
  // 0.4 is a reasonable balance for name matching
  const fuse = new Fuse(contactsWithMeta, {
    keys: ['nameCity'],
    threshold: 0.4,
    includeScore: true,
  })

  const searchTerm = `${customerName} ${customerCity}`.toLowerCase()
  const results = fuse.search(searchTerm)

  if (results.length === 0) {
    return null
  }

  // Take best match from Fuse.js results
  const best = results[0]
  const fuseScore = best.score || 1

  // Check phonetic similarity (does the name "sound like" the contact?)
  // Double Metaphone returns [primary, alternate] codes
  // Match if either primary or alternate codes match
  const phoneticMatch =
    best.item.phonetic[0] === customerPhonetic[0] ||
    best.item.phonetic[1] === customerPhonetic[1]

  // Calculate combined confidence score
  // Fuse.js score is 0-1 where 0 is perfect match, so we invert it
  let confidence = 1 - fuseScore

  // Boost confidence if phonetic codes match (sounds similar)
  // Cap at 95% because fuzzy matches should never be 100% confident
  if (phoneticMatch) {
    confidence = Math.min(confidence + 0.2, 0.95)
  }

  // Only return if confidence is reasonable (>40%)
  // Lower threshold leads to false positives
  if (confidence < 0.4) {
    return null
  }

  return {
    contact: {
      id: best.item.id,
      name: best.item.name,
      phone: best.item.phone,
    },
    matchType: 'fuzzy',
    confidence,
    // CRITICAL: Always flag fuzzy matches for human verification
    // This is a core requirement from CONTEXT.md - never auto-assign fuzzy matches
    needsVerification: true,
  }
}
