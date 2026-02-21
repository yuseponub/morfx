# Phase 24: Chat de Comandos UI - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Interfaz tipo terminal dentro de MorfX para que el equipo de operaciones y admin ejecuten comandos de logística y monitoreen el progreso del robot en tiempo real. No incluye nuevos comandos de robot ni integraciones con otros carriers — solo la UI para interactuar con la infraestructura existente (Phases 21-23).

</domain>

<decisions>
## Implementation Decisions

### Ubicación y navegación
- Módulo nuevo "Comandos" en el sidebar, entre "Tareas" y "Automatizaciones"
- Ruta propia: `/comandos` (página dedicada)
- Accesible para admin y equipo de operaciones (ambos roles)

### Estilo visual
- Consistente con el diseño actual de MorfX, similar al módulo Sandbox existente
- No estilo terminal oscuro — sigue el look & feel de la plataforma
- Panel split: chat/comandos a la izquierda, historial + logs a la derecha
- Los logs sirven como referencia para debugging con Claude Code (informativos, no herramientas de debug en la UI)

### Comandos disponibles
- `subir ordenes coord` — Comando principal: valida ciudades + sube órdenes a Coordinadora en un solo flujo
  - Toma automáticamente las órdenes de la etapa del pipeline preconfigurada (sin parámetros)
  - Paso 1: Valida ciudades de las órdenes
  - Paso 2: Sube las válidas, reporta las inválidas (no detiene el lote por errores individuales)
- `estado` — Estado del job actual
- `ayuda` — Muestra comandos disponibles
- `validar ciudades` NO es comando separado — está integrado en `subir ordenes coord`

### Input y accesibilidad
- Input de texto simple (sin historial de comandos con flechas)
- Botones rápidos/chips clickeables para cada comando
- Al usar botón: pide confirmación antes de ejecutar
- Al escribir texto: ejecuta directamente
- Input se bloquea mientras hay un job en progreso ("Job en progreso...")

### Progreso en tiempo real
- Mientras procesa: contador en vivo que se actualiza ("3/20 procesadas...")
- Al terminar: reporte completo con detalle por orden (éxitos con número de pedido, errores con razón)
- Sin notificaciones push/toast al cambiar de pestaña
- Si el usuario sale y vuelve a Comandos durante un job activo: reconecta al progreso en vivo (detecta job activo)

### Historial de trabajos (panel derecho)
- Lista/tabla cronológica inversa (más recientes primero)
- Columnas: fecha, comando, resultado (X éxitos, Y errores), estado
- Sin filtros — simple scroll
- No hay retry desde historial — errores se corrigen manualmente y se corre nuevo comando

### Claude's Discretion
- Detalle al hacer click en un job del historial (expandir fila vs panel de detalle)
- Diseño exacto del layout split (proporciones, responsive)
- Formato del spinner/contador en vivo
- Diseño de los botones rápidos (chips, icon buttons, etc.)
- Cómo mostrar los logs de debug en el panel derecho

</decisions>

<specifics>
## Specific Ideas

- "Debe tener el mismo look que la plataforma, parecido al sandbox que tenemos actualmente"
- El chat se siente como una interfaz de operaciones, no como una terminal de developer
- Botones de comando con confirmación es para que el equipo de operaciones no se equivoque
- Los logs son para apoyo de debugging con Claude Code, no para que el usuario final debuggee directamente

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 24-chat-de-comandos-ui*
*Context gathered: 2026-02-22*
