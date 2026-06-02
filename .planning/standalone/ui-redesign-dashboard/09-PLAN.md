---
phase: ui-redesign-dashboard
plan: 09
type: execute
wave: 4
depends_on: ['02', '03', '04', '05', '06', '07', '08']
files_modified:
  - .planning/standalone/ui-redesign-dashboard/dod-verification.txt
  - .planning/standalone/ui-redesign-dashboard/LEARNINGS.md
  - .planning/standalone/ui-redesign-dashboard/activacion-somnio.sql
  - docs/analysis/04-estado-actual-plataforma.md
autonomous: true
requirements:
  - D-DASH-01
  - D-DASH-04
  - D-DASH-07

must_haves:
  truths:
    - "DoD grep suite ejecutada y reporte saved a `.planning/standalone/ui-redesign-dashboard/dod-verification.txt` con ≥7 checks: slate-leakage por módulo (CRM/pedidos/tareas/agentes/automatizaciones/analytics+métricas/configuración), hsl() antipattern, dark: classes audit (deuda preexistente, no fix), mx-* count ≥ 50, tsc --noEmit clean global, NO-TOUCH Regla 6 (domain/agents/automation/inngest/api/actions diff = 0), flag-OFF byte-identical guarantee verificado"
    - "DoD report retorna exit code != 0 si CUALQUIER check falla — el script bloquea continuación hasta que el executor corrija los hallazgos en el módulo correspondiente o documente excepción intencional"
    - "Verificación NO-TOUCH (D-DASH-07): `git diff main -- src/lib/domain src/lib/agents src/lib/automation src/inngest src/app/api src/app/actions src/hooks` retorna 0 líneas (la fase es UI-only — cero cambios funcionales en el dashboard)"
    - "Verificación slate scope intencional: cualquier match de `slate-(50|100|...|900)` dentro de los 7 módulos in-scope debe estar EXCLUSIVAMENTE dentro de un `cn(..., !dashV2 && '...')` o equivalente conditional fallback (clases del path flag-OFF). Cero leakage editorial dentro de la rama `dashV2 && '...'`"
    - "Verificación scope CSS: `mx-tag|mx-h[0-9]|mx-body|mx-caption|mx-smallcaps|mx-display|mx-rubric|mx-mono|mx-skeleton|mx-rule` count ≥ 50 across los 7 módulos in-scope (mínimo de adoption editorial — no token-only override)"
    - "`.planning/standalone/ui-redesign-dashboard/LEARNINGS.md` creado con 12 secciones: header (commits + LOC + dates), what shipped, 7 patterns establecidos (dictionary-table, kanban card, editorial charts, form treatments editorial, portal sweeps por primitive, module consistency guidelines, activation playbook), pitfalls evitados, deferred items, Regla 6 verification, rollout playbook (SQL flag flip), recommendations for future agents/planners, DoD evidence table, commits ranges Plan 01-09, push to Vercel hash"
    - "Cada uno de los 7 patterns en LEARNINGS incluye: contexto, decisión arquitectónica, código ejemplo, link al archivo donde se aplicó (referencia a Plan 02-08 SUMMARY o source path real)"
    - "`docs/analysis/04-estado-actual-plataforma.md` actualizado (Regla 4 — BLOQUEANTE) con sección sobre el dashboard editorial: feature flag `ui_dashboard_v2.enabled` documentado, lista de los 7 módulos re-skineados, referencia a `.planning/standalone/ui-redesign-dashboard/`, status 'IN ROLLOUT' con instrucción de flip via SQL para activación, mención explícita de coexistencia con `ui_inbox_v2.enabled` (flag separado D-DASH-03)"
    - "`.planning/standalone/ui-redesign-dashboard/activacion-somnio.sql` creado con SQL snippet idempotente listo para `psql`/Supabase Studio: `UPDATE workspaces SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{ui_dashboard_v2,enabled}', 'true'::jsonb, true) WHERE id = '<workspace-uuid>';` + snippet de rollback + instrucciones de cómo obtener el workspace-uuid de Somnio"
    - "Push único final ejecutado: `git add` + `git commit -m \"feat(ui-redesign-dashboard): close out — 7 modules editorial gated by ui_dashboard_v2.enabled\"` + `git push origin main` — Regla 1"
    - "Decisión Task 4 documentada: NO activar flag en Somnio post-push automáticamente. Esperar instrucción explícita del usuario tras QA visual lado a lado en el deployment de Vercel. Documentar en LEARNINGS el checklist de QA pre-activación (los 7 módulos navegados con flag ON + screenshot por módulo + side-by-side con flag OFF)"
  artifacts:
    - path: ".planning/standalone/ui-redesign-dashboard/dod-verification.txt"
      provides: "DoD grep + tsc + diff suite output con resultado PASS/FAIL por check"
      contains: "PASS"
    - path: ".planning/standalone/ui-redesign-dashboard/LEARNINGS.md"
      provides: "Phase learnings — 7 patterns, pitfalls, deferred, rollout, DoD evidence"
      contains: "Patterns establecidos"
    - path: ".planning/standalone/ui-redesign-dashboard/activacion-somnio.sql"
      provides: "SQL snippet activación + rollback per-workspace del flag ui_dashboard_v2.enabled"
      contains: "ui_dashboard_v2"
    - path: "docs/analysis/04-estado-actual-plataforma.md"
      provides: "Section: Dashboard editorial v2 (flag + 7 módulos + rollout playbook)"
      contains: "ui_dashboard_v2"
  key_links:
    - from: "docs/analysis/04-estado-actual-plataforma.md"
      to: ".planning/standalone/ui-redesign-dashboard/"
      via: "explicit path reference"
      pattern: "ui-redesign-dashboard"
    - from: ".planning/standalone/ui-redesign-dashboard/LEARNINGS.md"
      to: ".planning/standalone/ui-redesign-dashboard/activacion-somnio.sql"
      via: "rollout playbook references SQL snippet"
      pattern: "activacion-somnio.sql"
    - from: ".planning/standalone/ui-redesign-dashboard/dod-verification.txt"
      to: "src/app/(dashboard)/{crm,tareas,agentes,automatizaciones,analytics,metricas,configuracion}/"
      via: "grep targets"
      pattern: "src/app/\\(dashboard\\)/"
---

<objective>
Wave 4 — DoD verification + LEARNINGS + push único. Run la suite completa de grep/tsc/diff sobre los 7 módulos re-skineados (CRM, Pedidos, Tareas, Agentes, Automatizaciones, Analytics+Métricas, Configuración), extrae 7 patterns reutilizables del trabajo de Plans 02-08, actualiza el platform state doc (Regla 4), prepara el SQL snippet de activación para Somnio, y hace el push único final a Vercel.

**Purpose:** Cerrar formalmente la mega-fase. Después de este plan, el editorial dashboard v2 queda SHIPPED detrás de `ui_dashboard_v2.enabled` (flag default `false` per workspace — Regla 6), la documentación refleja el nuevo feature, y el usuario tiene un SQL snippet listo para flip cuando el QA visual en Vercel esté aprobado.

**Output:** `dod-verification.txt` con todos los checks PASS, `LEARNINGS.md` sustantivo con 7 patterns establecidos, `docs/analysis/04-estado-actual-plataforma.md` actualizado, `activacion-somnio.sql` listo para psql, push único a Vercel ejecutado, fase formalmente CLOSED.

**This plan is `autonomous: true`** — no requiere checkpoints de usuario durante ejecución (los grep checks corren solos, LEARNINGS y SQL son extracciones del trabajo previo). El único paso humano es POST-push: el usuario decide cuándo flip el flag en Somnio tras QA visual del deployment.

**Plan 09 NO modifica código de producción** (ni `src/app/(dashboard)/**`, ni `src/components/**`, ni `src/lib/**`). Solo escribe docs + SQL + ejecuta commits de cierre. Si la suite DoD detecta una violación (slate leakage, hsl antipattern, NO-TOUCH breach), el executor PARA y reporta — el fix corresponde re-abrir el plan correspondiente del módulo (02-08), no remediar inline en Plan 09.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-dashboard/CONTEXT.md
@.planning/standalone/ui-redesign-dashboard/PLAN.md
@.planning/standalone/ui-redesign-conversaciones/06-PLAN.md
@.planning/standalone/ui-redesign-conversaciones/LEARNINGS.md
@.planning/standalone/ui-redesign-conversaciones/dod-verification.txt
@.planning/standalone/ui-redesign-landing/04-PLAN.md
@.planning/standalone/ui-redesign-landing/LEARNINGS.md
@.planning/standalone/ui-redesign-landing/dod-verification.txt
@docs/analysis/04-estado-actual-plataforma.md
@CLAUDE.md
</context>

<interfaces>
<!-- Patrones canónicos heredados de fases editoriales previas. El executor de Plan 09 NO los implementa — solo los DOCUMENTA en LEARNINGS y los VERIFICA con la suite DoD. -->

**Flag resolver pattern** (heredado de `ui-redesign-conversaciones/01-PLAN.md` Plan 01):
```ts
// src/lib/auth/dashboard-v2.ts (creado en Wave 0 / Plan 01 de esta fase)
export async function getIsDashboardV2Enabled(workspaceId: string): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single();
    if (error || !data) return false;  // fail-closed
    return data.settings?.ui_dashboard_v2?.enabled === true;
  } catch {
    return false;  // fail-closed on any throw
  }
}
```

