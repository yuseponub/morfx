// ============================================================================
// Standalone: whatsapp-template-ai-builder — Plan 03
// AI SDK tools para el Config Builder > WhatsApp Templates.
//
// 6 tools (matching stepCountIs(6) en .claude/rules/agent-scope.md):
//   1. listExistingTemplates  — READ
//   2. suggestCategory        — pure reasoning
//   3. suggestLanguage        — pure reasoning
//   4. captureVariableMapping — validate catalog path
//   5. validateTemplateDraft  — shared validator
//   6. submitTemplate         — MUTATION (delega a domain createTemplate)
//
// INVARIANTE CRITICO (Regla 3 + agent-scope.md):
//   - `submitTemplate` DEBE delegar al domain (unica forma de mutar whatsapp_templates).
//   - Zero inserciones directas a whatsapp_templates en este archivo.
//   - Zero llamadas directas a los helpers de 360 Dialog en este archivo.
//   - Los READ paths (listExistingTemplates, fetch de api key) SI usan createAdminClient
//     porque son no-mutantes — mismo patron que el builder de automatizaciones.
// ============================================================================

import { tool } from 'ai'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTemplate } from '@/lib/domain/whatsapp-templates'
import { validateDraft, sanitizeName } from './validation'
import { VARIABLE_CATALOG } from '@/lib/automations/constants'
import type { TemplateBuilderToolContext, TemplateDraft } from './types'
import type { TemplateComponent } from '@/lib/whatsapp/types'

// ============================================================================
// Shared: indice de rutas validas del catalogo
// ============================================================================

/**
 * Extrae el set unico de rutas validas del VARIABLE_CATALOG
 * (que tiene shape Record<trigger_type, Array<{ path, label }>>).
 */
function getValidCatalogPaths(): Set<string> {
  const set = new Set<string>()
  for (const entries of Object.values(VARIABLE_CATALOG)) {
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      if (entry && typeof entry.path === 'string') set.add(entry.path)
    }
  }
  return set
}

// ============================================================================
// Factory
// ============================================================================

