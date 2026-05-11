---
phase: shopify-dev-dashboard-oauth
plan: 08
title: Production cutover — disconnect+reconnect tienda $65 USD (D-03b)
wave: 4
depends_on: [7]
files_modified: []
autonomous: false
estimated_minutes: 20
requirements_addressed: []
must_haves:
  truths:
    - "La tienda Shopify productiva del plan $65 USD se desconecta vía UI de MorfX (botón Eliminar en /configuracion/integraciones) — soft delete via domain layer; legacy `shpat_` token retirado de prod"
    - "La misma tienda se reconecta vía OAuth flow (botón Conectar con Shopify) — nuevo offline access token persistido + 3 webhooks Shopify creados o idempotent-422"
    - "Workspace Somnio (productivo) tiene en `integrations` row con `access_token` que NO empieza con `shpat_` + `granted_scope='read_orders,read_customers,read_draft_orders'` + `is_active=true`"
    - "Pedidos de la tienda productiva siguen llegando a `/api/webhooks/shopify` sin interrupción medible (RTO < 5 min — el tiempo entre disconnect y reconnect debe ser breve)"
    - "Ningún cliente final perdió pedidos durante la ventana de cutover (verificable en logs entre los timestamps de disconnect y reconnect — buscar webhooks rejected por shop_not_found)"
  artifacts:
    - path: "logs y DB del workspace Somnio productivo (no archivo en repo)"
      provides: "Evidencia del cutover exitoso"
  key_links:
    - from: "Tienda Shopify $65 USD"
      to: "Workspace Somnio en MorfX"
      via: "OAuth offline access token + 3 webhooks"
      pattern: "config.access_token NOT LIKE 'shpat_%'"
---

<objective>
Cutover productivo: el usuario desconecta la tienda Shopify legacy (plan $65 USD, conectada hace meses con `shpat_` token) y la reconecta vía OAuth en el mismo workspace productivo Somnio. D-03b CONTEXT.md.

Purpose: cerrar el último `shpat_` activo en producción. Después de este plan, el sistema productivo está 100% en el flow nuevo. Regla 6 satisfecha: el agente productivo (Somnio recibe pedidos vía webhooks) NO se interrumpe — los webhooks viejos siguen funcionando hasta el momento del disconnect, y los nuevos toman over inmediatamente al reconnect.

Output: ningún `shpat_` activo en prod. Standalone shipped.

