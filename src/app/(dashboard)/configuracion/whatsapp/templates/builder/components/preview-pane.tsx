'use client'

// ============================================================================
// Standalone: whatsapp-template-ai-builder — Plan 04 Task 4.3
// Preview pane: campos editables + WhatsApp bubble live.
// D-01: preview visual en tiempo real.
// D-05: header TEXT e IMAGE (no VIDEO/DOCUMENT).
// D-06: body obligatorio (max 1024), footer opcional (max 60), header max 60.
// D-09: 3 idiomas (es, es_CO, en_US).
// D-08: 3 categorias (MARKETING, UTILITY, AUTHENTICATION).
//
// Cada input dispatchea UPDATE_FIELD; los cambios re-renderean el WhatsAppBubble
// al pie de la pagina. Los {{N}} en body/header se interpolan con bodyExamples
// / headerExamples si existen; caso contrario se muestran literalmente.
// ============================================================================

import { useTemplateDraft } from './template-draft-context'
import { WhatsAppBubble } from './whatsapp-bubble'
import { ImageUploader } from './image-uploader'
import type {
  TemplateCategoryEnum,
  TemplateLanguage,
  TemplateHeaderFormat,
} from '@/lib/config-builder/templates/types'

// ============================================================================
// Opciones de dropdowns
// ============================================================================

const CATEGORY_OPTIONS: Array<{
  value: TemplateCategoryEnum
  label: string
  desc: string
}> = [
  { value: 'UTILITY', label: 'UTILITY', desc: 'Transaccional / informativo' },
  { value: 'MARKETING', label: 'MARKETING', desc: 'Promociones / anuncios' },
  {
    value: 'AUTHENTICATION',
    label: 'AUTHENTICATION',
    desc: 'OTP / codigos de verificacion',
  },
]

const LANGUAGE_OPTIONS: Array<{ value: TemplateLanguage; label: string }> = [
  { value: 'es', label: 'Espanol (es)' },
  { value: 'es_CO', label: 'Espanol Colombia (es_CO)' },
  { value: 'en_US', label: 'Ingles US (en_US)' },
]

const HEADER_FORMAT_OPTIONS: Array<{
  value: TemplateHeaderFormat
  label: string
}> = [
  { value: 'NONE', label: 'Sin header' },
  { value: 'TEXT', label: 'Texto' },
  { value: 'IMAGE', label: 'Imagen' },
]

// ============================================================================
// Helpers
// ============================================================================

/**
 * Interpola {{N}} con los ejemplos dados; cae a la sintaxis literal si no hay
 * ejemplo para ese indice. Permite al usuario ver tanto el placeholder crudo
 * como la version resuelta.
 */
function interpolate(text: string, examples: Record<string, string>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_match, idx) => examples[idx] || `{{${idx}}}`)
}

// ============================================================================
// PreviewPane
// ============================================================================

