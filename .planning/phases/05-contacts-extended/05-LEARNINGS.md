# Phase 5: Contacts Extended - Learnings

**Fecha:** 2026-01-29
**Duración:** ~43 minutos
**Plans ejecutados:** 4

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| Timeline title no aceptaba ReactNode | Tipo definido como string | Cambiar tipo a `React.ReactNode` | Definir props flexibles desde inicio para composición |
| PapaParse worker causaba errores en Next.js | Incompatibilidad con build de Next.js | Usar `worker: false` | Probar librerías en entorno Next.js antes de integrar |
| JSONB diff incluía updated_at | Trigger capturaba todos los cambios | Filtrar `updated_at` en el loop | Definir campos ignorados explícitamente en triggers |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| JSONB para custom_fields | Columnas dinámicas, EAV pattern | Flexibilidad, índices GIN, menor complejidad |
| react-csv-importer para import | papaparse-importer, custom wizard | Mantenido activamente, buen UX de mapeo out-of-the-box |
| BOM en export CSV | Sin BOM, encoding alternativo | Excel requiere BOM para UTF-8 correcto |
| Timeline como componente UI | Inline en cada uso | Reutilización entre notas y actividad |
| Tabs para contact detail | Accordion, sections | Organización clara, patrón familiar de UI |
| Activity via trigger | Activity via application code | Captura cambios directos a DB, más confiable |
| Notes activity via app code | Notes activity via trigger | Notas requieren metadata (preview) que trigger no tiene |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| FieldInput | CustomFieldDefinition | Tipos no coincidían para `options` | Usar `as string[]` cast seguro |
| CsvImportDialog | contacts.ts | bulkCreateContacts no existía | Agregar Server Action con batch insert |
| ActivityTimeline | activity.ts | Tipo `user` podía ser null | Tipar correctamente con `| null` |

## Tips para Futuros Agentes

### Lo que funcionó bien
- Trigger con SECURITY DEFINER para logging sin bypass de RLS
- JSONB diff calculado en el trigger (no en app) para consistencia
- Batch inserts de 100 para balance memoria/rendimiento
- BOM character (`\ufeff`) al inicio del CSV para Excel

### Lo que NO hacer
- NO usar `worker: true` en PapaParse con Next.js
- NO permitir cambiar `key` de custom field después de creación
- NO hacer insert individual para bulk operations
- NO olvidar timezone America/Bogota en timestamps

### Patrones a seguir
- Dynamic Zod schema builder para validación flexible
- Optimistic updates con revert en error
- Server Actions con `revalidatePath` para refresh
- Separar parser y exporter en archivos distintos

### Comandos útiles
```bash
# Verificar TypeScript compila
cd morfx && pnpm exec tsc --noEmit

# Listar dependencias instaladas
pnpm list papaparse react-csv-importer

# Ver estructura de archivo
head -50 src/lib/csv/parser.ts
```

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| contact_relation usa text input en vez de combobox | Baja | Post-MVP |
| No hay drag-drop para reorder custom fields | Baja | Post-MVP |
| Activity no captura cambios en tags (solo via app code) | Media | Phase 9 (sync) |
| File field solo acepta URL, no upload | Media | Post-MVP |

## Notas para el Módulo

Información específica que un agente de documentación de este módulo necesitaría saber:

- **Custom Fields**: Los tipos soportados son 12, pero `file` y `contact_relation` tienen limitaciones en MVP
- **Activity Trigger**: Usa `auth.jwt() ->> 'sub'` para obtener user_id, puede ser null en operaciones directas DB
- **Import Flow**: 5 pasos (upload → parse → duplicates → import → results) con estado en componente
- **Export**: Usa PapaParse `unparse()` con `columns` para orden específico de headers
- **Timeline**: Componente genérico, recibe `isLast` prop para ocultar línea en último item
- **Notes vs Activity**: Notes tienen su propia tabla, activity log captura todo incluyendo note operations

---
*Generado al completar la fase. Input para entrenamiento de agentes de documentación.*