**Pre-requisito BLOQUEANTE:** Plan 07 SUMMARY = "smoke OK / READY for Plan 08 cutover". Si no, este plan se queda parqueado.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/shopify-dev-dashboard-oauth/CONTEXT.md
@.planning/standalone/shopify-dev-dashboard-oauth/RESEARCH.md
@.planning/standalone/shopify-dev-dashboard-oauth/01-SUMMARY.md
@.planning/standalone/shopify-dev-dashboard-oauth/07-SUMMARY.md
@CLAUDE.md
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Pre-cutover briefing + low-traffic window</name>
  <what-built>Información para que el usuario decida cuándo ejecutar el cutover. Esto NO es código.</what-built>
  <read_first>
    - 07-SUMMARY.md (debe decir "smoke OK / READY")
    - CONTEXT.md D-03b (usuario desconecta+reconecta manualmente al ship)
    - CLAUDE.md Regla 6 (no romper agente productivo)
  </read_first>
  <how-to-verify>
    El usuario debe confirmar **antes** de proceder al cutover:

    1. **Window de bajo tráfico:** ¿Qué hora es buena para ejecutar el disconnect+reconnect? Ideal: noche/madrugada Colombia, cuando el menor número de pedidos llegan. La ventana entre disconnect y reconnect (estimada <5 min) puede causar que algunos webhooks de pedidos no sean procesados por MorfX si caen exactamente en ese gap.

       **Importante:** Shopify NO reintenta webhooks fallidos de forma fiable más allá de algunos intentos. Si llega un pedido durante la ventana, puede perderse en MorfX (aunque Shopify lo procesa OK). Recomendar al usuario:
       - Confirmar window
       - Tener listo el SQL de auditoría (Task 4) para detectar gaps

    2. **Información del workspace productivo:** anotar:
       - `workspace_id` Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490` — verificar en CLAUDE.md)
       - Dominio Shopify productivo (tienda $65 USD) — el usuario debe saberlo; NO está en CONTEXT.md (privado)

    3. **Plan de rollback:** si algo sale mal, ¿qué hacer?
       - Re-conectar la app legacy en Shopify (si todavía existe la custom app vieja con su `shpat_`) y pegar manualmente con SQL directo en `integrations.config`. **PROHIBIDO via UI** — Plan 06 eliminó esa ruta. Esto es solo emergency. Una vez resuelta la emergencia, volver al flow OAuth.

    4. **Comunicación al equipo / clientes:** Confirmar si hay que avisar a algún stakeholder de la ventana.

    Resume cuando el usuario diga "listo para cutover" + share el window timestamp programado.
  </how-to-verify>
  <resume-signal>"listo para cutover" + timestamp window (ej. "2026-05-12 03:00 COL")</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Disconnect tienda legacy vía UI MorfX</name>
  <what-built>El usuario opera la UI en producción.</what-built>
  <how-to-verify>
    En el window acordado:

    1. **Login a MorfX en navegador.** Switch al workspace productivo Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`).
    2. Confirmar rol Owner.
    3. Abrir DevTools Network tab + Vercel logs en otra tab.
    4. Ir a `/configuracion/integraciones`.
    5. **Verificar:** rama CONNECTED visible — muestra "Shopify - <nombre tienda $65>" + selectors pipeline/stage actuales (los que Somnio tenga configurados).
    6. **Anotar antes de delete:**
       ```sql
       SELECT id, name, config->>'shop_domain', config->>'default_pipeline_id',
              config->>'default_stage_id', config->>'product_matching',
              config->>'enable_fuzzy_matching', config->>'auto_sync_orders'
       FROM integrations
       WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490' AND type = 'shopify';
       ```
       Copiar resultado a una nota — al reconnect, hay que reconfigurar pipeline/stage manualmente (CONTEXT.md branch connected post-OAuth muestra esos selectors vacíos por default).
    7. **Click "Eliminar / Desconectar".** Confirmar el modal de confirmación (si existe).
    8. **Verificar en UI:** la página vuelve al branch DISCONNECTED (input dominio + botón Conectar).
    9. **Verificar en BD:**
       ```sql
       SELECT COUNT(*) FROM integrations
       WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490' AND type = 'shopify';
       ```
       esperado: 0 (la row fue eliminada por el domain layer).
    10. **Verificar logs Vercel:** server action `deleteShopifyIntegration` debe loguear success.

    **NOTA Pitfall 9 (relevant para Task 3):** los 3 webhooks viejos en Shopify Admin de la tienda $65 USD NO se eliminan automáticamente (delete en MorfX NO llama Shopify Admin API DELETE webhook). Eso es OK — el reconnect (Task 3) hará create de los nuevos, que retornarán 422 (idempotent) porque las direcciones (`https://morfx-sandy.vercel.app/api/webhooks/shopify`) ya están registradas. Esto se trata como success en `oauth.ts` Plan 03.

    **CRÍTICO:** Anotar timestamp exacto del delete (UTC + Colombia time) para Task 4 audit.
  </how-to-verify>
  <resume-signal>"delete OK" + timestamp + config anterior anotado</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Reconnect vía OAuth (mismo workspace Somnio, misma tienda productiva)</name>
  <what-built>El usuario inicia el OAuth flow productivo, idéntico al smoke pero contra el workspace Somnio + dominio productivo.</what-built>
  <how-to-verify>
    Inmediatamente tras Task 2:

    1. **Mantenerse en el workspace Somnio.** En la página `/configuracion/integraciones` (branch DISCONNECTED).
    2. Tipear el dominio productivo (el de la tienda $65 USD) — no es el de testing, no es `6xvhnx-1v.myshopify.com`.
    3. Click "Conectar con Shopify".
    4. Authorize en Shopify (login si pide, click Install/Authorize).
    5. **Verificar redirect back:** toast verde + URL = `/configuracion/integraciones` (sin params, post `router.replace`).
    6. **Verificar en BD:**
       ```sql
       SELECT
         id, name,
         config->>'shop_domain' AS shop_domain,
         (config->>'access_token') ILIKE 'shpat_%' AS is_legacy_token,
         config->>'granted_scope' AS granted_scope,
         config->>'default_pipeline_id' AS pipeline,
         config->>'default_stage_id' AS stage,
         is_active,
         updated_at
       FROM integrations
       WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490' AND type = 'shopify';
       ```
       **Verificar:**
       - 1 row exactamente.
       - `is_legacy_token = false` (CRUCIAL — esto valida D-03b).
       - `granted_scope = 'read_orders,read_customers,read_draft_orders'`.
       - `pipeline` y `stage` están **vacíos** (la integración nueva no preservó esos campos — esperado).
       - `is_active = true`.

    7. **Verificar logs Vercel:** `[oauth-callback] success shop=<productivo> workspace=a3843b3f-... webhooks_ok=3/3 duration=<N>ms` (puede ser `webhooks_ok=0/3` si los 3 retornan 422 y oauth.ts cuenta 422 como ok=true; verificar el conteo es `=3/3` porque Pitfall 9 trata 422 como ok).

    8. **Reconfigurar pipeline/stage que se perdieron:**
       - En `/configuracion/integraciones` branch CONNECTED, usar los selectors para volver a configurar `default_pipeline_id` y `default_stage_id` con los valores anotados en Task 2.
       - Guardar (el server action update que use el form actual — esto es código existente, no nuevo).

    9. **Verificar Shopify Admin:** los 3 webhooks productivos siguen apuntando a `https://morfx-sandy.vercel.app/api/webhooks/shopify` API version `2024-01` formato JSON. NO debería haber duplicados (los viejos + los del callback son los mismos por idempotency).

    **CRÍTICO:** Anotar timestamp exacto del success del reconnect.
  </how-to-verify>
  <resume-signal>"reconnect OK" + timestamp success + confirmación pipeline/stage re-set</resume-signal>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Audit post-cutover — gap analysis + final SUMMARY</name>
  <what-built>El usuario ejecuta SQL audit para detectar si algún pedido se perdió entre los timestamps de disconnect (Task 2) y reconnect (Task 3). Luego documenta resultado.</what-built>
  <how-to-verify>
    1. **Audit SQL** (run on Supabase):
       ```sql
       -- Pedidos creados en Shopify productivo entre disconnect y reconnect.
       -- Si hay alguno, verificar si llegó a MorfX (tabla orders del workspace Somnio).
       -- Reemplazar timestamps con los exactos de Tasks 2 y 3.

       SELECT
         id, name, total_price, financial_status, created_at
       FROM <shopify_orders_table_si_la_hay>
       WHERE created_at BETWEEN '<TIMESTAMP_DELETE>' AND '<TIMESTAMP_RECONNECT_SUCCESS>';

       -- O alternativamente, revisar Shopify Admin → Orders → filter by date range.
       ```

       Verificar:
       - Si gap window = 0 pedidos → 100% OK.
       - Si gap window > 0 pedidos → verificar manualmente que llegaron a MorfX `orders` table. Si algún pedido falta:
         - Crear manualmente en MorfX vía CRM o domain layer.
         - O re-sincronizar via Shopify Admin "Resend webhook" para esos pedidos específicos.

    2. **Verificar pedido nuevo llega a MorfX post-reconnect:**
       - En la tienda productiva, ya sea esperar a un pedido orgánico o crear un test order pequeño.
       - Verificar en Vercel logs: `Shopify webhook [orders/create] processed in <N>ms: success`.
       - Verificar en MorfX `/crm/pedidos` workspace Somnio: el pedido aparece.

    3. **Documentar el resultado en `08-SUMMARY.md`:**
       - Timestamps disconnect / reconnect / total gap duration.
       - Resultado audit (pedidos en gap).
       - Si todo OK: "Standalone shipped 2026-05-XX. shpat_ legacy retirado de producción Somnio. 3 webhooks productivos idempotent-recreated (Pitfall 9 validado)."
       - Si hubo gap con pedidos perdidos: documentar acción remedial.

    4. **Final cleanup (opcional):**
       - En Shopify Admin de la tienda productiva, **NO eliminar la custom app legacy de inmediato** — déjala instalada durante 7 días como rollback safety. Después de 7 días sin issues, el usuario la puede desinstalar manualmente desde Shopify Admin → Apps → MorfX legacy → uninstall.
       - El `shpat_` que aún existe en Shopify (no usado por nadie tras Task 2) se invalida automáticamente cuando se uninstala la app legacy.

    5. **Update CLAUDE.md (Regla 4 — documentación):**
       - Si el standalone está shipped, ajustar `docs/analysis/04-estado-actual-plataforma.md` (módulo de integraciones Shopify) — cambiar de "shpat_ manual" a "OAuth Dev Dashboard, offline access token, 3 webhooks auto-creados, scope `read_orders,read_customers,read_draft_orders`".
       - O dejar TODO en LEARNINGS para futuro standalone si fuera del scope.
  </how-to-verify>
  <resume-signal>"audit OK" + share gap duration + share resultado audit (0 pedidos / X pedidos perdidos)</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Operación productiva → Shopify Admin (disconnect/reconnect) | Usuario actúa con privilegios de Owner en producción; cualquier error directamente afecta Somnio |
