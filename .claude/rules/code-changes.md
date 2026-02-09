---
description: Reglas antes de modificar cualquier archivo de codigo
globs:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "lib/**/*.ts"
  - "components/**/*.tsx"
---

# REGLAS PARA CAMBIOS DE CODIGO

## Antes de Editar CUALQUIER Archivo de Codigo

Verificar:
1. Existe un PLAN.md para la fase actual?
2. El plan fue aprobado por el usuario?
3. Estamos dentro de `/gsd:execute-phase`?

Si CUALQUIER respuesta es NO -> PARA -> Sugiere `/gsd:plan-phase`

## Excepciones Permitidas

Solo se permite editar codigo sin plan GSD en estos casos:
- Archivos en `.planning/` (documentacion del proceso)
- Archivos en `.claude/` (configuracion de Claude)
- Hotfixes criticos de produccion (requiere confirmacion explicita del usuario)

## Despues de Cambios de Codigo

SIEMPRE pushear a Vercel antes de pedir al usuario que pruebe:
```bash
git add <archivos> && git commit && git push origin main
```

## Commits

- Commits atomicos por tarea completada
- Mensaje descriptivo en espanol
- Co-authored-by Claude
- NUNCA commit de trabajo incompleto
