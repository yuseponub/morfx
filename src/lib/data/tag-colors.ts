/**
 * Predefined color palette for tags
 * Each color includes a contrasting text color for accessibility
 */

export interface TagColor {
  name: string
  value: string // Hex color for background
  textColor: string // Hex color for text (contrast-safe)
}

/**
 * 10 predefined tag colors with Spanish names
 * Colors are selected for visual distinction and accessibility
 */
export const TAG_COLORS: TagColor[] = [
  { name: 'Rojo', value: '#ef4444', textColor: '#ffffff' },
  { name: 'Naranja', value: '#f97316', textColor: '#ffffff' },
  { name: 'Amarillo', value: '#eab308', textColor: '#1f2937' },
  { name: 'Verde', value: '#22c55e', textColor: '#ffffff' },
  { name: 'Azul', value: '#3b82f6', textColor: '#ffffff' },
  { name: 'Indigo', value: '#6366f1', textColor: '#ffffff' },
  { name: 'Violeta', value: '#8b5cf6', textColor: '#ffffff' },
  { name: 'Rosa', value: '#ec4899', textColor: '#ffffff' },
  { name: 'Gris', value: '#6b7280', textColor: '#ffffff' },
  { name: 'Cian', value: '#06b6d4', textColor: '#1f2937' },
]

/**
 * Default tag color (Indigo)
 */
export const DEFAULT_TAG_COLOR = '#6366f1'

/**
 * Calculate contrast color (black or white) for a given hex background color
 * Uses relative luminance formula from WCAG 2.0
 *
 * @param hexColor - Hex color string (with or without #)
 * @returns '#ffffff' for dark backgrounds, '#1f2937' for light backgrounds
 */
export function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '')

  // Parse RGB values
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  // Calculate relative luminance using sRGB coefficients
  // Formula: L = 0.2126 * R + 0.7152 * G + 0.0722 * B
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

  // Return dark text for light backgrounds, white for dark
  // Using 0.5 as threshold (could be tuned for different contrast needs)
  return luminance > 0.5 ? '#1f2937' : '#ffffff'
}

/**
 * Get a TagColor object by hex value, or create one for custom colors
 *
 * @param hexValue - Hex color value
 * @returns TagColor object with appropriate text color
 */
export function getTagColorByValue(hexValue: string): TagColor {
  // Check if it's a predefined color
  const predefined = TAG_COLORS.find(
    (c) => c.value.toLowerCase() === hexValue.toLowerCase()
  )
  if (predefined) {
    return predefined
  }

  // Create custom color with calculated contrast
  return {
    name: 'Personalizado',
    value: hexValue,
    textColor: getContrastColor(hexValue),
  }
}
