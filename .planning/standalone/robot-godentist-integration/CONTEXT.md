# Standalone: Robot GoDentist — Integración con MorfX

## Objetivo

Integrar el robot-godentist (Railway) con MorfX para enviar confirmaciones de citas por WhatsApp. Ejecución manual desde el dashboard (botón), no programada.

## Estado Actual

### Lo que ya existe

1. **Robot en Railway** (`godentist-production.up.railway.app`)
   - Express + Playwright service
   - Dockerfile: `mcr.microsoft.com/playwright:v1.58.2-noble`
   - Código en: `godentist/robot-godentist/`
   - Endpoint: `POST /api/scrape-appointments` → devuelve JSON con citas
   - Endpoint: `GET /api/health`
   - Endpoint: `GET /api/screenshots` / `GET /api/screenshots/:name`

2. **Template WhatsApp** (`confirmacion_asist_godentist`)
   - Creado en 360dialog para workspace GoDentist
   - Estado: PENDIENTE aprobación Meta (1-24h)
   - Variables:
     - `{{1}}` = nombre del paciente (ej: "Martha Isabel Arciniegas")
     - `{{2}}` = sucursal (ej: "Cabecera")
     - `{{3}}` = fecha con día de semana (ej: "lunes 10 de marzo")
     - `{{4}}` = hora (ej: "3:20 PM")
     - `{{5}}` = dirección de la sucursal

3. **API de envío existente** (`src/lib/whatsapp/api.ts`)
   - `sendTemplateMessage(apiKey, to, templateName, languageCode, components)`
   - API key por workspace: `workspaces.settings.whatsapp_api_key`

### Credenciales Robot

- Username: `JROMERO`, Password: `123456`
- Se pasan en el request body al robot
- Portal: https://godentist.dentos.co

### Ejemplo de Output del Robot (42 citas, 2026-03-10)

```json
{
  "success": true,
  "date": "2026-03-10",
  "totalAppointments": 42,
  "appointments": [
    {"nombre": "MARTHA ISABEL ARCINIEGAS ALVAREZ", "telefono": "573015551368", "hora": "3:20 PM", "sucursal": "CABECERA"},
    {"nombre": "YULIMAR RAMIREZ", "telefono": "573138126180", "hora": "3:20 PM", "sucursal": "FLORIDABLANCA"},
    {"nombre": "NELSON DAVID NIÑO RIOS", "telefono": "573168676520", "hora": "3:40 PM", "sucursal": "JUMBO EL BOSQUE"},
    {"nombre": "ERIKA GARCIA", "telefono": "573204608304", "hora": "3:20 PM", "sucursal": "MEJORAS PUBLICAS"}
  ]
}
```

Distribución típica: CABECERA ~17, FLORIDABLANCA ~14, JUMBO EL BOSQUE ~3, MEJORAS PUBLICAS ~8

### Tipos actuales del robot (`godentist/robot-godentist/src/types/index.ts`)

```typescript
interface Appointment {
  nombre: string
  telefono: string
  hora: string
  sucursal: string
}
```

**Falta campo `estado`** — necesario para filtrar citas con estado "Cancelada".

## Lo que Falta Construir

### 1. Robot: Agregar campo `estado` al scraping

- En `godentist-adapter.ts`, `extractAppointments()` debe extraer la columna "Estado" de la tabla
- Agregar `estado: string` al tipo `Appointment`
- La tabla tiene columnas: Hora | Paciente | Estado | Teléfono | Doctor | Tipo | E | C | Comentarios

### 2. MorfX: Pantalla de envío manual

- Ubicación sugerida: dentro del workspace GoDentist, sección WhatsApp o sección propia
- Botón "Enviar confirmaciones" que:
  1. Llama al robot API (scrape)
  2. Muestra tabla con las citas obtenidas (nombre, teléfono, hora, sucursal, estado)
  3. Filtra automáticamente las que dicen "Cancelada"
  4. El usuario revisa y presiona "Enviar"
  5. Envía template `confirmacion_asist_godentist` a cada cita válida
  6. Muestra resumen: enviados, fallidos, canceladas excluidas

### 3. Mapeo de direcciones por sucursal

Para la variable `{{5}}` del template:

| Sucursal | Dirección |
|----------|-----------|
| CABECERA | Calle 52 # 31-32 Edificio Elsita Piso 1 |
| JUMBO EL BOSQUE | Autopista Floridablanca # 24-26; CC Jumbo El Bosque, Floridablanca; Local 2030 |
| FLORIDABLANCA | Calle 4 # 3-06 Edificio Florida Plaza Condominio Local 1 |
| MEJORAS PUBLICAS | Calle 41 # 27-63 Edificio Ó41 Centro Empresarial Oficina 1002 |

### 4. Lógica de variables del template

- `{{1}}` = nombre en Title Case (ej: "Martha Isabel Arciniegas Alvarez")
- `{{2}}` = sucursal en Title Case (ej: "Cabecera")
- `{{3}}` = fecha con día de semana en español (ej: "lunes 10 de marzo")
- `{{4}}` = hora tal cual viene del robot (ej: "3:20 PM")
- `{{5}}` = dirección del mapeo según sucursal

## Decisiones

- **Ejecución manual**, no programada (cron). Alguien presiona el botón cada mañana.
- **Citas con estado "Cancelada" NO se envían** — se filtran después del scrape.
- **Un solo template** para todas las sucursales (la dirección es variable).
- **Credenciales del robot** almacenadas... (TBD — ¿en `carrier_configs`? ¿nueva tabla? ¿hardcoded por ahora?)

## Archivos Clave

### Robot (godentist/robot-godentist/)
- `src/adapters/godentist-adapter.ts` — Playwright scraping (login, filtros ExtJS, extracción)
- `src/api/server.ts` — Express endpoints
- `src/types/index.ts` — Tipos compartidos
- `Dockerfile` — Playwright Docker image

### MorfX (src/)
- `src/lib/whatsapp/api.ts` — `sendTemplateMessage()` para 360dialog
- `src/app/actions/templates.ts` — Server actions de templates (con hotfix API key por workspace)
- `src/lib/whatsapp/types.ts` — Tipos WhatsApp

## Riesgos

- **Template pendiente aprobación Meta** — no se puede enviar hasta que esté APPROVED
- **ExtJS IDs dinámicos** — el robot usa selectores estables (#idsucursalgrid, #df_fecha, #idhoras) pero la extracción de estado depende de la estructura de la tabla
- **Rate limits 360dialog** — enviar 42+ templates rápido podría triggerear rate limits (agregar delay entre envíos)
- **Números duplicados** — ¿qué pasa si un paciente tiene 2 citas el mismo día? (enviar 1 solo mensaje o 2?)

## Plan Estimado

1. **Plan 01**: Robot — agregar campo `estado` al scraping + deploy
2. **Plan 02**: MorfX — pantalla de confirmaciones (scrape + preview + envío)
