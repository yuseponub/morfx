---
phase: bold-auth0-migration
plan: 02
subsystem: bold-payment-link
tags: [bold, ux, health-check, passive-degradation, server-action, unstable_cache]
status: complete
completed: 2026-05-11
requires: ["01"]
provides:
  - checkBoldRobotHealth (server action en src/app/actions/bold.ts)
  - Polling 60s + disabled UX cuando robot esta caido
affects:
  - src/app/actions/bold.ts (append-only — funciones existentes intactas)
  - src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx
tech-stack:
  added:
    - next/cache.unstable_cache (server-side dedup 30s)
  patterns:
    - "Passive UX degradation: button disabled visualmente sin ocultarlo"
    - "Server-side cache + client polling staggered (30s + 60s = ≤90s peor caso)"
    - "AbortController 5s timeout + try/catch nunca-throws para health-check"
    - "React useEffect cleanup con cancelled flag (strict mode safe)"
key-files:
  modified:
    - src/app/actions/bold.ts (append checkBoldRobotHealth + import unstable_cache; 41 insertions)
    - src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx (23 insertions, 3 modificaciones)
decisions:
  - "D-06: degradacion UX pasiva (tooltip + disabled) en lugar de hide o error-on-click"
  - "Optimistic default robotHealthy=true para evitar flash disabled en mount"
  - "unstable_cache key 'bold-robot-health' + tag homonimo para deduplicar fetch entre operators (Pitfall 9 mitigation)"
  - "cache: 'no-store' en el fetch interno — queremos que el fetch al robot pase la red cada 30s cuando unstable_cache revalida (sino, doble cache stale-stale)"
metrics:
  duration_minutes: 8
  tasks_completed: 2
  commits: 2
  files_modified: 2
  files_created: 0
  lines_added: 64
---

# Plan 02: BOLD Robot Health-Check + Passive UX Degradation Summary

Server action `checkBoldRobotHealth` con cache 30s + polling cliente 60s deshabilita visualmente el boton "Cobrar con BOLD" cuando el robot esta caido, sin requerir accion del operador.

## Objetivo

Implementar D-06 del standalone bold-auth0-migration: cuando el robot BOLD esta caido (timeout, 5xx, env var ausente), el boton "Cobrar con BOLD" queda visualmente deshabilitado (`opacity-50 cursor-not-allowed`) con tooltip explicativo ("Temporalmente no disponible — BOLD actualizando login"). Esto evita la cascada de reportes "no funciona" cuando upstream cambie su login flow de nuevo (que fue exactamente lo que paso al migrar de Auth0 legacy a Auth0 NUL, ver Plan 01).

## Estrategia (RESEARCH §"Pattern 3")

1. **Server-side:** `checkBoldRobotHealth` envuelto en `unstable_cache({ revalidate: 30 })`. El resultado se cachea 30s entre operators — si 10 operators tienen `/whatsapp` abierto, solo 1 request hits el robot cada 30s (Pitfall 9 mitigation).
2. **Cliente:** `BoldPaymentLinkButton` hace polling cada 60s mientras esta montado y `isConfigured===true`.
3. **UX:** El boton se DESHABILITA pero NO se oculta — el operator ve que la funcion existe, solo esta pausada.

Peor caso: ~90s entre que el robot cae y todos los botones se deshabilitan (30s cache server + 60s poll cliente).

## Tareas completadas

### Task 1: Server action checkBoldRobotHealth (commit `e4e28ee`)

Files: `src/app/actions/bold.ts`

- Import `unstable_cache` de `next/cache` (linea 9, antes del `createAdminClient` existente).
- Append `checkBoldRobotHealth` al final del archivo (lineas 193-231) bajo encabezado `// 4. Check BOLD Robot Health (D-06 passive UX degradation)`.
- Funciones existentes (`saveBoldIntegration`, `getBoldIntegration`, `createPaymentLinkAction`) intactas — append-only.
- Sin auth/workspace check (Plan 03 maneja `workspaceId` para el callBoldRobot path; el health-check es publico).
- Sin DB — solo fetch publico al robot. No importa `createAdminClient` ni Supabase.
- `'use server'` directive de linea 1 cubre el export automaticamente.

Acceptance criteria (todas pasan):
- `grep -c "export const checkBoldRobotHealth" src/app/actions/bold.ts` = **1** ✓
- `grep -c "unstable_cache" src/app/actions/bold.ts` = **2** ✓ (≥2 requerido)
- `grep -c "'bold-robot-health'" src/app/actions/bold.ts` = **2** ✓ (≥1 requerido)
- `grep -c "revalidate: 30" src/app/actions/bold.ts` = **1** ✓
- `grep -c "ctl.abort" src/app/actions/bold.ts` = **1** ✓
- `grep -c "process.env.BOLD_ROBOT_URL" src/app/actions/bold.ts` = **1** ✓

### Task 2: Polling + disabled UX wiring (commit `5ee4901`)

Files: `src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx`

