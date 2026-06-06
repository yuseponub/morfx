# Activación per-workspace — editorial v3 (chrome + contenido + dark)

**Standalone:** ui-redesign-editorial-shell · **Decisiones:** D-01, D-08 · **Fecha:** 2026-06-06

> **Paso MANUAL post-QA. NO se auto-ejecuta.** Este documento describe cómo un operador activa
> editorial v3 en un workspace. La activación es una decisión de negocio (D-08, RESEARCH §Deferred
> "Activación de v3 en producción") y se hace a mano cuando el usuario lo decida — este plan NO toca
> producción y NO corrió ningún `UPDATE` contra la base de datos.

## Qué activa este flag

`ui_editorial_v3` es el **MISMO flag** que ya activa el contenido editorial del core (las 3 pantallas:
Conversaciones, Contactos, Pedidos) — **NO hay flag nuevo** (D-01). Con este standalone, al poner el flag
en `true` aparece TODO el ecosistema editorial JUNTO:

- **Contenido** (ya shipeado por `ui-redesign-editorial-core`): las 3 pantallas reskineadas.
- **Sidebar v3** (desktop): branch `if (v3)` con scope `theme-editorial-v3` en el `<aside>` (Opción B).
- **Mobile-nav v3** (mobile): mount nuevo `md:hidden` en el dashboard, gated v3-only (D-05b).
- **Theme toggle**: en los 3 topbars v3 (Conversaciones / Contactos / Pedidos), light/dark/system.
- **Dark refinado**: auditoría token-por-token (D-06), textura OFF en dark.

Default **OFF**, fail-closed. **Sin migración** (D-01) — es una sub-key JSONB en `workspaces.settings`.

## SQL de activación (sub-key JSONB, sin migración)

```sql
-- Activar editorial v3 (chrome + contenido + dark) en un workspace.
-- Mismo flag que el core (D-01) — sin migración, sub-key JSONB en workspaces.settings.
UPDATE workspaces
SET settings = jsonb_set(coalesce(settings,'{}'::jsonb),'{ui_editorial_v3,enabled}','true'::jsonb,true)
WHERE id = '<workspace-uuid>';
```

### Rollback (desactivar)

```sql
-- Mismo UPDATE con 'false'::jsonb. Recovery inmediato (fail-closed: el server re-resuelve el flag).
UPDATE workspaces
SET settings = jsonb_set(coalesce(settings,'{}'::jsonb),'{ui_editorial_v3,enabled}','false'::jsonb,true)
WHERE id = '<workspace-uuid>';
```

## Procedimiento recomendado (QA antes de producción)

1. **Workspace de prueba primero.** Correr el `UPDATE ... 'true'` sobre un workspace de prueba (NO un
   workspace productivo como Somnio) y validar el chrome completo.
2. **QA de las 5 superficies en light + dark** antes de decidir activación en producción:
   - **Sidebar v3** (desktop, viewport ≥ md): brand/wordmark `morf·x`, workspace switcher, nav +
     categorías, footer de usuario; tokens resuelven, sin grain doble.
   - **Mobile-nav v3** (D-05b): **abrir en viewport mobile** (< md) — el `<MobileNav v3 />` solo se
     monta en mobile (`md:hidden`) y solo si el flag está ON. Verificar el Sheet editorial, que cada
     link cierra el sheet, y el reskin con `theme-editorial-v3`.
   - **Theme toggle** en los 3 topbars v3 (Conversaciones / Contactos / Pedidos): visible, alterna
     light/dark/system.
   - **Contenido dark** de las 3 pantallas: paleta charcoal-warm fiel al mock; textura OFF en dark.
   - **Acentos en dark**: en especial el indigo de tags (override D-06 a `oklch(0.62 0.07 260)` para
     legibilidad sobre charcoal).
3. **Recién entonces** decidir activación en producción (otro `UPDATE ... 'true'` sobre el workspace
   productivo objetivo). Rollback disponible en <1 paint vía el `UPDATE ... 'false'`.

## Notas

- **No crear flag nuevo, no migración** (D-01). Reusa la infra del core (`getIsEditorialV3Enabled` en
  `src/lib/auth/editorial-v3.ts`, sin cambios).
- Para usuarios **no-v3 el dashboard sigue exactamente igual que hoy**: el sidebar v2/legacy y el header
  de marketing quedan byte-frozen (Regla 6, verificado en `REGLA6-GATE.md`), y el dashboard no-v3 NO
  monta mobile-nav (el mount es aditivo y v3-gated).
