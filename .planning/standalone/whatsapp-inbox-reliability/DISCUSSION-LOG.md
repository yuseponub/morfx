# Standalone: WhatsApp Inbox Reliability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-11
**Phase:** standalone/whatsapp-inbox-reliability
**Mode:** `--auto` (delegación explícita del usuario 2026-06-11: "Claude decide lo técnico; lo más estructural posible, cero parches")
**Areas discussed:** Paginación F-1, Iniciales F-2, Reconciliación F-3/F-4, Scroll F-5, Error state F-6, Selección F-7, Waves/verificación

---

## F-1 — Estrategia de paginación

| Option | Description | Selected |
|--------|-------------|----------|
| Keyset cursor | Cursor por columna de sort + id tie-breaker; estable bajo reorden continuo | ✓ |
| Offset/limit | Más simple, pero con mensajes entrantes constantes duplica/salta filas entre páginas | |
| Solo limit (top-N fijo) | Parche: mantiene invisibles las conversaciones >N | |

**Choice:** Keyset. **Notes:** Offset descartado por el reorden continuo de Somnio (2.559 convos con tráfico permanente). Page size 50; SSR solo primera página; búsqueda y filtros server-side; count agregado para el topbar. Virtualización con `@tanstack/react-virtual` (ya en repo).

## F-2 — Util de iniciales

| Option | Description | Selected |
|--------|-------------|----------|
| Util único compartido grapheme-safe | `Intl.Segmenter` + fallback `Array.from`, migrar 9 call sites | ✓ |
| Fix puntual solo en conversation-item | Parche: deja el patrón latente en 8 sitios más | |

**Choice:** Util único. Gate: probe418 = 0 errors + grep limpio.

## F-3/F-4 — Reconciliación de lista

| Option | Description | Selected |
|--------|-------------|----------|
| Quitar revalidatePath de markAsRead + softRefetch 1ª página merge-por-id + timer coalescido | Espejo del patrón validado en use-messages | ✓ |
| Mantener revalidatePath con debounce | Parche: sigue re-renderizando el server por click | |
| Eliminar safety-net por completo | Riesgoso: realtime puede perder eventos en reconexiones | |

**Choice:** Opción estructural. archive/unarchive conservan revalidatePath. Orders handler pasa a merge puntual; efectos cancelados al desmontar (mata fetches zombie).

## F-5 — Estabilidad de scroll

| Option | Description | Selected |
|--------|-------------|----------|
| Freeze de re-sort + banner "N con actividad" | Patrón inbox estándar; elimina el shift por construcción | ✓ |
| Scroll anchoring CSS (`overflow-anchor`) | No cubre listas virtualizadas ni el reorder semántico | |
| Compensación manual de scrollTop | Parche frágil dependiente de medición de alturas | |

**Choice:** Freeze + banner. Umbral ~1 viewport (discreción del planner).

## F-6 — Estado de error del chat

| Option | Description | Selected |
|--------|-------------|----------|
| 3 estados: skeleton / error+retry+backoff / vacío real | isError+refetch expuestos desde useMessages | ✓ |
| Solo subir retry de React Query | Parche: el error final seguiría viéndose como chat vacío | |

**Choice:** 3 estados.

## F-7 — Selección derivada

| Option | Description | Selected |
|--------|-------------|----------|
| Derivar selectedConversation de selectedConversationId | Una sola fuente de verdad; elimina la clase de divergencias | ✓ |
| Sincronizar los dos estados con más efectos | Parche: agrega superficie de race en vez de quitarla | |

**Choice:** Derivación.

## Waves / verificación / despliegue

| Option | Description | Selected |
|--------|-------------|----------|
| 4 waves del DIAGNOSIS + robot gate pre-push por wave + sin feature flag | Cada wave = push independiente verificado; rollback = revert | ✓ |
| Big-bang (todo en un push) | Viola calidad-sobre-velocidad y dificulta atribución de regresiones | |
| Feature flag para F-1 | Innecesario: corrige comportamiento roto, no introduce comportamiento nuevo; doble code-path = deuda | |

**Choice:** 4 waves + robot gates. Migración de índice bajo Regla 5 (aplicar en prod ANTES de push, con pausa).

## Claude's Discretion

Wording del banner F-5, umbral exacto del freeze, forma del skeleton/error F-6, firma del util de iniciales, forma final del cursor keyset y del índice (valida research).

## Deferred Ideas

- TTFB de `/agentes` (item propio futuro).
- Caso 2 no reproducido — F-7 elimina la clase candidata; re-diagnosticar solo si reaparece post-W4.
- Auditoría de iniciales en módulos fuera del inventario (CRM kanban, futuros).
