# Plan: Automatizaciones — Filas + Carpetas con Drag & Drop

**Objetivo:** Cambiar la vista de automatizaciones de grid de cards a filas, agregar sistema de carpetas desplegables con drag & drop para organización.

---

## Requisitos Confirmados

1. **Layout filas** — Reemplazar grid de cards por filas largas y angostas
2. **Carpetas** — Desplegables (▼/►), sin redirección, drag & drop para reordenar
3. **Drag & drop automaciones** — Mover dentro/fuera de carpetas, reordenar posición
4. **Eliminar carpeta** — Confirmación con nombres de automatizaciones → elimina todo (CASCADE)
5. **Filtros** — Búsqueda/categoría ignoran carpetas → resultados planos
6. **Crear carpeta** — Botón "Nueva carpeta" junto a "Nueva automatización"
7. **Renombrar carpeta** — Desde menú ⋮

## Decisiones Técnicas

- **Librería DnD:** `@dnd-kit/react` v0.3.2 (React 19 compatible, nested sortable, cross-container)
- **DB:** Nueva tabla + columnas, RLS idéntico al patrón existente
- **Server actions:** Seguir patrón existente (no domain layer, consistente con automations actual)
- **Posiciones:** Integer con gaps (1000, 2000, 3000) para reordenamiento eficiente

---

## Tareas

### T1: Migración de Base de Datos
**Archivo:** `supabase/migrations/YYYYMMDD_automation_folders.sql`

```sql
-- Tabla de carpetas
CREATE TABLE automation_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_collapsed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Índices
CREATE INDEX idx_automation_folders_workspace ON automation_folders(workspace_id);

-- RLS (mismo patrón que automations)
ALTER TABLE automation_folders ENABLE ROW LEVEL SECURITY;
-- SELECT, INSERT, UPDATE, DELETE policies usando is_workspace_member()

-- Trigger updated_at
CREATE TRIGGER automation_folders_updated_at ...

-- Columnas nuevas en automations
ALTER TABLE automations ADD COLUMN folder_id UUID REFERENCES automation_folders(id) ON DELETE CASCADE;
ALTER TABLE automations ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_automations_folder ON automations(folder_id);
```

**Nota:** `folder_id ON DELETE CASCADE` = eliminar carpeta elimina sus automatizaciones.

**Criterio de éxito:** Migración aplica sin errores, tablas creadas con RLS.

---

### T2: Tipos TypeScript
**Archivo:** `src/lib/automations/types.ts`

Agregar:
```typescript
export interface AutomationFolder {
  id: string
  workspace_id: string
  name: string
  position: number
  is_collapsed: boolean
  created_at: string
  updated_at: string
}
```

Actualizar `Automation`:
```typescript
export interface Automation {
  // ... campos existentes ...
  folder_id: string | null    // NUEVO
  position: number             // NUEVO
}
```

**Criterio de éxito:** Tipos compilan sin errores.

---

### T3: Server Actions para Carpetas
**Archivo:** `src/app/actions/automations.ts`

Nuevas acciones:
- `getFolders()` → Todas las carpetas del workspace, ordenadas por position
- `createFolder(name: string)` → Crear carpeta con position al final
- `renameFolder(id, name)` → Renombrar
- `deleteFolder(id)` → Eliminar carpeta + automatizaciones (CASCADE). Retornar nombres de automaciones para confirmación.
- `getFolderAutomations(folderId)` → Nombres de automaciones en carpeta (para diálogo de confirmación)
- `toggleFolderCollapse(id)` → Alternar is_collapsed
- `reorderFolders(orderedIds: string[])` → Actualizar positions
- `moveAutomation(automationId, folderId: string | null, position: number)` → Mover a carpeta/raíz
- `reorderAutomations(updates: {id: string, folder_id: string | null, position: number}[])` → Batch reorder

Actualizar acciones existentes:
- `getAutomations()` → Incluir `folder_id` y `position` en select, ordenar por position
- `duplicateAutomation()` → Copiar en misma carpeta, position al final
- `createAutomation()` → Aceptar `folder_id` opcional

**Criterio de éxito:** Todas las acciones funcionan con auth + workspace verification.

---

### T4: Instalar @dnd-kit/react
```bash
npm install @dnd-kit/react
```

**Criterio de éxito:** Instala sin conflictos de peer deps.

---

### T5: Reescribir automation-list.tsx — Layout de Filas
**Archivo:** `src/app/(dashboard)/automatizaciones/components/automation-list.tsx`

