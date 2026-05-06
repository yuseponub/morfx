---
plan: 01
phase: somnio-sales-v4-runtime-wiring
wave: 0
depends_on: []
files_modified:
  - package.json
  - package-lock.json
  - src/lib/agents/engine/v4-production-runner.ts
  - src/lib/agents/engine/index.ts
addresses_decisions: [D-1, D-2, D-9, D-13, D-15, D-30]
addresses_research_pitfalls: []
autonomous: false
estimated_tasks: 3
must_haves:
  truths:
    - "Paquetes @ai-sdk/google y @ai-sdk/openai instalados con versiones lockeadas (D-9, D-30)"
    - "Env vars GOOGLE_GENERATIVE_AI_API_KEY y OPENAI_API_KEY_SALESV4 confirmadas en Vercel Production scope (D-30)"
    - "src/lib/agents/engine/v4-production-runner.ts existe — clon mecánico de v3-production-runner.ts con substituciones literales (D-13)"
    - "V4ProductionRunner importable desde @/lib/agents/engine sin errores de tipo"
    - "Cero edits a src/lib/agents/engine/v3-production-runner.ts (Regla 6 — v3 sigue intocado)"
  artifacts:
    - path: "package.json"
      provides: "Deps @ai-sdk/google y @ai-sdk/openai añadidos"
      contains: "@ai-sdk/google"
    - path: "src/lib/agents/engine/v4-production-runner.ts"
      provides: "Runner I/O para v4 (paralelo a v3-production-runner.ts)"
      contains: "export class V4ProductionRunner"
    - path: "src/lib/agents/engine/index.ts"
      provides: "Re-export del V4ProductionRunner"
      contains: "V4ProductionRunner"
  key_links:
    - from: "Webhook processor (Plan 04 wiring)"
      to: "V4ProductionRunner constructor"
      via: "import { V4ProductionRunner } from '../engine/v4-production-runner'"
      pattern: "V4ProductionRunner"
    - from: "V4ProductionRunner.processMessage"
      to: "somnio-v4 processMessage"
      via: "await import('../somnio-v4')"
      pattern: "import\\('\\.\\./somnio-v4'\\)"
---

<objective>
Wave 0 — Setup de stack mixto + V4ProductionRunner skeleton.

Este plan habilita el resto de la cadena:
1. Instalar deps `@ai-sdk/google` y `@ai-sdk/openai` (RESEARCH ya las usó con `--legacy-peer-deps` por conflict pre-existente). Sin ellas, Plan 05 model swap no compila.
2. Confirmar via human-action checkpoint que `GOOGLE_GENERATIVE_AI_API_KEY` y `OPENAI_API_KEY_SALESV4` están en Vercel Production scope. Sin ellas, deploy de Plan 04/05 fallaría con env undefined.
3. Crear `src/lib/agents/engine/v4-production-runner.ts` como clon **100% mecánico** de `v3-production-runner.ts` (D-13: cero shared helpers, cero abstract base). Substituciones literales:
   - Nombre de clase `V3ProductionRunner` → `V4ProductionRunner`
   - Comentario de archivo: "Somnio Sales Agent v3" → "Somnio Sales Agent v4"
   - Default `agentModule ?? 'somnio-v3'` → `agentModule ?? 'somnio-v4'`
   - Branches `agentModule === 'godentist' / 'godentist-fb-ig' / 'somnio-recompra' / 'somnio-pw-confirmation'` se eliminan (v4 no atiende esos agentes — solo `somnio-sales-v4`)
   - Default branch ahora hace `import('../somnio-v4')` en vez de `import('../somnio-v3/somnio-v3-agent')` y llama `processMessage(v4Input)` con el shape de V4AgentInput (no V3AgentInput)
   - NoRepetitionFilter wiring: en este Plan se mantiene EL MISMO bloque `if (process.env.USE_NO_REPETITION === 'true')` clonado verbatim — Plan 06 lo refactoriza al flag `USE_NO_REPETITION_V4` (D-16) con import path actualizado. Aceptable que Plan 01 deje el flag legacy intacto temporalmente.

D-13 razón: cuando v3 muera, simplemente borras `v3-production-runner.ts` y queda v4 limpio. Cero refactor a v3 = cero riesgo a Somnio prod durante desarrollo (Regla 6).

D-15: Rate limit bucket separado `'somnio-v4'` (si v3 runner referencia uno, v4 usa uno propio). Este plan NO toca rate-limit configuration externa — solo asegura que el runner no comparte estado mutable con v3.

agentRegistry.register(somnioV4Config) ya existe en `src/lib/agents/somnio-v4/index.ts:24` (parent shipped). Este plan NO lo duplica.

