# BOLD Payment Link — Standalone

## Goal
Permitir generar links de pago de BOLD desde cada conversación de WhatsApp del dashboard. Un botón abre un modal con (monto, descripción), dispara un **robot Playwright** que automatiza el panel web de BOLD, y devuelve la URL del link generado para que el usuario la copie y la envíe manualmente al cliente por el chat.

## Por qué Playwright (no API)

BOLD tiene API oficial (`POST /online/link/v1`) pero requiere aprobación comercial humana que **no llegó** tras varios días. El usuario ya tiene cuenta activa de BOLD y acceso al panel web. Scrapeamos el panel con Playwright — mismo patrón que Robot Coordinadora y Robot GoDentist.

⚠️ **Riesgo documentado:** El scraping puede violar los ToS de BOLD. Uso exclusivamente interno y bajo volumen (solo triggers manuales desde el chat, no loops automatizados). Si BOLD algún día aprueba la API, migramos el cliente interno y dejamos el robot deprecated — el contrato externo (server action) no cambia.

## User decisions (discuss-phase)

1. **Ubicación del botón:** Header de la conversación de WhatsApp, a la derecha de los toggles de agentes (`chat-header.tsx` L240-263, insertar en L263 antes del botón GoDentist L266).

2. **Inputs del modal:**
   - Monto en COP (number, requerido)
   - Descripción libre (text, requerido — ej "1x ELIXIR DEL SUEÑO")
   - ~~Imagen del producto~~ **DROPADO** — el panel web de BOLD no permite imagen en la creación de links (solo la API la acepta)

3. **Output:** Campo readonly dentro del modal con la URL del link + botón "Copiar".

4. **Credenciales BOLD:** Usuario + Contraseña del panel, guardados en tabla `integrations` con `type='bold'` y `config = { username, password }`. Plaintext (deuda técnica heredada de Shopify/Twilio, ya documentada como P2).

5. **Sin 2FA:** Confirmado por el usuario — la cuenta BOLD no pide código al loguear.

6. **Sin webhooks de pago confirmado.** Link one-shot, no se persiste en BD.

7. **Infra del robot:** **Nuevo servicio Railway** `bold-robot` (NO reusar `morfx-production` ni `godentist-production`). Decisión del usuario para mantener aislamiento.

8. **Scope:** Standalone, 2 waves (robot + integración Next.js).

## Flujo exacto del panel BOLD (investigado con usuario)

1. `https://panel.bold.co` → login con username + password (sin 2FA)
2. Navegar a `https://panel.bold.co/misventas/pagos-en-linea`
3. Click en "Links de pago" → `https://panel.bold.co/misventas/pagos-en-linea/link-de-pago`
4. Click en "Crear nuevo link" → `https://panel.bold.co/misventas/pagos-en-linea/link-de-pago/nuevo/agregar-monto`
5. **Step 01 — Agregar monto:** escribir monto → click "Continuar"
6. **Step 02 — Personalizar:** escribir descripción → click "Crear link de pago"
7. **Step 03 — Compartir:** URL `https://panel.bold.co/misventas/pagos-en-linea/link-de-pago/nuevo/compartir`
   - Muestra botón **"Copiar link"** (el que dispara la captura del URL real)
   - Muestra preview del link visible al cliente
   - ⚠️ **Puede aparecer popup de NPS** ("De 0 a 10, ¿qué tan recomendarías...") que bloquea clicks — el robot debe detectarlo y cerrarlo (click en X) antes de seguir.

## Estrategia para extraer la URL del link generado

Tres estrategias, en orden de preferencia:

**A) Interceptar `navigator.clipboard.writeText`** antes de click en "Copiar link":
```js
await page.addInitScript(() => {
  window.__clipboardValue = null
  const original = navigator.clipboard.writeText.bind(navigator.clipboard)
  navigator.clipboard.writeText = (text) => {
    window.__clipboardValue = text
    return original(text)
  }
})
// ... click "Copiar link"
const url = await page.evaluate(() => window.__clipboardValue)
```