export function createTemplateBuilderTools(ctx: TemplateBuilderToolContext) {
  return {
    // ------------------------------------------------------------------
    // 1. listExistingTemplates — READ only
    // ------------------------------------------------------------------
    listExistingTemplates: tool({
      description:
        'Lista plantillas existentes del workspace. Usar para detectar duplicados por nombre o cooldown de 30 dias tras rejected.',
      inputSchema: z.object({}),
      execute: async (): Promise<
        | {
            success: true
            templates: Array<{
              id: string
              name: string
              category: string
              status: string
              language: string
            }>
          }
        | { error: string }
      > => {
        try {
          const supabase = createAdminClient()
          const { data, error } = await supabase
            .from('whatsapp_templates')
            .select('id, name, category, status, language, created_at')
            .eq('workspace_id', ctx.workspaceId)
            .order('created_at', { ascending: false })
            .limit(50)
          if (error) {
            return { error: `Error consultando templates: ${error.message}` }
          }
          return {
            success: true,
            templates: (data || []) as Array<{
              id: string
              name: string
              category: string
              status: string
              language: string
            }>,
          }
        } catch (err) {
          return {
            error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}`,
          }
        }
      },
    }),

    // ------------------------------------------------------------------
    // 2. suggestCategory — pure reasoning
    // ------------------------------------------------------------------
    suggestCategory: tool({
      description:
        'Sugiere la categoria Meta (MARKETING / UTILITY / AUTHENTICATION) segun el contenido del mensaje. Revisa que UTILITY no incluya lenguaje de venta (Meta reclasifica desde abril 2025).',
      inputSchema: z.object({
        bodyText: z.string(),
        headerText: z.string().optional(),
        footerText: z.string().optional(),
      }),
      execute: async (
        params,
      ): Promise<
        | {
            success: true
            category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
            reason: string
          }
        | { error: string }
      > => {
        const combined = [
          params.bodyText,
          params.headerText || '',
          params.footerText || '',
        ]
          .join(' ')
          .toLowerCase()
        const otpHints =
          /\b(codigo|otp|verifica|pin)\b/.test(combined) &&
          /\{\{\d+\}\}/.test(combined)
        const marketingHints =
          /\b(oferta|descuento|promo|gratis|compra ya|ultimas horas|-\d+%)\b/.test(
            combined,
          )
        let category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' = 'UTILITY'
        let reason = 'Transaccional/informativa por defecto'
        if (otpHints) {
          category = 'AUTHENTICATION'
          reason = 'Detectado codigo/OTP con variable numerica'
        } else if (marketingHints) {
          category = 'MARKETING'
          reason = 'Detectado lenguaje promocional (oferta/descuento/gratis)'
        }
        return { success: true, category, reason }
      },
    }),

    // ------------------------------------------------------------------
    // 3. suggestLanguage — pure reasoning
    // ------------------------------------------------------------------
    suggestLanguage: tool({
      description:
        'Sugiere el idioma (es / es_CO / en_US) segun el contenido. es_CO si detecta colombianismos.',
      inputSchema: z.object({
        bodyText: z.string(),
        headerText: z.string().optional(),
      }),
      execute: async (
        params,
      ): Promise<
        | { success: true; language: 'es' | 'es_CO' | 'en_US'; reason: string }
        | { error: string }
      > => {
        const combined = [params.bodyText, params.headerText || '']
          .join(' ')
          .toLowerCase()
        const englishHints = /\b(the|and|your|order|hello|please)\b/.test(combined)
        const coHints =
          /\b(parcero|chevere|bacano|a la orden|quiubo|papi|mijo|mija)\b/.test(
            combined,
          )
        let language: 'es' | 'es_CO' | 'en_US' = 'es'
        let reason = 'Espanol generico'
        if (englishHints && !coHints) {
          language = 'en_US'
          reason = 'Detectadas palabras en ingles'
        } else if (coHints) {
          language = 'es_CO'
          reason = 'Detectados colombianismos'
        }
        return { success: true, language, reason }
      },
    }),

    // ------------------------------------------------------------------
    // 4. captureVariableMapping — valida ruta del catalogo
    // ------------------------------------------------------------------
    captureVariableMapping: tool({
      description:
        'Captura el mapping de una variable {{N}} a una ruta del catalogo (contacto.nombre, orden.numero, etc.). Valida que la ruta exista en VARIABLE_CATALOG.',
      inputSchema: z.object({
        varIndex: z.number().int().min(1),
        path: z.string().min(1),
      }),
      execute: async (
        params,
      ): Promise<
        { success: true; varIndex: number; path: string } | { error: string }
      > => {
        const validPaths = getValidCatalogPaths()
        if (!validPaths.has(params.path)) {
          const suggestions = Array.from(validPaths).slice(0, 10).join(', ')
          return {
            error: `Ruta "${params.path}" no existe en el catalogo. Usa una de: ${suggestions}... (ver catalogo completo en system prompt).`,
          }
        }
        return { success: true, varIndex: params.varIndex, path: params.path }
      },
    }),

    // ------------------------------------------------------------------
    // 5. validateTemplateDraft — validador compartido
    // ------------------------------------------------------------------
    validateTemplateDraft: tool({
      description:
        'Valida el draft completo contra las reglas de Meta (char limits, variables secuenciales, nombre). Llamar ANTES de submitTemplate.',
      inputSchema: z.object({
        draft: z.object({
          name: z.string(),
          language: z.enum(['es', 'es_CO', 'en_US']),
          category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
          headerFormat: z.enum(['NONE', 'TEXT', 'IMAGE']),
          headerText: z.string(),
          headerImageStoragePath: z.string().nullable(),
          headerImageLocalUrl: z.string().nullable(),
          bodyText: z.string(),
          footerText: z.string(),
          variableMapping: z.record(z.string(), z.string()),
          bodyExamples: z.record(z.string(), z.string()),
          headerExamples: z.record(z.string(), z.string()),
        }),
      }),
      execute: async (
        params,
      ): Promise<{ success: true } | { error: string; errors: string[] }> => {
        const result = validateDraft(params.draft as TemplateDraft)
        if (result.ok) return { success: true }
        return { error: 'Validacion fallo', errors: result.errors }
      },
    }),

    // ------------------------------------------------------------------
    // 6. submitTemplate — LA mutacion. Solo tras confirmacion del usuario.
    // ------------------------------------------------------------------
    submitTemplate: tool({
      description:
        'Crea el template y lo envia a 360 Dialog para revision de Meta. SOLO llamar cuando el usuario haya confirmado explicitamente el preview.',
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(512)
          .regex(/^[a-z0-9_]+$/, 'Solo minusculas, numeros y guiones bajos'),
        language: z.enum(['es', 'es_CO', 'en_US']),
        category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
        header: z
          .discriminatedUnion('format', [
            z.object({ format: z.literal('NONE') }),
            z.object({
              format: z.literal('TEXT'),
              text: z.string().min(1).max(60),
              exampleValue: z.string().optional(),
            }),
            z.object({
              format: z.literal('IMAGE'),
              storagePath: z.string().min(1),
              mimeType: z.enum(['image/jpeg', 'image/png']),
            }),
          ])
          .optional(),
        body: z.object({
          text: z.string().min(1).max(1024),
          exampleValues: z.record(z.string(), z.string()).default({}),
        }),
        footer: z.object({ text: z.string().min(1).max(60) }).optional(),
        variableMapping: z.record(z.string(), z.string()).default({}),
      }),
      execute: async (
        params,
      ): Promise<
        { success: true; templateId: string } | { success: false; error: string }
      > => {
        // Fetch workspace API key (READ, no MUTATION — permitido)
        const supabase = createAdminClient()
        const { data: ws } = await supabase
          .from('workspaces')
          .select('settings')
          .eq('id', ctx.workspaceId)
          .single()

        const apiKey =
          (ws?.settings as { whatsapp_api_key?: string } | undefined)
            ?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
        if (!apiKey) {
          return {
            success: false,
            error: 'API key de WhatsApp no configurada para este workspace',
          }
        }

        // Construir components a partir de los params estructurados
        const components: TemplateComponent[] = []

        if (params.header && params.header.format !== 'NONE') {
          if (params.header.format === 'TEXT') {
            const vars = [
              ...new Set(
                (params.header.text.match(/\{\{(\d+)\}\}/g) || []).map((v) =>
                  v.replace(/[{}]/g, ''),
                ),
              ),
            ]
            const h: TemplateComponent = {
              type: 'HEADER',
              format: 'TEXT',
              text: params.header.text,
            }
            if (vars.length > 0) {
              const exampleValue = params.header.exampleValue
              h.example = {
                header_text: vars.map((n) => exampleValue || `ejemplo_${n}`),
              }
            }
            components.push(h)
          } else {
            // IMAGE — placeholder; el header_handle lo patchea el domain tras resumable upload
            components.push({ type: 'HEADER', format: 'IMAGE' })
          }
        }

        const bodyVars = [
          ...new Set(
            (params.body.text.match(/\{\{(\d+)\}\}/g) || []).map((v) =>
              v.replace(/[{}]/g, ''),
            ),
          ),
        ]
        const bodyComp: TemplateComponent = {
          type: 'BODY',
          text: params.body.text,
        }
        if (bodyVars.length > 0) {
          bodyComp.example = {
            body_text: [
              bodyVars.map((n) => params.body.exampleValues[n] || `ejemplo_${n}`),
            ],
          }
        }
        components.push(bodyComp)

        if (params.footer) {
          components.push({ type: 'FOOTER', text: params.footer.text })
        }

        // Delegar al domain (OBLIGATORIO — Regla 3 + agent scope)
        const result = await createTemplate(
          { workspaceId: ctx.workspaceId, source: 'tool-handler' },
          {
            name: sanitizeName(params.name),
            language: params.language,
            category: params.category,
            components,
            variableMapping: params.variableMapping,
            headerImage:
              params.header?.format === 'IMAGE'
                ? {
                    storagePath: params.header.storagePath,
                    mimeType: params.header.mimeType,
                  }
                : undefined,
            apiKey,
          },
        )

        if (!result.success || !result.data) {
          return { success: false, error: result.error || 'Error desconocido' }
        }

        return { success: true, templateId: result.data.id }
      },
    }),
  }
}
