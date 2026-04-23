# HANDOFF — ui-redesign-dashboard-retrofit

**Lee este archivo PRIMERO al retomar en sesión limpia.**

## Situación

La mega-fase `ui-redesign-dashboard` (shipped 2026-04-23, 52 commits `33b657f..aaa01d0`) produjo ~35% fidelity al mock de Claude Design v2.1. Root cause: executors aplicaron editorial tokens sobre shadcn primitives en vez de restructurar JSX a raw HTML semantic como los mocks demandan.

El usuario hizo QA visual en Somnio (flip flag → revisar → rollback) y reportó: "es un repainting por encima, debe quedar casi idéntico en distribuciones, líneas y fonts a Claude Design". Verificado con `gsd-ui-auditor` retroactivo — audit completo en `.planning/standalone/ui-redesign-dashboard/UI-REVIEW.md`.

**Impact productivo:** cero. Flag `ui_dashboard_v2.enabled=false` en Somnio y en todos los workspaces (default). Ninguna regresión visible.

## Decisiones del usuario (2026-04-23, locked)

1. **Arrancar con CRM piloto.** Los otros 6 módulos esperan al PASS visual humano del piloto.
2. **Fresh rewrite** — descartar componentes v2 actuales. Crear archivos nuevos `*-v2.tsx` raw HTML. Ternary router en parent. Legacy preservado byte-identical.
3. **Sidebar Propuesta B** — 14 items en 4 categorías (Operación/Automatización/Análisis/Admin). NO eliminar los 6 extras (SMS/Comandos/Sandbox/Confirmaciones/Metricas/Equipo), solo re-categorizar.
4. **QA en Somnio directo** — no crear workspace dummy. Flag flip temporal → validar → rollback inmediato. Workspace UUID `a3843b3f-c337-4836-92b5-89c58bb98490`.

## Artefactos listos (commit `7086e4f`)

| Archivo | Propósito |
|---------|-----------|
| `CONTEXT.md` | D-RETRO-01..08 decisiones locked + R-RETRO-01..05 proceso corregido + scope IN/OUT |
| `01-PLAN.md` | CRM piloto con 5 tareas atómicas + mock_coverage checklist (9 secciones × status) |
| `HANDOFF.md` | Este archivo |

## Qué ejecutar en la nueva sesión

```
/gsd-execute-phase ui-redesign-dashboard-retrofit
```

El executor debe:
1. Leer `CONTEXT.md` + `01-PLAN.md` + este `HANDOFF.md` completos
2. Leer el mock `mocks/crm.html` completo (217 líneas — es tu source of truth)
3. Ejecutar Tasks 1-4 autonomous con commits atómicos
4. Task 5 = **CHECKPOINT HUMANO OBLIGATORIO** — no cerrar plan sin visual PASS del usuario

**El executor NO debe:**
- Importar `@/components/ui/*` en archivos `*-v2.tsx` del retrofit (Card/Sheet/Tabs/DataTable/Dialog/Select prohibidos en el v2 path)
- Emular el mock con Tailwind arbitrary values — usar las clases reales del mock portadas a `globals.css`
- Modificar componentes v2 shipped por la fase previa (se preservan como legacy hasta Plan 08 housekeeping)
- Push a Vercel antes de Task 5
- Flip flag en Somnio sin aviso al usuario (el flip es un paso explícito del checkpoint que usuario ejecuta)

## Estado Supabase actual (verificado 2026-04-23)

```sql
SELECT id, name,
  settings->'ui_inbox_v2'     AS inbox_v2_state,
  settings->'ui_dashboard_v2' AS dashboard_v2_state
FROM workspaces
WHERE id = 'a3843b3f-c337-4836-92b5-89c58bb98490';
-- Returns: inbox_v2_state={"enabled":true}, dashboard_v2_state={"enabled":false}
```

Flag inbox v2 está ON en Somnio (la fase inbox shipped 2026-04-22 y fue validada). Flag dashboard v2 está OFF.

