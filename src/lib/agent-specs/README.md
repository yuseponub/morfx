# Agent Specs — Single Source of Truth por Bot

Este directorio contiene la **spec de comportamiento** de cada bot en scope del panel forensics
(`.planning/standalone/agent-forensics-panel/`).

## Bots cubiertos (piloto de 3 bots, D-01)

| Agent ID (observability) | File                      | Runtime module                       |
| ------------------------ | ------------------------- | ------------------------------------ |
| `somnio-sales-v3`        | `somnio-sales-v3.md`      | `src/lib/agents/somnio-v3/`          |
| `somnio-recompra-v1`     | `somnio-recompra-v1.md`   | `src/lib/agents/somnio-recompra/`    |
| `godentist`              | `godentist.md`            | `src/lib/agents/godentist/`          |

## Cuando editar un spec

Cada vez que el **COMPORTAMIENTO ESPERADO** de un bot cambia. NO cada vez que cambia la
implementacion — eso se captura en los tests. Esto es la version "human readable" que:

1. **El auditor AI (Plan 04 de `agent-forensics-panel`)** lee en tiempo real via
   `loadAgentSpec(agentId)` para contrastar con lo que efectivamente ocurrio en un turn.
2. **El usuario** lee cuando revisa un turn en el panel forensics y quiere recordar "que
   deberia haber hecho este bot?".

## REGLA DE SCOPE

Cada spec documenta el **scope del agente** — que PUEDE y que NO PUEDE hacer. Esto debe
mantenerse alineado con `.claude/rules/agent-scope.md` (fuente canonica para Claude Code
en planning time). Si divergen, los spec files aqui son la autoridad para el bot en
**runtime** (panel forensics + auditor).

**NO agregar comportamiento no documentado en el modulo runtime** — las specs son consolidacion,
no extension. Si falta algo en el codigo y debe estar, eso va por un plan GSD aparte.

## Reglas de edicion

- **NO es autogenerado.** Se mantiene a mano.
- **Pointers `file:line` deben ser reales.** Si mueves codigo, actualiza los pointers. El
  auditor los cita literalmente, inventar pointers contamina el output.
- **No borrar secciones.** Si una seccion no aplica a un bot, poner `(N/A)` con una nota.
- **Consolida fuentes.** Si info esta en `.claude/rules/agent-scope.md` + un
  `.planning/standalone/` + response-track.ts — copia aqui la version canonica. Este es el
  single-source-of-truth del RUNTIME.
- **No inventar.** Si no encuentras evidencia en el codigo / tests / agent-scope, NO escribas.
  Poner "(no documentado)" es mejor que adivinar.

## Bundling en Vercel

Los archivos `.md` de este directorio **NO son imports de TypeScript**. Se leen en runtime
via `fs.readFile` dentro de `/api/agent-forensics/audit` (Plan 04).

Para que Vercel los incluya en el lambda bundle, `next.config.ts` tendra (re-agregado en
Plan 04 Task 1, ver Post-ship Issue 1 de 01-SUMMARY.md):

```typescript
outputFileTracingIncludes: {
  '/api/agent-forensics/audit': ['./src/lib/agent-specs/**/*.md'],
}
```

Si agregas un bot nuevo (un 4to spec file), el glob ya lo captura — no hay que tocar
config.

## Relacion con `.claude/rules/agent-scope.md`

`.claude/rules/agent-scope.md` es autoritative para **Claude Code en planning time**. Los
spec files aqui son autoritative para el **auditor en runtime**. Deben mantenerse alineados;
si divergen, los specs aqui ganan para el bot en produccion (el auditor no lee
`.claude/rules/`).

## Pitfall 6 — PII

El auditor (Plan 04) recibe el spec + el snapshot completo del `session_state` (D-06 — sin
filtering). El snapshot puede contener `phone`, `nombre`, `direccion`, etc. Esto va al mismo
API de Anthropic que ya procesa data en produccion para los agentes conversacionales; no hay
nuevo vector de fuga respecto del estado actual. Documentado aqui para trazabilidad.

Si en el futuro se requiere redaction, hacerlo en `loadSessionSnapshot` y actualizar D-06
en DISCUSSION-LOG.md.