| Webhook gap window → pedidos productivos | Algunos pedidos pueden caer en la ventana de disconnect→reconnect; Shopify webhooks NO tienen garantía de delivery infinita |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-shopify-oauth-36 | D (DoS — operational outage) | Pedidos perdidos en window de cutover | mitigate | Window de bajo tráfico (Task 1); audit SQL post (Task 4); rollback path documentado |
| T-shopify-oauth-37 | T (Tampering / accidental data loss) | Pipeline/stage config perdido al delete | mitigate | Task 2 step 6: anotar config previa antes de delete; Task 3 step 8: reconfigurar manualmente |
| T-shopify-oauth-38 | E (Elevation) | Usuario por error desconecta workspace incorrecto | mitigate | Task 2 step 1-2: verificar workspace + Owner; UI muestra workspace activo claramente |
| T-shopify-oauth-39 | I (Information disclosure) | `shpat_` legacy aún presente en logs históricos de Vercel | accept | Logs Vercel retention limitada; no rotamos secrets de la app legacy; aceptado per D-11 (legacy compatibility) |
| T-shopify-oauth-40 | T (Tampering) | App legacy de Shopify queda instalada con permisos vivos | mitigate | Task 4 step 4: dejar 7 días de rollback safety, después usuario uninstall manual; el token expira/invalida con el uninstall |
</threat_model>

