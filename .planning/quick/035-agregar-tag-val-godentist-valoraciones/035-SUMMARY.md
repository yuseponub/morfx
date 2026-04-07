---
quick: 035
title: Agregar tag VAL en GoDentist Valoraciones al pedir fecha
date: 2026-04-07
status: complete
files_modified:
  - src/lib/agents/engine/v3-production-runner.ts
tags:
  - godentist
  - tagging
  - metricas
  - valoraciones
  - v3-runner
---

# Quick 035: Tag VAL en GoDentist al transicionar a pedir_fecha

## Objetivo

Aplicar automaticamente el tag `VAL` al contacto cuando el agente GoDentist Valoraciones ejecuta por primera vez la accion `pedir_fecha` en una sesion (justo antes del template "¡Perfecto {nombre}! ¿Para que dia te gustaria agendar tu valoracion?"). Esto alimenta el sistema de metricas (standalone "Conversation Tags to Contact" ya completado), que escucha eventos `tag.assigned` en contactos para contar valoraciones agendadas por dia.

## Cambios Realizados

### `src/lib/agents/engine/v3-production-runner.ts`

1. **Llamada al helper** (linea 153, justo despues de obtener `output` del `processMessage` y antes del paso "5. Route output to adapters"):
   ```ts
   // 4b. Side-effect: tag VAL on first pedir_fecha transition (godentist only)
   await this.applyGodentistValTagIfNeeded(input, output, accionesEjecutadas)
   ```

2. **Helper privado nuevo** `applyGodentistValTagIfNeeded` (lineas 515-573):
   - Guard 1: solo activo si `this.config.agentModule === 'godentist'`
   - Guard 2: solo activo si `input.contactId` existe
   - Deteccion de transicion nueva: compara `previousAcciones` (snapshot pre-process) vs `output.accionesEjecutadas` y aplica el tag UNICAMENTE cuando `pedir_fecha` aparece como nueva (no estaba antes, esta ahora)
   - Llama `assignTag` del domain layer con `entityType='contact'`, `tagName='VAL'`, `cascadeDepth=0`, `source='adapter'`
   - **Fail-open**: cualquier error (tag no existe, falla DB, excepcion) solo loggea con `console.warn` y NUNCA hace throw — el flujo conversacional continua sin afectacion

3. **NO se modifico nada mas**: el agente godentist (`src/lib/agents/godentist/`), el domain `src/lib/domain/tags.ts`, y el robot Railway (`godentist/robot-godentist/`) quedaron intactos. Verificado con `git diff --stat`.

## Decisiones Tomadas

### 1. Inyeccion en runner, NO en agente
**Razon**: el agente godentist (`processMessage`) es puro/stateless respecto a side-effects de DB. No recibe `contactId` en su `V3AgentInput`. El runner ya tiene `input.contactId` y `this.config.workspaceId` disponibles, y por arquitectura es el lugar correcto para I/O (agente = decision, runner = adaptadores).

### 2. Trigger por deteccion de accion NUEVA
Comparar `output.accionesEjecutadas` vs `accionesEjecutadas` del snapshot pre-process. Si `pedir_fecha` aparece en output pero NO estaba en input -> es transicion nueva -> aplicar tag. Esto garantiza que el tag se aplica UNA VEZ por sesion, aunque la idempotencia de `assignTag` (codigo 23505 = success) tambien actua como segunda barrera defensiva.

### 3. Scope multi-workspace: TODOS los workspaces godentist
Filtro: `if (this.config.agentModule === 'godentist')` — sin whitelist por `workspace_id`. El tag VAL es semanticamente propio del flujo de valoraciones godentist, asi que cualquier workspace que use el agente debe taggear.

### 4. Fail-open ante errores
Si `assignTag` retorna `success: false` (tag no existe en el workspace, error de DB) o si `import` lanza, solo se loggea `console.warn` y se continua. **El tagging es observabilidad, no parte del contrato funcional del agente.** Un fallo aqui NUNCA puede romper la conversacion con el cliente real.

### 5. SIN feature flag (Regla 6 evaluada explicitamente)
El cambio es **estrictamente aditivo**: agrega un side-effect de DB despues de que el agente ya tomo su decision. **NO modifica**:
- Templates enviados
- Logica conversacional o decisiones del response-track / sales-track
- State machine del agente
- Transitions / phase

Riesgo de afectar al cliente real: **cero** (el unico efecto observable es un tag adicional en el perfil del contacto + un evento `tag.assigned` adicional en automations). Por eso se documenta explicitamente que NO requiere feature flag a pesar de la Regla 6.

