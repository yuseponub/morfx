---
phase: shopify-dev-dashboard-oauth
plan: 07
title: Smoke test E2E en tienda dev 6xvhnx-1v.myshopify.com
wave: 4
depends_on: [2, 3, 4, 5, 6]
files_modified: []
autonomous: false
estimated_minutes: 25
requirements_addressed: []
must_haves:
  truths:
    - "Usuario completa el flow OAuth real desde la UI productiva en tienda dev `6xvhnx-1v.myshopify.com`"
    - "Tras OAuth, row en `integrations` para algún workspace de testing (NO Somnio productivo) con `config.access_token` que NO empieza con `shpat_` + `config.granted_scope='read_orders,read_customers,write_webhooks'`"
    - "Los 3 webhooks visibles en Shopify Admin Dev Store: `https://6xvhnx-1v.myshopify.com/admin/settings/notifications` (o `/admin/webhooks` según UI), apuntando a `${NEXT_PUBLIC_APP_URL}/api/webhooks/shopify`, formato JSON, API version 2024-01"
    - "Toast verde 'Tienda Shopify conectada exitosamente' visible en UI tras redirect"
    - "Logs de Vercel del callback muestran `[oauth-callback] success ...` con duration < 10s y `webhooks_ok=3/3`"
    - "Crear un pedido manual en la tienda dev resulta en evento llegando a `/api/webhooks/shopify` (verificable en logs)"
  artifacts:
    - path: "logs de Vercel (no archivo en repo)"
      provides: "Evidencia runtime del callback completo"
  key_links:
    - from: "Tienda dev (Shopify)"
      to: "Callback route handler (Vercel)"
      via: "302 redirect post-authorize"
      pattern: "?code=...&hmac=...&shop=6xvhnx-1v.myshopify.com&state=..."
---

<objective>
Smoke test E2E — el primer flow OAuth real en producción contra la tienda dev `6xvhnx-1v.myshopify.com` (CONTEXT.md §Specifics). **Pre-cutover (Plan 08).** Esta es la verificación que cubre el risk gap entre "tests pasan" y "funciona contra Shopify real".

**Pre-requisito:** Plan 06 commiteado pero NO pusheado. Este plan inicia con `git push origin main` para que el callback de Vercel exista.

Purpose: detectar bugs operacionales (env vars mal cargadas, redirect URL typo, Pitfall 9 422 idempotency en re-install, scope grant timing, Vercel cold start). **Si este plan falla, todo lo anterior queda en evaluación.**