## SQL para Task 5 checkpoint (flip temporal + rollback)

**Flip ON:**
```sql
UPDATE workspaces
SET settings = settings || '{"ui_dashboard_v2":{"enabled":true}}'::jsonb
WHERE id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
RETURNING id, name, settings->'ui_dashboard_v2' AS dashboard_v2_state;
```

**Rollback OFF (ejecutar post-QA siempre):**
```sql
UPDATE workspaces
SET settings = settings || '{"ui_dashboard_v2":{"enabled":false}}'::jsonb
WHERE id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
RETURNING id, name, settings->'ui_dashboard_v2' AS dashboard_v2_state;
```

Nota: `jsonb_set` con path 2-niveles tuvo comportamiento raro en Supabase durante el QA del 2026-04-23 — el operador `||` concat es predecible y funcionó correctamente. Usar siempre `||`.

## Reglas proceso corregido (R-RETRO-01..05)

1. **Raw HTML semantic, NO shadcn primitives en v2 path.** Solo `<section>`, `<article>`, `<aside>`, `<details>/<summary>`, `<table>`, `<ul>/<li>`, `<button>`, `<input>`, `<textarea>`, `<select>` nativos. Lucide icons permitidos.
2. **Port CSS del mock a `globals.css`** bajo `.theme-editorial` scope. Clases mantienen nombres del mock (`.card`, `.dict`, `.tg.red`, etc.).
3. **Mock-coverage checklist explícito** por plan. Cada sección del mock × status (implemented/deferred/waived con razón).
4. **Fresh file rewrite**, legacy intacto. Ternary router en el parent.
5. **Human visual checkpoint** entre módulos. Sin PASS humano, no avanza al siguiente plan.

## Tras el piloto CRM PASS

El usuario decide si proceder con el resto en otra sesión. Orden sugerido:
- Plan 02: Pedidos (retrofit completo con KPI strip + period chips + Calendario + kanban raw)
- Plan 03: Tareas (workspace 3-col persistente)
- Plan 04: Agentes — **BLOCKER producto**: ¿catálogo de N agentes (como mock) o stay 1-agent metrics dashboard?
- Plan 05: Automatizaciones — **BLOCKER producto**: ¿flow canvas (como mock) o stay wizard?
- Plan 06: Analytics (6 KPI cards + funnel + channel bars + multi-series chart)
- Plan 07: Configuración (secondary sidebar 248px + consolidar `/settings/*` → `/configuracion/*`)
- Plan 08: Housekeeping — borrar componentes v2 viejos shipped por fase previa + UI-REVIEW-v2 re-audit + LEARNINGS.md + Regla 4 docs update

## Referencias clave

- Audit retroactivo fase previa: `.planning/standalone/ui-redesign-dashboard/UI-REVIEW.md`
- Mocks Claude Design v2.1: `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/*.html`
- Tokens editorial: `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/colors_and_type.css`
- README handoff: `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/README.md`
- Infra shipped reusable: `src/lib/auth/dashboard-v2.ts` + `src/components/layout/dashboard-v2-context.tsx` + `src/app/(dashboard)/fonts.ts` + `src/app/(dashboard)/layout.tsx`
- `globals.css` `.theme-editorial` block existente: desde `ui-redesign-conversaciones` shipped 2026-04-22

## HEAD al momento del handoff

```
7086e4f plan(ui-redesign-dashboard-retrofit): CONTEXT + 01-PLAN CRM piloto
c1d841e docs(ui-redesign-dashboard): update STATE.md — fase cerrada 2026-04-23
aaa01d0 docs(ui-redesign-dashboard): Plan 09 SUMMARY — close out + push + flag NO activado en Somnio
...
```

Main branch: sincronizada con `origin/main` hasta `c1d841e` (Plan 09 close-out push). `7086e4f` (retrofit planning) aún NO pusheado — se pushea con el primer commit del piloto.
