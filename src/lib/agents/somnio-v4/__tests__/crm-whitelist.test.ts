/**
 * Tests de la whitelist moveOrderToStage del gate CRM (standalone #2, Plan 06 Task 1).
 *
 * Cubre los 4 comportamientos <behavior> de `isMoveAllowed` (D-13 — fail-closed):
 *  - ->CONFIRMADO desde pre-confirmacion (NUEVO PEDIDO, FALTA INFO) -> true.
 *  - bloquea otros destinos (NUEVO PAG WEB), origen ya confirmado, CANCELADO.
 *  - fail-closed sin env CONFIRMADO -> false.
 *
 * `isMoveAllowed` resuelve CONFIRMADO via getConfirmadoStageUuid() (env-bridge lazy
 * Plan 02). Inyectamos SOMNIO_CONFIRMADO_STAGE_UUID via process.env.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isMoveAllowed } from '../crm-gate'

// UUIDs verificados live (RESEARCH §Pattern 2).
const CONFIRMADO = '4770a36e-5feb-4eec-a71c-75d54cb2797c'
const NUEVO_PEDIDO = '6be952b0-0a95-4957-b5f7-62e8fd8eb815'
const FALTA_INFO = '05c1f783-8d5a-492d-86c2-c660e8e23332'
const NUEVO_PAG_WEB = '42da9d61-6c00-4317-9fd9-2cec9113bd38'
const CANCELADO = '11111111-1111-1111-1111-111111111111' // ficticio (fuera de pre-confirmacion + no es CONFIRMADO)

describe('isMoveAllowed — whitelist D-13', () => {
  const prev = process.env.SOMNIO_CONFIRMADO_STAGE_UUID

  afterEach(() => {
    if (prev === undefined) delete process.env.SOMNIO_CONFIRMADO_STAGE_UUID
    else process.env.SOMNIO_CONFIRMADO_STAGE_UUID = prev
  })

  describe('->CONFIRMADO desde pre-confirmacion -> true', () => {
    beforeEach(() => {
      process.env.SOMNIO_CONFIRMADO_STAGE_UUID = CONFIRMADO
    })

    it('NUEVO PEDIDO -> CONFIRMADO -> true', () => {
      expect(isMoveAllowed(NUEVO_PEDIDO, CONFIRMADO)).toBe(true)
    })

    it('FALTA INFO -> CONFIRMADO -> true', () => {
      expect(isMoveAllowed(FALTA_INFO, CONFIRMADO)).toBe(true)
    })
  })

  describe('bloquea otros destinos / origenes', () => {
    beforeEach(() => {
      process.env.SOMNIO_CONFIRMADO_STAGE_UUID = CONFIRMADO
    })

    it('NUEVO PEDIDO -> NUEVO PAG WEB -> false (destino no permitido)', () => {
      expect(isMoveAllowed(NUEVO_PEDIDO, NUEVO_PAG_WEB)).toBe(false)
    })

    it('CONFIRMADO -> CONFIRMADO -> false (origen ya confirmado, no pre-confirmacion)', () => {
      expect(isMoveAllowed(CONFIRMADO, CONFIRMADO)).toBe(false)
    })

    it('NUEVO PEDIDO -> CANCELADO -> false (D-07 cancelar fuera de scope)', () => {
      expect(isMoveAllowed(NUEVO_PEDIDO, CANCELADO)).toBe(false)
    })
  })

  describe('fail-closed sin env CONFIRMADO', () => {
    beforeEach(() => {
      delete process.env.SOMNIO_CONFIRMADO_STAGE_UUID
    })

    it('getConfirmadoStageUuid()=null -> false (no se mueve)', () => {
      expect(isMoveAllowed(NUEVO_PEDIDO, CONFIRMADO)).toBe(false)
    })
  })
})
