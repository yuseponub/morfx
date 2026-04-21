// ============================================================================
// Standalone: whatsapp-template-ai-builder — Plan 03
// Shared types for the Config Builder > WhatsApp Templates flow.
// Imported by tools, system-prompt, validation, route handlers, and UI.
// ============================================================================

/**
 * TemplateBuilderToolContext — pasado a cada tool handler del builder.
 * Contiene la identidad del workspace y el usuario para acceso a datos.
 */
export interface TemplateBuilderToolContext {
  workspaceId: string
  userId: string
}

/**
 * Idiomas soportados por el builder (D-09).
 * `es_CO` se agrega en este standalone ademas de `es` y `en_US`.
 */
export type TemplateLanguage = 'es' | 'es_CO' | 'en_US'

/**
 * Categorias soportadas por Meta (D-08).
 */
export type TemplateCategoryEnum = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

/**
 * Formato del header (D-05).
 * VIDEO y DOCUMENT quedan FUERA de este standalone.
 */
export type TemplateHeaderFormat = 'NONE' | 'TEXT' | 'IMAGE'

/**
 * TemplateDraft — el estado vivo del builder.
 * Consumido por la IA (via params de tools) Y por la UI (via context reducer).
 *
 * Nota: `headerImageStoragePath` es la ruta en Supabase Storage (bucket
 * `whatsapp-media`, prefijo `templates/{workspaceId}/...`) que se envia al
 * domain en `submitTemplate`. `headerImageLocalUrl` es opcional y solo para
 * preview inmediato en la UI antes de que el upload complete.
 */
export interface TemplateDraft {
  name: string
  language: TemplateLanguage
  category: TemplateCategoryEnum
  headerFormat: TemplateHeaderFormat
  headerText: string
  headerImageStoragePath: string | null
  headerImageLocalUrl: string | null
  bodyText: string
  footerText: string
  /** Mapping {{N}} -> ruta catalogo (ej: {"1": "contacto.nombre"}) */
  variableMapping: Record<string, string>
  /** Ejemplos que Meta pide para la revision (ej: {"1": "Juan"}) */
  bodyExamples: Record<string, string>
  headerExamples: Record<string, string>
}

/**
 * Future-proofing: el session-store distingue entre 'automation' y 'template'.
 * Este builder siempre es 'template'.
 */
export type TemplateBuilderKind = 'template'
