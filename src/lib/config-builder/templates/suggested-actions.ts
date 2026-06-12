// ============================================================================
// Standalone: template-builder-suggested-actions — Plan 01
// Derivación determinista de chips de acción sugerida desde TemplateDraft +
// messages (D-01), merge con tope 4 (D-02/D-03), guard de confirmación (D-07)
// y starter-chips del empty-state (D-08/D-09). Puro: testeable sin React.
// ============================================================================

import type { TemplateDraft } from './types'
import { extractVarIndices } from './validation'

// ============================================================================
// Tipos exportados
// ============================================================================

export type ChipAction = 'upload-image' | 'navigate-templates' | 'new-session'

export interface Chip {
  label: string
  message: string // texto que se envía como burbuja del usuario ('' en acciones locales)
  action?: ChipAction // si presente, el click ejecuta acción local y NO envía mensaje (D-05)
  variant?: 'default' | 'confirm'
}

export type StageId =
  | 'post_submit'
  | 'empty'
  | 'validated_ok'
  | 'validated_failed'
  | 'image_missing'
  | 'examples_missing'
  | 'no_variables'
  | 'ready_to_validate'
  | 'fallback'

// Shape mínimo estructural de UIMessage para no importar de 'ai' (el módulo es puro)
export interface MessageLike {
  role?: string
  parts?: unknown[]
}

// ============================================================================
// STARTER_CHIPS (D-08/D-09) — los 4 prompts pre-armados del empty-state
// ============================================================================

export const STARTER_CHIPS: Chip[] = [
  {
    label: 'Confirmación de pedido',
    message:
      'Quiero un template para confirmar pedidos: que salude al cliente por su nombre, le confirme que recibimos su pedido con el número de orden y le diga la fecha estimada de entrega.',
  },
  {
    label: 'Recordatorio de cita',
    message:
      'Quiero un template para recordar citas: que salude al paciente por su nombre, le recuerde la fecha y la hora de su cita y le pida confirmar su asistencia.',
  },
  {
    label: 'Promoción',
    message:
      'Quiero un template de promoción: que salude al cliente por su nombre y le presente una oferta especial con descuento por tiempo limitado, invitándolo a responder para aprovecharla.',
  },
  {
    label: 'Código de verificación',
    message:
      'Quiero un template de código de verificación: que entregue al cliente su código de un solo uso y le aclare que expira en pocos minutos.',
  },
]

// ============================================================================
// Helpers internos de escaneo de parts (cubren static + dynamic shapes)
// ============================================================================

interface ParsedToolPart {
  toolName: string
  input?: unknown
  output?: unknown
}

/**
 * Narrowing estructural de un part de mensaje a un tool-part resuelto.
 * Soporta ambos shapes de AI SDK v6:
 *   - static:  { type: 'tool-{name}', state, input, output }
 *   - dynamic: { type: 'dynamic-tool', toolName, state, input, output }
 * Retorna null si el part no es un tool-part con output disponible.
 */
function getToolPart(part: unknown): ParsedToolPart | null {
  if (!part || typeof part !== 'object') return null
  const p = part as {
    type?: string
    state?: string
    toolName?: string
    input?: unknown
    output?: unknown
  }
  if (p.state !== 'output-available') return null
  let toolName: string | null = null
  if (p.type === 'dynamic-tool') {
    toolName = typeof p.toolName === 'string' ? p.toolName : null
  } else if (typeof p.type === 'string' && p.type.startsWith('tool-')) {
    toolName = p.type.slice(5)
  }
  if (!toolName) return null
  return { toolName, input: p.input, output: p.output }
}

interface ScanResult {
  lastValidate: { input?: unknown; output?: unknown; pos: number } | null
  lastSubmitOk: { pos: number } | null
}

/**
 * Escanea TODOS los messages en orden registrando la posición global del
 * último validateTemplateDraft y del último submitTemplate exitoso.
 */
function scanMilestones(messages: MessageLike[]): ScanResult {
  let lastValidate: ScanResult['lastValidate'] = null
  let lastSubmitOk: ScanResult['lastSubmitOk'] = null
  let pos = 0
  for (const msg of messages) {
    const parts = Array.isArray(msg?.parts) ? msg.parts : []
    for (const part of parts) {
      const tool = getToolPart(part)
      if (!tool) {
        pos++
        continue
      }
      if (tool.toolName === 'validateTemplateDraft') {
        lastValidate = { input: tool.input, output: tool.output, pos }
      } else if (tool.toolName === 'submitTemplate') {
        const out = tool.output as { success?: boolean } | undefined
        if (out?.success === true) {
          lastSubmitOk = { pos }
        }
      }
      pos++
    }
  }
  return { lastValidate, lastSubmitOk }
}

