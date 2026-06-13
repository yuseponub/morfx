/**
 * Tests del predicate del gate CRM (v4-gate-confidence-fixes D-01).
 *
 * Cubre los 3 comportamientos de `crmGateFired` tras Fix #1:
 *  - por accion (CRM_GATE_ACTIONS): mostrar_confirmacion/confirmar_orden -> true; pedir_datos -> false.
 *  - por datosCriticosJustCompleted: true -> true; false con category='venta' -> false.
 *  - por category: 'datos' -> true (red anti-falso-negativo).
 *  - caso Bucaramanga (regresión): city question con datosCriticosJustCompleted=false -> false.
 */
import { describe, it, expect } from 'vitest'
import { crmGateFired } from '../crm-gate'

describe('crmGateFired — gate D-01 (v4-gate-confidence-fixes)', () => {
  describe('por accion (CRM_GATE_ACTIONS)', () => {
    it('mostrar_confirmacion -> true', () => {
      expect(
        crmGateFired({ accion: 'mostrar_confirmacion', category: 'venta', datosCriticosJustCompleted: false }),
      ).toBe(true)
    })

    it('confirmar_orden -> true', () => {
      expect(
        crmGateFired({ accion: 'confirmar_orden', category: 'venta', datosCriticosJustCompleted: false }),
      ).toBe(true)
    })

    it('pedir_datos -> false (no es accion CRM-gate)', () => {
      expect(
        crmGateFired({ accion: 'pedir_datos', category: 'venta', datosCriticosJustCompleted: false }),
      ).toBe(false)
    })
  })

  describe('por datosCriticosJustCompleted (trigger b — Fix #1)', () => {
    it('datosCriticosJustCompleted=true -> true (todos los campos críticos recién completados)', () => {
      expect(
        crmGateFired({ accion: null, category: 'venta', datosCriticosJustCompleted: true }),
      ).toBe(true)
    })

    it('datosCriticosJustCompleted=false + category venta -> false (caso Bucaramanga)', () => {
      expect(
        crmGateFired({ accion: null, category: 'venta', datosCriticosJustCompleted: false }),
      ).toBe(false)
    })

    it('datosCriticosJustCompleted=false + category pregunta -> false (regresión caso Bucaramanga)', () => {
      // El turno que crasheó: ciudad extraída pero datos incompletos, category=pregunta
      expect(
        crmGateFired({ accion: null, category: 'pregunta', datosCriticosJustCompleted: false }),
      ).toBe(false)
    })
  })

  describe('por category (red anti-falso-negativo)', () => {
    it("category='datos' -> true", () => {
      expect(
        crmGateFired({ accion: null, category: 'datos', datosCriticosJustCompleted: false }),
      ).toBe(true)
    })

    it("category!='datos' + sin accion + datosCriticosJustCompleted=false -> false", () => {
      expect(
        crmGateFired({ accion: null, category: 'venta', datosCriticosJustCompleted: false }),
      ).toBe(false)
    })
  })
})
