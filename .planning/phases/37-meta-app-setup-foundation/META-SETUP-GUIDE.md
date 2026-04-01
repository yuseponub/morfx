# Meta App Setup Guide (SETUP-04)

Guia paso a paso para configurar la Meta App de MorfX y habilitar la integracion directa con WhatsApp, Facebook Messenger e Instagram.

---

## Prerequisitos

Antes de empezar, necesitas:

1. **Cuenta personal de Facebook** — para acceder a developers.facebook.com
2. **Meta Business Portfolio** — creado en business.facebook.com (si no tienes, se crea al verificar negocio)
3. **Business Verification completada** — documentos de la empresa subidos y aprobados por Meta
4. **Two-Factor Authentication (2FA)** — habilitado en tu cuenta de Facebook
5. **Dominio propio** — `morfx.app` (ya configurado y apuntando a Vercel)

---

## Paso 1: Crear Meta App

> NOTA: Si ya creaste la app, salta al Paso 2.

1. Ve a https://developers.facebook.com/apps/
2. Click **"Create App"**
3. Selecciona use case: **"Connect with customers through WhatsApp"**
4. Nombre de la app: **MorfX**
5. Vincula a tu Business Portfolio verificado
6. Click **"Create App"**

---

## Paso 2: Habilitar Productos

En el dashboard de tu app (sidebar izquierda):

1. **WhatsApp** — ya debe estar habilitado si seleccionaste el use case correcto
2. **Facebook Login for Business** — se agrega automaticamente
3. **Messenger** — Click "Add Product" > buscar "Messenger" > "Set Up" (hacer esto cuando lleguemos a Phase 40)
4. **Instagram** — Click "Add Product" > buscar "Instagram" > "Set Up" (hacer esto cuando lleguemos a Phase 41)

> Por ahora solo necesitas WhatsApp + Facebook Login for Business.

---

## Paso 3: Configurar WhatsApp

### 3a. API Setup

1. En sidebar: **WhatsApp > API Setup**
2. Anota el **Phone Number ID** y **WhatsApp Business Account ID** (son de prueba, para testear)
3. El **Access Token** temporal (24h) se genera aqui — generalo cuando te lo pida el desarrollador

### 3b. Configurar Webhook

1. En sidebar: **WhatsApp > Configuration**
2. En la seccion **Webhook**:
   - **Callback URL:** `https://morfx.app/api/webhooks/meta`
   - **Verify Token:** el valor de `META_WEBHOOK_VERIFY_TOKEN` (ver Paso 7)
3. Click **"Verify and Save"**
4. Suscribete a estos campos (checkboxes):
   - `messages` — mensajes entrantes
   - `message_template_status_update` — cambios de estado de templates

> IMPORTANTE: El webhook no va a funcionar hasta que el codigo este desplegado en Vercel. Configura la URL pero no te preocupes si falla la verificacion por ahora.

### 3c. Numero de Prueba

1. En **API Setup**, seccion "Send and receive messages"
2. Tienes un numero de prueba asignado por Meta
3. Para enviar mensajes de prueba, agrega numeros de destinatario (max 5)
4. Estos numeros de prueba solo funcionan con los permisos de desarrollo (no necesitan App Review)

---

## Paso 4: App Settings

1. En sidebar: **App Settings > Basic**
2. Copia y guarda:
   - **App ID** → sera `META_APP_ID`
   - **App Secret** (click "Show") → sera `META_APP_SECRET`
3. Configura:
   - **App Domains:** `morfx.app`
   - **Privacy Policy URL:** `https://morfx.app/privacy` (necesitas crear esta pagina)
   - **Terms of Service URL:** `https://morfx.app/terms` (necesitas crear esta pagina)
4. Click **"Save Changes"**

> NOTA: Privacy Policy y Terms son OBLIGATORIOS para App Review. Pueden ser paginas simples.

---

## Paso 5: Submit App Review

1. En sidebar: **App Review > Permissions and Features**
2. Solicita **Advanced Access** para estos permisos:

### Permisos de WhatsApp (solicitar ahora):

| Permiso | Para que | Video requerido |
|---------|----------|-----------------|
| `whatsapp_business_messaging` | Enviar/recibir mensajes WhatsApp | SI |
| `whatsapp_business_management` | Gestionar templates, numeros, WABAs | SI |

### Permisos de FB/IG (solicitar despues, cuando lleguemos a Phase 40-41):

| Permiso | Para que | Video requerido |
|---------|----------|-----------------|
| `pages_messaging` | Enviar/recibir mensajes Messenger | SI |
| `instagram_manage_messages` | Enviar/recibir DMs Instagram | SI |
| `business_management` | Access Business Portfolio endpoints | SI |

### Tips para el video walkthrough:

- Muestra la **interfaz del dashboard de MorfX** (lo que ve el negocio), NO el chat del consumidor
- Muestra como cada permiso se usa en la plataforma
- Duracion: 2-5 minutos es suficiente
- Graba en pantalla con audio explicando cada seccion

### Timeline:

- Review tipico: **24-72 horas**
- Maximo: **5 dias habiles**
- Si rechazan: revisa la pestana "App Requests" para ver el feedback, corrige, y resubmit

---

