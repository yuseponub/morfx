/**
 * Custom operators for json-rules-engine.
 *
 * All temporal operators honor timezone America/Bogota (Regla 2).
 * Pattern source: RESEARCH.md §Code Examples lines 720-790 (verified live).
 *
 * Registered operators (5):
 *   - daysSinceAtMost(factValue: ISO string, jsonValue: number) → boolean
 *   - daysSinceAtLeast(factValue: ISO string, jsonValue: number) → boolean
 *   - tagMatchesPattern(factValue: string[], jsonValue: regex source) → boolean
 *   - arrayContainsAny(factValue: string[], jsonValue: string[]) → boolean
 *   - arrayContainsAll(factValue: string[], jsonValue: string[]) → boolean
 *
 * Usage: invoked once per Engine factory (Pitfall 7 — one Engine per request).
 *   const engine = new Engine([], { allowUndefinedFacts: true })
 *   registerOperators(engine)
 */

import type { Engine } from 'json-rules-engine'

const BOGOTA = 'America/Bogota'

/**
 * Returns the current Date interpreted in Bogota timezone.
 * Required because raw `new Date()` is UTC and silent miscount happens across midnight Bogota.
 */
function nowInBogota(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: BOGOTA }))
}

export function registerOperators(engine: Engine): void {
  // daysSinceAtMost — true if the timestamp is at most jsonValue days ago (Bogota tz)
  engine.addOperator(
    'daysSinceAtMost',
    (factValue: string | null | undefined, jsonValue: number) => {
      if (factValue === null || factValue === undefined) return false
      if (typeof factValue !== 'string') return false
      const ts = new Date(factValue)
      if (Number.isNaN(ts.getTime())) return false
      const diffDays = Math.floor((nowInBogota().getTime() - ts.getTime()) / 86_400_000)
      return diffDays <= jsonValue
    },
  )

  // daysSinceAtLeast — true if the timestamp is at least jsonValue days ago (Bogota tz)
  engine.addOperator(
    'daysSinceAtLeast',
    (factValue: string | null | undefined, jsonValue: number) => {
      if (factValue === null || factValue === undefined) return false
      if (typeof factValue !== 'string') return false
      const ts = new Date(factValue)
      if (Number.isNaN(ts.getTime())) return false
      const diffDays = Math.floor((nowInBogota().getTime() - ts.getTime()) / 86_400_000)
      return diffDays >= jsonValue
    },
  )

  // tagMatchesPattern — fact is string[], jsonValue is regex source string
  engine.addOperator(
    'tagMatchesPattern',
    (factValue: string[], jsonValue: string) => {
      if (!Array.isArray(factValue)) return false
      let re: RegExp
      try {
        re = new RegExp(jsonValue)
      } catch {
        return false // invalid regex source — treat as no match (admin form should validate)
      }
      return factValue.some((t) => typeof t === 'string' && re.test(t))
    },
  )

  // arrayContainsAny — OR-semantics
  engine.addOperator(
    'arrayContainsAny',
    (factValue: string[], jsonValue: string[]) => {
      if (!Array.isArray(factValue) || !Array.isArray(jsonValue)) return false
      return factValue.some((v) => jsonValue.includes(v))
    },
  )

  // arrayContainsAll — AND-semantics
  engine.addOperator(
    'arrayContainsAll',
    (factValue: string[], jsonValue: string[]) => {
      if (!Array.isArray(factValue) || !Array.isArray(jsonValue)) return false
      return jsonValue.every((v) => factValue.includes(v))
    },
  )
}
