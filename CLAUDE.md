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

## REGLA 1: Reinicio de Servidor

SIEMPRE reiniciar despues de cambios de codigo antes de pedir pruebas al usuario:
```bash
pkill -f "next dev" 2>/dev/null; sleep 2; cd morfx && npm run dev &
```

## REGLA 2: Zona Horaria Colombia

TODA la logica de fechas usa **America/Bogota (UTC-5)**:
- DB: `timezone('America/Bogota', NOW())`
- Frontend: `toLocaleString('es-CO', { timeZone: 'America/Bogota' })`

---

## Comandos Esenciales

- `/gsd:progress` - Estado del proyecto y siguiente accion
- `/gsd:help` - Todos los comandos GSD disponibles
- `/gsd:plan-phase N` - Planificar fase N

## Stack Tecnologico

- Next.js 15 (App Router) + React 19
- TypeScript estricto
- Supabase (Auth, DB, RLS)
- Tailwind CSS
- Puerto dev: 3020
