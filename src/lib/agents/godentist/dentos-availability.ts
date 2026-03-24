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

    // Format slots WITHOUT doctor names — just "HH:MM AM - HH:MM PM"
    const manana = data.slots
      .filter(s => s.jornada === 'manana')
      .map(s => `${s.horaInicio} - ${s.horaFin}`)
    const tarde = data.slots
      .filter(s => s.jornada === 'tarde')
      .map(s => `${s.horaInicio} - ${s.horaFin}`)

    // Deduplicate (multiple doctors may have same hours)
    const uniqueManana = [...new Set(manana)]
    const uniqueTarde = [...new Set(tarde)]

    console.log(`[dentos-availability] Found ${uniqueManana.length} mañana + ${uniqueTarde.length} tarde slots`)

    return {
      success: true,
      slots: { manana: uniqueManana, tarde: uniqueTarde },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[dentos-availability] Error: ${msg}`)
    return { success: false, slots: { manana: [], tarde: [] }, error: msg }
  }
}
