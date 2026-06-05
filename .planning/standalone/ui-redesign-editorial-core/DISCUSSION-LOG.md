# Standalone: ui-redesign-editorial-core — Discussion Log

> **Audit trail only.** Do not use as input to planning/research/execution agents.
> Decisions live in CONTEXT.md — this log preserves alternatives considered.

**Date:** 2026-06-05
**Standalone:** ui-redesign-editorial-core
**Areas discussed:** Scope, Dark mode, Tokens reconciliation, Rollout/flag, Sidebar blast-radius, TSX usage

---

## Scope (alcance del primer tramo)

| Option | Description | Selected |
|--------|-------------|----------|
| 1 pantalla piloto (Conversaciones) | Validar pipeline en la pantalla más visible | |
| Tokens + las 3 prioritarias del HANDOFF | globals.css + Conversaciones + CRM Contactos + Pedidos | ✓ |
| Solo tokens / globals.css | Migrar fundación sin tocar pantallas | |
| Las 9 pantallas (milestone) | Rediseño total | |

**User's choice:** Tokens + las 3 prioritarias.

## Dark mode

| Option | Description | Selected |
|--------|-------------|----------|
| Sí, claro + oscuro juntos | Implementar overrides .theme-editorial.dark del handoff | ✓ |
| Solo claro por ahora | Diferir dark a ronda posterior | |

**User's choice:** Claro + oscuro juntos. **Nota:** supera la decisión "solo light v1" del CHANGELOG del handoff.

## Tokens (reconciliación con .theme-editorial vivo)

| Option | Description | Selected |
|--------|-------------|----------|
| Mergear/evolucionar preservando lo vivo | Token-a-token, sin romper Conversaciones v2 (recomendado) | |
| Reemplazo big-bang del bloque | Sustituir todo el .theme-editorial de una | ✓ |

**User's choice:** Big-bang replace. **Nota:** introduce RIESGO D-05 (Conversaciones v2 live) → el nuevo sistema DEBE aislarse bajo flag/clase nueva. Research lo resuelve.

## Rollout / protección producción

| Option | Description | Selected |
|--------|-------------|----------|
| Flag por-workspace, default OFF (SQL) | Patrón ui_inbox_v2, activación manual post-QA (recomendado) | ✓ |
| Reusar infra .theme-editorial existente | Apalancar gating actual sin flag nuevo | |
| Directo sin flag | Aplicar a todos (va contra Regla 6) | |

**User's choice:** Flag por-workspace default OFF.

## Sidebar (blast radius)

| Option | Description | Selected |
|--------|-------------|----------|
| Diferir sidebar: solo 3 content areas | Contiene el blast radius (recomendado) | ✓ |
| Incluir sidebar nuevo ahora | Más fiel pero toca los 9 módulos | |

**User's choice:** Diferir sidebar.

## Componentes TSX del handoff

| Option | Description | Selected |
|--------|-------------|----------|
| Referencia visual → portar a los reales | Markup+clases a componentes reales, preservar data wiring (recomendado) | ✓ |
| Adoptar TSX como scaffold y recablear | Base estructural + recablear datos encima | |

**User's choice:** Referencia visual → portar a los reales.

## Claude's Discretion
- Mecánica exacta del aislamiento de tema (D-05).
- Estructura de olas/tareas del plan.
- Mapeo next-themes → clase dark.

## Deferred Ideas
- Sidebar global nuevo (ronda follow-up).
- Otros 6 módulos (Agentes/Analytics/Automatizaciones/Configuración/Tareas/Landing).
- Texturas de papel al root (perf Safari).
- Estados loading/empty/error tipográficos en módulos restantes.
