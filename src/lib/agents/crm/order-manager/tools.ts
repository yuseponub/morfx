/**
 * Order Manager Tool Definitions
 * Phase 15.6: Sandbox Evolution
 *
 * Mock data generators for dry-run mode.
 * In live mode, these are replaced by real Action DSL tool calls.
 */

import type { ToolExecution } from '@/lib/sandbox/types'

/** Generate mock contact creation result */
export function mockCreateContact(input: Record<string, unknown>): ToolExecution {
  return {
    name: 'crm.contact.create',
    input,
    result: {
      success: true,
      data: {
        id: `mock-contact-${Date.now()}`,
        nombre: input.nombre ?? input.name,
        telefono: input.telefono ?? input.phone,
        ciudad: input.ciudad ?? input.city,
        departamento: input.departamento ?? input.department,
        direccion: input.direccion ?? input.address,
        created_at: new Date().toISOString(),
      },
    },
    durationMs: Math.floor(Math.random() * 150) + 80,
    timestamp: new Date().toISOString(),
  }
}

/** Generate mock order creation result */
export function mockCreateOrder(input: Record<string, unknown>): ToolExecution {
  const pack = input.pack as string ?? '1x'
  const prices: Record<string, number> = { '1x': 77900, '2x': 109900, '3x': 139900 }

  return {
    name: 'crm.order.create',
    input,
    result: {
      success: true,
      data: {
        id: `mock-order-${Date.now()}`,
        contactId: input.contactId ?? `mock-contact-${Date.now()}`,
        pack,
        total: prices[pack] ?? 77900,
        status: 'pending',
        pipeline_stage: 'nuevo',
        created_at: new Date().toISOString(),
      },
    },
    durationMs: Math.floor(Math.random() * 200) + 100,
    timestamp: new Date().toISOString(),
  }
}

/** Generate mock tag assignment result */
export function mockAssignTag(input: Record<string, unknown>): ToolExecution {
  return {
    name: 'crm.contact.tag',
    input,
    result: {
      success: true,
      data: {
        contactId: input.contactId,
        tag: input.tag ?? 'somnio-lead',
        assigned: true,
      },
    },
    durationMs: Math.floor(Math.random() * 80) + 30,
    timestamp: new Date().toISOString(),
  }
}
