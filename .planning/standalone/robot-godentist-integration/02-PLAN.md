# Plan 02: MorfX — Pantalla de confirmaciones GoDentist

## Objetivo
Pantalla operativa donde alguien presiona un botón cada mañana para:
1. Scrape de citas del día → robot Railway
2. Preview en tabla (filtrar Cancelada automáticamente)
3. Enviar template WhatsApp a cada cita válida
4. Ver resumen de resultados

## Ubicación
- Ruta: `/confirmaciones` (sección propia en sidebar, ocultable por workspace)
- Solo visible para workspaces que lo necesiten (hidden_modules)

## Tareas

### T1: Server action — scrape + envío
**Archivo:** `src/app/actions/godentist.ts`

```typescript
'use server'

// scrapeAppointments(date?: string) → llama robot API, retorna citas
// sendConfirmations(appointments: Appointment[]) → envía templates, retorna resumen

// Mapeo de direcciones por sucursal
const SUCURSAL_ADDRESSES: Record<string, string> = {
  'CABECERA': 'Calle 52 # 31-32 Edificio Elsita Piso 1',
  'JUMBO EL BOSQUE': 'Autopista Floridablanca # 24-26; CC Jumbo El Bosque, Floridablanca; Local 2030',
  'FLORIDABLANCA': 'Calle 4 # 3-06 Edificio Florida Plaza Condominio Local 1',
  'MEJORAS PUBLICAS': 'Calle 41 # 27-63 Edificio Ó41 Centro Empresarial Oficina 1002',
}

// Title Case helper: "MARTHA ISABEL" → "Martha Isabel"
// Fecha helper: "2026-03-10" → "lunes 10 de marzo"

// sendTemplateMessage con components:
// body.parameters = [nombre, sucursal, fecha, hora, dirección]
// Delay 500ms entre envíos para evitar rate limits
```

### T2: Página + componente cliente
**Archivo:** `src/app/(dashboard)/confirmaciones/page.tsx` (server page, auth check)
**Archivo:** `src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx` (client component)

**Flujo UI:**
1. Estado inicial: botón "Obtener citas de hoy" + date picker opcional
2. Click → loading spinner → tabla con citas
3. Tabla muestra: checkbox | nombre | teléfono | hora | sucursal | estado
4. Filas con "Cancelada" marcadas en rojo y deseleccionadas
5. Resumen arriba: "42 citas, 38 para enviar, 4 canceladas"
6. Botón "Enviar confirmaciones (38)"
7. Click → progress bar → resultados (enviados ✓, fallidos ✗)

**Componentes UI existentes a usar:** Card, Button, Badge, Table (de shadcn)

### T3: Agregar al sidebar
**Archivo:** `src/components/layout/sidebar.tsx`

- Agregar item `{ href: '/confirmaciones', label: 'Confirmaciones', icon: CalendarCheck }`
- Solo visible si workspace tiene el módulo habilitado (no adminOnly, es operativo)

### T4: Verificar con scraping real
- Probar que el robot devuelve campo `estado`
- Probar envío de 1 template de prueba (si template está aprobado)

## Criterios de Éxito
- [ ] Botón scrape trae citas con campo estado visible
- [ ] Canceladas se filtran automáticamente (deseleccionadas + marcadas en rojo)
- [ ] Envío masivo funciona con delay entre mensajes
- [ ] Resumen muestra conteos correctos
- [ ] Rate limits manejados (500ms delay)
