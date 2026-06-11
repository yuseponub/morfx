# LEARNINGS — whatsapp-inbox-reliability

**Shipped:** 2026-06-11 (4 waves, 7 planes, discuss→research→plan→execute en una sola sesión `--auto`)
**Resultado:** los 4 síntomas del usuario eliminados por clase, verificados con el robot contra baselines.

## Resultados medidos (baseline → final)

| Métrica | Baseline (DIAGNOSIS 2026-06-11 AM) | Final (regresión W4) |
|---|---|---|
| React #418 por carga | 3/3 corridas | **0/3** |
| Dead-clicks al entrar | 4/4 (6-74s, 1 NUNCA) | **0/4** |
| Chat abre (case3) | 9.8-19.1s o nunca | **2.5-2.6s** |
| Conversaciones alcanzables | 1.000/2.559 (1.559 invisibles) | **2.564/2.564** |
| HTML /whatsapp | 1.847 KB | **142 KB** |
| Nodos DOM /whatsapp | 12.953 | **~450** |
| Storm refetch (case4-A) | 3 full-refetches 4.3-4.6s | **0 acciones >2s** |
| Shifts de scroll (case4b) | 2/2 bumps | **0/4 bumps** (2 corridas) |
| case2 consistencia header/contenido | 2/12 switches | 7/8 (1 = artefacto matcher) |
| /tareas SPA (zombies) | 11.4s | **1.4-1.8s** |

## Bugs / gotchas descubiertos

1. **WSL `/mnt/c` + `next dev` = file-watching MUERTO.** El dev server sirve módulos compilados stale tras editar archivos (drvfs no emite inotify). Síntoma: el robot daba 1 error #418 "imposible" con el fix ya aplicado — ambos lados del diff mostraban U+FFFD porque un lone surrogate no es codificable a UTF-8 en el log. **Regla operativa: SIEMPRE reiniciar `npm run dev` antes de correr gates del robot.** Esto invalidó 1 corrida de gates (~10 min perdidos); sin el diagnóstico correcto habría sido un loop de "el fix no funciona".
2. **`.or()` de PostgREST pierde filas con sort-column NULL en keyset.** `last_customer_message_at` es NULL para toda conversación outbound-only (191 filas en Somnio) — un keyset con `.or()` encadenado habría recreado el bug de invisibilidad que veníamos a arreglar. La RPC con NULL-band explícito (`IS NOT DISTINCT FROM` + banda NULL al final del orden) es la forma correcta. Verificado: paginado completo 13 páginas × 200 = 2.564 únicas, 0 dups, 191 en NULL-band.
3. **Virtualizador + scroll programático = 1 "shift" de settle determinista.** `measureElement` corrige `estimateSize` en los primeros ~2s tras fijar scrollTop, moviendo el límite visual 1 fila UNA vez (mismo límite, mismo timing en 2 corridas). No es la clase de bug del reorder — documentarlo para no perseguirlo como regresión en futuros gates case4b.
4. **Sesión Claude concurrente pusheando el mismo main:** sus push arrastraron commits míos SIN gate (2 veces: W2 T1+T2 y W3 completo llegaron a Vercel antes de correr el robot). Mitigación usada: push selectivo `git push origin <sha>:main` + correr gates inmediatamente tras detectar el arrastre. **Para futuros standalones con sesiones concurrentes: pactar ownership del push o trabajar en branch.**
5. **`getInitials` por indexación UTF-16 estaba en 9 componentes** (no solo el inbox). El util compartido (`src/lib/utils/initials.ts`) deja cualquier futuro avatar a un import de distancia. El patrón de bug: `n[0]`/`charAt(0)` sobre nombres con emoji/astral → lone surrogate → SSR streamea bytes inválidos → parser→U+FFFD → mismatch → React descarta TODO el árbol SSR.
6. **El executor de plan 06 detectó (Rule 2) que `softRefetchPage1` debía ser frozen-aware** — el safety-timer coalescido habría re-sorteado bajo el viewport a los 10s, desactivando F-5. Caught pre-gate; case4b lo habría detectado.

## Patrones reusables

- **Robot harness como gate de regresión por wave** (fases con baselines JSON en `robot/`): cada wave corre SOLO sus fases pertinentes; la wave final re-corre todo. Costo ~3-5 min/fase; detectó el código stale y validó cada fix contra números, no contra "se ve bien".
- **RPC keyset con NULL-band** (`supabase/migrations/20260611160000_conversations_keyset.sql`): plantilla para cualquier lista paginada por timestamp nullable en este codebase.
- **Cancelación de efectos de server actions = mounted-ref guard** (16 guards en `use-conversations.ts`), NO AbortController (no aplica a server actions). Mató los fetches zombie cross-módulo.
- **Freeze + banner para listas realtime ordenadas por actividad:** updates in-place mientras el usuario navega histórico; reorden diferido a un Set pendiente + banner contador; aplicar al volver al tope.
- **Push selectivo `git push origin <sha>:main`** para publicar solo tu prefijo verificado cuando hay commits ajenos encima.

## Proceso

- **Regla 5 funcionó como está diseñada:** la migración se aplicó en prod por el usuario (clipboard paso a paso: 2 índices CONCURRENTLY sueltos → función+GRANT) ANTES del push del código que llama la RPC; smoke del RPC en prod (página 1 + cursor, 0 overlap) antes de retomar.
- **Modelos:** orquestación + executors de la cirugía (planes 05/06) en Fable; executors mecánicos en Opus; checker/mapper en Sonnet. El checker pasó los 7 planes en 1ª iteración.
- **Researcher crash-safe:** el primer researcher murió a los 31 min sin escribir nada; el retry con instrucción de "escribir RESEARCH.md incrementalmente" terminó en 6 min con todo. Instrucción a incluir por defecto en agentes de research largos.
