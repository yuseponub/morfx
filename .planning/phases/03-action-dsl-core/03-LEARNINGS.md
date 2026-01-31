# Phase 03: Action DSL Core - Learnings

**Fecha:** 2026-01-28
**Duración:** ~57 minutos (4 plans: 17 + 17 + 12 + 11 min)
**Plans ejecutados:** 4

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| pino/pino-http import errors | El proyecto usa ESM pero pino tiene exports complejos | Usar `import pino from 'pino'` directamente, no destructuring | Verificar compatibilidad ESM de librerías antes de instalar |
| ajv-formats types missing | @types/ajv-formats no existe oficialmente | No necesita tipos separados, viene incluido con ajv-formats | Verificar si la librería incluye tipos antes de buscar @types |
| middleware.ts path wrong | El archivo estaba en root, no en src/ | Crear en `/morfx/middleware.ts` (root de Next.js) | Verificar ubicación de middleware según docs Next.js |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| JSON Schema con Ajv (no Zod) | Zod, Yup, Joi | MCP spec usa JSON Schema, AI agents lo entienden nativamente, Ajv 10x más rápido con validators compilados |
| Pino (no Winston) | Winston, Bunyan | 50k logs/sec vs 10k, JSON-first, redacción built-in |
| SHA-256 para API keys (no bcrypt) | bcrypt, argon2 | API keys son random (no diccionario), necesitamos velocidad en cada request, keys son 36+ chars |
| jose (no jsonwebtoken) | jsonwebtoken | Edge Runtime compatible, Web Crypto API |
| Placeholder handlers con _placeholder flag | Throw "not implemented" | Permite dry-run testing del flujo completo, debugging más claro |
| PHASE_X_CONTRACT comments | Separate TODO file | Inline con el código, imposible de ignorar al implementar |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| Tool Registry | Ajv formats | format: 'email' fallaba | Importar addFormats(ajv) antes de usar |
| Middleware | Supabase client | createClient no disponible en edge | Usar fetch directo a Supabase REST API para API key validation |
| logToolExecution | Supabase RLS | Insert bloqueado por RLS | Usar service role key para audit logs (system insert) |

## Tips para Futuros Agentes

### Lo que funcionó bien
- Definir schemas primero, handlers después (schema-first design)
- Crear tipos TypeScript from day 1 (types.ts fue la base de todo)
- Usar instrumentation.ts para inicialización (evita race conditions)
- Exportar barrel files (index.ts) para imports limpios
- Placeholder handlers con output estructurado (_placeholder: true)

### Lo que NO hacer
- NO usar jsonwebtoken en Edge Runtime (middleware)
- NO hacer console.log para auditoría (usar Pino estructurado)
- NO validar en runtime lo que puedes validar con schema compilado
- NO crear archivos handler separados por tool (un index.ts por módulo)
- NO olvidar `additionalProperties: false` en schemas (seguridad)

### Patrones a seguir
- Tool naming: `module.entity.action` (crm.contact.create)
- Error classes: ToolValidationError, ToolNotFoundError, PermissionError
- Logging: { event: 'tool_execution', tool_name: '...', ... }
- API responses: { success, data?, error?, details? }

### Comandos útiles
```bash
# Verificar tools registrados
curl http://localhost:3020/api/v1/tools | jq '.total'

# Verificar CRM tools específicos
curl "http://localhost:3020/api/v1/tools?module=crm" | jq '.tools[].name'

# Test dry-run execution (requiere API key)
curl -X POST http://localhost:3020/api/v1/tools/crm.contact.create \
  -H "Authorization: Bearer mfx_xxx" \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"name": "Test", "phone": "+573001234567"}, "dry_run": true}'

# Ver logs de Pino en formato legible
pnpm dev 2>&1 | pino-pretty
```

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| API key UI (crear/revocar) | Media | Phase 10 (Settings) |
| Tool execution history UI | Media | Phase 10 (Analytics) |
| Batch execution con savepoints | Baja | Post-MVP |
| Tool versioning (breaking changes) | Baja | Post-MVP |
| Rate limiting en API | Media | Pre-producción |

## Notas para el Módulo

Información específica que un agente de documentación de este módulo necesitaría saber:

- **Tool Registry es singleton** - Importar `toolRegistry` de '@/lib/tools/registry'
- **initializeTools() es idempotent** - Llamar múltiples veces es seguro
- **Handlers están en src/lib/tools/handlers/{module}/index.ts** - Buscar PHASE_X_CONTRACT
- **Toda ejecución se loguea** - Tabla tool_executions, nunca modificar datos sin log
- **API keys usan SHA-256** - Comparar hash, no plaintext
- **16 tools actualmente** - 9 CRM + 7 WhatsApp, todos placeholders
- **Validation es schema-first** - Ajv compila validators en register()

### Archivos clave del módulo
```
src/lib/tools/
├── types.ts          # Tipos base (ToolSchema, ExecutionContext, etc.)
├── registry.ts       # Singleton con validación Ajv
├── executor.ts       # Ejecución con dry-run y logging
├── init.ts           # Inicialización (llamado desde instrumentation.ts)
├── schemas/
│   ├── crm.tools.ts       # 9 schemas CRM
│   └── whatsapp.tools.ts  # 7 schemas WhatsApp
└── handlers/
    ├── crm/index.ts       # PHASE_4_CONTRACT
    └── whatsapp/index.ts  # PHASE_7_CONTRACT

src/lib/audit/
├── logger.ts         # Pino con redacción
└── tool-logger.ts    # Persist a Supabase

src/lib/auth/
└── api-key.ts        # Validación y hashing

src/app/api/v1/tools/
├── route.ts              # GET /api/v1/tools (discovery)
└── [toolName]/route.ts   # POST (execution)
```

---
*Generado al completar Phase 03. Input para entrenamiento de agentes de documentación.*
