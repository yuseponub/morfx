// ============================================================================
// Domain Layer -- Carrier Coverage
// City validation against carrier coverage tables.
// Uses createAdminClient (bypass RLS, workspace isolation not needed for reference data).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeText, mapDepartmentToAbbrev } from '@/lib/logistics/constants'
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
    const { data: coverageRows, error } = await supabase
      .from('carrier_coverage')
      .select('city_name, department_abbrev, city_coordinadora, supports_cod')
      .eq('carrier', carrier)
      .eq('is_active', true)

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