export function PreviewPane() {
  const { draft, dispatch } = useTemplateDraft()

  const bodyPreview = interpolate(draft.bodyText, draft.bodyExamples)
  const headerPreview =
    draft.headerFormat === 'TEXT'
      ? interpolate(draft.headerText, draft.headerExamples)
      : undefined

  return (
    <div className="p-6 space-y-6 max-w-xl mx-auto w-full">
      <h2 className="text-lg font-semibold">Preview del template</h2>

      {/* ============================================================
          Identidad
          ============================================================ */}
      <section className="space-y-3 border-b pb-6">
        <div>
          <label className="block text-sm font-medium mb-1">
            Nombre
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              (minusculas, numeros, guiones bajos)
            </span>
          </label>
          <input
            value={draft.name}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_FIELD', field: 'name', value: e.target.value })
            }
            placeholder="mi_template"
            maxLength={512}
            className="w-full border rounded px-3 py-1.5 text-sm bg-background"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Categoria</label>
          <select
            value={draft.category}
            onChange={(e) =>
              dispatch({
                type: 'UPDATE_FIELD',
                field: 'category',
                value: e.target.value as TemplateCategoryEnum,
              })
            }
            className="w-full border rounded px-3 py-1.5 text-sm bg-background"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} — {o.desc}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Idioma</label>
          <select
            value={draft.language}
            onChange={(e) =>
              dispatch({
                type: 'UPDATE_FIELD',
                field: 'language',
                value: e.target.value as TemplateLanguage,
              })
            }
            className="w-full border rounded px-3 py-1.5 text-sm bg-background"
          >
            {LANGUAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* ============================================================
          Header
          ============================================================ */}
      <section className="space-y-3 border-b pb-6">
        <div>
          <label className="block text-sm font-medium mb-1">Header (opcional)</label>
          <select
            value={draft.headerFormat}
            onChange={(e) =>
              dispatch({
                type: 'UPDATE_FIELD',
                field: 'headerFormat',
                value: e.target.value as TemplateHeaderFormat,
              })
            }
            className="w-full border rounded px-3 py-1.5 text-sm bg-background"
          >
            {HEADER_FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {draft.headerFormat === 'TEXT' && (
          <div>
            <label className="block text-sm font-medium mb-1">
              Texto del header
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                ({draft.headerText.length}/60)
              </span>
            </label>
            <input
              value={draft.headerText}
              onChange={(e) =>
                dispatch({
                  type: 'UPDATE_FIELD',
                  field: 'headerText',
                  value: e.target.value,
                })
              }
              maxLength={60}
              placeholder="Ej: Confirmacion de pedido"
              className="w-full border rounded px-3 py-1.5 text-sm bg-background"
            />
          </div>
        )}

        {draft.headerFormat === 'IMAGE' && <ImageUploader />}
      </section>

      {/* ============================================================
          Body + Footer
          ============================================================ */}
      <section className="space-y-3 border-b pb-6">
        <div>
          <label className="block text-sm font-medium mb-1">
            Body
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              (obligatorio, {draft.bodyText.length}/1024)
            </span>
          </label>
          <textarea
            value={draft.bodyText}
            onChange={(e) =>
              dispatch({
                type: 'UPDATE_FIELD',
                field: 'bodyText',
                value: e.target.value,
              })
            }
            maxLength={1024}
            rows={5}
            placeholder="Hola {{1}}, tu pedido {{2}} llega manana."
            className="w-full border rounded px-3 py-2 text-sm bg-background resize-y"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Usa {'{{1}}'}, {'{{2}}'}, etc. para variables. La IA te ayuda a
            detectarlas automaticamente desde el chat.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Footer
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              (opcional, {draft.footerText.length}/60)
            </span>
          </label>
          <input
            value={draft.footerText}
            onChange={(e) =>
              dispatch({
                type: 'UPDATE_FIELD',
                field: 'footerText',
                value: e.target.value,
              })
            }
            maxLength={60}
            placeholder="Ej: Enviado por MorfX"
            className="w-full border rounded px-3 py-1.5 text-sm bg-background"
          />
        </div>
      </section>

      {/* ============================================================
          Vista previa de la burbuja
          ============================================================ */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Vista previa del mensaje</h3>
        <div className="rounded-lg border bg-muted/30 p-4 flex justify-start">
          <WhatsAppBubble
            header={
              draft.headerFormat === 'IMAGE'
                ? {
                    format: 'IMAGE',
                    imageUrl: draft.headerImageLocalUrl,
                  }
                : draft.headerFormat === 'TEXT'
                  ? { format: 'TEXT', text: headerPreview }
                  : undefined
            }
            body={bodyPreview}
            footer={draft.footerText || undefined}
          />
        </div>

        {/* Variable mapping (read-only; la IA lo llena via captureVariableMapping) */}
        {Object.keys(draft.variableMapping).length > 0 && (
          <div className="text-xs border rounded p-3 bg-muted/20">
            <div className="font-semibold mb-1">Mapping de variables:</div>
            <ul className="space-y-0.5 font-mono">
              {Object.entries(draft.variableMapping)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([idx, path]) => (
                  <li key={idx}>
                    {'{{'}
                    {idx}
                    {'}}'} → {path}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
