---
status: paused-awaiting-smoke
paused_at: 2026-05-01
phase: somnio-sales-v4
next_plan: 12 (smoke) → 13 (atomic flip)
---

# Resume Notes — somnio-sales-v4

Pausado el 2026-05-01 después de Plan 12 wiring + push. Esperando smoke manual del usuario antes del flip atómico.

## Estado actual

- Plans 01-12 ejecutados y pushed a `origin/main`
- 5 migraciones aplicadas en Supabase prod (Plans 01-03 SQL)
- KB corpus seedeado: 18 docs en `agent_knowledge_base` (workspace Somnio, agent_id='somnio-sales-v4')
- Vercel deploy ok con v4 registrado en `agentRegistry`
- Tests: 49 unit + 6 integration tests verdes
- TypeScript: `npx tsc --noEmit` exit 0
- **Tráfico productivo a v4: CERO** — sin regla en `routing_rules` (Regla 6 satisfecha)
- somnio-sales-v3 sigue atendiendo todo el tráfico Somnio sin cambios

## Para retomar mañana

1. **Smoke test manual** — sigue el checklist del [12-SUMMARY.md](./12-SUMMARY.md) sección "Smoke checklist Task 4":
   - A) Verificar dropdown `/agentes/routing/editor` muestra `somnio-sales-v4`
   - B) Sandbox 3 mensajes (universal-claro / ambiguo / edge-case embarazo)
   - C) SQL observability check
   - D) UI `/agentes/somnio-v4/unknown-cases` carga

2. **Si smoke PASS:** invocar `/gsd-execute-phase somnio-sales-v4 --wave 7` para correr Plan 13 (atomic flip).
   - Plan 13 = `UPDATE routing_rules` v3→v4 en BEGIN/COMMIT
   - Después del push, v4 toma el tráfico y v3 queda sin clientes

3. **Si smoke FAIL:** describir qué falló en el chat, diagnosticamos antes del flip. Plan 13 NO arranca hasta smoke verde.

## Riesgo del flip (Plan 13)

- Plan 13 es atómico: 2 SQL statements en BEGIN/COMMIT (D-40)
- Rollback: `UPDATE routing_rules SET agent_id='somnio-sales-v3' WHERE rule_id=...` (1 minuto)
- Antes del flip ya está confirmado: KB corpus seedeado, integration tests pasando, agente self-registered

## Pending despues del flip (Plan 13)

- LEARNINGS.md (Regla 0, config.learnings.mandatory=true)
- Phase verification (gsd-verifier subagent)
- Update CLAUDE.md scopes section con somnio-sales-v4

## Seguridad

⚠️ Revocar la `OPENAI_API_KEY` que se usó para el seed local — quedó en el chat history y `~/.bash_history`. Crear una nueva en `platform.openai.com` y agregarla solo a Vercel env vars.
