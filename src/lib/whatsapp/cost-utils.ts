// WhatsApp pricing per message by category and country
// Based on 360dialog/Meta pricing (as of Jan 2026)
type CostCategory = 'marketing' | 'utility' | 'authentication' | 'service'

const COST_RATES: Record<CostCategory, Record<string, number>> = {
  marketing: { CO: 0.0177, default: 0.02 },     // Colombia, default
  utility: { CO: 0.0064, default: 0.008 },
  authentication: { CO: 0.0064, default: 0.008 },
  service: { CO: 0.0, default: 0.0 }            // Service within 24h is free
}

/**
 * Get cost rate for a message category and country
 */
export function getCostRate(category: CostCategory, countryCode?: string | null): number {
  const rates = COST_RATES[category]
  return rates[countryCode || 'default'] || rates.default
}

/**
 * Estimate cost for sending a message
 * Used in UI to show estimated cost before sending template
 */
export function estimateMessageCost(
  category: CostCategory,
  countryCode?: string | null
): { costUsd: number; costCop: number } {
  const costUsd = getCostRate(category, countryCode)
  // Approximate USD to COP conversion (update periodically)
  const usdToCop = 4200
  const costCop = costUsd * usdToCop

  return { costUsd, costCop }
}
