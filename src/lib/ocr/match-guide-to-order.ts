/**
 * Phase 27: Robot OCR de Guias — Matching Algorithm
 *
 * Matches OCR-extracted guide data against eligible CRM orders.
 * Uses cascading priority: Phone > Name > City > Address.
 * Each criterion is tried independently; first match wins.
 */

import type { GuideOcrResult, OrderForMatching, MatchResult } from './types'
import { normalizePhone, normalizeAddress, normalizeNameForComparison } from './normalize'

/** Confidence scores per match criterion */
const CONFIDENCE_BY_CRITERION = {
  phone: 95,
  name: 80,
  city: 55,
  address: 50,
} as const

/**
 * Match a single guide's OCR data against a list of eligible orders.
 * Uses cascading priority: Phone > Name > City > Address.
 *
 * @param ocrData - Extracted guide data from Claude Vision
 * @param eligibleOrders - Orders in the target pipeline stage
 * @returns Best match with confidence score, or null if no match found
 */
export function matchGuideToOrder(
  ocrData: GuideOcrResult,
  eligibleOrders: OrderForMatching[]
): MatchResult | null {
  if (eligibleOrders.length === 0) return null

  // Priority 1: Phone match (highest confidence)
  const ocrPhone = normalizePhone(ocrData.telefono)
  if (ocrPhone) {
    for (const order of eligibleOrders) {
      const orderPhone = normalizePhone(order.contactPhone)
      if (orderPhone && ocrPhone === orderPhone) {
        return buildMatchResult(order, CONFIDENCE_BY_CRITERION.phone, 'phone')
      }
    }
  }

  // Priority 2: Name match
  const ocrName = normalizeNameForComparison(ocrData.destinatario)
  if (ocrName) {
    for (const order of eligibleOrders) {
      const orderName = normalizeNameForComparison(order.contactName)
      if (orderName && namesMatch(ocrName, orderName)) {
        return buildMatchResult(order, CONFIDENCE_BY_CRITERION.name, 'name')
      }
    }
  }

  // Priority 3: City match (only useful if a single order is in that city)
  const ocrCity = normalizeNameForComparison(ocrData.ciudad)
  if (ocrCity) {
    const cityMatches = eligibleOrders.filter((order) => {
      const orderCity = normalizeNameForComparison(order.shippingCity)
      return orderCity && ocrCity === orderCity
    })
    // Only return city match if exactly one order matches (ambiguous otherwise)
    if (cityMatches.length === 1) {
      return buildMatchResult(cityMatches[0], CONFIDENCE_BY_CRITERION.city, 'city')
    }
  }

  // Priority 4: Address match (lowest confidence, most error-prone)
  const ocrAddress = normalizeAddress(ocrData.direccion)
  if (ocrAddress) {
    for (const order of eligibleOrders) {
      const orderAddress = normalizeAddress(order.shippingAddress)
      if (orderAddress && addressesSimilar(ocrAddress, orderAddress)) {
        return buildMatchResult(order, CONFIDENCE_BY_CRITERION.address, 'address')
      }
    }
  }

  return null
}

/**
 * Check if two normalized names match.
 * Uses substring containment for partial matches:
 * "MARIA LOPEZ" matches "MARIA ISABEL LOPEZ GARCIA"
 */
function namesMatch(a: string, b: string): boolean {
  // Exact match
  if (a === b) return true

  // One contains the other (handles middle names, abbreviations)
  if (a.includes(b) || b.includes(a)) return true

  // Check if all words of the shorter name appear in the longer name
  const wordsA = a.split(' ')
  const wordsB = b.split(' ')
  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA]

  return shorter.every((word) => longer.some((w) => w === word))
}

/**
 * Check if two normalized addresses are similar enough to be a match.
 * Extracts core numeric components (street number, cross number) and compares.
 */
function addressesSimilar(a: string, b: string): boolean {
  // Extract numeric sequences (street/cross numbers are the most distinctive parts)
  const numbersA = a.match(/\d+/g) || []
  const numbersB = b.match(/\d+/g) || []

  // Must have at least 2 numbers in common (street + cross minimum)
  if (numbersA.length < 2 || numbersB.length < 2) return false

  // Check if the first 2-3 numbers match (street number, cross number, optional house number)
  const compareCount = Math.min(3, numbersA.length, numbersB.length)
  let matches = 0
  for (let i = 0; i < compareCount; i++) {
    if (numbersA[i] === numbersB[i]) matches++
  }

  return matches >= 2
}

/** Build a MatchResult from an order and match metadata */
function buildMatchResult(
  order: OrderForMatching,
  confidence: number,
  matchedBy: MatchResult['matchedBy']
): MatchResult {
  return {
    orderId: order.id,
    orderName: order.name,
    contactId: order.contactId,
    contactName: order.contactName,
    contactPhone: order.contactPhone,
    shippingCity: order.shippingCity,
    confidence,
    matchedBy,
  }
}
