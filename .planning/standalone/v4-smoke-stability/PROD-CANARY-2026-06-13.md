# Canary de v4 en producción — 2026-06-13

**Decisión del usuario:** flip de v4 a producción AHORA como canary vigilado, para recolectar comportamiento de tráfico real y decidir los ajustes de estabilización con datos reales (en vez de solo el censo sintético).

## Qué se cambió

```sql
-- Aplicado 2026-06-13 (vía script _flip-v4.mjs, snapshot previo verificado)
UPDATE workspace_agent_config SET conversational_agent_id='somnio-sales-v4'
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';
-- ANTES: somnio-sales-v3
```

**Radio de impacto:** prospectos nuevos del workspace Somnio (primera conversación de venta). Las 5 routing rules activas siguen mandando primero — NO se tocaron:
- [100] PW order_in_progress → lifecycle
- [100] PW agent router → somnio-sales-v3-pw-confirmation
- [800] is_client_to_recompra → somnio-recompra-v1
- [900] legacy_parity → somnio-sales-v3
- [1000] kill switch → null (forzar humano)

Pre-flip: deploy de Vercel con fix `TIMEOUT_MS.comprehension 10s→20s` (`392c8a59`) confirmado **Ready**.

## ROLLBACK INSTANTÁNEO (<10s tras TTL de cache)

```sql
UPDATE workspace_agent_config SET conversational_agent_id='somnio-sales-v3'
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';
```

## Qué vigilar (riesgo real = handoff silencioso en preguntas de funnel)

El censo (60 corridas) predijo monedas 50/50 en las preguntas MÁS comunes:
- "cuánto tarda a Medellín?" → ~40% handoff silencioso
- "cómo pago?" → ~50% handoff silencioso

Handoff silencioso = el bot no responde + marca `requires_human`. **Necesita humano vigilando la bandeja de Somnio**, o el prospecto se enfría.

**Monitoreo activo:** watcher de `agent_observability_events` (label `subloop_completed` filtrado a `agent='somnio-sales-v4'`) emite por cada conversación: HANDOFF vs generated + reason + topic. También `fallback_failed` (doble-fallo timeout) y `comprehension_completed_v4`.

## Objetivo del canary

Confirmar contra tráfico real:
1. La tasa real de handoff en funnel questions (¿coincide con el censo ~40-50%?).
2. Si el fix de timeout 20s eliminó los `fallback_failed`.
3. Qué reasons dominan → alimenta la decisión canónica + fix de KB (datos, no prompts) pendiente del discuss.