### 6. Idempotencia delegada al domain
`src/lib/domain/tags.ts::assignTag` ya maneja `error.code === '23505'` (unique violation) como success (linea ~92). Aplicar el tag dos veces es seguro.

### 7. Tipo `any[]` en parametro del helper
Para evitar import cross-package del tipo `AccionRegistrada` (que vive en `src/lib/agents/godentist/types.ts` mientras el runner es generico para todos los agentes), el parametro `previousAcciones` se tipa como `any[]` con `eslint-disable-next-line` y narrowing local via `(a: { tipo?: string }) => a.tipo === 'pedir_fecha'`. Esto preserva la separacion (runner agnostico al schema interno de cada agente).

## Verificacion Tecnica

| Check | Resultado |
|-------|-----------|
| `npx tsc --noEmit` (archivo modificado) | OK — los errores reportados son pre-existentes en tests vitest, ninguno introducido |
| `npx eslint v3-production-runner.ts` | OK — los 7 errores reportados son **todos pre-existentes** (lineas 55, 56, 141, 144, 170, 220, 400). Mi codigo nuevo usa `eslint-disable-next-line` para el unico `any[]` introducido |
| `git diff --stat src/lib/agents/godentist/` | Vacio (no se toco el agente) |
| `git diff --stat src/lib/domain/tags.ts` | Vacio (no se toco el domain) |
| `git diff --stat godentist/robot-godentist/` | Vacio (no se toco el robot) |
| Grep `applyGodentistValTagIfNeeded\|VAL` | Helper + invocacion + tagName confirmados en el archivo |

## TODO Fase 2 (futura, NO en este quick task)

**Mover el momento del tagging al COMPLETAR el agendamiento**, no al pedir la fecha. Razon: actualmente el tag VAL se aplica cuando el bot transiciona a `capturing_fecha` (esta a punto de preguntar la fecha), pero el cliente todavia podria abandonar la conversacion antes de confirmar la cita. Para metricas mas precisas de "valoraciones efectivamente agendadas", el tag deberia aplicarse cuando el agente confirma el agendamiento exitoso (probablemente despues de una accion `confirmar_cita` o cuando el robot dentos.co retorna exito).

Implementacion sugerida (Fase 2):
- Cambiar el trigger de `pedir_fecha` a una accion como `cita_confirmada` o despues de un callback exitoso del robot godentist
- Mantener el mismo patron de side-effect en el runner (NO en el agente)
- Considerar si la metrica actual (fase 1) debe coexistir como "interes en agendar" vs "agendamiento completado" (dos tags distintos)

## Verificacion en Produccion (PENDIENTE — para el usuario)

1. Esperar deploy de Vercel (push a `origin main` automatico)
2. Enviar mensaje al bot godentist en el workspace "GoDentist Valoraciones":
   - "Hola, quiero agendar una valoracion"
   - Responder con todos los datos: nombre completo, cedula, telefono, sede
   - Esperar a que el bot responda "¡Perfecto {nombre}! ¿Para que dia te gustaria agendar tu valoracion?"
3. Verificar en el CRM que el contacto AHORA tiene el tag `VAL` aplicado
4. Verificar en logs de Vercel: buscar `[V3-RUNNER][godentist] Assigned VAL tag to contact`
5. Verificar idempotencia: si el bot vuelve a transicionar a `pedir_fecha` en la misma sesion (no deberia, pero como proteccion), el tag NO se aplica de nuevo (helper detecta `wasAlreadyPresent`)
6. Verificar fail-open: en un workspace de prueba SIN el tag VAL creado, simular el flujo y confirmar que el bot responde normalmente y solo aparece `[V3-RUNNER][godentist] Could not assign VAL tag (fail-open)` en logs
7. Verificar que el sistema de metricas de valoraciones registra el evento (`tag.assigned` -> contador del dia incrementa)

## Criterios de Exito

- [x] Helper `applyGodentistValTagIfNeeded` existe en `v3-production-runner.ts`
- [x] Helper se invoca con `await` despues de `processMessage` y antes de "Route output to adapters"
- [x] Helper detecta correctamente la transicion nueva a `pedir_fecha`
- [x] Helper llama `assignTag` con parametros correctos
- [x] Helper es fail-open: errores solo loggean, nunca throw
- [x] Helper solo se activa cuando `agentModule === 'godentist'`
- [x] Build/lint sin errores nuevos
- [x] Cero cambios en agente godentist, domain/tags.ts o robot Railway
- [ ] **Verificacion en produccion** (pendiente del usuario post-deploy)