Output: V4ProductionRunner instanciable + deps + env vars confirmadas. Plan 02 puede arrancar.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md
@.planning/standalone/somnio-sales-v4/PATTERNS.md
@src/lib/agents/engine/v3-production-runner.ts
@src/lib/agents/engine/types.ts
@src/lib/agents/somnio-v4/index.ts
@src/lib/agents/somnio-v4/types.ts
</context>

<interfaces>
<!-- V3ProductionRunner public surface (clone target) -->
```typescript
// from src/lib/agents/engine/v3-production-runner.ts
export class V3ProductionRunner {
  constructor(adapters: EngineAdapters, config: EngineConfig)
  async processMessage(input: EngineInput, retryCount = 0): Promise<EngineOutput>
}
```

<!-- V4AgentInput shape (consumed by Plan 01 runner) -->
```typescript
// from src/lib/agents/somnio-v4/types.ts
import type { V4AgentInput, V4AgentOutput } from '../somnio-v4/types'
```

<!-- somnio-v4 processMessage entry -->
```typescript
// from src/lib/agents/somnio-v4/index.ts:30
export { processMessage } from './somnio-v4-agent'
// Signature: (input: V4AgentInput) => Promise<V4AgentOutput>
```

<!-- agentRegistry side-effect already present (do NOT duplicate) -->
```typescript
// from src/lib/agents/somnio-v4/index.ts:24
agentRegistry.register(somnioV4Config)
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Instalar deps AI SDK Google + OpenAI (D-9, D-30)</name>
  <files>package.json, package-lock.json</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md (§Setup ejecutado — versiones exactas testeadas)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-9, D-30)
    - package.json (estado actual de deps + scripts)
  </read_first>
  <action>
RESEARCH §Setup ejecutado lockea versiones probadas:
- `@ai-sdk/google@^3.0.67`
- `@ai-sdk/openai@^3.0.61`
- `@ai-sdk/anthropic@^3.0.43` (ya instalado, no tocar)
- AI SDK v6.0.86 (ya instalado, no tocar)

**Nota de RESEARCH:** la instalación necesitó `--legacy-peer-deps` por conflict pre-existente con `@webscopeio/react-textarea-autocomplete`. Aplicar el mismo flag.

**Comando:**
```bash
npm install @ai-sdk/google@^3.0.67 @ai-sdk/openai@^3.0.61 --legacy-peer-deps
```

Verifica que `package.json` quedó con las dos entries en `dependencies`. NO modificar otras deps.

Si `npm install` falla por otro conflict no documentado en RESEARCH:
1. Revisar el output completo
2. NO usar `--force` sin diagnosticar
3. PARA y avisa al usuario antes de seguir

Tras instalar:
```bash
npx tsc --noEmit | head -30
```
Debe compilar limpio (las nuevas deps NO se importan aún — eso pasa en Plans 02/05).
  </action>
  <verify>
    <automated>node -e "const p=require('./package.json'); if(!p.dependencies['@ai-sdk/google']) process.exit(1); if(!p.dependencies['@ai-sdk/openai']) process.exit(2); console.log('ok', p.dependencies['@ai-sdk/google'], p.dependencies['@ai-sdk/openai'])"</automated>
  </verify>
  <acceptance_criteria>
    - `package.json` contiene `"@ai-sdk/google"` con version starting con `^3.0.67` o newer
    - `package.json` contiene `"@ai-sdk/openai"` con version starting con `^3.0.61` o newer
    - `package-lock.json` actualizado (size cambió)
    - `npx tsc --noEmit` exit code 0 sin nuevos errores introducidos por estas deps
    - Cero cambios a otras deps en `package.json` (verificable con `git diff package.json` — solo aparecen las 2 nuevas líneas)
  </acceptance_criteria>
  <done>Deps instaladas, lockfile actualizado, tsc clean.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: HALT — Confirmar env vars Gemini + OpenAI custom en Vercel (D-30)</name>
  <what-built>
    Deps instaladas. Antes de seguir con clonado del runner, hay que confirmar que Vercel tiene las env vars que Plan 04 / Plan 05 van a consumir en runtime productivo.
  </what-built>
  <how-to-verify>
**STOP — Verificación de env vars en Vercel Production scope (D-30).**

Las env vars `GOOGLE_GENERATIVE_AI_API_KEY` y `OPENAI_API_KEY_SALESV4` deben existir en Vercel ANTES de que Plan 04/05 hagan deploy con el modelo swap. Si faltan, el primer turn productivo de v4 fallaría con `process.env.X is undefined` y el agent escalaría a handoff humano (lógica `requiresHuman=true` — D-11 fallback natural).

**Pasos manuales:**

1. Ir a Vercel Dashboard → Project `morfx-new` → Settings → Environment Variables
2. Filtrar Scope = "Production"
3. Confirmar las DOS variables siguientes:
   - **`GOOGLE_GENERATIVE_AI_API_KEY`** — usado por `@ai-sdk/google` (default lookup automático del provider)
   - **`OPENAI_API_KEY_SALESV4`** — sufijo `_SALESV4` deliberado (D-30) para aislar la key de v4 sub-loop de la key vieja `OPENAI_API_KEY` (KB sync, scopes restringidos). El standalone usa `createOpenAI({ apiKey: process.env.OPENAI_API_KEY_SALESV4 })` en Plan 05.
4. Si **falta alguna**, créala:
   - Google AI key: https://aistudio.google.com/app/apikey
   - OpenAI key con scopes amplios (chat.completions): https://platform.openai.com/api-keys
   - Nombre EXACTO `OPENAI_API_KEY_SALESV4` (con sufijo). NO usar `OPENAI_API_KEY` (esa es la KB sync, scopes limitados — RESEARCH §Setup).
   - Scope = "Production" (también "Preview" si quieres testear en preview branches)
5. Importante: esto **NO requiere redeploy aún** — el redeploy efectivo lo hará el push de Plan 04/05.

**Confirmar al asistente con UNA de estas respuestas:**
- "env vars OK" — ambas presentes en Production scope
- "falta GOOGLE_GENERATIVE_AI_API_KEY" — y se actuaría
- "falta OPENAI_API_KEY_SALESV4" — y se actuaría
- "falta ambas"

NO continuar al Task 3 hasta confirmación explícita.
  </how-to-verify>
  <resume-signal>Usuario escribe "env vars OK" o equivalente</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Clonar v3-production-runner.ts → v4-production-runner.ts (D-13)</name>
  <files>src/lib/agents/engine/v4-production-runner.ts, src/lib/agents/engine/index.ts</files>
  <read_first>
    - src/lib/agents/engine/v3-production-runner.ts (clone source — leer el archivo COMPLETO antes de tocar nada, son 648 líneas)
    - src/lib/agents/engine/index.ts (re-exports actuales)
    - src/lib/agents/somnio-v4/index.ts (entrypoint v4 + signature de processMessage)
    - src/lib/agents/somnio-v4/types.ts (V4AgentInput / V4AgentOutput shape)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-13 — duplicado 100%)
  </read_first>
  <action>
**A) Crear `src/lib/agents/engine/v4-production-runner.ts`** copiando byte por byte `v3-production-runner.ts` y aplicando estas substituciones literales:

| Substitución | De (v3) | A (v4) |
|---|---|---|
| Class name | `V3ProductionRunner` | `V4ProductionRunner` |
| Header comment | `Somnio Sales Agent v3` | `Somnio Sales Agent v4 (standalone: somnio-sales-v4-runtime-wiring, D-13)` |
| Default agentModule | `agentModule: this.config.agentModule ?? 'somnio-v3'` | `agentModule: this.config.agentModule ?? 'somnio-v4'` |
| Logger prefix | `[V3-RUNNER]` | `[V4-RUNNER]` |
| Type import | `import type { V3AgentInput, V3AgentOutput, ProcessedMessage } from '../somnio-v3/types'` | `import type { V4AgentInput, V4AgentOutput, ProcessedMessage } from '../somnio-v4/types'` |
| Variable types `V3AgentInput` / `V3AgentOutput` | (every occurrence) | `V4AgentInput` / `V4AgentOutput` |
| `_v3:` namespace keys in datos_capturados | (KEEP `_v3:` literal — they're stored in DB and v4 must read same keys for parity. Si v3 sessions se cierran al flip — D-38 padre — v4 arranca con sessions nuevas y los keys nuevos son irrelevantes) | (sin cambio — mantener `_v3:` literal) |
| `agentModuleAlreadyStored` check | `session.state.datos_capturados?.['_v3:agent_module']` | (sin cambio — mantener `_v3:` namespace) |

**Branches del switch en línea 153 (clone del v3 runner):** REEMPLAZAR el bloque entero por la versión v4-only:

```typescript
// 4. Call processMessage — route directly to somnio-v4 (V4 runner solo atiende somnio-sales-v4 — Regla 6)
let output: V4AgentOutput
const { processMessage } = await import('../somnio-v4')
output = await processMessage(v4Input)
```

Eliminar las branches `if (this.config.agentModule === 'godentist') / 'godentist-fb-ig' / 'somnio-recompra' / 'somnio-pw-confirmation') / else (somnio-v3)`. V4 runner solo atiende `somnio-sales-v4` — no comparte ruta con otros agentes.

**Construir `v4Input: V4AgentInput`** desde el `session.state` siguiendo el shape definido en `src/lib/agents/somnio-v4/types.ts` (clave: lee el archivo antes — algunos campos del V3 input no aplican al V4 input, ej. `accionesEjecutadas` puede tener una shape distinta `AccionRegistrada[]` vs `string[]`). Si encuentras divergencia entre V3 y V4 types que requiere transformación → adaptar inline. Si el adaptador es no-trivial (>20 líneas) → escalar como TODO comment con marcador `// TODO(v4-runtime-wiring): adapt accionesEjecutadas shape — see types.ts` y avisar al usuario.