**B) Extraer del DOM:** inspeccionar la preview card "Así lo verá tu cliente" y leer el href o text del link visible.

**C) Conceder permisos de clipboard a Playwright:**
```js
await context.grantPermissions(['clipboard-read', 'clipboard-write'])
// después del click
const url = await page.evaluate(() => navigator.clipboard.readText())
```

En implementación probamos A primero. Si falla, caemos a B. C es fallback adicional.

## Touch points en código (research)

| Concern | Path | Líneas | Notas |
|---|---|---|---|
| Header conversación WA | `src/app/(dashboard)/whatsapp/components/chat-header.tsx` | L240–263 | Insertar botón justo después del bloque de toggles (L263), antes del botón GoDentist (L266) |
| Patrón server action integraciones | `src/app/actions/integrations.ts` | L20–160 | `getIntegrationAuthContext`, `canManageIntegrations` (exportar), `saveTwilioIntegration` (replicar) |
| Patrón lectura integration | `src/app/actions/shopify.ts` | L24–44 | `getShopifyIntegration` — replicar shape |
| UI configuración tabs | `src/app/(dashboard)/configuracion/integraciones/page.tsx` | L66–171 | Añadir `<TabsTrigger value="bold">` y `<TabsContent value="bold">` |
| Form existente referencia | `src/app/(dashboard)/configuracion/integraciones/components/twilio-form.tsx` | — | Patrón a copiar para `bold-form.tsx` |
| Robot reference | `godentist/robot-godentist/` | — | Estructura a replicar: Dockerfile + Express + Playwright + debug screenshots |

## Estructura del nuevo robot

```
bold-robot/
├── Dockerfile              # mcr.microsoft.com/playwright:v1.58.2-noble
├── package.json            # express + playwright
├── server.js               # Express app con /api/health, /api/create-link, /api/screenshots
├── src/
│   ├── bold-client.js      # Playwright flow (login + create link)
│   └── screenshots.js      # Helper para guardar debug screenshots
├── screenshots/            # Volumen de debug
├── .dockerignore
└── README.md               # Cómo desplegar en Railway
```

Repo: misma convención que `godentist/robot-godentist/` (dentro del monorepo morfx, Railway configura root directory). **NO crear repo separado.**

## Out of scope

- Webhooks de pago confirmado (BOLD callback_url)
- Persistir links generados en BD
- Action de automatización / tool del agente
- Encriptación de credenciales BOLD (deuda técnica heredada P2)
- Imagen del producto en el link (el panel web no lo soporta)
- Soporte multi-currency (solo COP)
- Múltiples sesiones concurrentes del robot (secuencial es suficiente para uso manual)

## Verification criteria

1. Robot desplegado en Railway responde `GET /api/health` con 200
2. `POST /api/create-link` con credenciales válidas + monto + descripción retorna `{ url: "https://checkout.bold.co/LNK_xxx" }` en ~15-30s
3. Errores de login (password incorrecta) devuelven error legible, no timeout
4. Screenshots debug disponibles en `/api/screenshots` cuando falla el flow
5. Admin/owner puede guardar credenciales BOLD desde `/configuracion/integraciones` tab "BOLD"
6. Botón "Cobrar con BOLD" aparece en chat-header de cualquier conversación WhatsApp del workspace (si BOLD está configurado)
7. Click en botón → modal → submit → muestra URL del link real en campo readonly con botón copiar
8. Copiar la URL y abrirla en otra pestaña muestra el checkout real de BOLD con el monto y descripción correctos
9. Popup de NPS del panel BOLD no bloquea el flow
10. Si el workspace no tiene BOLD configurado, el botón se oculta

## Waves

- **Wave 1 (Plan 01):** Robot Playwright + deploy a Railway. Verificable con `curl` independientemente de Next.js.
- **Wave 2 (Plan 02):** Integración Next.js (server actions, UI config, botón + modal en chat). Depende de tener URL del robot desplegado.
