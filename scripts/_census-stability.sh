#!/bin/bash
# Censo de estabilidad — standalone v4-smoke-stability (2026-06-11)
# 6 casos borderline × 10 reps c/u. Cada corrida -t reescribe el results file
# del smoke, así que extraemos status/reason inmediatamente después de cada rep.
# La métrica es la DECISIÓN del sistema (status/reason) — el judge N/A no afecta.
set -u
cd /mnt/c/Users/Usuario/Proyectos/morfx-new

OUT=.planning/standalone/v4-smoke-stability/CENSUS-RAW.md
RES_A=.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md
RES_B=.planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md
REPS=10

echo "# Censo crudo de estabilidad — $(date -u +%FT%TZ)" > "$OUT"
echo "" >> "$OUT"

run_case () {
  local smoke="$1" pattern="$2" label="$3" results="$4"
  for i in $(seq 1 $REPS); do
    npx vitest run "src/lib/agents/somnio-v4/__tests__/smoke-rag-${smoke}.test.ts" -t "$pattern" >/dev/null 2>&1
    local status reason
    status=$(grep -m1 '^- status:' "$results" 2>/dev/null | sed 's/^- status: //')
    reason=$(grep -m1 '^- reason:' "$results" 2>/dev/null | sed 's/^- reason: //')
    if [ -z "$status" ]; then status='NO-RESULT'; reason='(vitest crash o infra sin decisión)'; fi
    echo "- ${label} rep ${i}/${REPS}: ${status} | ${reason}" >> "$OUT"
    echo "PROGRESS ${label} ${i}/${REPS}: ${status}"
  done
  echo "" >> "$OUT"
}

run_case a "alcohol"     "A/1-alcohol"      "$RES_A"
run_case a "Medell"      "A/10-medellin"    "$RES_A"
run_case a "cómo pago"   "A/11-pago"        "$RES_A"
run_case b "insomnio"    "B/1-insomnio"     "$RES_B"
run_case b "día raro"    "B/2-dia-raro"     "$RES_B"
run_case b "interesante" "B/3-interesante"  "$RES_B"

echo "CENSO COMPLETO — $(date -u +%FT%TZ)" >> "$OUT"
echo "DONE"