**NoRepetitionFilter wiring (línea 280 del v3 runner):** mantener el bloque `if (process.env.USE_NO_REPETITION === 'true')` literalmente clonado por ahora. Plan 06 lo refactoriza al flag `USE_NO_REPETITION_V4` (D-16). Actualiza solo los imports si los paths cambian (probable mantener `import('../somnio/no-repetition-filter')` igual — el filter es shared).

**B) Update `src/lib/agents/engine/index.ts`** para re-exportar:

```typescript
export { V4ProductionRunner } from './v4-production-runner'
```

Mantener exports existentes (UnifiedEngine, V3ProductionRunner) intactos.

**C) Verificar zero edits a v3-production-runner.ts:**

```bash
git diff src/lib/agents/engine/v3-production-runner.ts
# expect: empty (no changes)
```

**D) Type check:**

```bash
npx tsc --noEmit 2>&1 | grep -E "v4-production-runner|V4ProductionRunner" | head -20
# expect: empty (no errors)
```

Si tsc reporta errores en `v4-production-runner.ts`:
- Si son tipos de V3AgentInput/Output que no se sustituyeron → completar substitución
- Si son shape mismatches V3 vs V4 → leer types.ts y adaptar inline
- Si son imports rotos → verificar paths
- NO suprimir errores con `as any` excepto donde el código v3 ya lo hacía (`(this.adapters.timer as any).setSessionId` — preservar verbatim)

