/**
 * Tests para deriveCrmActions + createSimulatedMutationTools (Plan 05, Task 1).
 *
 * Standalone: somnio-v4-crm-subloop / Plan 05.
 *
 * D-14/D-23: el orquestador deriva crmActions[] de rawResult.steps[].toolResults
 * (GROUND-TRUTH del AI SDK, NO auto-reporte del LLM). Mapeo de MutationResult.status:
 *   - 'executed' | 'duplicate'           -> result 'success'
 *   - 'stage_changed_concurrently'       -> result 'cas_reject' (code presente)
 *   - 'validation_error'|'error'|...     -> result 'failed' (code presente)
 *   - origen siempre 'rag' (lo ejecuta el sub-loop grounded).
 *   - filtra no-mutaciones (kb_search / getActiveOrderByPhone NO aparecen).
 *
 * D-22/S5: createSimulatedMutationTools simula MutationResult exito SIN tocar DB —
 * el sub-loop puebla crmActions igual (View B), el debug panel los muestra; cero
 * import de domain/supabase (paridad §4.4 DB-vs-memoria permitido).
 */
import { describe, it, expect } from 'vitest'
import {
  deriveCrmActions,
  createSimulatedMutationTools,
  MUTATION_TOOL_NAMES,
} from '../sub-loop/crm-echo'

/** Helper: construye un rawResult-like del AI SDK v6 con N steps de toolResults. */
function rawResultWith(
  toolResults: Array<{ toolName: string; input?: unknown; output?: unknown }>,
  opts?: { stepsSplit?: number[] },
) {
  // Por default un solo step con todos los toolResults. stepsSplit permite repartir
  // en multiples steps (para el test multi-step).
  if (!opts?.stepsSplit) {
    return { steps: [{ toolResults }] }
  }
  const steps: Array<{ toolResults: typeof toolResults }> = []
  let idx = 0
  for (const count of opts.stepsSplit) {
    steps.push({ toolResults: toolResults.slice(idx, idx + count) })
    idx += count
  }
  return { steps }
}