Output: confirmación E2E + logs guardados + 1 row OK en `integrations`. Plan 08 puede proceder al cutover productivo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/shopify-dev-dashboard-oauth/CONTEXT.md
@.planning/standalone/shopify-dev-dashboard-oauth/RESEARCH.md
@.planning/standalone/shopify-dev-dashboard-oauth/01-SUMMARY.md
@.planning/standalone/shopify-dev-dashboard-oauth/02-SUMMARY.md
@.planning/standalone/shopify-dev-dashboard-oauth/03-SUMMARY.md
@.planning/standalone/shopify-dev-dashboard-oauth/04-SUMMARY.md
@.planning/standalone/shopify-dev-dashboard-oauth/05-SUMMARY.md
@.planning/standalone/shopify-dev-dashboard-oauth/06-SUMMARY.md
@CLAUDE.md
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Push a Vercel + esperar deploy + verificar env vars en runtime</name>
  <files></files>
  <read_first>
    - 01-SUMMARY.md (confirmar env vars cargadas en Vercel Production)
    - CLAUDE.md Regla 1 (Push a Vercel antes de pedir pruebas)
  </read_first>
  <action>
    1. **Push de los commits de Plans 02-06:**
       ```bash
       git push origin main
       ```

    2. **Esperar deploy de Vercel** (~1-2 min). Verificar status:
       ```bash
       # Si vercel CLI está disponible:
       vercel ls --limit 1
       # O via dashboard: https://vercel.com/<team>/<project>/deployments
       # Esperar a que el último deploy READY
       ```

    3. **Verificar env vars en runtime** (sin exponerlas):
       ```bash
       # Validación 1: la ruta callback responde (sin params)
       curl -i -X GET "https://morfx.app/api/integrations/shopify/oauth/callback" 2>&1 | head -20
       # esperado: 307 redirect a /configuracion/integraciones?error=oauth_failed&reason=shopify_error
       #           (porque sin params, Zod parse falla, callback redirige)
       # MUY importante: NO esperar 500 — eso significa env var faltante o crash de import

       # Validación 2: la ruta de start (server action) compila — abrir la UI
       # Abrir https://morfx.app/configuracion/integraciones en navegador
       # esperado: branch disconnected visible (input dominio + botón Conectar)
       ```

    4. **Si el curl devuelve 500 / module error / similar:**
       - PARAR. No proceder al smoke real. Diagnosticar:
         - Logs Vercel: `vercel logs --since=10m` o dashboard → Functions → callback
         - Buscar errores tipo "Module not found: node:crypto" (significa runtime != nodejs)
         - Buscar errores tipo "SHOPIFY_OAUTH_STATE_SECRET must be at least 32 chars" (env var corta — no debería; Plan 01 garantizó)
       - Reportar al orchestrator.
  </action>
  <verify>
    Manual:
    1. `git push origin main` exitoso (sin error).
    2. Vercel deploy READY (visualmente o vía CLI).
    3. `curl -i -X GET "https://morfx.app/api/integrations/shopify/oauth/callback"` retorna 307 con Location = `/configuracion/integraciones?error=oauth_failed&reason=shopify_error`.
    4. UI `/configuracion/integraciones` muestra branch disconnected.
  </verify>
  <done>
    - Push exitoso
    - Deploy Vercel READY
    - Smoke route response = 307 con reason=shopify_error (NO 500)
    - UI productiva muestra branch disconnected
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Smoke test E2E completo en tienda dev 6xvhnx-1v.myshopify.com</name>
  <what-built>Plans 02-06 desplegados. La UI está lista para que el usuario opere el OAuth real contra la tienda dev. Claude NO puede hacer este paso (requiere login Shopify del usuario).</what-built>
  <how-to-verify>
    **Setup previo (1 vez):** asegurar que el usuario tiene un workspace de MorfX no-productivo (testing) donde correr el smoke — **NO Somnio**, ese es Plan 08 cutover productivo separado. Si no existe, crear uno rápido o usar uno de QA.

    **Pasos del smoke (el usuario los ejecuta):**

    1. **Pre-checks (sanity):**
       - Login a MorfX en navegador.
       - Switch al workspace de testing (NO Somnio).
       - Confirmar rol Owner (sidebar / settings).
       - Abrir DevTools → Network tab (para inspeccionar requests).
       - Abrir Vercel logs en otra tab: `vercel logs --follow` o dashboard.

    2. **Iniciar OAuth:**
       - Ir a `https://morfx.app/configuracion/integraciones`.
       - **Verificar:** branch disconnected visible (Input "Dominio de tu tienda" + botón "Conectar con Shopify").
       - Tipear: `6xvhnx-1v.myshopify.com`.
       - Click "Conectar con Shopify".
       - **Verificar:** loading state breve (Loader2 spinner).

    3. **Authorize en Shopify:**
       - Browser redirige a `https://6xvhnx-1v.myshopify.com/admin/oauth/authorize?client_id=...&scope=read_orders,read_customers,write_webhooks&redirect_uri=https%3A%2F%2Fmorfx.app%2Fapi%2Fintegrations%2Fshopify%2Foauth%2Fcallback&state=eyJ...`
       - **Verificar URL:**
         - `client_id` no vacío
         - `scope=read_orders,read_customers,write_webhooks` exacto
         - `redirect_uri` URL-encoded de `https://morfx.app/api/integrations/shopify/oauth/callback` (sin trailing slash)
         - `state` = JWT (3 partes separadas por `.`)
       - Login a Shopify si pide.
       - Verificar la pantalla muestra: "MorfX wants permission to:" + lista de 3 scopes en español/inglés.
       - Click "Install app" / "Authorize".

    4. **Callback handling:**
       - Browser redirige back a `https://morfx.app/configuracion/integraciones?success=oauth_connected`.
       - **Verificar:**
         - URL post-redirect = `/configuracion/integraciones` SIN query params (porque `router.replace` los limpió ~1s después).
         - Toast verde "Tienda Shopify conectada exitosamente" aparece.
         - La página re-renderiza al branch CONNECTED (selectors pipeline/stage visibles, NO el input dominio).

    5. **Vercel logs (en la tab abierta):**
       - **Buscar línea:** `[oauth-callback] success shop=6xvhnx-1v.myshopify.com workspace=<UUID> webhooks_ok=3/3 duration=<N>ms`
       - **Verificar:**
         - `webhooks_ok=3/3` (los 3 webhooks creados OK)
         - `duration` < 10000 (ms) — debe ser <10s, ideal <5s
         - NINGÚN `[oauth-callback] fail` log
         - NINGÚN log con `access_token=` o `shpat_` (sanity de leakage)

    6. **DB verificación (via psql / Supabase Studio):**
       ```sql
       SELECT
         id,
         workspace_id,
         type,
         name,
         config->>'shop_domain' AS shop_domain,
         (config->>'access_token') ILIKE 'shpat_%' AS is_legacy_token,
         config->>'granted_scope' AS granted_scope,
         is_active,
         created_at,
         updated_at
       FROM integrations
       WHERE workspace_id = '<WORKSPACE_TESTING_UUID>'
         AND type = 'shopify';
       ```

       **Verificar:**
       - 1 row exactamente.
       - `shop_domain = '6xvhnx-1v.myshopify.com'`.
       - `is_legacy_token = false` (access_token NO empieza con `shpat_`).
       - `granted_scope = 'read_orders,read_customers,write_webhooks'`.
       - `is_active = true`.

    7. **Shopify Admin verificación:**
       - Login a Shopify Admin: `https://admin.shopify.com/store/6xvhnx-1v`.
       - Ir a Settings → Notifications → Webhooks (o `Apps and channels` → MorfX → Configuration).
       - **Verificar 3 webhooks creados:**
         - `orders/create` → `https://morfx.app/api/webhooks/shopify` formato JSON
         - `orders/updated` → `https://morfx.app/api/webhooks/shopify` formato JSON
         - `draft_orders/create` → `https://morfx.app/api/webhooks/shopify` formato JSON
       - **API version:** debe decir `2024-01` en cada uno.

    8. **End-to-end test de webhook (opcional pero recomendado):**
       - En Shopify Admin de la tienda dev → Orders → "Create order" (test order, no real).
       - Esperar ~2-3 seg.
       - **Verificar en logs Vercel:** un POST a `/api/webhooks/shopify` con topic `orders/create` log "Shopify webhook [orders/create] processed in <N>ms: success".
       - **Verificar en MorfX:** abrir `/crm/pedidos` del workspace de testing → ver el pedido recién creado.

    **Failure paths a probar (opcional — solo si tiempo):**

    - **Deny scope:** repetir flow, en Shopify authorize click "Cancel" → debería redirect a `/configuracion/integraciones?error=oauth_failed&reason=denied` o similar, toast en español visible.
    - **Re-install (Pitfall 9):** dar Delete a la integration en MorfX UI + repetir flow → callback succeed, los 3 webhooks en Shopify ya existen, callback debería tratar 422 como success (verificar logs `[oauth-callback] webhook orders/create OK (status=422)`).
  </how-to-verify>
  <resume-signal>
    Si todo PASS: "smoke OK" + share el `workspace_id` usado.
    Si algún check FAIL: describir el síntoma + adjuntar líneas relevantes de Vercel logs. NO proceder a Plan 08.
  </resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Documentar resultado del smoke en SUMMARY (solo si Task 2 PASS)</name>
  <files>.planning/standalone/shopify-dev-dashboard-oauth/07-SUMMARY.md</files>
  <read_first>
    - Output de Task 2 del usuario
  </read_first>
  <action>
    Si Task 2 retornó "smoke OK":

    1. Crear `.planning/standalone/shopify-dev-dashboard-oauth/07-SUMMARY.md` con:
       - Confirmación de cada uno de los 8 pasos del smoke con un ✓
       - `workspace_id` testing usado (sanitizado parcialmente — primeros 8 chars + ****)
       - `duration` reportada en logs
       - `webhooks_ok` reportado
       - Cualquier observación (cold start time, etc.)
       - **Veredicto:** "READY for Plan 08 cutover" o "BLOCKED — describir issue"

    2. Si hubo failure paths probados (deny, re-install): documentar resultado.

    3. **NO commit ni push** en este task — el SUMMARY se commitea junto con el siguiente plan / al final del standalone.

    Si Task 2 retornó FAIL:
    - Crear SUMMARY con detalle del failure.
    - Marcar Plan 08 como BLOCKED.
    - Recomendar acción remedial (e.g., "Plan 08 stays parked until Plan XX revision fixes the issue").
  </action>
  <verify>
    <automated>test -f .planning/standalone/shopify-dev-dashboard-oauth/07-SUMMARY.md && echo "EXISTS"</automated>
    <automated>grep -c "smoke OK\|READY\|BLOCKED" .planning/standalone/shopify-dev-dashboard-oauth/07-SUMMARY.md</automated>
  </verify>
  <done>
    - SUMMARY creado con veredicto explícito
    - Si PASS → Plan 08 puede proceder
    - Si FAIL → orchestrator decide siguiente paso
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Tienda dev (real Shopify) → callback productivo | Primer contacto real con Shopify; cualquier mismatch de redirect_uri / scope / secret se detecta aquí |
| Usuario → smoke test | Operación manual; usuario puede causar errores accidentales (e.g., tipear mal el dominio) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-shopify-oauth-33 | D (DoS) | Cold start lambda hace timeout en webhook creation | mitigate | Logs verifican `duration` < 10s; A1 (Plan 01) confirmó plan Vercel suficiente |
| T-shopify-oauth-34 | I (Information disclosure) | `access_token` aparece en logs durante el smoke | mitigate | Task 2 step 5 verifica explícitamente que NO aparece `access_token=` ni `shpat_` en logs |
| T-shopify-oauth-35 | T (Tampering) | Pitfall 9 (422 idempotent) no implementado correctamente | mitigate | Failure path opcional re-install test cubre exactamente este escenario |
</threat_model>

