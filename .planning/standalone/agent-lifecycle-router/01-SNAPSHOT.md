# Snapshot Pre-Migracion — agent-lifecycle-router

**Fecha captura:** 2026-04-26 (America/Bogota)
**Proposito:** Baseline para parity validation Plan 07 (Somnio rollout) + evidencia de estado pre-router.

## Query 1: workspace_agent_config baseline

| total_workspaces_with_config | agent_enabled_count | recompra_enabled_count | conversational_agents_in_use |
|------------------------------|---------------------|------------------------|------------------------------|
| 2 | 2 | 2 | `{godentist, somnio-sales-v3}` |

**Notas:**
- Solo 2 workspaces tienen `workspace_agent_config` row: Somnio (somnio-sales-v3) y GoDentist (godentist).
- Ambos con `agent_enabled = true` y `recompra_enabled = true`.
- En Somnio, el branch `is_client && recompra_enabled` rutea a `somnio-recompra-v1`; en GoDentist rutea a `godentist-recompra-v1` o equivalente.

## Query 2: tags productivas

| tag_name | contacts_with_tag |
|----------|-------------------|
| RECO | 2600 |
| P/W | 669 |
| WPP | 152 |

**Notas:**
- Solo existen actualmente las 3 skip-tags legacy (`RECO`, `P/W`, `WPP`) referenciadas en `webhook-handler.ts:91`. Total ~3,421 contactos con al menos una.
- Las **6 override tags D-04** (forzar_humano, pausar_agente, forzar_sales_v3, forzar_recompra, vip, pago_anticipado) NO existen aún → Plan 07 admin las creará bajo demanda desde el form (Regla scope: tags se crean desde UI, no desde router).
- `RECO` es la tag de mayor uso productivo — relevante para parity Somnio (los contactos con `RECO` actualmente saltan al recompra-v1; el router debe replicar via regla legacy parity B-1 con prioridad 900).

## Query 3: distribucion pedidos activos por stage_name + pipeline

| stage_name | pipeline_name | active_orders | logical_kind |
|------------|---------------|---------------|--------------|
| CONFIRMADO | Ventas Somnio Standard | 446 | preparation |
| ENTREGADO | Logistica | 297 | delivered |
| SOMNIO ENVIOS | Logistica | 56 | preparation |
| ENTREGADO | ENVIOS SOMNIO | 49 | delivered |
| CANCELADO | Ventas Somnio Standard | 35 | terminal_closed |
| DEVOLUCION | Logistica | 27 | terminal_closed |
| REPARTO | Logistica | 25 | transit |
| ENVIA | Logistica | 18 | transit |
| AGENDADO | Ventas Somnio Standard | 8 | preparation |
| NOVEDAD | Logistica | 6 | transit |
| OFI INTER | Logistica | 4 | transit |
| NUEVO PAG WEB | Ventas Somnio Standard | 4 | preparation |
| SOLUCIONADA | Logistica | 4 | delivered |
| BOGOTA | ENVIOS SOMNIO | 4 | preparation |
| COORDINADORA | Logistica | 4 | transit |
| CANCELA | ENVIOS SOMNIO | 3 | terminal_closed |
| CANCELA | Logistica | 2 | terminal_closed |
| FALTA CONFIRMAR | Ventas Somnio Standard | 2 | preparation |
| NUEVO PEDIDO | Ventas Somnio Standard | 1 | preparation |
| NUEVO INGRESO | Ventas Somnio Standard | 1 | preparation |
| FALTA INFO | Ventas Somnio Standard | 1 | preparation |
| FALTA ACCION | Logistica | 1 | preparation |
| AGENDADO | ENVIOS SOMNIO | 1 | preparation |

**Distribución por logical_kind (mapping admin → fact `activeOrderStage`):**

| logical_kind | total_orders | stages |
|--------------|--------------|--------|
| preparation | 524 | CONFIRMADO, SOMNIO ENVIOS, AGENDADO, NUEVO PAG WEB, BOGOTA, FALTA CONFIRMAR, NUEVO PEDIDO, NUEVO INGRESO, FALTA INFO, FALTA ACCION |
| delivered | 350 | ENTREGADO (×2), SOLUCIONADA |
| transit | 57 | REPARTO, ENVIA, NOVEDAD, OFI INTER, COORDINADORA |
| terminal_closed | 67 | CANCELADO, DEVOLUCION, CANCELA (×2) |
| **Total** | **998 active orders** | — |

