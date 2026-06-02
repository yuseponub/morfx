# GoDentist: Scraping General + Programacion de Recordatorios

## Objetivo
Transformar el area de "Confirmaciones" en un area de scraping general con:
1. Selector de fecha libre antes del scrape
2. Eleccion de accion post-scrape (enviar confirmacion actual O programar recordatorios)
3. Nuevo tab "Programacion" para gestionar envios programados

## Requisitos Detallados

### R1: Selector de Fecha
- Antes de "Obtener citas", el host elige la fecha del scrape
- Opciones rapidas: "Hoy", "Manana" (botones)
- Tambien calendario libre para cualquier fecha
- Formato del portal GoDentist: DD-MM-YYYY
- El robot actualmente fuerza `getNextWorkingDay()` — debe aceptar fecha custom

### R2: Eleccion de Accion Post-Scrape
Despues del scrape, el host elige UNA accion para todo el batch seleccionado:
- **Opcion A**: Enviar template de confirmacion (comportamiento actual sin cambios)
- **Opcion B**: Programar recordatorio 1h antes de cada cita

Es eleccion global para el batch seleccionado (parcial o completo).

### R3: Programacion de Recordatorios (Opcion B)
- Se toma la hora de cada cita del scrape
- Se calcula `hora_cita - 1h` como hora de envio
- **Validacion**: Solo se puede programar si la hora de envio es >= ahora + 15 min
  - Si ya paso o es < 15 min antes: no se puede programar esa cita
- Se crea un registro por cada cita programada
- Template: mismas 5 variables que el actual (nombre, sucursal, fecha, hora, direccion)
  - Template name: TBD (aun no creado en WhatsApp Business)
  - Por ahora usar placeholder `recordatorio_cita_godentist`
- El envio se ejecuta via Inngest `step.sleepUntil()`

### R4: Tab "Programacion"
Nuevo tab junto a "Nuevo scrape" e "Historial":
- **Vista principal**: Lista de envios programados pendientes
  - Muestra: nombre, telefono, hora de cita, hora de envio, sucursal, estado
  - El host puede cancelar envios individuales (toggle/boton)
- **Historial de programacion**: Envios ya ejecutados (enviados, fallidos, cancelados)
- Todo en hora Colombia (America/Bogota)

### R5: Fix Timezone
- Actualmente en historial los tiempos no estan en hora COL
- Corregir TODOS los timestamps a `America/Bogota`
- DB: `timezone('America/Bogota', NOW())`
- Frontend: `toLocaleString('es-CO', { timeZone: 'America/Bogota' })`

## Arquitectura Tecnica

### Robot (godentist-adapter.ts)
- `scrapeAppointments(filterSucursales?, targetDate?)` — nuevo parametro opcional
- Si `targetDate` viene en formato YYYY-MM-DD, usarlo en vez de `getNextWorkingDay()`
- Actualizar types y server route para pasar la fecha

### Nueva Tabla DB: `godentist_scheduled_reminders`
```sql
CREATE TABLE godentist_scheduled_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scrape_history_id UUID REFERENCES godentist_scrape_history(id),
  -- Appointment data
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  hora_cita TEXT NOT NULL,
  sucursal TEXT NOT NULL,
  fecha_cita TEXT NOT NULL,  -- YYYY-MM-DD
  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,  -- When to send
  inngest_event_id TEXT,              -- For cancellation
  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed | cancelled
  error TEXT,
  -- Timestamps
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);
```

### Inngest: Nuevo evento + funcion
- Evento: `godentist/reminder.send`
- Funcion: usa `step.sleepUntil(scheduled_at)` → envia template → actualiza DB
- Cancelacion: via `inngest.send()` con cancel event, o marcando en DB y checando antes de enviar

### Server Actions Nuevas
- `scheduleReminders(appointments, date, historyId)` — crea registros + dispara Inngest
- `getScheduledReminders()` — lista programados
- `cancelScheduledReminder(id)` — marca como cancelled

## Flujo Completo

1. Host abre /confirmaciones
2. Selecciona sucursales + fecha (hoy/manana/calendario)
3. Click "Obtener citas" → robot scrapea para esa fecha
4. Preview con citas, selecciona batch
5. Elige accion:
   a. "Enviar confirmaciones" → flujo actual
   b. "Programar recordatorios" → crea scheduled_reminders + Inngest events
6. Tab "Programacion": ve envios pendientes, puede cancelar
7. Al llegar la hora, Inngest envia template automaticamente

## Notas
- Separado de Somnio: Inngest event/function con namespace `godentist/`
- Template recordatorio: placeholder por ahora, se cambia cuando exista en WA Business
- Hora Colombia en TODA la UI y DB