<verification>
Sin tests automatizados (este plan es 100% manual + observacional). Los gates están en Task 2 §"Verificar".

Notas para el operador:
- Tener Vercel logs abiertos antes de Task 2 step 3 (para no perder logs).
- Si el cold start > 10s → revisar Vercel plan (Hobby = 10s timeout; necesita Pro 60s).
- Si webhooks_ok < 3 → revisar Vercel logs por `[oauth-callback] webhook X failed: ...` y verificar manualmente en Shopify Admin cuáles existen.
</verification>

<success_criteria>
- [ ] Push exitoso a main + Vercel deploy READY
- [ ] Smoke OAuth end-to-end PASS (8 steps de Task 2)
- [ ] DB confirma 1 row con access_token non-legacy + granted_scope correcto
- [ ] Shopify Admin muestra 3 webhooks API version 2024-01 formato JSON
- [ ] Logs muestran `success` + `webhooks_ok=3/3` + duration < 10s
- [ ] Cero leakage de `access_token` en logs
- [ ] Pedido test (opcional) llega a `/api/webhooks/shopify`
- [ ] SUMMARY documentado con veredicto explícito
</success_criteria>

<output>
`.planning/standalone/shopify-dev-dashboard-oauth/07-SUMMARY.md` — ver Task 3 above.
</output>
