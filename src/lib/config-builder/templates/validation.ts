// ============================================================================
// Standalone: whatsapp-template-ai-builder — Plan 03
// Pure-function validators y helpers para TemplateDraft.
//
// Compartidos entre:
//   - el tool `validateTemplateDraft` (tools.ts)
//   - futuras refactorizaciones del manual form (template-form.tsx)
//
// Reglas (D-05, D-06, D-09 + limites Meta):
//   - name: /^[a-z0-9_]+$/, <= 512 chars
//   - language: es | es_CO | en_US
//   - category: MARKETING | UTILITY | AUTHENTICATION
//   - header TEXT: <= 60 chars, maximo 1 variable
//   - header IMAGE: requiere storagePath subido
//   - body: 1..1024 chars, variables secuenciales desde {{1}}
//   - footer: <= 60 chars, sin variables
//   - variableMapping: cobertura de cada {{N}} del body
//   - bodyExamples: cobertura de cada {{N}} (requerido por Meta)
// ============================================================================

import type { TemplateDraft, TemplateLanguage } from './types'

const SUPPORTED_LANGUAGES: TemplateLanguage[] = ['es', 'es_CO', 'en_US']
const NAME_REGEX = /^[a-z0-9_]+$/
const MAX_NAME = 512
const MAX_HEADER_TEXT = 60
const MAX_BODY = 1024
const MAX_FOOTER = 60

/**
 * Normaliza un nombre libre a la sintaxis que Meta acepta:
 *   - minusculas
 *   - espacios y simbolos -> `_`
 *   - colapsar `_` repetidos
 *   - trim de `_` al inicio/final
 *
 * Ejemplos:
 *   sanitizeName('Hola Mundo!!')      -> 'hola_mundo'
 *   sanitizeName('  Confirm Order 1') -> 'confirm_order_1'
 *   sanitizeName('ya-valido_123')     -> 'ya_valido_123'
 */
export function sanitizeName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * Extrae los indices unicos de variables `{{N}}` en un texto, ordenados asc.
 * Ejemplo: 'Hola {{2}}, tu pedido {{1}} llega manana' -> [1, 2]
 */
export function extractVarIndices(text: string): number[] {
  const matches = text.match(/\{\{(\d+)\}\}/g) || []
  return [...new Set(matches.map((m) => Number(m.replace(/[{}]/g, ''))))].sort(
    (a, b) => a - b,
  )
}

export interface ValidateDraftResult {
  ok: boolean
  errors: string[]
}

/**
 * Valida un TemplateDraft contra las reglas de Meta y las reglas del scope.
 * No arroja; siempre retorna `{ ok, errors }`.
 */
export function validateDraft(draft: TemplateDraft): ValidateDraftResult {
  const errors: string[] = []

  // --- Name ---
  if (!draft.name.trim()) {
    errors.push('El nombre es requerido')
  } else if (!NAME_REGEX.test(draft.name)) {
    errors.push('El nombre solo puede contener minusculas, numeros y guiones bajos')
  } else if (draft.name.length > MAX_NAME) {
    errors.push(`El nombre supera el maximo de ${MAX_NAME} caracteres`)
  }

  // --- Language ---
  if (!SUPPORTED_LANGUAGES.includes(draft.language)) {
    errors.push(`Idioma no soportado: ${draft.language}. Usa es, es_CO, o en_US`)
  }

  // --- Category ---
  if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(draft.category)) {
    errors.push(`Categoria invalida: ${draft.category}`)
  }

  // --- Header (opcional) ---
  if (draft.headerFormat === 'TEXT') {
    if (!draft.headerText.trim()) {
      errors.push('Header TEXT requiere texto')
    } else if (draft.headerText.length > MAX_HEADER_TEXT) {
      errors.push(`Header supera ${MAX_HEADER_TEXT} caracteres`)
    }
    const hVars = extractVarIndices(draft.headerText)
    if (hVars.length > 1) {
      errors.push('Header TEXT solo admite 1 variable')
    }
  }
  if (draft.headerFormat === 'IMAGE' && !draft.headerImageStoragePath) {
    errors.push('Header IMAGE requiere una imagen subida')
  }

  // --- Body (obligatorio) ---
  if (!draft.bodyText.trim()) {
    errors.push('El cuerpo (body) es obligatorio')
  } else if (draft.bodyText.length > MAX_BODY) {
    errors.push(`Body supera ${MAX_BODY} caracteres`)
  }
  const bodyVars = extractVarIndices(draft.bodyText)
  // Sequential check: deben empezar en {{1}} y ser contiguos
  for (let i = 0; i < bodyVars.length; i++) {
    if (bodyVars[i] !== i + 1) {
      errors.push('Las variables deben ser secuenciales desde {{1}} sin saltos')
      break
    }
  }

  // --- Footer (opcional) ---
  if (draft.footerText && draft.footerText.length > MAX_FOOTER) {
    errors.push(`Footer supera ${MAX_FOOTER} caracteres`)
  }

  // --- Variable mapping coverage ---
  for (const idx of bodyVars) {
    if (!draft.variableMapping[String(idx)]) {
      errors.push(`Falta mapping para variable {{${idx}}}`)
    }
  }

  // --- Body examples coverage (requerido por Meta) ---
  for (const idx of bodyVars) {
    if (!draft.bodyExamples[String(idx)]) {
      errors.push(
        `Falta ejemplo para variable {{${idx}}} en body_text (requerido por Meta)`,
      )
    }
  }

  return { ok: errors.length === 0, errors }
}
