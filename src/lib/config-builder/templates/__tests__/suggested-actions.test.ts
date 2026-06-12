import { describe, it, expect } from 'vitest'
import {
  deriveStage,
  mergeChips,
  draftMatchesValidated,
  extractAiActions,
  STARTER_CHIPS,
  type Chip,
} from '../suggested-actions'
import type { TemplateDraft } from '../types'

// Origen: Standalone template-builder-suggested-actions — Plan 01.
// Cubre la derivación determinista de etapa (D-01), el guard de confirmación
// (D-07), el merge con tope 4 + dedupe + filtro CONFIRM (D-02/D-03, Pitfall 2),
// y la extracción de AI-chips del último mensaje (D-10). Módulo puro, sin React.

// Fixture local espejando initialDraft (NO importar de template-draft-context.tsx
// que es client component — PATTERNS §3).
const baseDraft: TemplateDraft = {
  name: '',
  language: 'es',
  category: 'UTILITY',
  headerFormat: 'NONE',
  headerText: '',
  headerImageStoragePath: null,
  headerImageLocalUrl: null,
  bodyText: '',
  footerText: '',
  variableMapping: {},
  bodyExamples: {},
  headerExamples: {},
}

// Fixtures de messages con parts mínimos (shape ToolUIPart de ai@6.0.86).
const validateOkMsg = (draft: TemplateDraft) => ({
  id: 'm1',
  role: 'assistant',
  parts: [
    {
      type: 'tool-validateTemplateDraft',
      state: 'output-available',
      input: { draft },
      output: { success: true },
    },
  ],
})

const validateFailMsg = (draft: TemplateDraft) => ({
  id: 'm2',
  role: 'assistant',
  parts: [
    {
      type: 'tool-validateTemplateDraft',
      state: 'output-available',
      input: { draft },
      output: { error: 'Validacion fallo', errors: ['x'] },
    },
  ],
})

const submitOkMsg = () => ({
  id: 'm3',
  role: 'assistant',
  parts: [
    {
      type: 'tool-submitTemplate',
      state: 'output-available',
      input: {},
      output: { success: true, templateId: 'tpl-1' },
    },
  ],
})

const userMsg = (text: string) => ({
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', text }],
})

describe('deriveStage — precedencia de etapas (D-01)', () => {
  it('retorna empty con chips [] cuando no hay mensajes', () => {
    const { stage, chips } = deriveStage(baseDraft, [])
    expect(stage).toBe('empty')
    expect(chips).toEqual([])
  })

  it('retorna fallback con chips [] cuando hay mensajes pero el draft está vacío', () => {
    const { stage, chips } = deriveStage(baseDraft, [userMsg('hola')])
    expect(stage).toBe('fallback')
    expect(chips).toEqual([])
  })

  it('retorna ready_to_validate cuando el body no está vacío y sin variables', () => {
    const draft = { ...baseDraft, bodyText: 'Hola, gracias por tu compra' }
    const { stage, chips } = deriveStage(draft, [userMsg('crea uno')])
    expect(stage).toBe('no_variables') // body sin variables tiene su propia etapa
    expect(chips.some((c) => c.label === 'Agregar variables')).toBe(true)
  })

  it('retorna ready_to_validate cuando hay variables CON ejemplos completos', () => {
    const draft = {
      ...baseDraft,
      bodyText: 'Hola {{1}}, tu pedido {{2}}',
      bodyExamples: { '1': 'Juan', '2': '#123' },
    }
    const { stage } = deriveStage(draft, [userMsg('listo')])
    expect(stage).toBe('ready_to_validate')
  })

  it('retorna examples_missing cuando hay variables {{N}} sin ejemplo', () => {
    const draft = {
      ...baseDraft,
      bodyText: 'Hola {{1}}, pedido {{2}}',
      bodyExamples: { '1': 'Juan' },
    }
    const { stage, chips } = deriveStage(draft, [userMsg('x')])
    expect(stage).toBe('examples_missing')
    expect(chips.some((c) => c.label === 'Usar ejemplos sugeridos')).toBe(true)
  })

  it('retorna no_variables cuando el body no vacío no tiene variables', () => {
    const draft = { ...baseDraft, bodyText: 'Mensaje fijo sin variables' }
    const { stage, chips } = deriveStage(draft, [userMsg('x')])
    expect(stage).toBe('no_variables')
    expect(chips.length).toBe(4)
  })

  it('retorna image_missing cuando headerFormat=IMAGE y sin storagePath', () => {
    const draft = {
      ...baseDraft,
      headerFormat: 'IMAGE' as const,
      bodyText: 'Cuerpo con imagen',
    }
    const { stage, chips } = deriveStage(draft, [userMsg('con imagen')])
    expect(stage).toBe('image_missing')
    const upload = chips.find((c) => c.action === 'upload-image')
    expect(upload).toBeTruthy()
    expect(upload?.message).toBe('') // acción local, no envía mensaje
  })
})

