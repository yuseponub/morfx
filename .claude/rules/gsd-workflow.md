---
description: Reglas GSD que aplican a TODO el proyecto
globs:
  - "**/*"
---

# GSD WORKFLOW - OBLIGATORIO SIN EXCEPCION

## Filosofia de Tokens

NO optimizar tokens a costa del proceso GSD.

- INCORRECTO: "Saltemos la investigacion para ahorrar tokens"
- CORRECTO: "Sigamos el proceso completo aunque use mas tokens"

Prioridades del proyecto:
1. Correctitud
2. Completitud
3. Calidad
4. (ultimo y distante) Eficiencia de tokens

## Pasos Obligatorios por Fase

### Antes de Planificar
- [ ] `/gsd:discuss-phase` - Capturar decisiones del usuario
- [ ] `/gsd:research-phase` - Investigar stack, patrones, pitfalls

### Antes de Implementar
- [ ] `/gsd:plan-phase` - Plan detallado con tareas atomicas
- [ ] Plan aprobado por el usuario

### Durante Implementacion
- [ ] `/gsd:execute-phase` - Seguir el plan paso a paso
- [ ] Commits atomicos por tarea completada
- [ ] Verificar cada tarea contra criterios de exito

### Al Completar Fase
- [ ] `LEARNINGS.md` - Documentar bugs, decisiones, tips
- [ ] `/gsd:verify-work` - Verificacion final

## Lo que NUNCA Hacer

1. **NUNCA** implementar sin plan GSD aprobado
2. **NUNCA** saltar `/gsd:research-phase`
3. **NUNCA** saltar `/gsd:discuss-phase`
4. **NUNCA** omitir LEARNINGS.md al completar
5. **NUNCA** priorizar velocidad sobre calidad
6. **NUNCA** decir "esto es simple, no necesita plan"

## Cuando Parar y Preguntar

Si el usuario pide:
- "Hazlo rapido" -> Recordar: calidad sobre velocidad
- "Solo hazlo" -> Preguntar: quieres que siga GSD o hay urgencia real?
- "No necesita plan" -> Explicar: todo necesita plan en este proyecto

Si Claude piensa:
- "Esto es simple" -> PARA, probablemente no lo es
- "Ya se como hacerlo" -> PARA, igual necesita research
- "Puedo ahorrar tokens" -> PARA, tokens no son restriccion aqui
