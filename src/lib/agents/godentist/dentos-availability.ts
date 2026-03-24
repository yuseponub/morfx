/**
 * GoDentist — Dentos Availability Lookup
 *
 * Calls the GoDentist robot on Railway to check doctor availability
 * for a specific date and sede. Returns slots grouped by jornada.
 */

const ROBOT_URL = 'https://godentist-production.up.railway.app'
const ROBOT_CREDENTIALS = { username: 'JROMERO', password: '123456' }

/** Map sede internal names to Dentos sucursal names */
const SEDE_TO_SUCURSAL: Record<string, string> = {
  cabecera: 'CABECERA',
  mejoras_publicas: 'MEJORAS PUBLICAS',
  floridablanca: 'FLORIDABLANCA',
  canaveral: 'JUMBO EL BOSQUE',
}

interface AvailabilityResult {
  success: boolean
  slots: { manana: string[]; tarde: string[] }
  error?: string
}

/**
 * Check availability in Dentos for a date + sede.
 * Returns formatted slot strings (without doctor names).
 *
 * @param date - YYYY-MM-DD format
 * @param sede - Internal sede name (cabecera, mejoras_publicas, floridablanca, canaveral)
 */
export async function checkDentosAvailability(
  date: string,
  sede: string,
): Promise<AvailabilityResult> {
  const sucursal = SEDE_TO_SUCURSAL[sede]
  if (!sucursal) {
    console.error(`[dentos-availability] Unknown sede: ${sede}`)
    return { success: false, slots: { manana: [], tarde: [] }, error: `Sede desconocida: ${sede}` }
  }

  try {
    console.log(`[dentos-availability] Checking ${sucursal} for ${date}...`)

    const response = await fetch(`${ROBOT_URL}/api/check-availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120_000), // 2 min timeout (robot scrapes multiple doctors)
      body: JSON.stringify({
        workspaceId: 'godentist-valoraciones',
        credentials: ROBOT_CREDENTIALS,
        date,
        sucursal,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error')
      console.error(`[dentos-availability] Robot returned ${response.status}: ${errText}`)
      return { success: false, slots: { manana: [], tarde: [] }, error: `Robot error: ${response.status}` }
    }

    const data = await response.json() as {
      success: boolean
      slots: { doctor: string; horaInicio: string; horaFin: string; jornada: 'manana' | 'tarde' }[]
      summary: { manana: string[]; tarde: string[] }
      errors?: string[]
    }

    if (!data.success) {
      console.error(`[dentos-availability] Robot returned success=false`)
      return { success: false, slots: { manana: [], tarde: [] }, error: 'Robot scrape failed' }
    }

    // Merge overlapping/adjacent slots into continuous blocks per jornada
    const mananaSlots = data.slots.filter(s => s.jornada === 'manana')
    const tardeSlots = data.slots.filter(s => s.jornada === 'tarde')

    const mergedManana = mergeIntervals(mananaSlots)
    const mergedTarde = mergeIntervals(tardeSlots)

    console.log(`[dentos-availability] Merged: ${mergedManana.length} mañana + ${mergedTarde.length} tarde blocks`)

    return {
      success: true,
      slots: { manana: mergedManana, tarde: mergedTarde },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[dentos-availability] Error: ${msg}`)
    return { success: false, slots: { manana: [], tarde: [] }, error: msg }
  }
}

// ============================================================================
// Interval Merging — consolidate overlapping/adjacent slots into blocks
// ============================================================================

/**
 * Parse "8:00 AM" or "1:30 PM" to minutes since midnight.
 */
function parseTimeToMinutes(time: string): number {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return -1
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const period = match[3].toUpperCase()
  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0
  return hours * 60 + minutes
}

/**
 * Convert minutes since midnight back to "H:MM AM/PM" format.
 */
function minutesToTime(mins: number): string {
  let hours = Math.floor(mins / 60)
  const minutes = mins % 60
  const period = hours >= 12 ? 'PM' : 'AM'
  if (hours > 12) hours -= 12
  if (hours === 0) hours = 12
  return `${hours}:${minutes.toString().padStart(2, '0')} ${period}`
}

/**
 * Merge overlapping/adjacent time intervals into continuous blocks.
 * Returns formatted strings like "8:00 AM - 12:00 PM".
 */
function mergeIntervals(
  slots: { horaInicio: string; horaFin: string }[]
): string[] {
  if (slots.length === 0) return []

  // Convert to [start, end] in minutes
  const intervals = slots
    .map(s => ({
      start: parseTimeToMinutes(s.horaInicio),
      end: parseTimeToMinutes(s.horaFin),
    }))
    .filter(i => i.start >= 0 && i.end >= 0)
    .sort((a, b) => a.start - b.start)

  if (intervals.length === 0) return []

  // Merge overlapping/adjacent intervals
  const merged: { start: number; end: number }[] = [intervals[0]]

  for (let i = 1; i < intervals.length; i++) {
    const current = intervals[i]
    const last = merged[merged.length - 1]

    // Overlap or adjacent (touching) → extend
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push(current)
    }
  }

  // Format back to strings
  return merged.map(m => `${minutesToTime(m.start)} - ${minutesToTime(m.end)}`)
}
