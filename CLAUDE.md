# REGLAS CRITICAS - MORFX

## REGLA 0: SIEMPRE GSD COMPLETO

Este es tu PROYECTO DE VIDA. Calidad sobre eficiencia. SIN ATAJOS.

**WORKFLOW OBLIGATORIO:**
1. `/gsd:progress` - Ver estado actual
2. `/gsd:discuss-phase` - Capturar decisiones del usuario
3. `/gsd:research-phase` - Investigar SIEMPRE antes de planificar
4. `/gsd:plan-phase` - Crear plan detallado
5. `/gsd:execute-phase` - Ejecutar con commits atomicos
6. `/gsd:verify-work` - Verificar criterios de exito
7. `LEARNINGS.md` - Documentar al completar fase

**BLOQUEANTE:** No se puede hacer cambios de codigo sin plan GSD aprobado.

**PROHIBIDO:**
- Saltar pasos para "ahorrar tokens"
- Implementar sin `/gsd:plan-phase`
- Omitir `/gsd:research-phase` porque "ya se como hacerlo"
- Priorizar velocidad sobre calidad

Cuando tengas duda: PARA y sigue el proceso completo.

---

## REGLA 1: Push a Vercel

SIEMPRE pushear a Vercel despues de cambios de codigo antes de pedir pruebas al usuario:
```bash
git add <archivos> && git commit && git push origin main
```

## REGLA 2: Zona Horaria Colombia

TODA la logica de fechas usa **America/Bogota (UTC-5)**:
- DB: `timezone('America/Bogota', NOW())`
- Frontend: `toLocaleString('es-CO', { timeZone: 'America/Bogota' })`

## Regla 3: Domain Layer

TODA mutacion de datos DEBE pasar por `src/lib/domain/`.
Nunca escribir directo a Supabase desde server actions, tool handlers, action executor o webhooks.

Patron obligatorio:
- Server Action → valida auth → llama domain → revalidatePath
- Tool Handler → llama domain → retorna ToolResult
- Action Executor → llama domain con cascadeDepth
- Webhook → llama domain con source: 'webhook'

Domain SIEMPRE:
- Usa `createAdminClient()` (bypass RLS)
- Filtra por `workspace_id` en cada query
- Emite trigger de automatizacion correspondiente

---

## Comandos Esenciales

- `/gsd:progress` - Estado del proyecto y siguiente accion
- `/gsd:help` - Todos los comandos GSD disponibles
- `/gsd:plan-phase N` - Planificar fase N

## Regla 4: Documentacion Siempre Actualizada

Cada vez que hagas un cambio de codigo (feature, fix, refactor), DEBES actualizar la documentacion relevante:

1. **`docs/analysis/04-estado-actual-plataforma.md`** — Si el cambio afecta el estado de un modulo, actualiza su seccion (status, bugs, deuda tecnica)
2. **`docs/architecture/`** — Si cambias arquitectura de agentes, schema DB, o sistema retroactivo
3. **`docs/roadmap/features-por-fase.md`** — Si completas una fase o feature
4. **LEARNINGS del phase actual** — Siempre documentar bugs encontrados y patterns aprendidos
5. **Deuda Tecnica** — Si resuelves un item P0/P1/P2/P3, eliminalo de la lista. Si creas deuda nueva, agregala.

**PROHIBIDO:** Hacer merge/push sin actualizar docs afectados. El codigo y la documentacion SIEMPRE deben estar sincronizados.

---

## Stack Tecnologico

- Next.js 15 (App Router) + React 19
- TypeScript estricto
- Supabase (Auth, DB, RLS)
- Tailwind CSS
- Puerto dev: 3020