Cambios principales:
1. **Eliminar grid de cards** → Lista vertical de filas
2. **Cada fila de automatización:**
   - Handle de drag (≡) a la izquierda
   - Nombre + descripción truncada
   - Badge de trigger (categoría + color)
   - Badge de acciones (N acciones)
   - Estado última ejecución
   - Toggle switch
   - Menú ⋮ (editar, duplicar, mover a carpeta, eliminar)
3. **Cada fila de carpeta:**
   - Handle de drag (≡) a la izquierda
   - Flecha desplegable (▼/►)
   - Nombre de carpeta
   - Conteo de automatizaciones
   - Menú ⋮ (renombrar, eliminar)
4. **Estado colapsado** de carpetas: usar is_collapsed de DB

**Visual de una fila de automatización:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ ≡  Nombre de la automatización      [CRM] [2 acc]  Exitosa 2h  ● ⋮│
│    Descripción truncada...                                         │
└─────────────────────────────────────────────────────────────────────┘
```

**Visual de una fila de carpeta (expandida):**
```
┌─────────────────────────────────────────────────────────────────────┐
│ ≡  ▼ Onboarding                                      3 autom.    ⋮│
├─────────────────────────────────────────────────────────────────────┤
│   ≡  Bienvenida WhatsApp            [WA] [1 acc]  Exitosa 1h   ● ⋮│
│   ≡  Asignar pipeline               [CRM] [1 acc] Sin ejec.    ● ⋮│
│   ≡  Crear tarea seguimiento        [Tareas] [2]  Fallida 3h   ● ⋮│
└─────────────────────────────────────────────────────────────────────┘
```

**Criterio de éxito:** Layout funcional sin drag & drop aún.

---

### T6: Integrar Drag & Drop
**Archivo:** `src/app/(dashboard)/automatizaciones/components/automation-list.tsx`

Usar `@dnd-kit/react`:
- `DragDropProvider` wrapper
- `useSortable` para carpetas (reordenar entre sí)
- `useSortable` para automatizaciones (reordenar + mover entre carpetas/raíz)
- `DragOverlay` para feedback visual durante drag
- On drop: llamar `reorderFolders()` o `moveAutomation()` server action
- Optimistic updates para UX fluida

**Comportamientos de drag:**
1. **Drag carpeta** → Solo reordena entre carpetas (no puede ir dentro de otra carpeta)
2. **Drag automatización** → Puede:
   - Reordenar dentro de su carpeta actual
   - Mover a otra carpeta (drop sobre carpeta)
   - Mover a raíz (drop fuera de carpetas)
   - Reordenar en raíz

**Criterio de éxito:** Drag & drop funcional con persistencia en DB.

---

### T7: CRUD de Carpetas en UI
**Agregar a** `automation-list.tsx`:

1. **Botón "Nueva carpeta"** — Al lado de "Nueva automatización" en header
   - Input inline para nombre
   - Enter para crear, Escape para cancelar
2. **Renombrar carpeta** — Desde menú ⋮, inline edit
3. **Eliminar carpeta** — AlertDialog con lista de automatizaciones que se eliminarán
4. **Mover a carpeta** — Opción en menú ⋮ de automatización con sub-menú de carpetas disponibles

**Criterio de éxito:** CRUD completo funcional.

---

### T8: Filtros Ignoran Carpetas
Cuando `search` o `categoryFilter` están activos:
- Aplanar estructura → mostrar todas las automatizaciones como filas sin carpetas
- Al limpiar filtros → restaurar estructura de carpetas

**Criterio de éxito:** Filtrar muestra lista plana, limpiar restaura carpetas.

---

### T9: Actualizar page.tsx
**Archivo:** `src/app/(dashboard)/automatizaciones/page.tsx`

- Llamar `getFolders()` además de `getAutomations()`
- Pasar ambos a `AutomationList`

**Criterio de éxito:** Página carga con datos de carpetas y automatizaciones.

---

## Orden de Ejecución

```
T1 (DB) → T2 (Types) → T3 (Server Actions) → T4 (Install DnD)
    ↓
T9 (Page) → T5 (Layout Filas) → T6 (Drag & Drop) → T7 (CRUD Carpetas) → T8 (Filtros)
```

T1-T4 son backend/setup, T5-T8 son UI progresivo, T9 conecta ambos.

## Archivos Afectados

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/YYYYMMDD_automation_folders.sql` | NUEVO |
| `src/lib/automations/types.ts` | EDIT — agregar AutomationFolder, folder_id, position |
| `src/app/actions/automations.ts` | EDIT — CRUD carpetas + actualizar queries |
| `src/app/(dashboard)/automatizaciones/page.tsx` | EDIT — cargar folders |
| `src/app/(dashboard)/automatizaciones/components/automation-list.tsx` | REESCRIBIR — filas + carpetas + DnD |
| `package.json` | EDIT — agregar @dnd-kit/react |
