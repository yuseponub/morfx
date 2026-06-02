# Godentist — Canary cross-sede bloqueaba programación (falso positivo)

**Estado:** RESUELTO 2026-06-02 · commit `dad5df82` (push a `main` → Vercel)
**Workspace:** godentist `36a74890-aad6-4804-838c-57904b1c9328`

## Síntoma

El operador no podía **enviar confirmaciones** ni **programar recordatorios** en
`/confirmaciones`. UI mostraba banner rojo:

> "Scrape marcado como inconsistent — programación bloqueada. Revisar diagnóstico del scrape antes de reintentar."

El 2026-06-02 hizo 7 scrapes (13:21 → 16:13), **todos** marcados `inconsistent=true`
y bloqueados. 0 recordatorios salieron ese día hasta el fix.

## Root cause

El **canary cross-sede** (`src/app/actions/godentist.ts:194-210`) marca un scrape como
inconsistente si un mismo `(telefono | nombre_normalizado)` aparece en >1 sede en el
mismo scrape, bajo el supuesto *"un paciente no puede estar en 2 sedes el mismo día"*.

Ese supuesto es **falso**. Los 2 casos que dispararon el bloqueo eran legítimos:

| Teléfono | Nombre | Citas | Veredicto |
|---|---|---|---|
| 573144306914 | JOSE OLAYA | CABECERA 10:05 + 10:45 AM (Confirmada) · FLORIDABLANCA 3:30 PM (Sin confirmar) | Paciente real, 2 sedes a **horas distintas** |
| 573176413050 | CARLOS J. MARTINEZ | FLORIDABLANCA 8:00 AM · MEJORAS 8:30 AM — **ambas Canceladas** | Reagendamiento, ambas canceladas (se excluyen del envío de todos modos) |

**Invariante dura verificada = limpia:** 0 pares `(telefono | hora exacta)` en >1 sede.
Ese es el patrón del bug estructural real (mayo 2026: una MISMA cita duplicada a la sede
equivocada por *filter drift* del portal Dentos). Aquí no existe → **no había
contaminación de scraping**, solo falsos positivos del canary.

El refinamiento del 2026-05-15 ya había arreglado un falso positivo previo (teléfonos
compartidos por familia con **nombres distintos**). Quedó esta otra clase: **mismo
nombre + mismas teléfono + sedes distintas a horas distintas**.

## Fix

`dad5df82` — Los dos gates bloqueantes (`sendConfirmations` ~L309, `scheduleReminders`
~L791) pasan de `return { error }` a `console.warn` (WARN-ONLY). El canary **sigue
detectando** y persiste `inconsistent` + `inconsistency_details` + emite evento Inngest
`godentist/scrape.inconsistent`, y la UI mantiene el badge "inconsistent" — pero **ya no
bloquea** el envío/programación.

Directiva del operador: *"no crees bloqueos, solo reintentos"*.

Unblock inmediato (antes del deploy): se limpió `inconsistent=false` en los 6 scrapes
flagged de 2026-06-02 vía admin client.

## Deuda / mejora futura (opcional, vía GSD)

El canary podría endurecerse a la firma del bug **real** en vez de WARN-only genérico:
- Clave `(telefono | hora)` en vez de `(telefono | nombre)` → solo dispara ante misma
  franja horaria en 2 sedes (físicamente imposible = contaminación dura).
- Excluir citas `Cancelada` antes de evaluar.
- Exigir solapamiento de horario para considerar inconsistencia.

Mientras tanto WARN-only es seguro: el operador ve el badge y decide.
