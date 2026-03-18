/**
 * Somnio Sales Agent v3 -- Delivery Zone Lookup
 *
 * Looks up the delivery zone for a municipality and returns
 * a formatted delivery time string. Same-day cutoff evaluated
 * in America/Bogota timezone.
 *
 * Zones: same_day | next_day | 1_3_days | 2_4_days
 * Default (city not found): 2_4_days
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeCity } from '@/lib/agents/somnio/normalizers'

// ============================================================================
// Types
// ============================================================================

export interface DeliveryZoneResult {
  zone: 'same_day' | 'next_day' | '1_3_days' | '2_4_days'
  cutoffHour: number | null
  cutoffMinutes: number
  carrier: string // 'domiciliario propio' for same_day, 'transportadora' for rest
}

// ============================================================================
// Zone Lookup
// ============================================================================

/**
 * Look up the delivery zone for a municipality.
 *
 * 1. Normalizes city through normalizeCity (handles "bga" -> "Bucaramanga", etc.)
 * 2. Converts to DB format (upper case, no accents)
 * 3. Queries delivery_zones table
 * 4. Falls back to 2_4_days if not found
 */
export async function lookupDeliveryZone(ciudad: string): Promise<DeliveryZoneResult> {
  // 1. Normalize through normalizeCity (handles abbreviations, spelling)
  const normalized = normalizeCity(ciudad)

  // 2. Convert to DB format (upper case, no accents)
  const dbKey = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()

  // 3. Query delivery_zones
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('delivery_zones')
    .select('zone, cutoff_hour, cutoff_minutes')
    .eq('municipality_name_normalized', dbKey)
    .maybeSingle()

  if (data) {
    return {
      zone: data.zone as DeliveryZoneResult['zone'],
      cutoffHour: data.cutoff_hour,
      cutoffMinutes: data.cutoff_minutes ?? 0,
      carrier: data.zone === 'same_day' ? 'domiciliario propio' : 'transportadora',
    }
  }

  // Default: 2_4_days
  return { zone: '2_4_days', cutoffHour: null, cutoffMinutes: 0, carrier: 'transportadora' }
}

// ============================================================================
// Time Formatting
// ============================================================================

/**
 * Format the delivery time as a human-readable string for templates.
 *
 * For same_day zones, evaluates the cutoff time in America/Bogota timezone.
 * Edge cases:
 * - Sunday (any time) -> "el LUNES" (Sunday is not a delivery day)
 * - Saturday after cutoff -> "el LUNES" (tomorrow is Sunday)
 * - Saturday before cutoff -> "HOY mismo"
 * - Friday after cutoff -> "MANANA MISMO" (Saturday IS a delivery day)
 */
export function formatDeliveryTime(zoneResult: DeliveryZoneResult): string {
  switch (zoneResult.zone) {
    case 'same_day':
      return formatSameDayTime(zoneResult.cutoffHour!, zoneResult.cutoffMinutes)
    case 'next_day':
      return 'al dia siguiente de ser despachado'
    case '1_3_days':
      return 'en 1-3 dias habiles'
    case '2_4_days':
      return 'en 2-4 dias habiles'
  }
}

/**
 * Same-day cutoff logic in Colombian timezone.
 *
 * Uses toLocaleString to get current Colombian time,
 * then evaluates against cutoff hour/minutes.
 */
function formatSameDayTime(cutoffHour: number, cutoffMinutes: number): string {
  // Get current Colombian time
  const now = new Date()
  const colombianTimeStr = now.toLocaleString('en-US', { timeZone: 'America/Bogota' })
  const colombianTime = new Date(colombianTimeStr)
  const currentDay = colombianTime.getDay() // 0 = Sunday
  const currentHour = colombianTime.getHours()
  const currentMinutes = colombianTime.getMinutes()

  // Sunday is NOT a delivery day -- always return next business day (Monday)
  if (currentDay === 0) {
    return 'el LUNES'
  }

  const beforeCutoff = currentHour < cutoffHour ||
    (currentHour === cutoffHour && currentMinutes < cutoffMinutes)

  if (beforeCutoff) {
    return 'HOY mismo'
  }

  // After cutoff: check next delivery day
  const tomorrow = new Date(colombianTime)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowDay = tomorrow.getDay() // 0 = Sunday

  if (tomorrowDay === 0) {
    // Saturday after cutoff -> next delivery day is Monday
    return 'el LUNES'
  }
  return 'MAÑANA'
}
