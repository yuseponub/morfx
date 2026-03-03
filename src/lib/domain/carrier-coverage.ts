// ============================================================================
// Domain Layer -- Carrier Coverage
// City validation against carrier coverage tables.
// Uses createAdminClient (bypass RLS, workspace isolation not needed for reference data).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeText, mapDepartmentToAbbrev } from '@/lib/logistics/constants'
import Anthropic from '@anthropic-ai/sdk'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Param Types
// ============================================================================

export interface ValidateCityParams {
  city: string
  department: string
  carrier?: string // defaults to 'coordinadora'
}

export interface ValidateCitiesParams {
  cities: Array<{ city: string; department: string; orderId?: string }>
  carrier?: string // defaults to 'coordinadora'
}

// ============================================================================
// Result Types
// ============================================================================

export interface ValidateCityResult {
  isValid: boolean
  /** Exact Coordinadora format: "MEDELLIN (ANT)" */
  coordinadoraCity: string | null
  supportsCod: boolean
}

export interface CityValidationItem {
  city: string
  department: string
  orderId?: string
  isValid: boolean
  coordinadoraCity: string | null
  supportsCod: boolean
  departmentAbbrev: string | null
}

export interface CoverageStats {
  totalCities: number
  codCities: number
  activeCities: number
}

export interface AIResolvedCity {
  orderId: string
  originalCity: string
  resolvedCityName: string        // normalizado (e.g. "CHIGORODO")
  coordinadoraCity: string         // formato Coordinadora (e.g. "CHIGORODO (ANT)")
  departmentAbbrev: string
  supportsCod: boolean
  reason: string                   // explicacion del problema detectado
}

export interface ResolveCitiesWithAIResult {
  resolved: AIResolvedCity[]
  stillInvalid: CityValidationItem[]
}

// ============================================================================
// validateCity -- single city validation
// ============================================================================

/**
 * Validate a single city against the carrier coverage table.
 * Returns whether the city is covered and whether COD is available.
 */