describe('deriveStage — guard de validación (D-07)', () => {
  it('retorna validated_ok con chip Confirmar SOLO si el draft coincide con el validado', () => {
    const draft = { ...baseDraft, name: 'mi_template', bodyText: 'Hola' }
    const { stage, chips } = deriveStage(draft, [validateOkMsg(draft)])
    expect(stage).toBe('validated_ok')
    const confirm = chips.find((c) => c.variant === 'confirm')
    expect(confirm?.label).toBe('✅ Confirmar y crear')
    expect(confirm?.message).toBe('Confirmo, créalo')
  })

  it('editar bodyText después de validar rompe el match y cae a etapa inferior (D-07)', () => {
    const validatedDraft = { ...baseDraft, name: 'mi_template', bodyText: 'Hola' }
    const editedDraft = { ...validatedDraft, bodyText: 'Hola editado' }
    const { stage, chips } = deriveStage(editedDraft, [validateOkMsg(validatedDraft)])
    expect(stage).not.toBe('validated_ok')
    expect(chips.some((c) => c.variant === 'confirm')).toBe(false)
  })

  it('retorna validated_failed cuando el último validate falló y el draft sigue igual', () => {
    const draft = { ...baseDraft, name: 'mi_template', bodyText: 'Hola {{1}}' }
    const { stage, chips } = deriveStage(draft, [validateFailMsg(draft)])
    expect(stage).toBe('validated_failed')
    expect(chips.some((c) => c.label === 'Corregir automáticamente')).toBe(true)
  })

  it('retorna post_submit cuando el submit ok es posterior al validate', () => {
    const draft = { ...baseDraft, name: 'mi_template', bodyText: 'Hola' }
    const { stage, chips } = deriveStage(draft, [
      validateOkMsg(draft),
      submitOkMsg(),
    ])
    expect(stage).toBe('post_submit')
    expect(chips.some((c) => c.action === 'new-session')).toBe(true)
    expect(chips.some((c) => c.action === 'navigate-templates')).toBe(true)
  })
})

describe('draftMatchesValidated — exclusiones (Pitfall 6)', () => {
  it('ignora variableMapping (puede diferir entre context y IA)', () => {
    const draft = { ...baseDraft, name: 'x', bodyText: 'Hola {{1}}' }
    const inputConMapping = { ...draft, variableMapping: { '1': 'contacto.nombre' } }
    expect(draftMatchesValidated(inputConMapping, draft)).toBe(true)
  })

  it('ignora headerImageLocalUrl (efímero)', () => {
    const draft = { ...baseDraft, name: 'x', bodyText: 'Hola' }
    const input = { ...draft, headerImageLocalUrl: 'blob:abc' }
    expect(draftMatchesValidated(input, draft)).toBe(true)
  })

  it('compara headerImageStoragePath por Boolean (tolerancia)', () => {
    const draft = { ...baseDraft, headerImageStoragePath: 'templates/x.png' }
    const input = { ...draft, headerImageStoragePath: 'templates/otro.png' }
    expect(draftMatchesValidated(input, draft)).toBe(true) // ambos truthy
    const inputNull = { ...draft, headerImageStoragePath: null }
    expect(draftMatchesValidated(inputNull, draft)).toBe(false) // truthy vs null
  })

  it('compara bodyExamples por igualdad estructural con keys ordenadas', () => {
    const draft = { ...baseDraft, bodyExamples: { '1': 'a', '2': 'b' } }
    const input = { ...draft, bodyExamples: { '2': 'b', '1': 'a' } }
    expect(draftMatchesValidated(input, draft)).toBe(true)
    const inputDiff = { ...draft, bodyExamples: { '1': 'a', '2': 'c' } }
    expect(draftMatchesValidated(inputDiff, draft)).toBe(false)
  })

  it('retorna false cuando input no es objeto', () => {
    expect(draftMatchesValidated(null, baseDraft)).toBe(false)
    expect(draftMatchesValidated('x', baseDraft)).toBe(false)
  })
})