- **Import:** `checkBoldRobotHealth` agregado al import existente de `@/app/actions/bold`.
- **State:** `const [robotHealthy, setRobotHealthy] = useState<boolean>(true)` despues de `error` (linea 39). Default optimistic `true` para evitar flash disabled en mount inicial.
- **Polling useEffect:** Despues del listener de `bold-link-update`, ANTES del guard `if (isConfigured !== true) return null`. Skip si no esta configurado. Poll inmediato + `setInterval(poll, 60_000)`. Cleanup con `cancelled` flag + `clearInterval`.
- **Boton JSX:** `disabled={!robotHealthy}` + `title` condicional + `className` template literal que concatena `opacity-50 cursor-not-allowed` cuando `!robotHealthy`.
- **MANTENIDO** intacto: guard `if (isConfigured !== true) return null` linea 75 (ahora 76 tras los inserts). Flow de `handleSubmit`/`createPaymentLinkAction` sin cambios.

Acceptance criteria (todas pasan):
- `grep -c "robotHealthy"` = **4** ✓ (≥3 requerido — state declaration + setState + 3 JSX usages: className, disabled, title)
- `grep -c "checkBoldRobotHealth"` = **3** ✓ (≥2 requerido — import + invocation + JSDoc-style none, just two real usages)
- `grep -c "Temporalmente no disponible"` = **1** ✓
- `grep -c "BOLD actualizando login"` = **1** ✓
- `grep -c "setInterval(poll, 60_000)"` = **1** ✓
- `grep -c "opacity-50 cursor-not-allowed"` = **1** ✓
- `grep -c "isConfigured !== true"` = **2** ✓ (guard L76 + new useEffect early-return)

## Verificacion

### TypeScript (`npx tsc --noEmit`)

Pre y post Plan 02 muestran los MISMOS 2 errores en archivo NO TOCADO por este plan:

```
src/lib/domain/__tests__/conversations.test.ts(16,7): error TS7022
src/lib/domain/__tests__/conversations.test.ts(16,22): error TS7024
```

Origen: commit `307aa8d` (routing-channel-fact plan-01, 2026-05-04). Out-of-scope per executor rules — registrado en deferred-items historico. **0 errores nuevos introducidos por Plan 02.**

### ESLint

Stash-compare confirmo que el unico error de lint en el archivo del button (`src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx`) es PRE-EXISTENTE:

```
60:5  error  Calling setState synchronously within an effect can trigger cascading renders
> 60 |     syncState()
     |     ^^^^^^^^^ Avoid calling setState() directly within an effect
```

El `syncState()` al que apunta el linter esta en el `useEffect` de la linea ~60 (codigo del Plan 01, intacto). Pre-Task-2 lint = 1 problem (1 error). Post-Task-2 lint = 1 problem (1 error). **0 errores/warnings nuevos introducidos por Plan 02.**

## Deviations from Plan

Ninguna — plan ejecutado exactamente como escrito. Append-only pattern en `bold.ts` se respeto (las 3 funciones existentes intactas, garantizando cero conflicto con Plan 03 Wave 2 que tocara el call site de `createPaymentLinkAction`).

## Auth Gates

Ninguno — ambas tareas son refactor de codigo sin requerir credenciales nuevas, sin migracion DB, sin env vars nuevos.

## Threat Flags

Ninguno — el endpoint `/api/health` del robot ya existia y es publico por diseno. El cache `unstable_cache` reduce egress (mitiga Pitfall 9: health-check DDoS por polling concurrent de N operators). No se agrega nueva surface expuesta.

## Self-Check: PASSED

- FOUND: `src/app/actions/bold.ts` (Task 1)
- FOUND: `src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx` (Task 2)
- FOUND: commit `e4e28ee` en git log
- FOUND: commit `5ee4901` en git log
- FOUND: `.planning/standalone/bold-auth0-migration/02-SUMMARY.md` (este archivo)

## Commits

| Task | SHA       | Mensaje                                                                                 |
| ---- | --------- | --------------------------------------------------------------------------------------- |
| 1    | `e4e28ee` | feat(bold-auth0-migration): server action checkBoldRobotHealth con unstable_cache 30s (D-06) |
| 2    | `5ee4901` | feat(bold-auth0-migration): polling 60s + disabled UX cuando BOLD robot esta caido (D-06) |

## Next steps

- Plan 03 (Wave 2) toca el mismo `src/app/actions/bold.ts` pero solo modifica el call site existente de `createPaymentLinkAction` (~L172-179) para pasar `workspaceId: ctx.workspaceId`. **Cero conflicto** previsto con el append de Task 1.
- Push a Vercel: deferred — Plan 04 lo maneja (NO push desde aqui per execution context).
- Manual UAT post-deploy:
  1. Operator en `/whatsapp` con BOLD configurado → boton aparece habilitado (`robotHealthy=true` default)
  2. Robot caido (curl `/api/health` retorna 503 o no responde) → en <90s el boton se deshabilita visualmente con tooltip
  3. Hover sobre boton disabled → tooltip "Temporalmente no disponible — BOLD actualizando login"
  4. Robot vuelve OK → proximo poll (60s) el boton vuelve a habilitarse
  5. Network tab: una sola request a `/api/health` cada 30s sin importar cuantos operators tengan `/whatsapp` abierto (unstable_cache server-side dedup)
