/**
 * Tests del predicate del gate CRM (standalone #2, Plan 06 Task 1).
 *
 * Cubre los 3 comportamientos <behavior> del predicate `crmGateFired` (D-02):
 *  - por accion (CRM_GATE_ACTIONS): mostrar_confirmacion/confirmar_orden -> true; pedir_datos -> false.
 *  - por newFields (SHIPPING_FIELDS): incluye 'ciudad' -> true; solo 'nombre' -> false.
 *  - por category: 'datos' -> true (red anti-falso-negativo).
 */
import { describe, it, expect } from 'vitest'
import { crmGateFired } from '../crm-gate'

describe('crmGateFired — gate amplio (D-02)', () => {
  describe('por accion (CRM_GATE_ACTIONS)', () => {
    it('mostrar_confirmacion -> true', () => {
      expect(
        crmGateFired({ accion: 'mostrar_confirmacion', newFields: [], category: 'venta' }),
      ).toBe(true)
    })

    it('confirmar_orden -> true', () => {
      expect(
        crmGateFired({ accion: 'confirmar_orden', newFields: [], category: 'venta' }),
      ).toBe(true)
    })

    it('pedir_datos -> false (no es accion CRM-gate)', () => {
      expect(
        crmGateFired({ accion: 'pedir_datos', newFields: [], category: 'venta' }),
      ).toBe(false)
    })
  })

  describe('por newFields (SHIPPING_FIELDS)', () => {
    it('newFields incluye ciudad -> true', () => {
      expect(
        crmGateFired({ accion: null, newFields: ['ciudad'], category: 'venta' }),
      ).toBe(true)
    })

    it('newFields=[nombre] -> false (nombre no es shipping)', () => {
      expect(
        crmGateFired({ accion: null, newFields: ['nombre'], category: 'venta' }),
      ).toBe(false)
    })
  })

  describe('por category (red anti-falso-negativo D-02)', () => {
    it("category='datos' -> true", () => {
      expect(crmGateFired({ accion: null, newFields: [], category: 'datos' })).toBe(true)
    })

    it("category!='datos' + sin accion + sin shipping -> false", () => {
      expect(crmGateFired({ accion: null, newFields: [], category: 'venta' })).toBe(false)
    })
  })
})