describe('deriveCrmActions — ground-truth mapping (D-14/D-23)', () => {
  it('executed -> success con origen rag', () => {
    const raw = rawResultWith([
      {
        toolName: 'createOrder',
        input: { contactId: 'c1', pipelineId: 'p1' },
        output: { status: 'executed', data: { id: 'o1', stageId: 's1' } },
      },
    ])
    const actions = deriveCrmActions(raw)
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({
      tool: 'createOrder',
      args: { contactId: 'c1', pipelineId: 'p1' },
      result: 'success',
      origen: 'rag',
    })
  })

  it('stage_changed_concurrently -> cas_reject con code', () => {
    const raw = rawResultWith([
      {
        toolName: 'moveOrderToStage',
        input: { orderId: 'o1', stageId: 'CONFIRMADO' },
        output: {
          status: 'stage_changed_concurrently',
          error: { code: 'stage_changed_concurrently', expectedStageId: 'a', actualStageId: 'b' },
        },
      },
    ])
    const actions = deriveCrmActions(raw)
    expect(actions).toHaveLength(1)
    expect(actions[0].result).toBe('cas_reject')
    expect(actions[0].code).toBe('stage_changed_concurrently')
    expect(actions[0].origen).toBe('rag')
  })

  it('validation_error / error / resource_not_found -> failed con code', () => {
    const raw = rawResultWith([
      {
        toolName: 'updateOrder',
        input: { orderId: 'o1' },
        output: { status: 'validation_error', error: { code: 'bad_field', message: 'x' } },
      },
      {
        toolName: 'addOrderNote',
        input: { orderId: 'o1', body: 'n' },
        output: { status: 'error', error: { code: 'unhandled' } },
      },
      {
        toolName: 'updateContact',
        input: { contactId: 'c1' },
        output: {
          status: 'resource_not_found',
          error: { code: 'not_found', missing: { resource: 'contact', id: 'c1' } },
        },
      },
    ])
    const actions = deriveCrmActions(raw)
    expect(actions).toHaveLength(3)
    expect(actions.map((a) => a.result)).toEqual(['failed', 'failed', 'failed'])
    expect(actions[0].code).toBe('bad_field')
    expect(actions[1].code).toBe('unhandled')
    expect(actions[2].code).toBe('not_found')
  })

  it('duplicate -> success (idempotency hit)', () => {
    const raw = rawResultWith([
      {
        toolName: 'createOrder',
        input: { contactId: 'c1' },
        output: { status: 'duplicate', data: { id: 'o1' } },
      },
    ])
    const actions = deriveCrmActions(raw)
    expect(actions).toHaveLength(1)
    expect(actions[0].result).toBe('success')
  })

  it('filtra no-mutaciones (kb_search / getActiveOrderByPhone)', () => {
    const raw = rawResultWith([
      { toolName: 'kb_search', input: { query: 'x' }, output: [{ topic: 't', similarity: 0.9 }] },
      {
        toolName: 'getActiveOrderByPhone',
        input: { phone: '57300' },
        output: { status: 'found', data: { id: 'o1' } },
      },
      {
        toolName: 'createOrder',
        input: { contactId: 'c1' },
        output: { status: 'executed', data: { id: 'o2' } },
      },
    ])
    const actions = deriveCrmActions(raw)
    expect(actions).toHaveLength(1)
    expect(actions[0].tool).toBe('createOrder')
  })

  it('multi-step: flatMap preserva orden a traves de varios steps', () => {
    const raw = rawResultWith(
      [
        { toolName: 'createOrder', input: {}, output: { status: 'executed', data: { id: 'o1' } } },
        { toolName: 'updateOrder', input: {}, output: { status: 'executed', data: { id: 'o1' } } },
        {
          toolName: 'moveOrderToStage',
          input: {},
          output: { status: 'executed', data: { id: 'o1', stageId: 'CONFIRMADO' } },
        },
      ],
      { stepsSplit: [1, 2] },
    )
    const actions = deriveCrmActions(raw)
    expect(actions.map((a) => a.tool)).toEqual([
      'createOrder',
      'updateOrder',
      'moveOrderToStage',
    ])
    // stageAtTime incluido cuando output.data.stageId existe.
    expect(actions[2].stageAtTime).toBe('CONFIRMADO')
  })

  it('defensivo: rawResult null / sin steps -> []', () => {
    expect(deriveCrmActions(null)).toEqual([])
    expect(deriveCrmActions(undefined)).toEqual([])
    expect(deriveCrmActions({})).toEqual([])
    expect(deriveCrmActions({ steps: [] })).toEqual([])
    expect(deriveCrmActions({ steps: [{}] })).toEqual([])
  })

  it('MUTATION_TOOL_NAMES contiene las 5 mutaciones', () => {
    expect([...MUTATION_TOOL_NAMES].sort()).toEqual(
      ['addOrderNote', 'createOrder', 'moveOrderToStage', 'updateContact', 'updateOrder'].sort(),
    )
  })
})

describe('createSimulatedMutationTools — sandbox parity (D-22/S5)', () => {
  it('retorna dict con las 5 mutation-tools cuyo execute devuelve executed sin tocar DB', async () => {
    const tools = createSimulatedMutationTools()
    for (const name of MUTATION_TOOL_NAMES) {
      expect(tools[name]).toBeDefined()
      expect(typeof tools[name].execute).toBe('function')
    }
    const res = await tools.createOrder.execute({ contactId: 'c1', pipelineId: 'p1' })
    expect(res.status).toBe('executed')
    expect(res.data).toBeDefined()
    expect(res.data.id).toMatch(/^sim-/)
    expect(res.data._simulated).toBe(true)
    // echo del input dentro de data
    expect(res.data.contactId).toBe('c1')
  })
})
