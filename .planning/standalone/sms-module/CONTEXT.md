# Standalone: SMS Module - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Módulo SMS completo para clientes MorfX. Los clientes pueden ver su saldo, historial de SMS enviados, y estadísticas de entrega. Los SMS se envían via automatizaciones o llamadas directas desde código. El proveedor es Onurix (transparente para el usuario — el módulo se llama "SMS", no "Onurix"). Precio al cliente: $97 COP/SMS.

</domain>

<decisions>
## Implementation Decisions

### Ubicación en la UI
- Entrada propia en el sidebar: "SMS" (al mismo nivel que Contactos, Pedidos, WhatsApp)
- Página SMS contiene todo: dashboard + historial + configuración
- NO hay envío manual desde la página SMS — solo visualización y config
- Configuración SMS (activar servicio, ver saldo, toggle saldo negativo) vive dentro de la página SMS, no en Settings

### Modelo de créditos/cobro
- Prepago con saldo en COP
- Precio fijo: $97 COP por SMS
- Recarga manual (admin agrega saldo) — pasarela de pago en fase futura
- Por defecto: saldo negativo permitido (SMS se envía y saldo queda negativo)
- Configurable por workspace: toggle para bloquear envío cuando saldo llega a 0
- Cuando bloqueado y saldo=0: la automatización registra error "sin saldo SMS"
- Panel admin global para gestionar saldos de todos los workspaces

### Canales de envío
- Acción de automatización "Enviar SMS" — parámetros: número destino + mensaje libre con variables
- Función domain reutilizable sendSMS() que cualquier parte del código puede llamar (automatizaciones, scripts, procesos custom hardcoded)
- Número destino flexible: puede ser phone del contacto asociado, phone del pedido, o número custom — se decide al configurar la automatización o al llamar la función domain
- Mensaje libre con variables (ej: {{contacto.nombre}}, {{pedido.total}}) — NO templates predefinidos como WhatsApp
- NO campañas masivas en esta versión
- NO envío desde agente Somnio en esta versión
- NO envío manual desde UI en esta versión

### Dashboard y métricas
- Dashboard completo: saldo actual, SMS enviados hoy/semana/mes, tasa de entrega %, costo acumulado, gráfico de uso
- Tabla de historial con columnas: fecha, destinatario (nombre+número), mensaje, estado (enviado/entregado/fallido), costo, fuente (qué automatización lo disparó)

### Verificación de entrega
- Approach híbrido: check inmediato a 10s después de enviar + segundo check a 60s via Inngest si aún no confirma
- Máximo 2 requests de verificación por SMS
- Estados: pending → enviado → entregado/fallido
- Onurix solo cobra SMS con entrega confirmada por operador

### Proveedor (transparente para el usuario)
- API Onurix: POST /api/v1/sms/send (params: client, key, phone, sms)
- Verificación: GET /api/v1/messages-state (params: client, key, id)
- Credenciales Onurix: client=7976, key almacenado en env vars (NO en DB)
- Formato número: 57 + número (ej: 573137549286)
- Respuesta envío: { status: 1, id: "dispatch_id", data: { state, credits, sms, phone } }
- Respuesta verificación: [{ state: "Enviado", id, credits, phone, sms, dispatch_id }]

### Claude's Discretion
- Diseño exacto del dashboard (layout, charts library)
- Diseño de la tabla de historial (paginación, filtros disponibles)
- Estructura de la tabla DB para SMS logs
- Cómo se integra el panel admin global (ruta, permisos)
- Manejo de SMS largos (>160 chars = múltiples créditos)

</decisions>

<specifics>
## Specific Ideas

- Probamos la API de Onurix en vivo durante esta conversación — envío y verificación funcionan correctamente
- Onurix agrega "ONURIX.COM SMS DEMO:" en capa gratuita, desaparece en cuenta paga
- El módulo se llama "SMS" en todo el UI — Onurix nunca se menciona al usuario
- $97 COP/SMS es el precio al cliente; costo real es ~$6.9 COP (margen ~1,300%)
- Regulación CRC Colombia: SMS solo entre 8 AM - 9 PM, requiere autorización previa del destinatario

</specifics>

<deferred>
## Deferred Ideas

- Pasarela de pago para recarga automática de saldo — fase futura
- Campañas masivas de SMS (seleccionar contactos por tag/filtro) — fase futura
- Envío manual desde ficha de contacto o página SMS — fase futura
- SMS bidireccional (recibir respuestas) — fase futura
- Integración SMS con agente Somnio como herramienta — fase futura
- WhatsApp via Onurix — descartado (ya tenemos WhatsApp directo)

</deferred>

---

*Standalone: sms-module*
*Context gathered: 2026-03-16*