**Notas:**
- 3 pipelines en uso: `Ventas Somnio Standard` (sales funnel), `Logistica` (post-confirmación, mayor volumen), `ENVIOS SOMNIO` (legacy/secundario).
- Volumen de pedidos esperados en flujos del router: ~70% en logística (preparation/transit/delivered), ~30% en ventas (preparation).
- El fact `activeOrderStage` necesita mapping pipeline_stage→logical_kind. Plan 02 (`getActiveOrderForContact`) consume esta tabla para resolver. Plan 03 (`activeOrderStage` resolver) hace la traducción de nombres a kinds.
- `terminal_closed` (CANCELADO, DEVOLUCION, CANCELA) NO debería contar como pedido activo — el resolver debe filtrarlos vía `pipeline_stages.is_closed = true` o equivalente.

## Query 4: contactos is_client Somnio

| workspace_id | total_contacts | clients | prospects |
|--------------|----------------|---------|-----------|
| a3843b3f-c337-4836-92b5-89c58bb98490 | 21,295 | 17,204 | 4,091 |

**Notas:**
- Distribución 80.8% clients / 19.2% prospects → la regla legacy parity (priority 900, B-1) que rutea `is_client && !recompra_enabled` cubre la mayoría del tráfico Somnio.
- Con `recompra_enabled=true` actualmente, los 17,204 clients caen al branch `somnio-recompra-v1`; los 4,091 prospects caen a `conversational_agent_id = somnio-sales-v3`.
- El router debe replicar exactamente esta distribución cuando se flipea el flag (Plan 07 dry-run target: 100% parity).

## Query 5: ultimos 30 dias inbound Somnio

| day | inbound_messages | distinct_conversations |
|-----|------------------|------------------------|
| 2026-04-25 | 93 | 28 |
| 2026-04-24 | 119 | 40 |
| 2026-04-23 | 166 | 40 |
| 2026-04-22 | 137 | 38 |
| 2026-04-21 | 102 | 31 |
| 2026-04-20 | 119 | 44 |
| 2026-04-19 | 81 | 26 |
| 2026-04-18 | 94 | 26 |
| 2026-04-17 | 155 | 45 |
| 2026-04-16 | 168 | 47 |
| 2026-04-15 | 172 | 45 |
| 2026-04-14 | 149 | 37 |
| 2026-04-13 | 159 | 44 |
| 2026-04-12 | 123 | 33 |
| 2026-04-11 | 89 | 30 |
| 2026-04-10 | 120 | 42 |
| 2026-04-09 | 206 | 54 |
| 2026-04-08 | 155 | 58 |
| 2026-04-07 | 234 | 58 |
| 2026-04-06 | 325 | 58 |
| 2026-04-05 | 76 | 21 |
| 2026-04-04 | 103 | 27 |
| 2026-04-03 | 67 | 21 |
| 2026-04-02 | 84 | 27 |
| 2026-04-01 | 149 | 41 |
| 2026-03-31 | 147 | 40 |
| 2026-03-30 | 107 | 37 |
| 2026-03-29 | 103 | 36 |
| 2026-03-28 | 94 | 35 |
| 2026-03-27 | 152 | 36 |
| 2026-03-26 | 9 | 7 |
| **Total** | **3902 inbound** | — |
| **Promedio** | **~126/día** | **~38 conv distintas/día** |

## Decision

- [x] Snapshot capturado, todas las queries devolvieron data esperada — proceder a Wave 1.
- [ ] FALLA: queries devolvieron data inesperada (workspace_agent_config vacia, contacts sin tags, etc.) — escalar a usuario, NO proceder.

**Resumen baseline:**
- 2 workspaces productivos (Somnio, GoDentist), ambos con `agent_enabled=true` y `recompra_enabled=true`.
- Tags productivas: solo legacy skip-tags (RECO 2,600 / P/W 669 / WPP 152). Override tags D-04 NO existen aún.
- 998 pedidos activos en últimos 30d, distribuidos en 3 pipelines (Logistica, Ventas Somnio Standard, ENVIOS SOMNIO).
- Somnio: 21,295 contactos (80.8% clients, 19.2% prospects).
- Volumen mensajes inbound Somnio: ~3,902 últimos 30d (~126/día, ~38 conversaciones/día).
- Wave 0 cleared para proceder.

## Retention Policy (W-7 fix — Plan 01 Task 4)

- **Tabla:** `routing_audit_log`
- **Cleanup function:** Inngest cron `routing-audit-cleanup` (daily 03:00 America/Bogota)
- **Borra:** rows con `reason='matched'` AND `created_at < NOW() - INTERVAL '30 days'`
- **Preserva indefinidamente:** `human_handoff`, `no_rule_matched`, `fallback_legacy` (audit forensics)
- **Volumen estimado** (basado en Q5): ~3,900 mensajes inbound Somnio/30d × 1 audit row por mensaje ≈ ~130 rows/día. Tras 30d: ~3,900 rows con `reason='matched'` cleanup automático; resto retenido.
