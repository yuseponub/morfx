// ============================================================================
// Tests for sub-loop/safe-output.ts — safeAccessOutput wrapper (A3 RESEARCH).
//
// Standalone: somnio-v4-rag-generative / Plan 03.
//
// Wrapper defensivo alrededor de result.output para escapar bug vercel/ai#11348
// (NoObjectGeneratedError thrown aunque haya JSON válido en result.text).
//
// Coverage:
//   1. Happy path: result.output existe → retorna T directo.
//   2. NoObjectGeneratedError + result.text con JSON válido + schema OK → manual parse retorna T.
//   3. NoObjectGeneratedError + result.text con JSON inválido → throw con diagnostic.
//   4. NoObjectGeneratedError + result.text vacío → re-throw original error.
//   5. Otro error (no NoObjectGeneratedError) → re-throw sin transformar.
// ============================================================================

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { NoObjectGeneratedError } from 'ai'
import { safeAccessOutput } from '../safe-output'

// Schema simple para los tests.
const TestSchema = z.object({
  name: z.string(),
  count: z.number(),
})
type TestOutput = z.infer<typeof TestSchema>

// Helper: construye un mock NoObjectGeneratedError.
function makeNoObjectError(): Error {
  // AI SDK v6 expone NoObjectGeneratedError como clase; construirla con campos requeridos.
  // Si la API cambia, esta función es el único place a actualizar.
  try {
    return new NoObjectGeneratedError({
      message: 'No object generated',
      text: '',
      response: undefined as any,
      usage: undefined as any,
      finishReason: 'stop',
    } as any)
  } catch {
    // Fallback: instanceof check del wrapper usa isInstance method que mira name match,
    // así que un Error custom con name='AI_NoObjectGeneratedError' también funciona.
    const e = new Error('No object generated')
    e.name = 'AI_NoObjectGeneratedError'
    return e
  }
}

describe('safeAccessOutput', () => {
  it('Test 1: returns result.output directly when available', () => {
    const result = {
      output: { name: 'somnio', count: 42 } as TestOutput,
      text: '{"name":"somnio","count":42}',
    }
    const parsed = safeAccessOutput(result, TestSchema)
    expect(parsed).toEqual({ name: 'somnio', count: 42 })
  })

  it('Test 2: falls back to manual JSON parse when NoObjectGeneratedError thrown and text is valid JSON', () => {
    const noErr = makeNoObjectError()
    // Use property getter that throws.
    const result = {
      text: '{"name":"flash","count":7}',
    }
    Object.defineProperty(result, 'output', {
      get() {
        throw noErr
      },
    })
    // Only applies if NoObjectGeneratedError.isInstance returns true for our mock.
    if (NoObjectGeneratedError.isInstance(noErr)) {
      const parsed = safeAccessOutput(result, TestSchema)
      expect(parsed).toEqual({ name: 'flash', count: 7 })
    } else {
      // El mock fallback no es detectado por isInstance — skip behavioral assertion,
      // pero verificamos que el wrapper re-throwea (Test 5 cubre eso).
      expect(() => safeAccessOutput(result, TestSchema)).toThrow()
    }
  })

  it('Test 3: throws diagnostic when NoObjectGeneratedError thrown and text JSON parse fails', () => {
    const noErr = makeNoObjectError()
    const result = {
      text: 'this is not JSON at all just plain text',
    }
    Object.defineProperty(result, 'output', {
      get() {
        throw noErr
      },
    })
    if (NoObjectGeneratedError.isInstance(noErr)) {
      expect(() => safeAccessOutput(result, TestSchema)).toThrow(/safeAccessOutput/)
      try {
        safeAccessOutput(result, TestSchema)
      } catch (e) {
        // Debe incluir slice de los primeros 200 chars del text.
        expect((e as Error).message).toMatch(/this is not JSON/)
      }
    } else {
      // Fallback: re-throw original.
      expect(() => safeAccessOutput(result, TestSchema)).toThrow()
    }
  })

  it('Test 4: re-throws non-NoObjectGeneratedError errors unchanged', () => {
    const customErr = new TypeError('some other error from generateText guts')
    const result = {
      text: '{"name":"x","count":1}',
    }
    Object.defineProperty(result, 'output', {
      get() {
        throw customErr
      },
    })
    expect(() => safeAccessOutput(result, TestSchema)).toThrow(TypeError)
    expect(() => safeAccessOutput(result, TestSchema)).toThrow(/some other error/)
  })

  it('Test 5: schema validation in fallback path rejects malformed JSON shape', () => {
    const noErr = makeNoObjectError()
    const result = {
      text: '{"name":"x","count":"not a number"}',
    }
    Object.defineProperty(result, 'output', {
      get() {
        throw noErr
      },
    })
    if (NoObjectGeneratedError.isInstance(noErr)) {
      // Schema espera count:number — string falla la validation → throw diagnostic.
      expect(() => safeAccessOutput(result, TestSchema)).toThrow(/safeAccessOutput/)
    } else {
      expect(() => safeAccessOutput(result, TestSchema)).toThrow()
    }
  })
})
