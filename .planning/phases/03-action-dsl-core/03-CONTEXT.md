# Phase 3 Context: Action DSL Core

## Overview

**Goal:** Every operation in the system is a logged, executable tool

**Vision:** Action DSL es la base para IA Distribuida. Los agentes de IA deben poder descubrir, entender y ejecutar tools sin ambiguedad. Cada tool tiene un schema rigido que define exactamente que hace, que recibe, que devuelve, y que efectos tiene.

---

## Decisions

### 1. Tool Registry Design

**Approach: Schema-First**

Cada tool se define con un JSON Schema completo que es la fuente de verdad. Los agentes de IA (Claude, GPT, MCP) entienden JSON Schema nativamente.

```typescript
// Ejemplo de schema de tool
export const createContactTool: ToolSchema = {
  name: 'crm.contact.create',
  description: 'Crea un nuevo contacto en el CRM del workspace activo',

  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nombre completo del contacto' },
      phone: { type: 'string', description: 'Telefono con codigo de pais (+57...)' },
      email: { type: 'string', description: 'Email opcional' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags iniciales' }
    },
    required: ['name', 'phone']
  },

  returns: {
    type: 'object',
    properties: {
      contactId: { type: 'string' },
      created: { type: 'boolean' }
    }
  },

  metadata: {
    module: 'crm',
    entity: 'contact',
    action: 'create',
    reversible: false,
    requiresApproval: false,
    sideEffects: ['creates_record'],
    permissions: ['contacts:write']
  }
}
```

**Naming Convention: `module.entity.action`**

3 niveles fijos, siempre igual, inequivoco:
- `crm.contact.create`
- `crm.contact.update`
- `crm.contact.delete`
- `crm.order.create`
- `whatsapp.message.send`
- `whatsapp.template.send`

**Metadata Obligatoria:**

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| module | string | Modulo al que pertenece (crm, whatsapp, system) |
| entity | string | Entidad que manipula (contact, order, message) |
| action | string | Accion que realiza (create, update, delete, send) |
| reversible | boolean | Si la accion se puede deshacer |
| requiresApproval | boolean | Si necesita aprobacion humana antes de ejecutar |
| sideEffects | string[] | Efectos secundarios (creates_record, sends_message, triggers_webhook) |
| permissions | string[] | Permisos requeridos para ejecutar |

---

### 2. Structured Logging

**Level: Forensic Audit**

Cada ejecucion genera un log completo que permite reconstruir exactamente que paso y revertir cambios si es necesario.

```typescript
interface ToolExecution {
  id: string
  tool_name: string                    // 'crm.contact.create'

  // Inputs/Outputs
  inputs: Record<string, unknown>      // Parametros recibidos
  outputs: Record<string, unknown>     // Resultado devuelto

  // Status
  status: 'success' | 'error' | 'dry_run'
  error_message?: string
  error_stack?: string                 // Stack trace completo si hay error

  // Timing
  started_at: string
  completed_at: string
  duration_ms: number

  // Context
  user_id: string
  workspace_id: string
  session_id?: string

  // Request context (forensic)
  request_context: {
    ip?: string
    user_agent?: string
    source: 'ui' | 'api' | 'agent' | 'webhook'
  }

  // Snapshots (forensic)
  snapshot_before?: Record<string, unknown>  // Estado ANTES (para updates/deletes)
  snapshot_after?: Record<string, unknown>   // Estado DESPUES

  // Relationships
  related_executions?: string[]        // Si es parte de un batch
  batch_id?: string                    // ID del batch si aplica
}
```

**Storage:** Tabla Supabase `tool_executions` con RLS por workspace

**Retention:** Indefinido con alerta automatica a 90 dias para evaluar

**UI Visibility:** Modulo dedicado de historial/actividad (scope futuro, fuera de Phase 3)

---

### 3. Invocation API

**From UI (React components):**

Server Actions que llaman al Tool Registry internamente. Type-safe, simple.

```typescript
// src/app/actions/contacts.ts
'use server'

import { toolRegistry } from '@/lib/tools/registry'

export async function createContact(data: CreateContactInput) {
  return toolRegistry.execute('crm.contact.create', data)
}
```

**From External Agents (IA, n8n, webhooks):**

API REST dedicada con API key authentication.

```
POST /api/v1/tools/crm.contact.create
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "inputs": { "name": "Juan", "phone": "+573001234567" },
  "dry_run": false
}
```

Response:
```json
{
  "execution_id": "exec_abc123",
  "status": "success",
  "outputs": { "contactId": "contact_xyz", "created": true },
  "duration_ms": 145
}
```

**Dry-Run Mode:** Obligatorio en todos los tools

Cada tool debe soportar `dry_run: true` que:
- Valida inputs contra schema
- Verifica permisos
- Simula la ejecucion sin persistir cambios
- Devuelve lo que HARIA si se ejecutara

```typescript
// Dry-run execution
const result = await toolRegistry.execute('crm.contact.create', data, { dryRun: true })
// result.status === 'dry_run'
// result.outputs === { contactId: 'dry_run_preview', created: true }
```

**Batch Execution:** Transaccion atomica

Multiples tools en secuencia. Si uno falla, todos se revierten.

```typescript
const result = await toolRegistry.executeBatch([
  { tool: 'crm.contact.create', inputs: { name: 'Juan', phone: '+57...' } },
  { tool: 'whatsapp.message.send', inputs: { contactId: '$0.contactId', message: 'Bienvenido!' } }
], { atomic: true })

// Si whatsapp.message.send falla, crm.contact.create se revierte
```

---

## Scope Boundaries

### In Scope (Phase 3)
- Tool Registry con schema validation
- Tool schemas para operaciones CRM basicas (placeholder, se implementan en Phase 4)
- Tool schemas para operaciones WhatsApp basicas (placeholder, se implementan en Phase 7)
- Tabla `tool_executions` con logging forense
- API REST para invocacion externa
- Dry-run mode en todos los tools
- Batch execution con transacciones atomicas

### Out of Scope (Future)
- UI de historial/actividad (Phase 10 o dedicado)
- Tools reales de CRM (Phase 4)
- Tools reales de WhatsApp (Phase 7)
- MCP integration (post-MVP)
- Tool versioning (post-MVP si se necesita)

---

## Dependencies

- Phase 2 complete (workspaces, roles, permissions)
- Supabase table `tool_executions`

---

## Success Criteria Mapping

| Success Criteria | How We'll Achieve It |
|------------------|---------------------|
| Tool registry exists with list of available operations | Schema-First registry con listTools() |
| Any CRM operation can be invoked as a tool | Tool schemas definidos (handlers placeholder) |
| Any WhatsApp operation can be invoked as a tool | Tool schemas definidos (handlers placeholder) |
| Every tool execution generates structured log | Forensic logging en tool_executions |
| Tools can be discovered and invoked programmatically | REST API + registry.listTools() |

---

*Context gathered: 2026-01-28*
