/**
 * Variable Substitution Utility
 * Phase 14: Agente Ventas Somnio - Plan 03
 *
 * Handles {{variable}} pattern replacement in templates.
 * Includes hardcoded Somnio prices and variable extraction utilities.
 */

import type { PackSelection } from '../types'

// ============================================================================
// Price Constants
// ============================================================================

/**
 * Hardcoded prices for Somnio products.
 * Per CONTEXT.md: configurable prices deferred to post-MVP.
 */
export const SOMNIO_PRICES = {
  '1x': '$77,900',
  '2x': '$109,900',
  '3x': '$139,900',
} as const

export type PackType = keyof typeof SOMNIO_PRICES

// ============================================================================
// Variable Context
// ============================================================================

/**
 * Context for variable substitution.
 * Contains customer data and computed values.
 */
export interface VariableContext {
  // Customer data fields
  nombre?: string
  apellido?: string
  telefono?: string
  direccion?: string
  ciudad?: string
  departamento?: string
  barrio?: string
  correo?: string
  indicaciones_extra?: string

  // Computed/special variables (auto-populated)
  precio?: string
  precio_1x?: string
  precio_2x?: string
  precio_3x?: string

  // Pack selection from session state
  pack?: PackSelection

  // Allow additional arbitrary values
  [key: string]: string | undefined
}

// ============================================================================
// Substitution Functions
// ============================================================================

/**
 * Substitute {{variable}} patterns in a template with context values.
 *
 * Pre-populates price variables automatically.
 * If a variable is not found in context, keeps the original {{variable}}.
 *
 * @param template - Template string with {{variable}} patterns
 * @param context - Variable values for substitution
 * @returns Template with variables substituted
 *
 * @example
 * substituteVariables("Hola {{nombre}}, el precio es {{precio_1x}}", { nombre: "Juan" })
 * // Returns: "Hola Juan, el precio es $77,900"
 */
export function substituteVariables(
  template: string,
  context: VariableContext
): string {
  // Pre-populate price variables
  const fullContext: Record<string, string | undefined> = {
    ...context,
    precio_1x: SOMNIO_PRICES['1x'],
    precio_2x: SOMNIO_PRICES['2x'],
    precio_3x: SOMNIO_PRICES['3x'],
    precio: context.pack ? SOMNIO_PRICES[context.pack] : SOMNIO_PRICES['1x'],
  }

  // Replace all {{variable}} patterns
  return template.replace(/\{\{(\w+)\}\}/g, (match, varName: string) => {
    const value = fullContext[varName]
    return value ?? match // Keep original if not found
  })
}

/**
 * Extract all variable names from a template.
 *
 * @param template - Template string with {{variable}} patterns
 * @returns Array of unique variable names
 *
 * @example
 * extractVariables("Hola {{nombre}}, tu pedido a {{ciudad}}")
 * // Returns: ["nombre", "ciudad"]
 */
export function extractVariables(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)\}\}/g)
  return [...new Set([...matches].map(m => m[1]))]
}

/**
 * Check if a text contains unsubstituted {{variable}} patterns.
 *
 * @param text - Text to check
 * @returns True if contains {{variable}} patterns
 *
 * @example
 * hasUnsubstitutedVariables("Hola {{nombre}}") // true
 * hasUnsubstitutedVariables("Hola Juan") // false
 */
export function hasUnsubstitutedVariables(text: string): boolean {
  return /\{\{\w+\}\}/.test(text)
}

/**
 * Get list of missing variables in a template given a context.
 *
 * @param template - Template string with {{variable}} patterns
 * @param context - Variable context
 * @returns Array of variable names that are not in context
 *
 * @example
 * getMissingVariables("Hola {{nombre}} de {{ciudad}}", { nombre: "Juan" })
 * // Returns: ["ciudad"]
 */
export function getMissingVariables(
  template: string,
  context: VariableContext
): string[] {
  const variables = extractVariables(template)
  const priceVars = ['precio', 'precio_1x', 'precio_2x', 'precio_3x']

  return variables.filter(v => {
    // Price variables are always available
    if (priceVars.includes(v)) return false
    // Check if variable is in context
    return context[v] === undefined || context[v] === ''
  })
}
