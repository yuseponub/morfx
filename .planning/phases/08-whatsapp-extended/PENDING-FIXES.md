# Phase 8 - Estado Actual (31 ene 2026 - 19:25 COL)

## ✅ RESUELTO: Mensajes no llegaban a MORFX

**Causa:** Bug de Turbopack con `CostCategory` tipo importado que causaba error 500 en webhook.

**Fix:** Definir el tipo localmente en cada archivo en lugar de importarlo:
- `src/lib/whatsapp/cost-utils.ts`
- `src/lib/whatsapp/webhook-handler.ts`
- `src/app/actions/usage.ts`

---

## ✅ RESUELTO: Error de join con profiles

**Causa:** Query de Supabase intentaba join con `profiles` usando FK que no existía.

**Fix:** Removido el join de `assignee:profiles!conversations_assigned_to_fkey` en:
- `src/app/actions/conversations.ts` (2 lugares)

---

## ✅ RESUELTO: Templates no mostraban error real de 360dialog

**Causa:** `createTemplate` siempre retornaba `{ success: true }` aunque fallara la API.

**Fix:** Ahora retorna el error específico de 360dialog/Meta al frontend.

---

## ⏳ PENDIENTE: Sync automático de templates

**Problema:** La función `syncTemplateStatuses` no actualiza correctamente los estados de templates desde 360dialog.

**Fix aplicado:** Normalización de status a mayúsculas (`remote.status?.toUpperCase()`).

**Estado:** Necesita más investigación. Por ahora usar botón "Sincronizar" manual o actualizar DB directamente.

---

## ⏳ EN PRUEBA: Template esperando aprobación de Meta

**Template:** `morfx_notificacion`
- Status en 360dialog: **PENDING**
- Categoría: UTILITY
- Body: "Hola, tienes una nueva notificacion de MorfX. Revisa tu cuenta para mas detalles."

**Para verificar aprobación:**
```bash
source .env.local && curl -s "https://waba-v2.360dialog.io/v1/configs/templates" -H "D360-API-KEY: ${WHATSAPP_API_KEY}" | grep morfx_notificacion -A5
```

---

## Comandos útiles

### Verificar templates en 360dialog:
```bash
source .env.local && curl -s "https://waba-v2.360dialog.io/v1/configs/templates" -H "D360-API-KEY: ${WHATSAPP_API_KEY}"
```

### Verificar templates en DB local:
```bash
source .env.local && curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/whatsapp_templates?select=name,status" -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
```

### Forzar actualización de status de template:
```bash
source .env.local && curl -s -X PATCH "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/whatsapp_templates?name=eq.NOMBRE_TEMPLATE" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"status":"APPROVED"}'
```

### Verificar últimos mensajes:
```bash
source .env.local && curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/messages?select=direction,content,timestamp&order=timestamp.desc&limit=5" -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
```

### Re-registrar webhook en 360dialog:
```bash
source .env.local && curl -s -X POST "https://waba-v2.360dialog.io/v1/configs/webhook" \
  -H "D360-API-KEY: ${WHATSAPP_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://TU-URL-NGROK.ngrok-free.dev/api/webhooks/whatsapp"}'
```

---

## Próximas pruebas

1. **Verificar aprobación de template** - Esperar que Meta apruebe `morfx_notificacion`
2. **Probar envío de template** - Una vez aprobado, probar envío fuera de ventana 24h
3. **Crear template con variables** - Probar formato correcto: `Hola {{1}}, tu mensaje aqui {{2}}. Texto final.`
4. **Probar costos** - Verificar que se registren costos de mensajes en `/configuracion/whatsapp/costos`

---

*Última actualización: 2026-01-31 19:25 COL*