## Paso 6: Generar Encryption Key

Ejecuta este comando en tu terminal local:

```bash
openssl rand -base64 32
```

El output sera algo como: `K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=`

Guarda este valor — sera `META_TOKEN_ENCRYPTION_KEY`.

> CRITICO: Este key encripta los tokens de acceso de tus clientes. Si lo pierdes, necesitas regenerar y reconectar todos los workspaces.

---

## Paso 7: Variables de Entorno en Vercel

Ve a Vercel > tu proyecto > Settings > Environment Variables y agrega:

| Variable | Valor | Descripcion |
|----------|-------|-------------|
| `META_APP_ID` | Del Paso 4 (App ID) | Facebook App ID (numerico) |
| `META_APP_SECRET` | Del Paso 4 (App Secret) | Facebook App Secret (hex string) |
| `META_WEBHOOK_VERIFY_TOKEN` | Cualquier string random, ej: `morfx_meta_verify_2026` | Token para verificacion de webhook URL |
| `META_TOKEN_ENCRYPTION_KEY` | Del Paso 6 (base64 string de 44 chars) | Key AES-256-GCM para encriptar tokens |
| `META_CONFIG_ID` | (dejar vacio por ahora) | Se configura en Phase 38 (Embedded Signup) |

> IMPORTANTE: Asegurate de agregar las variables tanto en **Production** como en **Preview** environments.
> NUNCA uses el prefijo `NEXT_PUBLIC_` para estas variables — son secrets del servidor.

---

## Paso 8: Tech Provider Enrollment

Para que tus clientes puedan conectar sus cuentas de WhatsApp via Embedded Signup, necesitas registrarte como Tech Provider:

1. Ve a **business.facebook.com > Settings > Business Assets**
2. Busca la opcion de **Tech Provider enrollment**
3. Completa el formulario (requiere Business Verification aprobada)
4. Acepta los terminos del programa

> NOTA: El deadline original era Junio 30, 2025. Si el enrollment no carga o no esta disponible, intenta:
> - Usar ventana de incognito
> - Verificar que Business Verification este aprobada
> - Contactar a Meta Business Support

### Requisitos del Tech Provider:

- Business Verification completada ✓
- 2FA habilitado ✓
- Meta App creada con WhatsApp ✓
- App Review aprobado (para permisos de messaging)

---

## Paso 9: Privacy Policy y Terms of Service

Meta requiere paginas publicas de Privacy Policy y Terms of Service. Crea paginas simples en MorfX:

### Privacy Policy (`/privacy`) debe mencionar:

- Que datos se recopilan (mensajes, contactos, media)
- Como se usan los datos de WhatsApp/Facebook/Instagram
- Que datos se comparten con Meta
- Como los usuarios pueden solicitar eliminacion de datos
- Contacto para preguntas de privacidad

### Terms of Service (`/terms`) debe mencionar:

- Condiciones de uso de la plataforma
- Responsabilidades del usuario
- Limitaciones del servicio

> Estas paginas son requeridas para App Review. No necesitan ser extensas, pero deben existir y cargar rapido.

---

## Paso 10: Troubleshooting

### App Review rechazado

1. Ve a **App Review > App Requests**
2. Lee el feedback de Meta — usualmente es especifico
3. Razones comunes de rechazo:
   - Video walkthrough no muestra la interfaz del negocio
   - Privacy Policy URL no carga o no menciona WhatsApp
   - Permisos solicitados que no se usan en la app
4. Corrige y resubmit — no hay penalidad por resubmitir

### Business Verification demorada

- Tipicamente toma 2-10 dias habiles
- Si pasan mas de 10 dias, contacta Meta Business Support
- Asegurate de que los documentos subidos sean legibles y coincidan con la info del negocio
- Documentos aceptados: Certificado de Camara de Comercio, RUT, extracto bancario, factura de servicios

### Webhook verification falla

- Verifica que el codigo este desplegado en Vercel con la ruta `/api/webhooks/meta`
- Verifica que `META_WEBHOOK_VERIFY_TOKEN` en Vercel coincida con el Verify Token en Meta dashboard
- Revisa los logs de Vercel para ver si la request llega

### Token temporal expira

- El token de API Setup dura 24 horas
- Para desarrollo: genera uno nuevo desde API Setup
- Para produccion: los tokens BISUAT (de Embedded Signup) no expiran

---

## Resumen de lo que queda pendiente

| Item | Estado | Cuando |
|------|--------|--------|
| Business Verification | EN REVIEW | Esperar 2-10 dias |
| Meta App creada | HECHO | Ya creada |
| WhatsApp producto | HECHO | Ya habilitado |
| Webhook configurado | PENDIENTE | Cuando el codigo este desplegado |
| App Review (WA permisos) | PENDIENTE | Despues de tener video walkthrough |
| Tech Provider enrollment | PENDIENTE | Despues de Business Verification |
| Env vars en Vercel | PENDIENTE | Ahora (Paso 7) |
| Privacy Policy / Terms | PENDIENTE | Antes de App Review |
| Messenger producto | FUTURO | Phase 40 |
| Instagram producto | FUTURO | Phase 41 |

---
*Guia creada: 2026-03-31*
*Valida hasta: completar Phase 37-38*
