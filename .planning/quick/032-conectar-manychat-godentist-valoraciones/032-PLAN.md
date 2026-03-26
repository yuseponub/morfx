---
phase: quick-032
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/webhooks/manychat/route.ts
autonomous: true

must_haves:
  truths:
    - "ManyChat GoDentist Valoraciones webhook llega al workspace correcto (f0241182-f79b-4bc6-b0ed-b5f6eb20c514)"
    - "ManyChat Somnio sigue funcionando sin cambios"
    - "Cada workspace tiene su propio secret validado"
  artifacts:
    - path: "src/app/api/webhooks/manychat/route.ts"
      provides: "Multi-workspace ManyChat webhook resolver"
      contains: "searchParams.*workspace"
  key_links:
    - from: "ManyChat Flow (GoDentist)"
      to: "/api/webhooks/manychat?workspace=f0241182...&secret=SECRET"
      via: "External Request URL"
---

<objective>
Hacer el webhook de ManyChat multi-workspace para que GoDentist Valoraciones reciba mensajes de Facebook Messenger via ManyChat, sin romper Somnio.

Purpose: GoDentist Valoraciones necesita atender leads de Facebook Messenger con su agente AI.
Output: Webhook multi-workspace + SQL para configurar API key + instrucciones de setup ManyChat.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/api/webhooks/manychat/route.ts
@src/lib/manychat/webhook-handler.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Multi-workspace webhook resolver + per-workspace secret</name>
  <files>src/app/api/webhooks/manychat/route.ts</files>
  <action>
Actualizar `resolveWorkspaceForManyChat` y la validacion de secret para soportar multi-workspace via query params:

1. **Resolver workspace por query param `workspace`:**
   - Leer `request.nextUrl.searchParams.get('workspace')`
   - Si existe, usarlo como workspaceId directamente
   - Si no existe, fallback al env var `MANYCHAT_DEFAULT_WORKSPACE_ID` (backward compatible con Somnio)

2. **Validar secret per-workspace desde DB:**
   - Cambiar la validacion de secret para que soporte tanto el env var global `MANYCHAT_WEBHOOK_SECRET` como un secret per-workspace almacenado en `workspaces.settings->>'manychat_webhook_secret'`
   - Flujo:
     a. Si hay query param `secret`, comparar contra `MANYCHAT_WEBHOOK_SECRET` env var (global) O contra el `manychat_webhook_secret` del workspace en settings
     b. Si no hay secret y el env var tampoco existe, skip validation (dev mode)
   - IMPORTANTE: Mover la validacion de secret DESPUES del resolve de workspace, porque necesitamos el workspace_id para buscar el secret en settings

3. **Refactor del flujo en POST handler:**
   - Paso 1: Parse payload (ya existe)
   - Paso 2: Validate required fields (ya existe)
   - Paso 3: Resolve workspace (query param > env var > DB fallback)
   - Paso 4: Validate secret (env var global OR workspace settings)
   - Paso 5: Process webhook (ya existe)

4. **Actualizar firma de resolveWorkspaceForManyChat:**
   - Cambiar a `resolveWorkspaceForManyChat(request: NextRequest, payload: ManyChatWebhookPayload)`
   - O simplemente extraer el workspace del request en el POST handler antes de llamar la funcion

Mantener el fallback existente (env var + DB lookup) para backward compatibility con Somnio que ya funciona.
  </action>
  <verify>
TypeScript compila sin errores: `npx tsc --noEmit src/app/api/webhooks/manychat/route.ts` o build completo.
Revisar que el codigo maneja: (1) workspace en query param, (2) fallback a env var, (3) fallback a DB lookup.
  </verify>
  <done>
El webhook resuelve workspace por query param `?workspace=ID` con fallback a env var. Secret se valida contra env var global o settings del workspace. Somnio sigue funcionando sin cambios (usa env var).
  </done>
</task>

<task type="auto">
  <name>Task 2: SQL + instrucciones de setup ManyChat</name>
  <files>scripts/setup-godentist-manychat.sql</files>
  <action>
Crear archivo SQL con las queries necesarias para configurar GoDentist Valoraciones:

```sql
-- Agregar manychat_api_key y manychat_webhook_secret al workspace GoDentist Valoraciones
UPDATE workspaces
SET settings = COALESCE(settings, '{}'::jsonb)
  || '{"manychat_api_key": "1487106984933226:8531fb4f876f81d5eb7d5733cb20279c"}'::jsonb
  || '{"manychat_webhook_secret": "godentist-mc-secret-CAMBIAR"}'::jsonb
WHERE id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';

-- Verificar
SELECT id, name, settings->>'manychat_api_key' as mc_key, settings->>'manychat_webhook_secret' as mc_secret
FROM workspaces
WHERE id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';
```

Agregar comentarios con instrucciones de setup de ManyChat Flow:

```
-- ============================================================
-- INSTRUCCIONES SETUP MANYCHAT (para el usuario)
-- ============================================================
-- 1. Ir a ManyChat > Settings > General > API Key (ya configurada)
-- 2. Ir a ManyChat > Automation > Flows
-- 3. Crear un Flow con trigger "Default Reply" (o el trigger deseado)
-- 4. Agregar step "External Request" (POST)
--    URL: https://morfx.vercel.app/api/webhooks/manychat?workspace=f0241182-f79b-4bc6-b0ed-b5f6eb20c514&secret=godentist-mc-secret-CAMBIAR
--    Headers: Content-Type: application/json
--    Body (JSON):
--    {
--      "subscriber_id": "{{subscriber_id}}",
--      "first_name": "{{first_name}}",
--      "last_name": "{{last_name}}",
--      "name": "{{full_name}}",
--      "message_text": "{{last_input_text}}",
--      "channel": "{{channel}}"
--    }
-- 5. Guardar y activar el Flow
-- 6. Probar enviando un mensaje a la pagina de Facebook
```

NOTA: El usuario debe cambiar `godentist-mc-secret-CAMBIAR` por un secret seguro antes de ejecutar.
  </action>
  <verify>SQL es sintacticamente correcto. Las instrucciones son claras y completas.</verify>
  <done>
Archivo SQL listo para ejecutar en produccion. Instrucciones de ManyChat Flow documentadas en comentarios del mismo archivo.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` pasa sin errores
2. El webhook route.ts maneja los 3 escenarios: query param, env var, DB fallback
3. SQL file tiene las queries correctas con workspace_id de GoDentist Valoraciones
4. Instrucciones de ManyChat Flow completas en el SQL
</verification>

<success_criteria>
- Webhook ManyChat soporta multi-workspace via `?workspace=ID&secret=SECRET`
- Somnio sigue funcionando sin cambios (backward compatible via env var)
- SQL listo para ejecutar que configura manychat_api_key en GoDentist Valoraciones
- Instrucciones claras para configurar ManyChat Flow Builder
</success_criteria>

<output>
After completion, create `.planning/quick/032-conectar-manychat-godentist-valoraciones/032-SUMMARY.md`
</output>
