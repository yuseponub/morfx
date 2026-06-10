# Standalone: somnio-v4-consolidation — Discussion Log

> **Audit trail only.** Las decisiones canónicas están en CONTEXT.md — este log preserva las alternativas consideradas.

**Date:** 2026-06-10
**Áreas:** Alcance/timing, Diseño del core, Re-validación, Código muerto
**Modo:** El usuario delegó las 4 áreas a criterio de Claude (Fable 5): "confío en ti fable... tú decide". Claude seleccionó la opción recomendada en cada área con el contexto completo de la sesión de auditoría 2026-06-10 (AUDIT + RESTRUCTURE-RESEARCH + lectura de código de primera mano).

---

## Alcance de waves y timing

| Opción | Descripción | Selected |
|--------|-------------|----------|
| Solo W1 (limpieza) | Bajo riesgo pero deja el problema real (paridad prod/sandbox) sin resolver | |
| W1 + W2 (core unificado) | Limpieza + orquestador compartido; checkpoints declarativos dentro de W2 | ✓ |
| W1 + W2 + W3 completo | Incluye split output/debug + escalación única — toca ~10 returns sin ganancia de consistencia | |

**Decisión:** D-01 (W1+W2, W3 parcial-diferido) + D-02 (ANTES del flip Plan 08; condición de revisita si hay urgencia de negocio).
**Notas:** DORMANT = riesgo cero; smokes del flip se corren una sola vez sobre código final.

## Diseño del core unificado

| Opción | Descripción | Selected |
|--------|-------------|----------|
| Extraer del runner prod → engine consume | El runner es el lado más completo (CKPT-6a, crash-recovery, no-rep) | ✓ |
| Extraer del engine sandbox → runner consume | El engine es más chico pero le faltan paths de prod | |
| Core nuevo desde cero | Máximo riesgo de divergencia con ambos | |

**Decisión:** D-03..D-07 (core en `somnio-v4/core/`, adapters mínimos agnósticos, checkpoints factorizados SIN mover colocaciones, PARITY.md reducido a diferencias de adapters).

## Política de re-validación

| Opción | Descripción | Selected |
|--------|-------------|----------|
| Baseline lock + tests intactos + smokes A/B por wave + Regla 6 | Equivalencia de decisiones, no byte-equality del texto LLM | ✓ |
| Solo suite de tests | Insuficiente — los smokes cubren el comportamiento LLM real | |
| Byte-equality total | Imposible — el texto generativo no es determinista por diseño | |

**Decisión:** D-08..D-11.

## Decisiones puntuales de código muerto

| Item | Decisión | Selected |
|------|----------|----------|
| M-1 isCrmMutation/casReject | Borrar plumbing + ramas; NO tocar SubLoopReason del sub-loop (vivo vía crm-gate) | ✓ D-12 |
| M-2 shouldCreateOrder | Borrar campo + ~10 asignaciones | ✓ D-13 |
| M-3 branch fallback runner :949-961 | Borrar + warning observability (mata G-3) | ✓ D-14 |
| M-4 confidence legacy 0-100 | Condicional a grep de consumidores (≤2 → quitar; más → deprecar) | ✓ D-15 |
| M-5 labels sin emisor | Borrar del union los que no tengan emisor alguno; actualizar gates CLAUDE.md | ✓ D-16 |
| M-6/M-7 docs + rename | runLegacySubLoop→runCrmMutationSubLoop; sincronizar ARCHITECTURE/PARITY/AUDIT | ✓ D-17 |
| M-8 _v3:pendingUserMessage | CONSERVAR + documentar (borrable cuando v3 muera) | ✓ D-18 |

## Claude's Discretion

- Nombres finales de archivos del core, división en planes/waves, estrategia de transición de tests, detalle del warning D-14.

## Deferred Ideas

- Calibración ICLR 2025 del threshold (post-flip)
- Split V4AgentOutput contract/debug (W3)
- Superficie de escalación única (W3)
- Borrado runner v3 + Phase 31 polling (cuando v3 muera)
- Seed: re-evaluar WDK cuando vercel/workflow#301 shippee per-key concurrency
- Promover core a shared para otros agentes