/**
 * Ordena las keys de un objeto alfabéticamente (para comparación estructural
 * estable vía JSON.stringify).
 */
function sortKeys(obj: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of Object.keys(obj).sort()) {
    out[k] = obj[k]
  }
  return out
}

// ============================================================================
// draftMatchesValidated (guard D-07)
// ============================================================================

/**
 * Compara el draft que la IA pasó a validateTemplateDraft (input.draft) contra
 * el draft actual del preview. Si difieren, el resultado de validación quedó
 * stale y el chip "Confirmar y crear" debe desaparecer (D-07 re-evaluación).
 *
 * EXCLUYE del comparador:
 *   - variableMapping  (Pitfall 6 — el context casi siempre lo deja {} mientras
 *                       la IA pudo pasar otro mapping para pasar la validación)
 *   - headerImageLocalUrl (efímero — solo preview)
 * headerImageStoragePath se compara con Boolean(a)===Boolean(b) (tolerancia: la
 * IA conoce el path solo por el mensaje de aviso).
 */
export function draftMatchesValidated(
  input: unknown,
  draft: TemplateDraft,
): boolean {
  if (!input || typeof input !== 'object') return false
  const a = input as Partial<TemplateDraft>

  if (a.name !== draft.name) return false
  if (a.language !== draft.language) return false
  if (a.category !== draft.category) return false
  if (a.headerFormat !== draft.headerFormat) return false
  if (a.headerText !== draft.headerText) return false
  if (a.bodyText !== draft.bodyText) return false
  if (a.footerText !== draft.footerText) return false

  if (Boolean(a.headerImageStoragePath) !== Boolean(draft.headerImageStoragePath))
    return false

  const eqRecord = (
    x: Record<string, string> | undefined,
    y: Record<string, string> | undefined,
  ) => JSON.stringify(sortKeys(x ?? {})) === JSON.stringify(sortKeys(y ?? {}))

  if (!eqRecord(a.bodyExamples, draft.bodyExamples)) return false
  if (!eqRecord(a.headerExamples, draft.headerExamples)) return false

  return true
}

// ============================================================================
// deriveStage — first match wins (orden exacto de precedencia)
// ============================================================================

/**
 * Deriva la etapa del flujo + los chips deterministas desde el draft actual y
 * el historial de messages. first-match-wins en el orden de la tabla.
 */