<verification>
Manual — todos los checks son del usuario en producción. No hay grep gates automatizables en este plan.

Riesgo principal: cuán bien Shopify reintenta webhooks durante la ventana de gap. Mitigación = Task 4 audit + window de bajo tráfico.
</verification>

<success_criteria>
- [ ] Plan 07 SUMMARY = "smoke OK / READY" (pre-requisito)
- [ ] Window de bajo tráfico acordado (Task 1)
- [ ] Disconnect ejecutado en workspace Somnio (Task 2) — `integrations` row count = 0
- [ ] Config previa (pipeline/stage) anotada antes de disconnect
- [ ] Reconnect vía OAuth ejecutado (Task 3) — `integrations` row count = 1, `is_legacy_token = false`
- [ ] `granted_scope` persistido para Somnio workspace
- [ ] 3 webhooks productivos OK (oauth-callback logs `webhooks_ok=3/3` o equivalente con 422)
- [ ] Pipeline/stage re-configurados a valores previos
- [ ] Audit SQL post-cutover: gap window analysis sin pedidos perdidos (o todos recuperados)
- [ ] Pedido test (orgánico o manual) llega a MorfX post-reconnect
- [ ] SUMMARY con timestamps + audit result
- [ ] (Opcional) `docs/analysis/04-estado-actual-plataforma.md` actualizado o TODO en LEARNINGS
- [ ] Plan 08 SUMMARY veredicto: "Standalone shipped — shpat_ legacy retirado de producción"
</success_criteria>

<output>
`.planning/standalone/shopify-dev-dashboard-oauth/08-SUMMARY.md` con:
- Timestamps exactos disconnect / reconnect
- Gap duration
- Audit SQL output
- Decisión final sobre la app legacy en Shopify (mantener 7 días o uninstall inmediato)
- Veredicto: shipped o blocked

**Tras Plan 08 SUMMARY = shipped:**
- Orchestrator commitea los SUMMARYs.
- Orchestrator agrega entrada al `MEMORY.md` global (`shopify_dev_dashboard_oauth_shipped.md`).
- Standalone se mueve a estado SHIPPED en `STATE.md`.
</output>
