# Apply Evidence — godentist-fb-ig migration (Wave 5 Plan 07 Task 2)

**Apply date:** 2026-05-05 (America/Bogota)
**Applied by:** Jose Romero (joseromerorincon041100@gmail.com) — Supabase Dashboard production SQL Editor
**Migration file:** `supabase/migrations/20260505220000_godentist_fb_ig_template_catalog.sql`
**Migration commit (local, not pushed yet):** `ba4b300` — `feat(agent-godentist-fb-ig): add migration SQL — clone godentist catalog with D-05 saludo (Wave 5 Plan 07 Task 1)`
**Regla 5:** SQL apply en produccion ANTES del push del codigo. Plan 07 = SQL apply [BLOCKING]. Plan 08 = code push (subsequente, ahora UNBLOCKED).

---

## 1. Output del SQL Editor (apply transaction)

```
Result: Success. No rows returned
```

Notas:
- Supabase SQL Editor mostro warning de operacion destructiva (esperado por el `DELETE FROM agent_templates WHERE agent_id = 'godentist-fb-ig'` inicial de la idempotency guard); el usuario confirmo `Run`.
- Transaccion completada (`COMMIT;` ejecutado, sin `ERROR` raised).
- Los `RAISE NOTICE` de los 2 DO blocks no se renderizan en el panel de Supabase result; pero su no-emision de `RAISE EXCEPTION` confirma que ambos sanity checks pasaron (de lo contrario la transaccion habria abortado y el resultado habria sido un error PG, no `Success. No rows returned`).

Sanity checks (inferidos por non-error):
- [x] **Sanity check 1 (row count match):** la transaccion no abortó → `sibling_count = godentist_count` se cumple.
- [x] **Sanity check 2 (D-05 saludo):** la transaccion no abortó → existe ≥1 row `intent='saludo'` + `priority='CORE'` con `content LIKE '%goBot%' AND content LIKE '%Habeas Data%'`.

---

## 2. Verificacion 1 — total row count

SQL ejecutado:
```sql
SELECT COUNT(*) AS sibling_total
FROM agent_templates
WHERE agent_id = 'godentist-fb-ig';
```

Output verbatim:
```json
[ { "sibling_total": 79 } ]
```

**Esperado segun 01-SUMMARY.md Q-A:** 79 rows (godentist baseline = 79 templates → sibling target = 79 templates).

**Match:** [x] SI

---

## 3. Verificacion 2 — saludo D-05

SQL ejecutado:
```sql
SELECT id, intent, visit_type, priority, content
FROM agent_templates
WHERE agent_id = 'godentist-fb-ig'
  AND intent = 'saludo'
  AND priority = 'CORE';
```

Output verbatim:
```json
[
  {
    "id": "3a7099d0-af89-45c7-9712-32bfd67711ad",
    "intent": "saludo",
    "priority": "CORE",
    "orden": 0,
    "content": "👋 ¡Hola! Soy goBot 🤖 de godentist ®️.\n\nTu valoración odontológica es totalmente GRATIS 🦷✨\nDéjanos estos datos y reservamos tu cita de inmediato:\n\n📌 Nombre completo\n📌 Celular\n\n🔒 Al compartir tus datos, autorizas su tratamiento conforme a la Ley 1581 de 2011 (Habeas Data).\n\nEstás a un paso de comenzar tu nueva sonrisa 💙 ¿Deseas agendar tu cita de valoración GRATIS?"
  }
]
```

D-05 markers presentes en el `content`:

| Marker             | Esperado | Detectado | Status |
| ------------------ | -------- | --------- | ------ |
| `goBot`            | si       | si        | [x] OK |
| `Habeas Data`      | si       | si        | [x] OK |
| `Ley 1581`         | si       | si        | [x] OK |
| `valoración GRATIS`| si       | si        | [x] OK |
| `📌 Nombre completo` (lead-capture pattern) | si | si | [x] OK |
| `📌 Celular` (lead-capture pattern)         | si | si | [x] OK |

Primera linea del content: `👋 ¡Hola! Soy goBot 🤖 de godentist ®️.`
Ultima linea del content: `Estás a un paso de comenzar tu nueva sonrisa 💙 ¿Deseas agendar tu cita de valoración GRATIS?`

**Decision:** [x] D-05 verbatim aplicado. Lead-capture lead-magnet con disclaimer Habeas Data inline.

---

## 4. Verificacion 3 — comparison godentist vs sibling

SQL ejecutado:
```sql
SELECT
  (SELECT COUNT(*) FROM agent_templates WHERE agent_id = 'godentist' AND workspace_id IS NULL) AS godentist_count,
  (SELECT COUNT(*) FROM agent_templates WHERE agent_id = 'godentist-fb-ig') AS sibling_count;
```

Output verbatim:
```json
[ { "godentist_count": 79, "sibling_count": 79 } ]
```

**Equal:** [x] SI (79 = 79)

Confirmaciones:
- [x] No hubo row drops (CASE WHEN no filtro ningun row — solo modifico content del saludo CORE).
- [x] No hubo extras (DELETE-first idempotency garantiza clean slate).
- [x] godentist catalog NO fue tocado (DELETE filtro por `agent_id='godentist-fb-ig'` exclusivamente).

---

## 5. Decision agregada

| Verificacion                 | Verdict | Output                                  |
| ---------------------------- | ------- | --------------------------------------- |
| sibling_total                | PASS    | 79 (matches Q-A baseline)               |
| saludo D-05 verbatim         | PASS    | content includes goBot + Habeas Data + Ley 1581 + lead-capture |
| godentist_count = sibling_count | PASS | 79 = 79                                 |

- [x] **Wave 5 PASA — desbloquear Plan 08 push.** Las 3 verificaciones GO.
- [ ] Wave 5 BLOCKER — pausar fase. (no aplica)

**Regla 5 (CLAUDE.md) honored:** SQL applied en produccion ANTES del push del codigo del Plan 08. Plan 08 (push del codigo del sibling + integration en routing-editor) ahora puede proceder.

**Anti-Pitfall 1 (cdc06d9) check:** el sibling tiene `agent_id='godentist-fb-ig'` distinto y row count distinto del catalog godentist (post-Plan 08, godentist sigue con 79 rows propios + sibling 79 rows propios = 158 rows total para grep `agent_id IN ('godentist', 'godentist-fb-ig')`). El aislamiento de catalog (D-08) esta confirmado en DB.