export function deriveStage(
  draft: TemplateDraft,
  messages: MessageLike[],
): { stage: StageId; chips: Chip[] } {
  // 2. empty antes de escanear: sin mensajes no hay milestones que evaluar.
  if (messages.length === 0) {
    return { stage: 'empty', chips: [] }
  }

  const { lastValidate, lastSubmitOk } = scanMilestones(messages)

  // 1. post_submit — el submit exitoso es el milestone más reciente.
  if (
    lastSubmitOk &&
    (!lastValidate || lastSubmitOk.pos > lastValidate.pos)
  ) {
    return {
      stage: 'post_submit',
      chips: [
        { label: 'Crear otro template', message: '', action: 'new-session' },
        { label: 'Ver mis templates', message: '', action: 'navigate-templates' },
      ],
    }
  }

  // Resolver el resultado vigente del último validate (si el draft no cambió).
  const validateOutput = lastValidate?.output as
    | { success?: boolean; error?: string }
    | undefined
  const validateInput = (lastValidate?.input as { draft?: unknown } | undefined)
    ?.draft
  const validateStillVigente =
    !!lastValidate && draftMatchesValidated(validateInput, draft)

  // 3. validated_ok — último validate success Y draft sigue igual (guard D-07).
  if (validateStillVigente && validateOutput?.success === true) {
    return {
      stage: 'validated_ok',
      chips: [
        {
          label: '✅ Confirmar y crear',
          message: 'Confirmo, créalo',
          variant: 'confirm',
        },
        {
          label: 'Revisar de nuevo',
          message: 'Revisemos el template una vez más antes de crearlo',
        },
      ],
    }
  }

  // 4. validated_failed — último validate con error Y draft sigue igual.
  if (validateStillVigente && validateOutput?.error) {
    return {
      stage: 'validated_failed',
      chips: [
        {
          label: 'Corregir automáticamente',
          message: 'Corrige los errores de validación automáticamente',
        },
        {
          label: 'Editar yo mismo',
          message: 'Dime exactamente qué errores hay y los corrijo yo mismo',
        },
      ],
    }
  }

  // 5. image_missing — header IMAGE sin imagen subida.
  if (draft.headerFormat === 'IMAGE' && !draft.headerImageStoragePath) {
    return {
      stage: 'image_missing',
      chips: [
        { label: '📷 Subir imagen', message: '', action: 'upload-image' },
        {
          label: 'Mejor sin imagen',
          message:
            'Mejor hagamos el template sin imagen, quita el header de imagen',
        },
      ],
    }
  }

  const bodyVars = extractVarIndices(draft.bodyText)

  // 6. examples_missing — hay variables {{N}} sin entry en bodyExamples.
  if (bodyVars.length > 0 && bodyVars.some((i) => !draft.bodyExamples[String(i)])) {
    return {
      stage: 'examples_missing',
      chips: [
        {
          label: 'Usar ejemplos sugeridos',
          message: 'Sugiere tú los ejemplos para las variables',
        },
        {
          label: 'Escribir mis ejemplos',
          message:
            'Yo te paso los ejemplos de las variables, pregúntame los valores',
        },
      ],
    }
  }

  // 7. no_variables — body no vacío y sin variables.
  if (draft.bodyText.trim() !== '' && bodyVars.length === 0) {
    return {
      stage: 'no_variables',
      chips: [
        {
          label: 'Agregar variables',
          message: 'Agrega variables al template, por ejemplo el nombre del cliente',
        },
        {
          label: 'Agregar imagen',
          message: 'Quiero que el template tenga una imagen en el header',
        },
        { label: 'Cambiar el texto', message: 'Quiero cambiar el texto del mensaje' },
        { label: 'Continuar →', message: 'Continúa con el siguiente paso' },
      ],
    }
  }

  // 8. ready_to_validate — body no vacío (y no matcheó nada anterior).
  if (draft.bodyText.trim() !== '') {
    return {
      stage: 'ready_to_validate',
      chips: [
        { label: 'Validar template', message: 'Valida el template' },
        { label: 'Cambiar algo', message: 'Quiero cambiar algo antes de validar' },
      ],
    }
  }

  // 9. fallback — ninguno.
  return { stage: 'fallback', chips: [] }
}

// ============================================================================
// mergeChips (D-02/D-03) — deterministas mandan, cap 4, dedupe, filtro CONFIRM
// ============================================================================

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // sin acentos
    .replace(/[^\p{L}\p{N} ]/gu, '') // sin emoji/punct
    .trim()

const CONFIRM_RE = /(confirm|crealo|crearlo|envialo|submit|crea el template)/

/**
 * Combina chips deterministas (mandan, primeros slots) con AI-chips de relleno.
 * - cap total = 4 (D-02)
 * - dedupe por label normalizado (sin acentos/emoji/case)
 * - descarta AI-chips cuyo label O message normalizado matchee CONFIRM_RE
 *   (Pitfall 2 capa 3 — protege el guard D-07)
 */
export function mergeChips(deterministic: Chip[], ai: Chip[], cap = 4): Chip[] {
  const seen = new Set(deterministic.map((c) => norm(c.label)))
  const out = [...deterministic]
  for (const chip of ai) {
    if (out.length >= cap) break
    const nLabel = norm(chip.label)
    if (seen.has(nLabel)) continue
    if (CONFIRM_RE.test(nLabel) || CONFIRM_RE.test(norm(chip.message))) continue
    out.push(chip)
    seen.add(nLabel)
  }
  return out.slice(0, cap)
}

// ============================================================================
// extractAiActions — lee SOLO el último mensaje del asistente
// ============================================================================

/**
 * Extrae los AI-chips del tool-result de suggestActions en el ÚLTIMO mensaje.
 * Solo mira messages[length-1]: si no es un assistant message con un
 * suggestActions output-available exitoso → []. Así los chips reflejan SOLO el
 * turno actual y desaparecen cuando llega un turno nuevo.
 */
export function extractAiActions(messages: MessageLike[]): Chip[] {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant' || !Array.isArray(last.parts)) return []
  for (let i = last.parts.length - 1; i >= 0; i--) {
    const tool = getToolPart(last.parts[i])
    if (!tool || tool.toolName !== 'suggestActions') continue
    const o = tool.output as
      | { success?: boolean; actions?: Array<{ label?: unknown; message?: unknown }> }
      | undefined
    if (o?.success === true && Array.isArray(o.actions)) {
      return o.actions.map((a) => ({
        label: String(a.label ?? ''),
        message: String(a.message ?? ''),
      }))
    }
  }
  return []
}
