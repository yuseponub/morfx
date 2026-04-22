# Changelog — design_handoff_morfx

## v2 · consolidación

Revisión tras auditoría del handoff original. Se arreglaron todas las inconsistencias reportadas.

### Tipografía — unificada contra el CSS real
- **Antes** (README): decía "Instrument Serif + Space Grotesk".
- **Ahora**: `EB Garamond` (display/serif), `Cormorant Garamond` (fallback display), `Inter` (sans UI), `JetBrains Mono` (mono), `EB Garamond` con small-caps para rúbricas — que es lo que los mocks realmente renderizan vía `colors_and_type.css`.
- **Decisión**: fuente de verdad = CSS; README se ajusta al CSS.

### Estética — unificada
- **Antes**: README decía "editorial + terminal / swiss newspaper"; CSS decía "old paper / Bible / dictionary".
- **Ahora**: sección §2 reescrita como **"paper / Bible / dictionary"**, explicando qué es y qué **no** es. Se elimina cualquier referencia a "swiss newspaper" o "terminal".

### Radios — unificados
- **Antes** (README): decía 4/8px.
- **Ahora**: valores reales del CSS documentados — `--radius-0: 0`, `--radius-1: 2`, `--radius-2: 3`, `--radius-3: 4` (default), `--radius-pill: 999`.

### Dark mode — decisión explícita (§8 nueva)
- Decisión: **solo light en v1**. La estética paper/dictionary requiere rediseño deliberado para dark, no se puede resolver con swap de tokens.
- Se excluye del toggle de tema del proyecto host hasta que haya ronda de diseño específica.

### Estados — loading / empty / error (§10 nueva)
- Patrón completo definido para Conversaciones: loading (skeleton con pulse sutil), empty (bandeja limpia / filtro sin resultados), error (canal caído / 404 dedicado).
- Sin ilustraciones — resolución tipográfica, coherente con la estética.
- Claude Code debe replicar el patrón en los otros 7 módulos.

### Responsive — breakpoints (§9 nueva)
- Tabla de breakpoints: ≥1440 / 1280–1439 / 1024–1279 / 768–1023 / <768.
- Comportamiento explícito: sidebar colapsa a 56px (icons only), panel lateral → drawer overlay, tablas → cards, kanban → acordeón apilado.
- Comportamiento específico para Conversaciones (3 cols → 2 → stack).

### Texturas de papel (§7 nueva)
- Confirmado: `--paper-grain` y `--paper-fibers` **se aplican al body real** a través de `mx-doc`. No son solo decoración de los mocks.
- Uso recomendado: sí al root/body; no a cards individuales ni a canvas interactivos.
- Nota de performance para Safari retina (mover a `::before` con opacidad si hace falta).

### Lucide — versión fijada (§11 nueva)
- Mocks cargan `@latest` para visualización — aceptable en referencia.
- **Implementación debe fijar versión**: `lucide-react@0.460.0` o la última estable verificada al momento. Nunca `@latest` en producción.

### Tags/pills — clases oficiales nuevas (§6)
- Antes: `.tg.red/.gold/.indi/.ver` definidos localmente en `conversaciones.html` y `crm.html` con valores OKLCH hardcoded — no usaban tokens.
- **Añadido al CSS**: bloque de clases `mx-tag` + `mx-tag--rubric`, `mx-tag--gold`, `mx-tag--indigo`, `mx-tag--verdigris`, `mx-tag--ink` construidas con `color-mix(in oklch, <token> N%, var(--paper-0))` sobre los tokens oficiales `--rubric-*` y `--accent-*`.
- Los mocks legados conservan `.tg.*` locales (no se tocaron para no romper snapshots visuales). Al portar a código de producción **reemplazar por `mx-tag--*`** — indicado en el README.

### Sub-vistas por módulo — tabla completa (§4)
- Antes: README listaba un HTML por módulo sin aclarar qué cubría y qué no.
- **Ahora**: tabla con dos columnas por módulo — "vistas/estados incluidos en el HTML" y "vistas/estados faltantes (TODO Claude Code)".
- Ejemplo — Tareas: el HTML sí contiene kanban + toggle a lista + detalle con timeline; faltan modal de crear-tarea, subtareas, filtros avanzados.

---

## Archivos tocados en v2

```
+ CHANGELOG.md                      (nuevo)
M README.md                         (reescrito)
M colors_and_type.css               (+42 líneas: clases mx-tag)
  mocks/*.html                      (sin cambios — conservan .tg.* legado)
```