**Anti-patterns aplicados:**
- D-13: NO crear abstract base class. NO refactorizar v3 runner. NO shared helpers nuevos.
- Regla 6: cero edits a v3-production-runner.ts. Verificable post-task con git diff.
- D-15: rate-limit bucket aislamiento. El runner NO referencia rate-limit hardcoded; el bucket vive en routes/middleware. Plan 03 (engine-v4 sandbox wrapper) ni necesita pensar en esto.
  </action>
  <verify>
    <automated>test -f src/lib/agents/engine/v4-production-runner.ts && grep -q "export class V4ProductionRunner" src/lib/agents/engine/v4-production-runner.ts && grep -q "V4AgentInput" src/lib/agents/engine/v4-production-runner.ts && grep -q "V4AgentOutput" src/lib/agents/engine/v4-production-runner.ts && grep -q "import('../somnio-v4')" src/lib/agents/engine/v4-production-runner.ts && grep -q "V4ProductionRunner" src/lib/agents/engine/index.ts && [ -z "$(git diff src/lib/agents/engine/v3-production-runner.ts)" ] && npx tsc --noEmit 2>&1 | grep -E "v4-production-runner" | grep -v "warning" | head -1 | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/agents/engine/v4-production-runner.ts` existe y compila
    - `export class V4ProductionRunner` presente
    - `V4AgentInput` y `V4AgentOutput` aparecen como tipos en el archivo (clone fidelity)
    - `import('../somnio-v4')` aparece en el archivo (route to v4 agent)
    - Cero `'godentist'` / `'somnio-recompra'` / `'somnio-pw-confirmation'` / `'somnio-v3'` literals en `v4-production-runner.ts` (excepto en `_v3:` namespace keys que se preservan en datos_capturados)
    - `src/lib/agents/engine/index.ts` exporta `V4ProductionRunner`
    - `git diff src/lib/agents/engine/v3-production-runner.ts` es vacío (Regla 6 — v3 intocado)
    - `npx tsc --noEmit` no introduce errores nuevos
  </acceptance_criteria>
  <done>V4ProductionRunner clonado y exportado.</done>
</task>

</tasks>

<verification>
- Deps añadidas a package.json (lockfile actualizado)
- Env vars confirmadas por usuario en Vercel Production
- V4ProductionRunner duplicado 100% como clase nueva (D-13)
- v3-production-runner.ts intocado (Regla 6)
- agentRegistry.register(somnioV4Config) sigue presente desde el padre (cero duplicación)
</verification>

<success_criteria>
- Plan 02 puede arrancar (schema re-shape no necesita el runner pero sí compila contra deps nuevas)
- Plan 03 (engine-v4 sandbox) y Plan 04 (webhook branch) tendrán a `V4ProductionRunner` listo para instanciar
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4-runtime-wiring/01-SUMMARY.md` con:
- Versions exactas instaladas de @ai-sdk/google y @ai-sdk/openai
- Confirmación texual del usuario en Task 2 ("env vars OK")
- Diff stats de v4-production-runner.ts (lines, similarity con v3)
- Notas de cualquier divergencia V3AgentInput vs V4AgentInput que tuvo que adaptarse
</output>
