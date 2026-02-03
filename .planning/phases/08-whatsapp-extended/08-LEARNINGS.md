# Phase 8: WhatsApp Extended - Learnings

**Fecha:** 2026-01-31
**Duracion:** ~75 minutos (9 plans, 3 waves)
**Plans ejecutados:** 9

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevencion |
|-----|-------|-----|------------|
| Migration file naming conflict | Plan especificaba 20260131000001 pero ya existia para storage_policies | Usar 20260131000002 | Siempre verificar migrations existentes con `ls supabase/migrations/` antes de nombrar |
| react-textarea-autocomplete incompatible con React 19 | Peer dependency warnings y falta de TypeScript definitions | Implementar autocomplete custom con shadcn/ui | Verificar compatibilidad React 19 antes de elegir librerias |
| Recharts no soporta CSS variables en Cell fill | Intentar usar `hsl(var(--primary))` en pie chart | Hardcodear colores hex | Documentar limitaciones de librerias de graficos |

## Decisiones Tecnicas

| Decision | Alternativas Descartadas | Razon |
|----------|-------------------------|-------|
| Form action wrapper para void return | Usar onSubmit handler | TypeScript requiere que form actions retornen void, Server Actions con ActionResult no funcionan directo |
| is_workspace_manager() function | Inline role check en policies | Patron consistente con is_workspace_member existente, reusable |
| Cost recording solo en status 'sent' | Registrar en cada webhook | Evita duplicados de delivered/read webhooks que tambien incluyen pricing |
| Custom autocomplete para slash-commands | @webscopeio/react-textarea-autocomplete | React 19 compatibility + mejor integracion shadcn/ui |
| Template names auto-cleaned | Validacion estricta con error | UX mas fluida, "My Template!" -> "my_template" automaticamente |
| Agent visibility: assigned + unassigned | Agents ven todo / Agents solo ven assigned | Permite a agentes reclamar chats sin asignar pero protege trabajo de otros |

## Problemas de Integracion

| Componente A | Componente B | Problema | Solucion |
|--------------|--------------|----------|----------|
| Server Actions | Form action prop | TypeScript type mismatch (ActionResult vs void) | Wrapper function con 'use server' que llama action y retorna void |
| 360dialog API | Template creation | Status puede tardar horas en actualizarse | Patron async: guardar local primero, luego API, sync manual |
| RLS policies | useConversations hook | Filtros del hook deben trabajar CON RLS, no contra | Documentar que RLS limita resultados, filtros solo refinan |

## Tips para Futuros Agentes

### Lo que funciono bien
- Patron de helper functions PostgreSQL (is_workspace_member, is_workspace_manager) para RLS complejo
- Migration numbering con fecha+secuencia (20260131000002) evita conflictos
- Separacion clara: RLS controla acceso, filtros UI refinan vista
- Recharts para graficos simples - area chart y pie chart funcionan bien

### Lo que NO hacer
- NO asumir que librerias npm son compatibles con React 19 - verificar peer dependencies
- NO usar CSS variables en Recharts Cell components - no funcionan
- NO registrar costos en cada status update de webhook - solo en 'sent'
- NO crear policies INSERT/DELETE para tablas manejadas por service role (message_costs, workspace_limits)

### Patrones a seguir
- Template CRUD: DB local primero, luego API externa, update status con respuesta
- Role-based visibility: SECURITY DEFINER function + RLS policies que la usan
- Form with Server Action: wrapper void-returning para TypeScript compliance
- Debounce en autocomplete (150ms) para reducir Server Action calls

### Comandos utiles
```bash
# Verificar migrations existentes antes de crear nueva
ls supabase/migrations/

# Verificar TypeScript sin ejecutar
pnpm tsc --noEmit

# Ver peer dependency warnings
pnpm install 2>&1 | grep -i peer
```

## Deuda Tecnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| Quick replies sin soporte video/audio/documents | Baja | Future enhancement |
| Supabase CLI no linkeado - migrations no validadas con db push | Media | Antes de produccion |
| Recharts colores hardcodeados | Baja | Si se cambia tema |

## Notas para el Modulo

### WhatsApp Templates
- Templates son INMUTABLES despues de enviar a Meta - solo variable_mapping editable
- Status flow: pending -> (approved | rejected) - puede tardar 1-24 horas
- Regex para variables: `/\{\{(\d+)\}\}/g` extrae {{1}}, {{2}}, etc.

### Teams y Assignment
- get_workspace_from_team() helper function para RLS de team_members
- Agentes solo ven: assigned_to = self OR assigned_to IS NULL
- DELETE conversations restringido a managers

### Cost Tracking
- Country code extraction: phone.slice(1,3) para obtener codigo pais
- Mapping: 57->CO, 1->US, 52->MX, etc.
- Billable: status === 'sent' con pricing object

### Quick Replies
- Shortcut validation: lowercase, numbers, underscores only
- Trigger en chat: "/" inicia autocomplete
- Max 5 resultados en dropdown para performance

---
*Generado al completar la fase. Input para entrenamiento de agentes de documentacion.*