**Theme scope wrapper pattern** (heredado del bloque `.theme-editorial` en `globals.css`, ya canónico):
```tsx
// src/app/(dashboard)/layout.tsx (modificado en Wave 0 / Plan 01)
const dashV2 = await getIsDashboardV2Enabled(workspaceId);
return (
  <div className={cn(
    'flex h-screen',
    dashV2 && 'theme-editorial',
    dashV2 && fonts.serif.variable,
    dashV2 && fonts.sans.variable,
    dashV2 && fonts.mono.variable
  )} data-dashboard-v2={dashV2 ? 'true' : 'false'}>
    ...
  </div>
);
```

**Conditional rendering pattern** (`useDashboardV2()` hook + `cn(dashV2 && '...')` para gate de className editorial):
```tsx
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context';

const dashV2 = useDashboardV2();
return <button className={cn(
  'px-3 py-2 rounded',
  !dashV2 && 'bg-slate-200 hover:bg-slate-300 text-slate-900',  // flag-OFF byte-identical
  dashV2 && 'mx-tag mx-tag--ink hover:bg-[var(--paper-3)]'       // flag-ON editorial
)}>...</button>
```

**SQL flag flip idempotente** (heredado de `ui-redesign-conversaciones/LEARNINGS.md` §3.1):
```sql
-- Activar
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{ui_dashboard_v2,enabled}',
  'true'::jsonb,
  true  -- create_missing
)
WHERE id = '<workspace-uuid>';

-- Rollback
UPDATE workspaces
SET settings = jsonb_set(settings, '{ui_dashboard_v2,enabled}', 'false'::jsonb)
WHERE id = '<workspace-uuid>';
```
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: DoD grep + tsc + diff verification suite (genera dod-verification.txt)</name>
  <files>.planning/standalone/ui-redesign-dashboard/dod-verification.txt</files>
  <read_first>
    - .planning/standalone/ui-redesign-dashboard/CONTEXT.md (sección "Artefactos esperados al cierre" — listado canonical de checks)
    - .planning/standalone/ui-redesign-dashboard/PLAN.md (Wave 4 task list)
    - .planning/standalone/ui-redesign-conversaciones/dod-verification.txt (formato análogo)
    - .planning/standalone/ui-redesign-landing/dod-verification.txt (formato análogo, más reciente)
    - SUMMARY de Plans 02-08 si existen — para identificar deviations / exceptions intencionales que el grep podría flaggear como falso positivo
  </read_first>
  <action>
    Ejecuta la suite completa de DoD checks para los 7 módulos in-scope. **Cada check tiene un criterio PASS/FAIL explícito. Si CUALQUIER check FAIL, el script debe abortar con `exit 1` y reportar el módulo + tipo de violación.** El executor PARA — el fix NO se hace inline en Plan 09, sino re-abriendo el plan del módulo correspondiente.

    Define la lista canonical de módulos in-scope (excluye `whatsapp` que tiene su propio flag, y excluye `super-admin/sandbox/onboarding/create-workspace/invite` que son OUT-OF-SCOPE per CONTEXT D-DASH-04):

    ```bash
    DASH_MODULES=(
      "src/app/(dashboard)/crm"
      "src/app/(dashboard)/tareas"
      "src/app/(dashboard)/agentes"
      "src/app/(dashboard)/automatizaciones"
      "src/app/(dashboard)/analytics"
      "src/app/(dashboard)/metricas"
      "src/app/(dashboard)/configuracion"
    )
    ```

    Genera el reporte directamente al file con tee/append y captura exit code de cada check. Estructura del script:

    ```bash
    #!/usr/bin/env bash
    set +e  # NO abortar — queremos correr todos los checks y reportar al final

    REPORT=".planning/standalone/ui-redesign-dashboard/dod-verification.txt"
    FAIL_COUNT=0

    {
      echo "=== UI Redesign Dashboard — DoD Verification ==="
      echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "Executor: claude-opus-4-7 (Plan 09 Task 1, autonomous-true)"
      echo "HEAD: $(git rev-parse HEAD)"
      echo "Base: main (pre-mega-phase, base_commit 9642e36)"
      echo "Modules in-scope: crm, tareas, agentes, automatizaciones, analytics, metricas, configuracion"
      echo "Modules OUT-OF-SCOPE (per D-DASH-04): whatsapp, super-admin, sandbox, onboarding, create-workspace, invite"
      echo
    } > "$REPORT"

    # ============================================================
    # Check 1 — Slate leakage por módulo (D-DASH-04 CSS scope)
    # ============================================================
    # Cualquier match `slate-N` dentro de los 7 módulos DEBE estar dentro
    # del path flag-OFF (`!dashV2 && '...'` o equivalente conditional fallback).
    # Leakage editorial = match `slate-N` dentro de la rama `dashV2 && '...'`.
    #
    # Heuristic: para cada match, extraer la línea + 3 líneas de contexto;
    # si el contexto contiene `dashV2 &&` SIN `!dashV2`, FAIL.

    {
      echo "--- Check 1: slate-* leakage por módulo ---"
      LEAKAGE_FOUND=0
      for MOD in "${DASH_MODULES[@]}"; do
        # Buscar slate-N classes
        MATCHES=$(grep -rEn "slate-(50|100|200|300|400|500|600|700|800|900)" "$MOD" --include="*.tsx" --include="*.ts" 2>/dev/null || true)
        if [ -n "$MATCHES" ]; then
          # Filtrar: keep solo si la línea NO contiene `!dashV2` AND SÍ contiene `dashV2 &&`
          # → eso indica leakage del path editorial
          BAD=$(echo "$MATCHES" | while IFS= read -r LINE; do
            FILE=$(echo "$LINE" | cut -d: -f1)
            LINENO=$(echo "$LINE" | cut -d: -f2)
            # Leer 3 líneas antes y después para context
            CTX=$(sed -n "$((LINENO-3)),$((LINENO+3))p" "$FILE" 2>/dev/null)
            # FAIL si el contexto tiene `dashV2 &&` SIN un `!dashV2` cercano (path editorial usa slate)
            if echo "$CTX" | grep -qE "dashV2\s*&&" && ! echo "$CTX" | grep -qE "!dashV2\s*&&"; then
              echo "$LINE"
            fi
          done)
          if [ -n "$BAD" ]; then
            echo "FAIL ($MOD):"
            echo "$BAD"
            LEAKAGE_FOUND=1
          fi
        fi
      done
      if [ "$LEAKAGE_FOUND" -eq 0 ]; then
        echo "PASS: zero slate leakage en path editorial — slate-N matches están confinados a la rama flag-OFF (cn(!dashV2 && '...'))"
      else
        FAIL_COUNT=$((FAIL_COUNT+1))
      fi
      echo
    } >> "$REPORT"

    # ============================================================
    # Check 2 — hsl(var(--*)) antipattern post Tailwind v4
    # ============================================================
    {
      echo "--- Check 2: hsl(var(--*)) antipattern (post Tailwind v4 — Pitfall heredado de fase Conversaciones §3.4) ---"
      HSL_MATCHES=""
      for MOD in "${DASH_MODULES[@]}"; do
        H=$(grep -rEn "hsl\(var\(--" "$MOD" --include="*.tsx" --include="*.ts" --include="*.css" 2>/dev/null || true)
        if [ -n "$H" ]; then
          HSL_MATCHES="$HSL_MATCHES\n$H"
        fi
      done
      if [ -z "$HSL_MATCHES" ]; then
        echo "PASS: zero hsl(var(--*)) wrappers (tokens shadcn v4 son bare OKLCH, no triples HSL)"
      else
        echo "FAIL: hsl(var(--*)) detectado — bug silente, browser descarta valor:"
        echo -e "$HSL_MATCHES"
        FAIL_COUNT=$((FAIL_COUNT+1))
      fi
      echo
    } >> "$REPORT"

    # ============================================================
    # Check 3 — dark: classes audit (deuda PREEXISTENTE, no fix)
    # ============================================================
    # Esta fase NO se mete con dark mode (D-DASH-04 CONTEXT — dark mode editorial es fase futura).
    # El check anota cuántos `dark:` ya estaban antes; si el número creció en los 7 módulos,
    # FAIL (la fase introdujo dark: nuevo).
    #
    # Heurística simple: contar dark: en los módulos in-scope hoy y en main (base).
    {
      echo "--- Check 3: dark: classes audit (deuda preexistente — NO se debe agregar nuevos en flag-ON path) ---"
      DARK_HEAD=0
      DARK_BASE=0
      for MOD in "${DASH_MODULES[@]}"; do
        H=$(grep -rE "dark:" "$MOD" --include="*.tsx" 2>/dev/null | wc -l)
        DARK_HEAD=$((DARK_HEAD + H))
        # Conteo en base (main):
        for FILE in $(git ls-tree -r --name-only main -- "$MOD" 2>/dev/null | grep -E "\.tsx$"); do
          B=$(git show "main:$FILE" 2>/dev/null | grep -cE "dark:" || true)
          DARK_BASE=$((DARK_BASE + B))
        done
      done
      DELTA=$((DARK_HEAD - DARK_BASE))
      echo "dark: count en HEAD: $DARK_HEAD"
      echo "dark: count en main (base): $DARK_BASE"
      echo "delta: $DELTA"
      if [ "$DELTA" -le 0 ]; then
        echo "PASS: no se introdujeron clases dark: nuevas (delta <= 0). Las dark: preexistentes son deuda heredada — fuera de scope (D-DASH-04: dark mode editorial es fase futura)"
      else
        echo "FAIL: $DELTA clases dark: nuevas introducidas. Esta fase NO debe agregar dark mode editorial (fase futura). Revisar plan del módulo correspondiente."
        FAIL_COUNT=$((FAIL_COUNT+1))
      fi
      echo
    } >> "$REPORT"

    # ============================================================
    # Check 4 — mx-* utilities adoption count (mínimo 50)
    # ============================================================
    {
      echo "--- Check 4: mx-* utilities adoption count (mínimo 50 — adoption editorial real) ---"
      TOTAL=0
      for MOD in "${DASH_MODULES[@]}"; do
        N=$(grep -rE "mx-(tag|smallcaps|rubric|display|h[0-9]|body|caption|rule|skeleton|mono)" "$MOD" --include="*.tsx" 2>/dev/null | wc -l)
        echo "$MOD: $N"
        TOTAL=$((TOTAL + N))
      done
      echo "TOTAL mx-* references: $TOTAL"
      if [ "$TOTAL" -ge 50 ]; then
        echo "PASS: mx-* count $TOTAL >= 50"
      else
        echo "FAIL: mx-* count $TOTAL < 50 — adoption insuficiente. Revisar si los módulos están realmente re-skineados o si están solo heredando override de tokens shadcn sin usar utilities editoriales."
        FAIL_COUNT=$((FAIL_COUNT+1))
      fi
      echo
    } >> "$REPORT"

    # ============================================================
    # Check 5 — TypeScript clean global
    # ============================================================
    {
      echo "--- Check 5: tsc --noEmit clean ---"
      TSC_OUT=$(npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -E "error TS" || true)
      if [ -z "$TSC_OUT" ]; then
        echo "PASS: zero TypeScript errors fuera de node_modules"
      else
        echo "FAIL:"
        echo "$TSC_OUT"
        FAIL_COUNT=$((FAIL_COUNT+1))
      fi
      echo
    } >> "$REPORT"

    # ============================================================
    # Check 6 — Regla 6 NO-TOUCH (D-DASH-07: UI-only, cero cambios funcionales)
    # ============================================================
    {
      echo "--- Check 6: Regla 6 NO-TOUCH guard (D-DASH-07 — UI-only) ---"
      NOTOUCH_PATHS=(
        "src/lib/domain"
        "src/lib/agents"
        "src/lib/automation"
        "src/inngest"
        "src/app/api"
        "src/app/actions"
        "src/hooks"
      )
      DIFF_LINES=$(git diff main -- "${NOTOUCH_PATHS[@]}" 2>/dev/null | wc -l)
      echo "git diff main -- <NO-TOUCH paths>: $DIFF_LINES líneas"
      echo "Paths verificados:"
      for P in "${NOTOUCH_PATHS[@]}"; do echo "  - $P"; done
      if [ "$DIFF_LINES" -eq 0 ]; then
        echo "PASS: cero cambios funcionales — domain/agents/automation/inngest/api/actions/hooks bit-for-bit identical a main. Regla 6 verificada."
      else
        echo "FAIL: cambios detectados en paths NO-TOUCH. La fase debe ser UI-only (D-DASH-07). Revertir o re-abrir plan del módulo."
        echo "Detalle:"
        git diff main --stat -- "${NOTOUCH_PATHS[@]}" 2>/dev/null | tee -a "$REPORT"
        FAIL_COUNT=$((FAIL_COUNT+1))
      fi
      echo
    } >> "$REPORT"

    # ============================================================
    # Check 7 — Flag-OFF byte-identical guarantee
    # ============================================================
    # Estrategia: build the dashboard layout snapshot del path flag-OFF.
    # Como no podemos screenshot programático sin browser, verificamos via heurística:
    # cualquier archivo .tsx en los 7 módulos cuya diff vs main NO esté envuelta en
    # `cn(..., dashV2 && ...)` o `useDashboardV2()` indica un cambio universal
    # (afecta ambos paths flag-ON y flag-OFF) — POTENCIAL regresión flag-OFF.
    #
    # Excepción permitida: cambios universales aditivos (aria-labels, ARIA roles,
    # bug fixes pre-existentes — mismo pattern que ui-redesign-conversaciones).
    # Documentar excepciones explícitas en LEARNINGS Task 2.
    {
      echo "--- Check 7: flag-OFF byte-identical guarantee (D-DASH-04 + Regla 6) ---"
      UNIVERSAL_CHANGES=0
      for MOD in "${DASH_MODULES[@]}"; do
        FILES_CHANGED=$(git diff --name-only main -- "$MOD" 2>/dev/null)
        for FILE in $FILES_CHANGED; do
          # Skip non-tsx
          [[ "$FILE" =~ \.tsx?$ ]] || continue
          # Get diff hunks: si hay cambios añadidos (+) que NO contienen `dashV2`, `useDashboardV2`,
          # `theme-editorial`, `mx-`, `aria-`, `role=` → potencial cambio universal
          DIFF_BODY=$(git diff main -- "$FILE" 2>/dev/null | grep -E "^\+[^+]" | grep -vE "dashV2|useDashboardV2|theme-editorial|mx-|aria-|role=|//.*comment|^\+\s*$")
          if [ -n "$DIFF_BODY" ]; then
            LINE_COUNT=$(echo "$DIFF_BODY" | wc -l)
            echo "  AUDIT ($FILE): $LINE_COUNT líneas añadidas no obviamente flag-gated:"
            echo "$DIFF_BODY" | head -10 | sed 's/^/    /'
            UNIVERSAL_CHANGES=$((UNIVERSAL_CHANGES + LINE_COUNT))
          fi
        done
      done
      if [ "$UNIVERSAL_CHANGES" -eq 0 ]; then
        echo "PASS: todos los cambios .tsx en los 7 módulos están flag-gated (dashV2/useDashboardV2/theme-editorial/mx-/aria-/role=). Flag-OFF path byte-identical."
      else
        echo "AUDIT: $UNIVERSAL_CHANGES líneas añadidas sin gating obvio. Revisar caso por caso:"
        echo "  - Si son aria-labels / ARIA roles / bug fixes pre-existentes → universal positive, documentar en LEARNINGS sección 'Universal positives'"
        echo "  - Si son cambios visuales que afectan flag-OFF → regresión, REVERTIR o gateaar"
        echo "Este check NO es bloqueante por sí solo (universals positives son legítimos), pero EL EXECUTOR DEBE listar cada caso en LEARNINGS Task 2 sección §6."
      fi
      echo
    } >> "$REPORT"

    # ============================================================
    # Resumen final
    # ============================================================
    {
      echo "=== Summary ==="
      echo "Check 1 (slate leakage en path editorial):      $([ $LEAKAGE_FOUND -eq 0 ] && echo PASS || echo FAIL)"
      echo "Check 2 (hsl(var(--*)) antipattern):            $([ -z \"$HSL_MATCHES\" ] && echo PASS || echo FAIL)"
      echo "Check 3 (dark: delta <= 0):                     $([ $DELTA -le 0 ] && echo PASS || echo FAIL)"
      echo "Check 4 (mx-* count >= 50):                     $([ $TOTAL -ge 50 ] && echo PASS || echo FAIL)"
      echo "Check 5 (tsc --noEmit clean):                   $([ -z \"$TSC_OUT\" ] && echo PASS || echo FAIL)"
      echo "Check 6 (Regla 6 NO-TOUCH = 0 diff):            $([ $DIFF_LINES -eq 0 ] && echo PASS || echo FAIL)"
      echo "Check 7 (flag-OFF byte-identical AUDIT):        $([ $UNIVERSAL_CHANGES -eq 0 ] && echo PASS || echo "AUDIT — see LEARNINGS §6")"
      echo
      echo "FAIL_COUNT: $FAIL_COUNT"
      if [ "$FAIL_COUNT" -gt 0 ]; then
        echo "STATUS: BLOCKED — re-abrir plan del módulo violador y corregir."
        echo "Plan 09 NO modifica código de producción. Fixes inline NO permitidos."
      else
        echo "STATUS: PASS — proceder a Task 2 (LEARNINGS)."
      fi
    } >> "$REPORT"

    cat "$REPORT"

    # Exit code propagado: si FAIL_COUNT > 0, return 1 para que el executor PARE
    exit $FAIL_COUNT
    ```

    Guarda el script anterior como bloque `bash -c '...'` o crea un archivo temporal `dod-suite.sh`. Ejecútalo. Si exit code != 0, DETENTE — reporta los hallazgos al usuario y NO procedas a Task 2/3/4. El usuario decide si:
    - Re-abrir plan del módulo violador (acción correcta).
    - Documentar excepción intencional + override del check (acción rara — solo si el grep es false-positive verificable).

    Si exit code == 0, procede a Task 2.

    **Importante:** el script usa `git diff main` — asegúrate que la base remota `main` está al día (`git fetch origin main` antes si hay duda). Si el worktree de la fase está merged a main pero no pulled, los diffs salen incorrectos.
  </action>
  <verify>
    <automated>test -f .planning/standalone/ui-redesign-dashboard/dod-verification.txt && grep -q "STATUS: PASS" .planning/standalone/ui-redesign-dashboard/dod-verification.txt && ! grep -q "FAIL_COUNT: [1-9]" .planning/standalone/ui-redesign-dashboard/dod-verification.txt</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/standalone/ui-redesign-dashboard/dod-verification.txt` exists con los 7 checks ejecutados.
    - Cada check tiene una resolución explícita (PASS / FAIL / AUDIT).
    - `FAIL_COUNT: 0` y `STATUS: PASS` al final del reporte.
    - Si CUALQUIER check FAIL, el executor detiene Plan 09 y reporta — no procede a Tasks 2/3/4.
    - Si Check 7 retorna AUDIT con cambios universales, esos cambios deben listarse en LEARNINGS §6 en Task 2.
  </acceptance_criteria>
  <done>DoD suite ejecutada, reporte saved a dod-verification.txt, todos los checks PASS (o AUDIT documentado para Check 7). Si FAIL, Plan 09 detenido y se reporta al usuario para escalación al plan del módulo violador.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Crear LEARNINGS.md con 7 patterns establecidos + DoD evidence + commits ranges</name>
  <files>.planning/standalone/ui-redesign-dashboard/LEARNINGS.md</files>
  <read_first>
    - .planning/standalone/ui-redesign-dashboard/dod-verification.txt (output de Task 1)
    - .planning/standalone/ui-redesign-dashboard/CONTEXT.md (todas las decisiones D-DASH-01..18)
    - .planning/standalone/ui-redesign-dashboard/PLAN.md (estructura wave + scope por plan)
    - SUMMARY de Plans 02-08 si existen (para extraer patterns reales aplicados, deviations, commits SHAs)
    - .planning/standalone/ui-redesign-conversaciones/LEARNINGS.md (formato análogo más cercano — usar como template)
    - .planning/standalone/ui-redesign-landing/LEARNINGS.md (formato análogo secundario)
    - .planning/standalone/ui-redesign-conversaciones/CONTEXT.md (referencia a flags / patterns ya canonical en conversaciones, para cross-link)
  </read_first>
  <action>
    Crear `.planning/standalone/ui-redesign-dashboard/LEARNINGS.md` con estructura narrativa sustantiva — NO checklist vacío, NO bullets sin contenido. Cada sección debe extraer aprendizaje real del trabajo de Plans 01-08 (no del template).

    Estructura obligatoria (12 secciones):

    ---

    **Header (top del file):**
    ```markdown
    # LEARNINGS — Standalone `ui-redesign-dashboard` (mega-fase)

    **Phase type:** UI re-skin editorial multi-módulo behind feature flag per-workspace (Regla 6).
    **Dates:** 2026-04-23 a YYYY-MM-DD (Plan 01 → Plan 09).
    **Plans:** 9 (01 infra → 02 CRM → 03 Pedidos → 04 Tareas → 05 Agentes → 06 Automatizaciones → 07 Analytics+Métricas → 08 Configuración → 09 close-out).
    **Waves:** 4 (Wave 0 infra → Wave 1 CRM+Pedidos+Tareas paralelo → Wave 2 Agentes+Automatizaciones paralelo → Wave 3 Analytics+Configuración paralelo → Wave 4 close).
    **Commits totales:** N en `main` (extraer rango con `git log --oneline <base_commit>..HEAD | wc -l`).
    **LOC delta:** +X / -Y (neto +Z). 7 módulos re-skineados + infra Wave 0 (sidebar+header+layout+fonts+flag+context).
    **Status:** ✅ SHIPPED detrás de `workspaces.settings.ui_dashboard_v2.enabled` flag (default `false`). Activación pendiente del primer workspace post-QA visual del usuario.
    **Base commit:** 9642e36 (post landing realignment).
    ```

    ---

    **§1. Phase overview — qué entregó:**

    Resumen de los 7 módulos re-skineados + infra. Cita los archivos clave creados (con paths reales — `src/lib/auth/dashboard-v2.ts`, `src/components/layout/dashboard-v2-context.tsx`, `src/app/(dashboard)/fonts.ts`, `src/app/(dashboard)/layout.tsx`, `src/components/layout/sidebar.tsx`). Para cada módulo, una línea que diga el approach editorial principal aplicado (e.g., "CRM — dictionary-table pattern para listados, detail drawer ledger-style").

    ---

    **§2. Decisiones locked (D-DASH-01..18) — las de mayor leverage:**

    Listar las 5-7 decisiones más impactful del CONTEXT y explicar el RESULTADO real:
    - D-DASH-01 (flag maestro): cómo se implementó, dónde vive el resolver.
    - D-DASH-02 (activación unitaria): justificación validated by experience — la coherencia visual se hubiera roto si activamos solo 3/7.
    - D-DASH-04 (scope path-based): consecuencias prácticas del scope amplio + cómo se manejaron los OUT-OF-SCOPE (super-admin/sandbox/onboarding) que pueden romperse visualmente con flag ON.
    - D-DASH-07 (UI-only — Regla 6): verificable en Check 6 del reporte DoD (0 líneas diff).
    - D-DASH-09 (shadcn primitives extendidos aditivamente): qué primitives terminaron extendiéndose (probable: dialog, sheet, select además de dropdown-menu/popover heredados de conversaciones).
    - D-DASH-10 (modals tema-respetuosos): cuántos portales se re-rootearon en total a través de los 7 módulos.

    ---

    **§3. Patterns establecidos (los 7 obligatorios — cada uno con contexto + decisión + código + link a archivo donde se aplicó):**

    Esta sección es la MÁS IMPORTANTE del LEARNINGS. Cada uno de los 7 patterns debe tener:
    1. **Contexto:** qué problema motivó el pattern.
    2. **Decisión arquitectónica:** qué se eligió y por qué (alternativas descartadas).
    3. **Código ejemplo:** snippet real (15-30 líneas) extraído del codebase.
    4. **Link al archivo donde se aplicó:** path + plan SUMMARY que lo introdujo.

    Los 7 patterns:

    ### 3.1 Dictionary-table pattern (D-DASH-11)

    Contexto: tablas en CRM/Pedidos/Tareas-list/Analytics necesitaban un look editorial unified.
    Decisión: `<table>` con border-collapse, `<th>` smallcaps rubric-2 uppercase 9-11px tracking-0.08em, `<td>` serif 13-14px ink-1/ink-2, border-bottom ink-4, hover paper-1, active row border-left 2px rubric-2.
    Código: extraer del primer archivo donde se aplicó (probable `src/app/(dashboard)/crm/contactos/components/contacts-table.tsx`).
    Link: `Plan 02 SUMMARY` + path real.

    ### 3.2 Kanban card pattern (D-DASH-12)

    Contexto: Tareas (kanban 4-col) y Pedidos (kanban opcional) necesitaban cards editoriales consistentes.
    Decisión: `<article>` paper-0 + border ink-1 + shadow-stamp (0 1px 0 ink-1), header serif 15px weight 600, body serif 13px ink-2, footer mono 11px ink-3 + tags `.mx-tag--*`. Column headers smallcaps rubric-2 + count mono.
    Código: extraer del primer archivo donde se aplicó.
    Link: `Plan 04 SUMMARY` + path real.

    ### 3.3 Editorial charts pattern (D-DASH-13)

    Contexto: Analytics+Métricas usan Recharts (o similar). Default es slate, hostil al theme editorial.
    Decisión: axes ink-3, grid lines ink-4 alpha 20%, font sans 11px, series colors en order rubric-2 → accent-gold → accent-verdigris → accent-indigo → ink-2. Background paper-0 + border ink-1 + shadow-stamp.
    Código: snippet del wrapper `<EditorialChart>` o config object aplicado a Recharts.
    Link: `Plan 07 SUMMARY` + path real.

    ### 3.4 Form treatments editorial (D-DASH-14)

    Contexto: Forms en Configuración/Automatizaciones builder/Tareas detail. Inputs slate por default — disonancia visual.
    Decisión: inputs/selects/textareas con border ink-1 rounded-[3px] paper-0 bg, focus ring ink-1 (no slate), labels smallcaps rubric-2 10-11px tracking-0.12em uppercase, error state border rubric-2. Buttons primary = rubric-2 press, secondary = ink-1 outline, destructive = rubric-1 outline.
    Código: snippet del primer form re-skineado (probablemente Configuración).
    Link: `Plan 08 SUMMARY` + path real.

    ### 3.5 Portal sweeps por primitive — método sistemático

    Contexto: Radix UI portals (DropdownMenu, Popover, Select, Dialog, Sheet, Tooltip, HoverCard) default a `document.body`, fuera del scope `.theme-editorial`. Conversaciones ya extendió `dropdown-menu` y `popover`; esta fase necesita extender más primitives.
    Decisión: aplicar el mismo pattern aditivo (`portalContainer?: HTMLElement | null` opcional) a los primitives que aparezcan en los 7 módulos. Sweep al final de cada wave: `grep -rnE 'DropdownMenu|Popover|Select|HoverCard|Dialog|Tooltip|Sheet' src/app/\\(dashboard\\)/<module>/`. Re-rootear o documentar como intentional-slate exclusion.
    Código: lista de los primitives que se extendieron en esta fase + el patrón canónico aplicado.
    Link: enumerar los SUMMARY donde aparece cada extensión + commits SHA.

    ### 3.6 Module consistency guidelines

    Contexto: 7 módulos re-skineados en paralelo en 3 waves. Riesgo: divergencia estilística entre módulos (CRM hace tabla con un padding, Pedidos otro; Agentes usa shadow-stamp diferente al de Tareas, etc.).
    Decisión: el bloque `.theme-editorial` en `globals.css` es la fuente de verdad. NO definir tokens nuevos por módulo — todos heredan los mismos tokens (`--paper-0..3`, `--ink-1..4`, `--rubric-1..3`, `--accent-*`). Los módulos solo combinan utilities `mx-*` y aplican `cn(dashV2 && '...')` con clases Tailwind arbitrary basadas en var().
    Lista de "valores canonical" que TODOS los módulos respetan:
    - Border radius: `3px` (forms), `4px` (cards), `xl` (drawer cards heredado de inbox).
    - Shadow stamp: `0 1px 0 var(--ink-1)`.
    - Border thickness: `1px` (default), `2px` (active rail), `3px` (active rail rubric-2 — sólo selected items).
    - Font sizes serif: 13px (body), 14px (body-large), 15-16px (card titles), 19-20px (section h3), 24-26px (page h1), 28+ (display rare).
    Link: cada SUMMARY confirma adherence o flag desviation.

    ### 3.7 Activation playbook (rollout per-workspace)

    Contexto: D-DASH-02 dice "activación unitaria" — los 7 módulos se prenden juntos. Necesitamos un playbook claro.
    Decisión:
    1. Pre-activación QA: el usuario navega los 7 módulos con flag OFF (screenshot baseline) → flip flag a ON via SQL → navega los 7 módulos con flag ON (screenshot lado a lado).
    2. Para CADA módulo, verificar:
       - No horizontal overflow en 1280px / 1024px.
       - Funcional intacto (CRUD básico de cada módulo: crear/editar/listar — Regla 6 ya garantiza por NO-TOUCH, pero confirmar visualmente).
       - Modales/sheets se ven editoriales (portal sweep funcionó).
       - Charts (Analytics) renderean correctamente con paleta editorial.
    3. Post-QA, decisión usuario: activar productivamente o revertir.
    4. Activación productiva: SQL flip per-workspace (snippet `activacion-somnio.sql`).
    5. Rollback: instant via SQL flip a `false` (cero downtime, cero migración).
    Link: `activacion-somnio.sql` (creado en Task 3).

    ---

    **§4. Pitfalls evitados:**

    Lista de errores que casi se cometen y cómo se evitaron:
    - Pitfall heredado: `hsl(var(--token))` antipattern post Tailwind v4 — verificable Check 2 del reporte DoD.
    - Pitfall de scope: tentación de aplicar `.theme-editorial` en `<html>` o `<body>` para "ahorrar wrappers" → ROMPE OUT-OF-SCOPE modules (super-admin/sandbox). Solución: scope al wrapper del `(dashboard)/layout.tsx`.
    - Pitfall de portals: extender Tailwind v4 con `@theme` anidado dentro del scope → NO funciona (Pitfall heredado). Solución: CSS custom properties + override de tokens shadcn.
    - Pitfall de dark mode: `next-themes` aplica `.dark` global → puede invertir el editorial. Solución: `.theme-editorial { color-scheme: light }` + override defensivo `.dark .theme-editorial`.
    - Pitfall de fonts: `<input>/<textarea>/<select>` no heredan font-family por default (user-agent stylesheet). Solución: explicit `[font-family:var(--font-sans)]` en form controls.
    - Pitfall de form controls: si el módulo tiene form complejo (Automatizaciones builder con muchos inputs), tentación de hacer un wrapper component custom. NO necesario — clases Tailwind arbitrary `[border:1px_solid_var(--ink-1)]` resuelven.

    ---

    **§5. Scope deviations caught & justified:**

    Si durante Plans 02-08 hubo deviations del plan original (extensiones de primitives no anticipadas, refactor de un componente, fix de bug pre-existente), listarlas aquí. Mismo formato que conversaciones LEARNINGS §6:
    - Trigger
    - Fix
    - Justification (Rule 1 bug, Rule 2 missing semantic, Rule 3 blocker)
    - Commit SHA

    ---

    **§6. Universal positives (cambios aditivos que aplican CON y SIN flag):**

    Cualquier cambio universal detectado por Check 7 del reporte DoD AUDIT que sea legítimamente positivo (aria-labels, ARIA roles, bug fixes pre-existentes). Listar archivo + naturaleza del cambio + justificación.

    Si Check 7 retornó AUDIT > 0 y los cambios NO son universales positives, esto indica una violación del flag-OFF byte-identical guarantee. EN ESE CASO, esta sección debe documentar la decisión: revertir, gateaer, o aceptar como deuda con justificación.

    ---

    **§7. Deferrals:**

    Items que NO entraron en esta fase y futuras fases:
    - **Brand component `<Brand />`** — heredado de conversaciones; sigue diferido (la fase actual aplicó wordmark `morf·x` directo en sidebar pero no abstrajo a `<Brand />` reusable).
    - **Modales/sheets internos NO re-skineados** — listar cualquier modal específico que quedó intentional-slate (e.g., NewConversationModal para CRM si existe, ImportContactsDialog, etc.) por ser fuera de scope o por requerir refactor estructural fuera del scope className-only.
    - **Mobile responsive <1024px** — esta fase enfoca ≥1024px (CONTEXT D-DASH-04). Mobile dashboard es fase futura.
    - **Dark mode editorial** — fuera de scope (ver Pitfall §4).
    - **Sistema de microanimaciones** — mocks son estáticos.
    - **OUT-OF-SCOPE modules con flag ON** (super-admin, sandbox, onboarding, create-workspace, invite) — pueden verse rotos visualmente con flag ON. Si surge necesidad, fase `ui-redesign-dashboard-extras` con `[data-theme-override="slate"]` en sus layouts.
    - **Admin UI para flipear flag sin SQL** — operativo, no frecuente. Standalone separado low-priority.
    - **i18n del dashboard editorial** — copy preservado donde keys existen (D-DASH-18); textos nuevos hardcoded en español. Standalone i18n posterior.

    ---

    **§8. Regla 6 verification:**

    Cita Check 6 del reporte DoD verbatim. Lista los paths NO-TOUCH verificados. Conclusión: cero riesgo de regresión productiva al activar el flag — ningún hook, realtime, action handler, webhook, agent, automation runner, ni domain function fue modificado.

    ---

    **§9. Rollout playbook:**

    Mismo contenido que §3.7 pero más práctico — comandos SQL listos para copy-paste, instrucciones de cómo obtener workspace UUID de Somnio (`SELECT id, name FROM workspaces WHERE name ILIKE '%somnio%';`), pasos de QA visual ordenados.

    Reference al archivo `activacion-somnio.sql` creado en Task 3.

    ---

    **§10. Recommendations for future agents/planners:**

    Para futuras fases UI editoriales:
    1. **Reutilizar el bloque `.theme-editorial` canónico** — NO crear `.theme-{module}` paralelos. La consistencia es el valor.
    2. **Adoptar el patrón flag resolver server-side** mirror de `getIsDashboardV2Enabled()`. Fail-closed try/catch.
    3. **Adoptar `<XContext>` + `useX()` hook** para gate de NEW JSX sin prop drilling — más limpio que `v2={true}` propagado por niveles.
    4. **Sweep de Radix portals al final de cada wave** — grep canonical, re-rootear o documentar exclusion.
    5. **Mock pixel-perfect vs grid alignment** — documentar decisión por valor en UI-SPEC ANTES de execution.
    6. **Universal aria-labels + ARIA roles** — aplicar con/sin flag. Mejora a11y para TODOS los usuarios.
    7. **Auditar `hsl(var(--token))` bugs pre-existentes** en cada módulo nuevo antes de empezar — universal positive.
    8. **Para módulos con muchos forms (Configuración, Automatizaciones builder):** invertir tiempo en una pasada inicial de form treatments (D-DASH-14) ANTES de re-skinear el resto del módulo. Los inputs son los más visibles cuando rompen el theme.

    ---

    **§11. DoD evidence (cita verbatim los resultados de Task 1):**

    | # | Check | Result |
    |---|-------|--------|
    | 1 | Slate leakage en path editorial | PASS / FAIL (de Task 1) |
    | 2 | hsl(var(--*)) antipattern | PASS / FAIL |
    | 3 | dark: delta ≤ 0 | PASS / FAIL |
    | 4 | mx-* count ≥ 50 (count: N) | PASS / FAIL |
    | 5 | tsc --noEmit clean | PASS / FAIL |
    | 6 | Regla 6 NO-TOUCH (= 0 diff) | PASS / FAIL |
    | 7 | Flag-OFF byte-identical AUDIT | PASS / AUDIT (con detalle §6) |

    ---

    **§12. Commits ranges:**

    | Plan | Range | Notas |
    |------|-------|-------|
    | 01 (Wave 0 infra) | `<sha-range>` | Flag + fonts + layout + sidebar + header + context |
    | 02 (CRM) | `<sha-range>` | Dictionary-table pattern primer aplicación |
    | 03 (Pedidos) | `<sha-range>` | Status pills + ledger detail |
    | 04 (Tareas) | `<sha-range>` | Kanban cards primer aplicación |
    | 05 (Agentes) | `<sha-range>` | Agent cards + prompt editor |
    | 06 (Automatizaciones) | `<sha-range>` | Canvas + inspector + builder forms |
    | 07 (Analytics+Métricas) | `<sha-range>` | Editorial charts primer aplicación |
    | 08 (Configuración) | `<sha-range>` | Settings + integrations + form treatments masivo |
    | 09 (close-out) | `<sha-range>` (this plan) | DoD + LEARNINGS + platform doc + SQL + push |

    Reemplazar `<sha-range>` con valores reales: `git log --oneline <plan-base>..<plan-tip> | head -20`.

    **Push a Vercel:** ejecutado YYYY-MM-DD vía `git push origin main` al final de Task 4 (ver `09-SUMMARY.md` para el hash final).

    ---

    Crea el archivo. Verifica que cada sección tiene contenido sustantivo (no `[TODO]` placeholders en el final). Si no tienes datos reales para una sección (e.g., si Plans 02-08 no shipped aún en este worktree), infiere el contenido desde el PLAN.md / CONTEXT.md y marca explícitamente "anticipated — pending Plan NN execution" para que el usuario no se confunda. Mejor un LEARNINGS pre-poblado con anticipated values + TODO de actualización que un LEARNINGS hueco.
  </action>
  <verify>
    <automated>test -f .planning/standalone/ui-redesign-dashboard/LEARNINGS.md && grep -q "Patterns establecidos" .planning/standalone/ui-redesign-dashboard/LEARNINGS.md && grep -q "Dictionary-table" .planning/standalone/ui-redesign-dashboard/LEARNINGS.md && grep -q "Kanban card" .planning/standalone/ui-redesign-dashboard/LEARNINGS.md && grep -q "Editorial charts" .planning/standalone/ui-redesign-dashboard/LEARNINGS.md && grep -q "Form treatments" .planning/standalone/ui-redesign-dashboard/LEARNINGS.md && grep -q "Portal sweeps" .planning/standalone/ui-redesign-dashboard/LEARNINGS.md && grep -q "Module consistency" .planning/standalone/ui-redesign-dashboard/LEARNINGS.md && grep -q "Activation playbook" .planning/standalone/ui-redesign-dashboard/LEARNINGS.md && grep -q "Rollout playbook" .planning/standalone/ui-redesign-dashboard/LEARNINGS.md && grep -q "Deferrals" .planning/standalone/ui-redesign-dashboard/LEARNINGS.md && grep -q "Regla 6 verification" .planning/standalone/ui-redesign-dashboard/LEARNINGS.md && grep -q "DoD evidence" .planning/standalone/ui-redesign-dashboard/LEARNINGS.md && grep -q "Commits ranges" .planning/standalone/ui-redesign-dashboard/LEARNINGS.md</automated>
  </verify>
  <acceptance_criteria>
    - LEARNINGS.md existe con las 12 secciones (header + §1..§12).
    - §3 (Patterns establecidos) tiene los 7 patterns obligatorios cada uno con: contexto + decisión + código snippet + link a archivo.
    - §11 (DoD evidence) cita verbatim los resultados de Task 1.
    - §12 (Commits ranges) tiene placeholders `<sha-range>` reemplazados por valores reales (extraídos con `git log --oneline`).
    - El archivo NO tiene `[TODO]` o `<placeholder>` sin reemplazar.
    - Tono y profundidad similar a `ui-redesign-conversaciones/LEARNINGS.md` (no checklist hueco).
  </acceptance_criteria>
  <done>LEARNINGS.md creado con contenido sustantivo. 7 patterns documentados con código real. DoD evidence + commits ranges populados.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Update docs/analysis/04-estado-actual-plataforma.md (Regla 4) + crear activacion-somnio.sql</name>
  <files>
    docs/analysis/04-estado-actual-plataforma.md
    .planning/standalone/ui-redesign-dashboard/activacion-somnio.sql
  </files>
  <read_first>
    - docs/analysis/04-estado-actual-plataforma.md (full file — buscar dónde está la sección de UI / Conversaciones editorial agregada en fase ui-redesign-conversaciones; el dashboard editorial debe ir al lado o en sección hermana)
    - .planning/standalone/ui-redesign-dashboard/CONTEXT.md (lista de los 7 módulos in-scope)
    - .planning/standalone/ui-redesign-conversaciones/LEARNINGS.md §3.1 (SQL flag flip pattern canónico — copiar y solo cambiar el namespace)
  </read_first>
  <action>
    **Paso 1 — Crear `.planning/standalone/ui-redesign-dashboard/activacion-somnio.sql`:**

    ```sql
    -- ============================================================
    -- UI Editorial Dashboard v2 — Activación per-workspace
    -- ============================================================
    -- Standalone: .planning/standalone/ui-redesign-dashboard/
    -- Flag: workspaces.settings.ui_dashboard_v2.enabled (boolean, JSONB)
    -- Default: false (Regla 6 — NO afecta producción hasta activación explícita)
    -- Scope: 7 módulos (CRM, Pedidos, Tareas, Agentes, Automatizaciones,
    --        Analytics+Métricas, Configuración).
    --        NO incluye /whatsapp (ese tiene su propio flag ui_inbox_v2.enabled).
    -- ============================================================

    -- ============================================================
    -- PASO 1: Identificar el workspace UUID de Somnio
    -- ============================================================
    -- Ejecutar primero para confirmar el ID:
    SELECT id, name, settings->'ui_inbox_v2' AS inbox_v2_state, settings->'ui_dashboard_v2' AS dashboard_v2_state
    FROM workspaces
    WHERE name ILIKE '%somnio%';

    -- Reemplazar <workspace-uuid> en los snippets siguientes con el id real.
    -- Ejemplo histórico (no garantizado actual): 'a3843b3f-c337-4836-92b5-89c58bb98490'

    -- ============================================================
    -- PASO 2: Activar (idempotente — usa create_missing=true para crear
    --         la llave intermedia 'ui_dashboard_v2' si no existe)
    -- ============================================================
    UPDATE workspaces
    SET settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{ui_dashboard_v2,enabled}',
      'true'::jsonb,
      true  -- create_missing — necesario si la llave 'ui_dashboard_v2' no existe aún
    )
    WHERE id = '<workspace-uuid>';

    -- Verificar:
    SELECT id, name, settings->'ui_dashboard_v2' AS dashboard_v2_state
    FROM workspaces
    WHERE id = '<workspace-uuid>';
    -- Esperado: dashboard_v2_state = {"enabled": true}

    -- ============================================================
    -- PASO 3: Rollback inmediato (si QA visual descubre regresión)
    -- ============================================================
    UPDATE workspaces
    SET settings = jsonb_set(settings, '{ui_dashboard_v2,enabled}', 'false'::jsonb)
    WHERE id = '<workspace-uuid>';

    -- Verificar rollback:
    SELECT id, name, settings->'ui_dashboard_v2' AS dashboard_v2_state
    FROM workspaces
    WHERE id = '<workspace-uuid>';
    -- Esperado: dashboard_v2_state = {"enabled": false}

    -- ============================================================
    -- NOTAS
    -- ============================================================
    -- 1. La activación tiene efecto inmediato — el resolver server-side
    --    `getIsDashboardV2Enabled(workspaceId)` lee el flag en cada page load
    --    del segment (dashboard).
    -- 2. NO hay migración de schema asociada — solo flip del JSONB.
    -- 3. Si Somnio ya tiene ui_inbox_v2 activo, la coexistencia es soportada:
    --    {ui_inbox_v2: {enabled: true}, ui_dashboard_v2: {enabled: true}}
    --    es válida y esperada (D-DASH-03).
    -- 4. Para activación masiva (todos los workspaces premium, etc.) sin tocar
    --    cada uno: WHERE clause más amplia. NO recomendado sin QA per-workspace.
    -- 5. Admin UI para flipear el flag sin SQL: deferred a standalone separado.
    ```

    **Paso 2 — Update `docs/analysis/04-estado-actual-plataforma.md`:**

    Localizar la sección donde está el `ui_inbox_v2` (agregada por fase ui-redesign-conversaciones — Plan 06 Task 3). El dashboard editorial debe ir **inmediatamente después** o en una nueva subsección hermana del módulo correspondiente.

    Agregar:

    ```markdown
    ### UI Editorial Dashboard v2 (in rollout — 2026-04-23)

    **Standalone:** `.planning/standalone/ui-redesign-dashboard/`
    **Status:** SHIPPED detrás de feature flag — flag default `false` per workspace (Regla 6).

    **Feature flag:** `workspaces.settings.ui_dashboard_v2.enabled` (boolean, JSONB).
    **Coexistencia:** independiente de `ui_inbox_v2.enabled`. Un workspace puede tener uno sin el otro (D-DASH-03). Caso típico Somnio: hoy tiene `ui_inbox_v2=true` y `ui_dashboard_v2=false`. Post-QA de esta fase, se activan ambos.

    **Activación per workspace (manual, via SQL — admin UI deferred):**
    Snippet completo en `.planning/standalone/ui-redesign-dashboard/activacion-somnio.sql`.

    Resumen:
    ```sql
    UPDATE workspaces
    SET settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{ui_dashboard_v2,enabled}',
      'true'::jsonb,
      true
    )
    WHERE id = '<workspace-uuid>';
    ```

    **Rollback:**
    ```sql
    UPDATE workspaces
    SET settings = jsonb_set(settings, '{ui_dashboard_v2,enabled}', 'false'::jsonb)
    WHERE id = '<workspace-uuid>';
    ```

    **Módulos re-skineados (7):**
    - **CRM** (`src/app/(dashboard)/crm/`) — dictionary-table para listados de contactos/productos, detail drawer ledger-style.
    - **Pedidos** (`src/app/(dashboard)/crm/pedidos/`) — status pills editorial, timeline con rule ornaments, ledger detail sheet.
    - **Tareas** (`src/app/(dashboard)/tareas/`) — kanban 4-col paper-0 + border ink-1, detail sheet con timeline + checklist.
    - **Agentes** (`src/app/(dashboard)/agentes/`) — agent cards header nombre+status dot, prompt editor con typography editorial, stats grandes serif.
    - **Automatizaciones** (`src/app/(dashboard)/automatizaciones/`) — flow canvas con nodes bordered ink-1 paper-0, inspector paper-2 + lista lateral.
    - **Analytics + Métricas** (`src/app/(dashboard)/analytics/` + `metricas/`) — metric cards + charts editorial (axes ink-3, series rubric-2 + accent-*).
    - **Configuración** (`src/app/(dashboard)/configuracion/`) — settings pages + integrations (cards paper-2 + status badges editorial) + users.

    **Infraestructura compartida (Wave 0):**
    - `src/lib/auth/dashboard-v2.ts` — server-side flag resolver `getIsDashboardV2Enabled(workspaceId)` (fail-closed try/catch).
    - `src/app/(dashboard)/fonts.ts` — loader EB Garamond + Inter + JetBrains Mono via `next/font/google` (per-segment preload).
    - `src/app/(dashboard)/layout.tsx` — wrapper conditional `theme-editorial` + font vars basado en flag.
    - `src/components/layout/sidebar.tsx` — re-skin editorial conditional gated (paper-1 bg, smallcaps section labels, ink-1 border, rubric-2 active state, wordmark `morf·x`).
    - `src/components/layout/header.tsx` — editorial treatment conditional (si existe el componente).
    - `src/components/layout/dashboard-v2-context.tsx` — `DashboardV2Provider` + `useDashboardV2()` hook para propagación sin prop drilling.

    **CSS:**
    - `src/app/globals.css` — bloque `.theme-editorial` heredado de fase Conversaciones (sin cambios estructurales; tokens canónicos reutilizados). Cero cambios nuevos al globals.

    **Out-of-scope (deferred):**
    - Módulos `whatsapp` (tiene su propio flag `ui_inbox_v2.enabled`), `super-admin`, `sandbox`, `onboarding`, `create-workspace`, `invite` — estos pueden romperse visualmente con flag ON (D-DASH-04). Si surge necesidad, fase `ui-redesign-dashboard-extras` con `[data-theme-override="slate"]` en sus layouts.
    - Mobile responsive <1024px — fase futura.
    - Dark mode editorial — fuera de scope.
    - Sistema de microanimaciones — fuera de scope.
    - Admin UI para flipear flag sin SQL — operativo, no frecuente. Standalone separado low-priority.
    - i18n del dashboard editorial — keys preservadas donde existían; textos nuevos hardcoded en español (D-DASH-18).

    **Stack additivo cero npm packages.** Las 3 fuentes ya están en uso por la fase Conversaciones; el next/font/google las cachea entre segments.

    **Reglas verificadas:**
    - Regla 6 (proteger agente productivo + dashboard productivo): cero cambios en `src/lib/domain`, `src/lib/agents`, `src/lib/automation`, `src/inngest`, `src/app/api`, `src/app/actions`, `src/hooks`. Verificable via `git diff main` en lista NO-TOUCH (Check 6 del DoD reporte).
    - Regla 1 (push a Vercel): commits de Plans 01-09 pusheados.
    - Regla 4 (docs): este documento actualizado.
    - Coexistencia con flag inbox v2 (D-DASH-03): un workspace puede tener uno, otro, ambos o ninguno activo.

    **DoD verification:** `.planning/standalone/ui-redesign-dashboard/dod-verification.txt` (7 checks: slate leakage por módulo, hsl antipattern, dark audit, mx-* count, tsc, Regla 6 NO-TOUCH, flag-OFF byte-identical).

    **LEARNINGS:** `.planning/standalone/ui-redesign-dashboard/LEARNINGS.md` (7 patterns establecidos + pitfalls + deferred + rollout playbook).
    ```

    **Paso 3 — Footer del documento:** actualizar la línea de "Última actualización" o equivalente al final del file con la fecha actual.

    Verifica que los grep checks de la sección `<verify>` retornan los matches esperados.
  </action>
  <verify>
    <automated>test -f .planning/standalone/ui-redesign-dashboard/activacion-somnio.sql && grep -q "ui_dashboard_v2" .planning/standalone/ui-redesign-dashboard/activacion-somnio.sql && grep -q "create_missing" .planning/standalone/ui-redesign-dashboard/activacion-somnio.sql && grep -q "ui_dashboard_v2" docs/analysis/04-estado-actual-plataforma.md && grep -q "ui-redesign-dashboard" docs/analysis/04-estado-actual-plataforma.md && grep -q "Regla 6" docs/analysis/04-estado-actual-plataforma.md && grep -q "D-DASH-03" docs/analysis/04-estado-actual-plataforma.md</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/standalone/ui-redesign-dashboard/activacion-somnio.sql` existe con SQL idempotente (create_missing=true) + snippet de rollback + instrucciones para obtener workspace UUID.
    - File `docs/analysis/04-estado-actual-plataforma.md` actualizado con sección dedicated al dashboard editorial v2.
    - Sección documenta: flag name, scope (7 módulos listed), coexistencia con `ui_inbox_v2.enabled` (D-DASH-03), SQL activación + rollback, infraestructura Wave 0 (5+ archivos), out-of-scope items, Reglas 1/4/6 verificadas, links a `dod-verification.txt` y `LEARNINGS.md`.
    - Footer del documento con fecha de actualización.
  </acceptance_criteria>
  <done>activacion-somnio.sql creado y listo para psql/Supabase Studio. docs/analysis/04-estado-actual-plataforma.md updated con sección dashboard editorial v2 (Regla 4 satisfied).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Commit único + push a Vercel + documentar decisión activación Somnio</name>
  <files></files>
  <read_first>
    - .planning/standalone/ui-redesign-dashboard/dod-verification.txt
    - .planning/standalone/ui-redesign-dashboard/LEARNINGS.md
    - .planning/standalone/ui-redesign-dashboard/activacion-somnio.sql
    - docs/analysis/04-estado-actual-plataforma.md
  </read_first>
  <action>
    **Paso 1 — Confirmar status del worktree:**

    ```bash
    git status
    ```

    Esperar exactamente estos 4 archivos modified/new (de Tasks 1, 2, 3):
    - `.planning/standalone/ui-redesign-dashboard/dod-verification.txt` (NEW)
    - `.planning/standalone/ui-redesign-dashboard/LEARNINGS.md` (NEW)
    - `.planning/standalone/ui-redesign-dashboard/activacion-somnio.sql` (NEW)
    - `docs/analysis/04-estado-actual-plataforma.md` (MODIFIED)

    Si hay cualquier OTRO archivo modificado, PARAR — investigar (puede ser leftover de Plans 02-08 que no fueron mergeados, o cambios accidentales).

    **Paso 2 — Stage explícito (NO `git add -A` ni `git add .` — Regla de seguridad):**

    ```bash
    git add .planning/standalone/ui-redesign-dashboard/dod-verification.txt
    git add .planning/standalone/ui-redesign-dashboard/LEARNINGS.md
    git add .planning/standalone/ui-redesign-dashboard/activacion-somnio.sql
    git add docs/analysis/04-estado-actual-plataforma.md
    ```

    **Paso 3 — Commit único de cierre:**

    ```bash
    git commit -m "$(cat <<'EOF'
    feat(ui-redesign-dashboard): close out — 7 modules editorial gated by ui_dashboard_v2.enabled

    Wave 4 cierre de la mega-fase. DoD suite (7 checks) ejecutada y
    archivada en dod-verification.txt: slate leakage scoping verified,
    hsl(var(--*)) antipattern PASS, dark: delta <= 0, mx-* adoption count
    above threshold, tsc --noEmit clean, Regla 6 NO-TOUCH (= 0 diff en
    domain/agents/automation/inngest/api/actions/hooks), flag-OFF byte-
    identical guarantee verificado.

    LEARNINGS.md sustantivo con 7 patterns establecidos:
    dictionary-table, kanban card, editorial charts, form treatments,
    portal sweeps por primitive, module consistency guidelines, activation
    playbook. Pitfalls heredados de fase Conversaciones (hsl antipattern,
    @theme nesting, dark mode override) prevenidos.

    Platform doc (docs/analysis/04-estado-actual-plataforma.md) actualizado
    (Regla 4) con sección dashboard editorial v2: flag, 7 modulos, infra
    Wave 0, out-of-scope, coexistencia con ui_inbox_v2 (D-DASH-03), SQL
    snippet activacion-somnio.sql.

    Fase 'ui-redesign-dashboard' SHIPPED detrás de
    workspaces.settings.ui_dashboard_v2.enabled (default false, Regla 6).
    Activación per-workspace via SQL (snippet idempotente con
    create_missing=true en activacion-somnio.sql). Rollback inmediato via
    flag flip a false (cero downtime, cero migración).

    NO se activa el flag en Somnio en este push. Esperar instrucción
    explícita del usuario tras QA visual del deployment de Vercel
    navegando los 7 módulos lado a lado (flag OFF baseline -> flag ON
    editorial). Checklist de QA pre-activación documentado en
    LEARNINGS §3.7 + §9 Rollout playbook.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    EOF
    )"
    ```

    **Paso 4 — Push a Vercel (Regla 1):**

    ```bash
    git push origin main
    ```

    Capturar el hash final del commit:
    ```bash
    git rev-parse HEAD
    ```

    **Paso 5 — Documentar decisión activación Somnio en LEARNINGS:**

    Edit `.planning/standalone/ui-redesign-dashboard/LEARNINGS.md` para appendear (al final de §9 Rollout playbook o como subsección §9.1):

    ```markdown
    ### §9.1 Decisión post-push: activación Somnio

    **Estado al cierre del Plan 09 (YYYY-MM-DD):** flag `ui_dashboard_v2.enabled` NO activado en ningún workspace. El push a Vercel commit `<sha>` solo deja el código disponible — el comportamiento productivo (todos los workspaces ven dashboard slate actual) es 100% byte-identical al `main` pre-fase.

    **Por qué NO se activa automáticamente en Somnio post-push:**
    1. La fase es mega — 7 módulos re-skineados. Hay riesgo no-cero de detalle visual roto en algún módulo que el grep no detecta (e.g., un overflow en chart de Analytics, un dropdown que quedó slate, un modal que portal-sweep no cubrió).
    2. Somnio es un workspace **productivo con cliente real** (no morfx-dev). Activar sin QA visual del usuario incumple el espíritu de Regla 6.
    3. La activación es un **paso operativo de 1 query SQL** — no necesita ser parte del code commit.

    **Checklist QA pre-activación (el usuario decide cuándo ejecutar):**

    1. Identificar workspace UUID de Somnio:
       ```sql
       SELECT id, name FROM workspaces WHERE name ILIKE '%somnio%';
       ```
    2. **Baseline screenshots (flag OFF — estado actual):**
       - Para CADA uno de los 7 módulos, navegar y screenshot:
         - `/crm` (listado contactos + un contacto detail)
         - `/crm/pedidos` (listado + un pedido detail)
         - `/tareas` (kanban + lista + detail de una tarea)
         - `/agentes` (lista + un agent detail con prompt editor)
         - `/automatizaciones` (lista + builder de una automation)
         - `/analytics` (dashboard principal con charts)
         - `/metricas` (vista métricas)
         - `/configuracion` (cada subsección — integraciones, whatsapp, users, etc.)
    3. **Activar flag** vía `activacion-somnio.sql` PASO 2.
    4. **Reload + screenshots flag-ON:** mismas vistas, lado a lado con baseline.
    5. **Verificación funcional smoke** (en cada módulo): crear/editar/listar el recurso principal funciona.
    6. **Verificación crossover:** desde `/whatsapp` (que ya tenía `ui_inbox_v2.enabled=true`) confirma que la transición a otros módulos es coherente — no hay flash slate ni font swap visible.
    7. Si todo OK → mantener flag activado. Si CUALQUIER regresión → rollback inmediato vía `activacion-somnio.sql` PASO 3 + reportar el módulo afectado.

    **Si el QA descubre regresión menor:** documentar en debug `.planning/debug/<descripción>.md`, dejar flag activado si la regresión es estética y no funcional (puede esperar fix), o rollback si es funcional/visible.

    **Cuándo activar productivamente en otros workspaces:** después que el flag haya estado activo en Somnio por al menos 1-2 semanas sin reports negativos, y solo después de QA equivalente per-workspace.
    ```

    Después de editar el LEARNINGS, hacer un segundo commit pequeño SOLO con esa adición:

    ```bash
    git add .planning/standalone/ui-redesign-dashboard/LEARNINGS.md
    git commit -m "$(cat <<'EOF'
    docs(ui-redesign-dashboard): documentar decisión NO activar flag en Somnio post-push

    Activación queda diferida a instrucción explícita del usuario tras QA
    visual lado a lado en Vercel deployment. Checklist QA pre-activación
    detallado en LEARNINGS §9.1.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    EOF
    )"

    git push origin main
    ```

    **Paso 6 — Verificación final:**

    ```bash
    # Confirmar que ambos commits estén en origin/main
    git log --oneline origin/main -5

    # Verificar que el flag NO está activo en NINGÚN workspace (defensa final)
    # NOTA: este es informacional, no requiere acción. El flag default es false.
    # El usuario puede correr esta query manualmente para confirmar:
    # SELECT id, name, settings->'ui_dashboard_v2' FROM workspaces WHERE settings->'ui_dashboard_v2' IS NOT NULL;
    ```

    Reportar al usuario:
    - Hash del commit principal (close-out).
    - Hash del segundo commit (decisión activación).
    - Confirmación push exitoso a `origin/main`.
    - Recordatorio: el flag está OFF en producción. Esperando instrucción del usuario para activar en Somnio (vía `activacion-somnio.sql`).
  </action>
  <verify>
    <automated>git log --oneline origin/main -2 | grep -q "ui-redesign-dashboard.*close out" && git log --oneline origin/main -2 | grep -q "activación.*Somnio\|activacion.*Somnio" && git diff origin/main HEAD --stat | wc -l | grep -q "^0$" || git diff origin/main HEAD --stat 2>&1 | head -1</automated>
  </verify>
  <acceptance_criteria>
    - Working tree limpio antes del primer commit (solo los 4 archivos esperados de Tasks 1-3).
    - Stage explícito archivo por archivo (NO `git add -A`).
    - Primer commit con mensaje conventional `feat(ui-redesign-dashboard): close out — 7 modules editorial gated by ui_dashboard_v2.enabled`.
    - LEARNINGS.md actualizado con §9.1 (decisión NO activar flag en Somnio).
    - Segundo commit con la adición §9.1.
    - `git push origin main` ejecutado exitosamente — ambos commits visibles en `origin/main`.
    - Flag `ui_dashboard_v2.enabled` permanece OFF en producción (default).
    - Reporte final al usuario incluye: hashes de los 2 commits, confirmación de push, y recordatorio del paso operativo pendiente (SQL flip).
  </acceptance_criteria>
  <done>Push único final ejecutado (Regla 1). Fase formalmente CLOSED. Flag NO activado en Somnio — esperando QA visual del usuario en Vercel deployment + instrucción explícita para flip via `activacion-somnio.sql`.</done>
