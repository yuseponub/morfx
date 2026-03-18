// ============================================================================
// Phone Distance Utility
// Detects when a Shopify phone is 1-2 digits different from an existing
// contact's phone, combined with fuzzy name matching.
// Used by resolveOrCreateContact to flag potential duplicates for review.
// ============================================================================

import Fuse from 'fuse.js'

// ============================================================================
// Types
// ============================================================================

export interface ContactCandidate {
  id: string
  name: string
  phone: string
}

export interface ClosePhoneMatch {
  contactId: string
  contactName: string
  existingPhone: string
  distance: number
  nameScore: number
}

// ============================================================================
// Levenshtein Distance
// Simple DP implementation — no external library needed.
// ============================================================================

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length

  // Edge cases
  if (m === 0) return n
  if (n === 0) return m

  // Create DP matrix
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  )

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,     // deletion
        dp[i][j - 1] + 1,     // insertion
        dp[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return dp[m][n]
}

// ============================================================================
// Phone normalization for comparison
// Strips country code, keeps last 10 digits for comparison.
// ============================================================================

function normalizeForComparison(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')
  // Take last 10 digits (strips country code like +57, +1, etc.)
  return digits.slice(-10)
}

// ============================================================================
// findClosePhone
// Returns a match if target phone is 1-2 digits different from any contact's
// phone AND the customer name is similar to the contact name.
// ============================================================================

/**
 * Find a contact whose phone is 1-2 digits different from targetPhone
 * AND whose name is similar to customerName.
 *
 * @param targetPhone - The Shopify order phone (E.164 format)
 * @param contacts - Array of existing contacts with id, name, phone
 * @param customerName - The Shopify customer name for fuzzy matching
 * @returns Match with closest phone + name similarity, or null
 */
export function findClosePhone(
  targetPhone: string,
  contacts: ContactCandidate[],
  customerName: string
): ClosePhoneMatch | null {
  if (!targetPhone || !customerName || contacts.length === 0) return null

  const targetNorm = normalizeForComparison(targetPhone)
  if (targetNorm.length === 0) return null

  // First pass: find contacts with phone distance 1-2
  const phoneMatches: Array<{
    contact: ContactCandidate
    distance: number
  }> = []

  for (const contact of contacts) {
    if (!contact.phone) continue
    const contactNorm = normalizeForComparison(contact.phone)
    if (contactNorm.length === 0) continue

    // Skip exact matches (distance 0 means same phone, not a review case)
    const dist = levenshtein(targetNorm, contactNorm)
    if (dist >= 1 && dist <= 2) {
      phoneMatches.push({ contact, distance: dist })
    }
  }

  if (phoneMatches.length === 0) return null

  // Second pass: fuzzy name matching using Fuse.js
  // Fuse threshold 0.3 means score 0-0.3 is a good match
  // (Fuse score 0 = perfect match, 1 = no match)
  const fuse = new Fuse(
    phoneMatches.map((m) => ({ ...m, name: m.contact.name })),
    {
      keys: ['name'],
      threshold: 0.3, // Only accept good matches (score <= 0.3)
      includeScore: true,
    }
  )

  const fuseResults = fuse.search(customerName)
  if (fuseResults.length === 0) return null

  // Take best match (lowest Fuse score = best name match)
  const best = fuseResults[0]
  const fuseScore = best.score ?? 1
  // Convert Fuse score to similarity: 1 - fuseScore
  // fuseScore 0 = perfect match → nameScore 1.0
  // fuseScore 0.3 = threshold → nameScore 0.7
  const nameScore = 1 - fuseScore

  return {
    contactId: best.item.contact.id,
    contactName: best.item.contact.name,
    existingPhone: best.item.contact.phone,
    distance: best.item.distance,
    nameScore,
  }
}