export async function validateCity(
  ctx: DomainContext,
  params: ValidateCityParams
): Promise<DomainResult<ValidateCityResult>> {
  const supabase = createAdminClient()
  const carrier = params.carrier || 'coordinadora'

  try {
    const normalizedCity = normalizeText(params.city)
    const deptAbbrev = mapDepartmentToAbbrev(params.department)

    if (!deptAbbrev) {
      return {
        success: true,
        data: {
          isValid: false,
          coordinadoraCity: null,
          supportsCod: false,
        },
      }
    }

    const { data, error } = await supabase
      .from('carrier_coverage')
      .select('city_coordinadora, supports_cod')
      .eq('carrier', carrier)
      .eq('city_name', normalizedCity)
      .eq('department_abbrev', deptAbbrev)
      .eq('is_active', true)
      .single()

    if (error) {
      // PGRST116 = no rows found -- city not in coverage
      if (error.code === 'PGRST116') {
        return {
          success: true,
          data: {
            isValid: false,
            coordinadoraCity: null,
            supportsCod: false,
          },
        }
      }
      return { success: false, error: `Error validando ciudad: ${error.message}` }
    }

    return {
      success: true,
      data: {
        isValid: true,
        coordinadoraCity: data.city_coordinadora,
        supportsCod: data.supports_cod ?? false,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// validateCities -- batch validation (single DB call)
// ============================================================================

/**
 * Validate multiple cities against the carrier coverage table in a single DB call.
 * Uses a Map lookup to avoid N+1 queries.
 */
export async function validateCities(
  ctx: DomainContext,
  params: ValidateCitiesParams
): Promise<DomainResult<{ results: CityValidationItem[]; validCount: number; invalidCount: number }>> {
  const supabase = createAdminClient()
  const carrier = params.carrier || 'coordinadora'

  try {
    // Fetch ALL active coverage entries for this carrier in a single query
    // NOTE: Supabase default limit is 1000 rows. Coverage has ~1489 cities,
    // so we MUST set an explicit limit to avoid silently dropping cities.
    const { data: coverageRows, error } = await supabase
      .from('carrier_coverage')
      .select('city_name, department_abbrev, city_coordinadora, supports_cod')
      .eq('carrier', carrier)
      .eq('is_active', true)
      .limit(5000)

    if (error) {
      return { success: false, error: `Error cargando cobertura: ${error.message}` }
    }

    // Build lookup Map: "CITY_NAME|DEPT_ABBREV" -> coverage row
    const coverageMap = new Map<string, { city_coordinadora: string; supports_cod: boolean }>()
    for (const row of coverageRows || []) {
      const key = `${row.city_name}|${row.department_abbrev}`
      coverageMap.set(key, {
        city_coordinadora: row.city_coordinadora,
        supports_cod: row.supports_cod ?? false,
      })
    }

    let validCount = 0
    let invalidCount = 0

    const results: CityValidationItem[] = params.cities.map((input) => {
      const normalizedCity = normalizeText(input.city)
      const deptAbbrev = mapDepartmentToAbbrev(input.department)

      if (!deptAbbrev) {
        invalidCount++
        return {
          city: input.city,
          department: input.department,
          orderId: input.orderId,
          isValid: false,
          coordinadoraCity: null,
          supportsCod: false,
          departmentAbbrev: null,
        }
      }

      const key = `${normalizedCity}|${deptAbbrev}`
      const match = coverageMap.get(key)

      if (!match) {
        invalidCount++
        return {
          city: input.city,
          department: input.department,
          orderId: input.orderId,
          isValid: false,
          coordinadoraCity: null,
          supportsCod: false,
          departmentAbbrev: deptAbbrev,
        }
      }

      validCount++
      return {
        city: input.city,
        department: input.department,
        orderId: input.orderId,
        isValid: true,
        coordinadoraCity: match.city_coordinadora,
        supportsCod: match.supports_cod,
        departmentAbbrev: deptAbbrev,
      }
    })

    return {
      success: true,
      data: { results, validCount, invalidCount },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// resolveCitiesWithAI -- fuzzy city matching via Claude AI
// ============================================================================

/**
 * Attempt to resolve invalid cities using Claude AI before rejecting them.
 * Groups invalids by department, fetches coverage cities for each dept,
 * asks Claude to fuzzy-match, and validates Claude's answers against the DB.
 *
 * Fallback: if Claude API fails or returns garbage, all invalids stay invalid
 * (same behavior as before this feature existed).
 */
export async function resolveCitiesWithAI(
  _ctx: DomainContext,
  invalidItems: CityValidationItem[],
  carrier?: string
): Promise<ResolveCitiesWithAIResult> {
  // Only attempt resolution for items that have a valid departmentAbbrev
  // (if dept itself is unrecognized, Claude can't help)
  const resolvable = invalidItems.filter(i => i.departmentAbbrev !== null)
  const unresolvable = invalidItems.filter(i => i.departmentAbbrev === null)

  if (resolvable.length === 0) {
    return { resolved: [], stillInvalid: invalidItems }
  }

  try {
    const supabase = createAdminClient()
    const carrierName = carrier || 'coordinadora'

    // Group resolvable items by department abbreviation
    const byDept = new Map<string, CityValidationItem[]>()
    for (const item of resolvable) {
      const dept = item.departmentAbbrev!
      const list = byDept.get(dept) || []
      list.push(item)
      byDept.set(dept, list)
    }

    // For each department, fetch its coverage cities
    const deptCoverageMap = new Map<string, Array<{ city_name: string; city_coordinadora: string; supports_cod: boolean }>>()
    for (const dept of byDept.keys()) {
      const { data: rows, error } = await supabase
        .from('carrier_coverage')
        .select('city_name, city_coordinadora, supports_cod')
        .eq('carrier', carrierName)
        .eq('department_abbrev', dept)
        .eq('is_active', true)
        .limit(5000)

      if (error || !rows) continue
      deptCoverageMap.set(dept, rows)
    }

    // Build a single prompt with all departments
    const promptParts: string[] = []
    for (const [dept, items] of byDept.entries()) {
      const coverageCities = deptCoverageMap.get(dept)
      if (!coverageCities || coverageCities.length === 0) continue

      const cityNames = coverageCities.map(c => c.city_name)
      const citiesToResolve = items.map(i => ({
        orderId: i.orderId,
        rawCity: i.city,
      }))

      promptParts.push(
        `Departamento: ${dept}\n` +
        `Ciudades en cobertura: ${JSON.stringify(cityNames)}\n` +
        `Ciudades a resolver: ${JSON.stringify(citiesToResolve)}`
      )
    }

    if (promptParts.length === 0) {
      return { resolved: [], stillInvalid: invalidItems }
    }

    const prompt = `Eres un asistente de resolucion de ciudades colombianas para el sistema de envios de Coordinadora.

Te doy ciudades que NO hicieron match exacto contra la base de datos de cobertura.
Tu trabajo es intentar encontrar la ciudad correcta en la lista de cobertura.

Casos comunes que debes manejar:
- Departamento concatenado en el nombre de ciudad: "Chigorodo Antioquia" -> buscar "CHIGORODO"
- Nombre parcial o incompleto: "Ariguani" -> buscar "SAN JOSE DE ARIGUANI" o similar
- Errores ortograficos menores: "Sanata Marta" -> "SANTA MARTA"
- Abreviaturas: "Bga" -> "BUCARAMANGA"

REGLAS ESTRICTAS:
1. SOLO puedes matchear contra las ciudades de la lista de cobertura del departamento correspondiente
2. Si no hay match logico, devuelve null — NUNCA inventes un nombre de ciudad
3. El matchedCityName DEBE ser EXACTAMENTE igual a uno de los nombres en la lista de cobertura
4. Cada resultado debe tener orderId, matchedCityName, y reason

El campo "reason" debe explicar en espanol claro y corto QUE problema tenia el dato original. Ejemplos:
- "El departamento estaba pegado al nombre de la ciudad"
- "El nombre estaba incompleto, faltaba 'San Jose de'"
- "Error de ortografia: faltaba una letra"
- "Nombre abreviado"
Si matchedCityName es null, reason debe explicar por que no se pudo resolver.

${promptParts.join('\n\n')}

Responde UNICAMENTE con un JSON array valido. Ejemplo:
[{"orderId": "abc123", "matchedCityName": "CHIGORODO", "reason": "El departamento estaba pegado al nombre de la ciudad"}, {"orderId": "def456", "matchedCityName": null, "reason": "No se encontro ninguna ciudad similar"}]

IMPORTANTE: Responde SOLO con el JSON array. Sin explicaciones, sin markdown.`

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    // Extract text
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    // Parse JSON (with regex fallback for markdown fences)
    let parsed: Array<{ orderId: string; matchedCityName: string | null; reason?: string }>
    try {
      parsed = JSON.parse(text)
    } catch {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        console.warn('[carrier-coverage] AI response was not valid JSON:', text.slice(0, 300))
        return { resolved: [], stillInvalid: invalidItems }
      }
      parsed = JSON.parse(jsonMatch[0])
    }

    if (!Array.isArray(parsed)) {
      return { resolved: [], stillInvalid: invalidItems }
    }

    // Build a lookup of all coverage by dept+city_name for anti-hallucination validation
    const coverageLookup = new Map<string, { city_coordinadora: string; supports_cod: boolean }>()
    for (const [dept, cities] of deptCoverageMap.entries()) {
      for (const c of cities) {
        coverageLookup.set(`${c.city_name}|${dept}`, {
          city_coordinadora: c.city_coordinadora,
          supports_cod: c.supports_cod ?? false,
        })
      }
    }

    const resolved: AIResolvedCity[] = []
    const resolvedOrderIds = new Set<string>()

    for (const match of parsed) {
      if (!match.orderId || !match.matchedCityName) continue

      const item = resolvable.find(i => i.orderId === match.orderId)
      if (!item) continue

      // Anti-hallucination: verify matchedCityName actually exists in coverage
      const key = `${match.matchedCityName}|${item.departmentAbbrev}`
      const coverage = coverageLookup.get(key)
      if (!coverage) {
        console.warn(`[carrier-coverage] AI hallucination rejected: "${match.matchedCityName}" not in ${item.departmentAbbrev} coverage`)
        continue
      }

      resolved.push({
        orderId: match.orderId,
        originalCity: item.city,
        resolvedCityName: match.matchedCityName,
        coordinadoraCity: coverage.city_coordinadora,
        departmentAbbrev: item.departmentAbbrev!,
        supportsCod: coverage.supports_cod,
        reason: match.reason || 'Ciudad corregida por IA',
      })
      resolvedOrderIds.add(match.orderId)
    }

    // Items that weren't resolved stay invalid
    const stillInvalid = [
      ...unresolvable,
      ...resolvable.filter(i => !resolvedOrderIds.has(i.orderId || '')),
    ]

    console.log(`[carrier-coverage] AI resolved ${resolved.length}/${resolvable.length} cities`)
    return { resolved, stillInvalid }
  } catch (err) {
    // Claude API failure = graceful fallback — all invalids stay invalid
    console.error('[carrier-coverage] resolveCitiesWithAI error:', err)
    return { resolved: [], stillInvalid: invalidItems }
  }
}

// ============================================================================
// getCoverageStats -- summary statistics
// ============================================================================

/**
 * Get coverage statistics for a carrier.
 */
export async function getCoverageStats(
  ctx: DomainContext,
  carrier?: string
): Promise<DomainResult<CoverageStats>> {
  const supabase = createAdminClient()
  const carrierName = carrier || 'coordinadora'

  try {
    // Total cities for this carrier
    const { count: totalCities, error: totalError } = await supabase
      .from('carrier_coverage')
      .select('*', { count: 'exact', head: true })
      .eq('carrier', carrierName)

    if (totalError) {
      return { success: false, error: `Error contando ciudades: ${totalError.message}` }
    }

    // Cities with COD support
    const { count: codCities, error: codError } = await supabase
      .from('carrier_coverage')
      .select('*', { count: 'exact', head: true })
      .eq('carrier', carrierName)
      .eq('supports_cod', true)

    if (codError) {
      return { success: false, error: `Error contando ciudades COD: ${codError.message}` }
    }

    // Active cities
    const { count: activeCities, error: activeError } = await supabase
      .from('carrier_coverage')
      .select('*', { count: 'exact', head: true })
      .eq('carrier', carrierName)
      .eq('is_active', true)

    if (activeError) {
      return { success: false, error: `Error contando ciudades activas: ${activeError.message}` }
    }

    return {
      success: true,
      data: {
        totalCities: totalCities ?? 0,
        codCities: codCities ?? 0,
        activeCities: activeCities ?? 0,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