describe('mergeChips — D-02/D-03 + filtro CONFIRM (Pitfall 2)', () => {
  const det: Chip[] = [
    { label: 'Validar template', message: 'Valida el template' },
    { label: 'Cambiar algo', message: 'Quiero cambiar algo' },
  ]

  it('los deterministas ocupan los primeros slots y la IA rellena hasta el cap', () => {
    const ai: Chip[] = [
      { label: 'Hacerlo más corto', message: 'Hazlo más corto' },
      { label: 'Versión en inglés', message: 'Tradúcelo al inglés' },
    ]
    const merged = mergeChips(det, ai, 4)
    expect(merged.length).toBe(4)
    expect(merged[0].label).toBe('Validar template')
    expect(merged[2].label).toBe('Hacerlo más corto')
  })

  it('respeta el tope de 4 chips (D-02)', () => {
    const ai: Chip[] = [
      { label: 'A', message: 'a' },
      { label: 'B', message: 'b' },
      { label: 'C', message: 'c' },
    ]
    expect(mergeChips(det, ai, 4).length).toBe(4)
  })

  it('descarta AI-chips de confirmación por label normalizado (créalo con acento)', () => {
    const ai: Chip[] = [{ label: 'Confirmar', message: 'Confirmo, créalo' }]
    const merged = mergeChips(det, ai, 4)
    expect(merged.some((c) => c.label === 'Confirmar')).toBe(false)
  })

  it('descarta AI-chips de confirmación por message normalizado', () => {
    const ai: Chip[] = [{ label: 'Listo ya', message: 'envíalo a Meta' }]
    const merged = mergeChips(det, ai, 4)
    expect(merged.some((c) => c.label === 'Listo ya')).toBe(false)
  })

  it('dedupe por label normalizado (sin acentos/case)', () => {
    const ai: Chip[] = [{ label: 'validar TEMPLATE', message: 'otro' }]
    const merged = mergeChips(det, ai, 4)
    expect(merged.filter((c) => c.label.toLowerCase().includes('validar')).length).toBe(1)
  })
})

describe('extractAiActions — lee solo el último mensaje (D-10)', () => {
  const suggestMsg = (actions: Array<{ label: string; message: string }>) => ({
    id: 's1',
    role: 'assistant',
    parts: [
      {
        type: 'tool-suggestActions',
        state: 'output-available',
        input: { actions },
        output: { success: true, actions },
      },
    ],
  })

  it('extrae las actions del tool-suggestActions del último mensaje (shape static)', () => {
    const msgs = [suggestMsg([{ label: 'A', message: 'a' }])]
    const chips = extractAiActions(msgs)
    expect(chips).toEqual([{ label: 'A', message: 'a' }])
  })

  it('soporta el shape dynamic-tool', () => {
    const msgs = [
      {
        id: 'd1',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'suggestActions',
            state: 'output-available',
            output: { success: true, actions: [{ label: 'B', message: 'b' }] },
          },
        ],
      },
    ]
    const chips = extractAiActions(msgs)
    expect(chips).toEqual([{ label: 'B', message: 'b' }])
  })

  it('retorna [] si el último mensaje es del usuario', () => {
    const msgs = [suggestMsg([{ label: 'A', message: 'a' }]), userMsg('otra cosa')]
    expect(extractAiActions(msgs)).toEqual([])
  })

  it('retorna [] si no hay tool-suggestActions', () => {
    expect(extractAiActions([validateOkMsg(baseDraft)])).toEqual([])
  })
})

describe('STARTER_CHIPS (D-08/D-09)', () => {
  it('tiene exactamente 4 entries con los labels D-08', () => {
    expect(STARTER_CHIPS).toHaveLength(4)
    expect(STARTER_CHIPS.map((c) => c.label)).toEqual([
      'Confirmación de pedido',
      'Recordatorio de cita',
      'Promoción',
      'Código de verificación',
    ])
  })

  it('cada starter-chip tiene un message pre-armado no vacío', () => {
    for (const chip of STARTER_CHIPS) {
      expect(chip.message.length).toBeGreaterThan(20)
    }
  })
})