</task>

</tasks>

<verification>
After all 4 tasks:

1. `dod-verification.txt` existe con 7 checks ejecutados, todos PASS (o Check 7 AUDIT documentado).
2. `LEARNINGS.md` existe con 12 secciones sustantivas — 7 patterns documentados con código real, DoD evidence inline, commits ranges populated, decisión activación Somnio en §9.1.
3. `activacion-somnio.sql` existe con SQL idempotente (`create_missing=true`) + rollback + instrucciones UUID lookup.
4. `docs/analysis/04-estado-actual-plataforma.md` actualizado con sección dashboard editorial v2 (flag + 7 módulos + coexistencia D-DASH-03 + SQL refs + Reglas verificadas).
5. 2 commits creados: close-out principal + decisión activación. Ambos pushed a `origin/main`.
6. Flag `ui_dashboard_v2.enabled` permanece OFF en producción (default).
7. Fase formalmente CLOSED.
</verification>

<success_criteria>
- DoD §16 dashboard checklist verificado: 7 checks ejecutados con resultado explícito en `dod-verification.txt`.
- `docs/analysis/04-estado-actual-plataforma.md` refleja el nuevo feature dashboard editorial v2.
- `LEARNINGS.md` captura 7 patterns + pitfalls + deferred + rollout + DoD evidence + commits ranges + decisión activación.
- `activacion-somnio.sql` listo para `psql` / Supabase Studio (idempotente con `create_missing=true`).
- 2 commits + push único a Vercel (Regla 1).
- Flag NO activado automáticamente — Regla 6 honored, esperando instrucción del usuario.
- Reglas 1, 4, 6 verificadas explícitamente.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-dashboard/09-SUMMARY.md` with:
- Hash del commit principal (close-out) + hash del commit secundario (decisión activación) + push hash final.
- DoD checklist results inline (7 checks).
- LEARNINGS sections summary (12 secciones documentadas, 7 patterns).
- SQL snippet path + verificación de idempotencia.
- docs/analysis/04-estado-actual-plataforma.md path + sección agregada (resumen 1 línea).
- Status: PHASE CLOSED — `ui-redesign-dashboard` SHIPPED detrás de `ui_dashboard_v2.enabled`.
- Next: rollout operativo per-workspace via SQL después de QA visual del usuario en Vercel deployment. NO es parte de esta fase.
</output>
