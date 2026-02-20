# Bigin → MorfX Migration: Learnings

## Fase 3 — Upload a Supabase Producción

### Resumen Final
- **Duración total**: 81.6 minutos (3 iteraciones del script)
- **0 errores** en la ejecución final

| Dato | Input | Output | Post-Cleanup |
|------|-------|--------|--------------|
| Contactos | 20,058 normalizados | 20,009 insertados (40 sin phone, 9 ya existían) | 20,009 |
| Ventas (order-groups + standalone) | 24,195 + 1,959 | 26,154 órdenes | **24,195** (1,959 duplicados eliminados) |
| Logísticas (groups + standalone) | 22,236 + 6 | 22,242 órdenes | 22,242 |
| Envíos (groups + standalone) | 3,832 + 39 | 3,871 órdenes | 3,871 |
| **Total órdenes migradas** | | **52,267** | **50,308** (+ 85 reales = 50,393 en DB) |
| Vinculadas (source_order_id) | | 26,068 | 26,068 |
| Productos asignados | | 25,574 | 25,179 |
| Órdenes sin contacto | | 564 | — |
| updated_at restaurados | | 25,574 | — |

---

## Bugs y Problemas Encontrados

### BUG 1: Contactos con teléfono NULL
- **Qué pasó**: 40 de 20,058 contactos tenían `phone: null` en el JSON normalizado. Al hacer batch INSERT de 500, un solo NULL fallaba TODO el batch (2,558 contactos perdidos en la v1).
- **Causa raíz**: La tabla `contacts` tiene `phone TEXT NOT NULL`. Un row inválido falla toda la transacción batch.
- **Fix**: Filtrar contactos sin phone ANTES de insertar. Retry individual cuando un batch falla.
- **Para próxima vez**: SIEMPRE validar NOT NULL constraints antes de batch insert. Filtrar datos inválidos en la preparación, no durante el insert.

### BUG 2: UPSERT sobreescribe datos existentes
- **Qué pasó**: Usamos `upsert({onConflict: 'workspace_id,phone'})` para contactos. Esto SOBREESCRIBÍA el `custom_fields` de contactos pre-existentes con datos de Bigin. Luego el cleanup borraba esos contactos pensando que eran de migración.
- **Resultado**: Perdimos 104 contactos originales.
- **Fix**: Cambiar de UPSERT a INSERT-only para nuevos. Cargar existentes en un Set y filtrar antes de insertar.
- **Para próxima vez**: NUNCA usar upsert en migraciones si puede sobreescribir datos de producción. Usar INSERT con control explícito de duplicados.

### BUG 3: `updated_at` sobreescrito por trigger en cascada
- **Qué pasó**: Al insertar `order_product`, el trigger `update_order_total()` hace un `UPDATE orders SET total_value = ...`, que dispara `orders_updated_at` que setea `updated_at = NOW()`.
- **Cadena**: INSERT order_product → trigger update_order_total → UPDATE orders → trigger orders_updated_at → updated_at = NOW()
- **Fix**: Después de insertar products, hacer UPDATE individual para restaurar el `updated_at` original. Esto es LENTO (25k updates individuales ≈ 1 hora).
- **Para próxima vez**: Antes de la migración, DESHABILITAR triggers con `ALTER TABLE orders DISABLE TRIGGER orders_updated_at`, hacer la migración, y luego `ENABLE TRIGGER`. Mucho más rápido.

### BUG 4: Order-groups con venta NULL (392)
- **Qué pasó**: El archivo `order-groups.json` incluía 392 groups donde `venta: null` (eran logísticas/envíos standalone empaquetados como groups). El código asumía que todo group tenía venta.
- **Fix**: Agregar `if (!group.venta) continue;` y manejar standalone por separado.
- **Para próxima vez**: SIEMPRE verificar la estructura de datos antes de procesar. Hacer un scan de nulls/anomalías en los campos críticos.

### BUG 5: Datasets de input NO eran mutuamente exclusivos (1,959 duplicados)
- **Qué pasó**: Las 1,959 ventas en `unmatched.ventasSinLogistica` eran las MISMAS ventas que ya estaban como `venta` dentro de `order-groups.json` (groups cuya logística era null). El script de upload las insertó dos veces: una desde el loop de order-groups y otra desde el loop de standalone ventas.
- **Causa raíz**: El script de normalización (02-normalize.ts) puso estas ventas en AMBOS archivos. `order-groups.json` las incluía como groups con `venta` presente pero `logistica: null`, y `unmatched.json` las listaba como "ventas sin logística". No eran datasets mutuamente exclusivos.
- **Resultado**: 1,959 bigin_ids duplicados en el pipeline de Ventas (3,918 órdenes donde debían ser 24,195 únicas). Total insertado: 26,154 cuando el real era 24,195.
- **Detección**: Auditoría post-migración con script `04-post-audit.ts` que agrupa por `custom_fields->>bigin_id` y cuenta duplicados por pipeline.
- **Fix**: Script `04b-cleanup-duplicates.ts` con dry-run + --execute. Eliminó las 1,959 copias sin productos ni hijos. 0 efectos colaterales.
- **Para próxima vez**: SIEMPRE validar que los datasets de input sean mutuamente exclusivos antes de insertar. Antes de la migración, cruzar los IDs entre archivos: `const ventaIdsInGroups = new Set(orderGroups.map(g => g.venta?.id)); const overlap = unmatched.ventasSinLogistica.filter(v => ventaIdsInGroups.has(v.id));` Si overlap > 0, hay un bug en la normalización.

### PERF 1: Idempotency check per-record es prohibitivo
- **Qué pasó**: La v1 hacía `SELECT count FROM orders WHERE bigin_id = X` por cada orden antes de insertar. Con 75,000+ órdenes, esto hacía 75k queries individuales. A ~100ms cada una = 2+ horas solo en checks.
- **Fix**: Eliminar el check si partimos de estado limpio. Si se necesita idempotencia, cargar TODOS los bigin_ids existentes en un Set al inicio.
- **Para próxima vez**: NUNCA hacer queries individuales en loops de migración. Precargar datos de validación en memoria.

### PERF 2: INSERT individual vs batch
- **Qué pasó**: La v2 insertaba cada orden individualmente (necesario por la dependencia source_order_id). Cada INSERT es un round-trip a Supabase (~100ms).
- **Fix**: Separar en 3 pasadas batch: 1) todas las ventas (batch 200), 2) todas las logísticas con source_order_id ya resuelto, 3) todos los envíos.
- **Resultado**: De ~61,000 requests individuales → ~300 batch requests. De horas a minutos.
- **Para próxima vez**: SIEMPRE diseñar la migración con batch inserts. Si hay dependencias (source_order_id), separarlas en pasadas secuenciales.

---

## Checklist para Próxima Migración

### Pre-migración
- [ ] Auditar datos: contar nulls en todos los campos NOT NULL
- [ ] Verificar constraints UNIQUE y NOT NULL de las tablas destino
- [ ] Mapear stages/pipelines/productos ANTES de escribir código
- [ ] Test con 1 registro completo antes de batch
- [ ] Identificar triggers que podrían interferir (updated_at, totales, actividad)
- [ ] Decidir: ¿deshabilitar triggers durante migración?
- [ ] **Validar que datasets de input sean mutuamente exclusivos** (cruzar IDs entre archivos, overlap = 0)

### Script de migración
- [ ] Filtrar datos inválidos ANTES del insert (no dejar que falle el batch)
- [ ] INSERT-only para nuevos registros (NO upsert que sobreescribe producción)
- [ ] Batch inserts (200-500 por request)
- [ ] Si hay dependencias entre tablas, usar pasadas secuenciales
- [ ] Precargar datos de validación en memoria (no queries en loop)
- [ ] Retry individual cuando un batch falla (para salvar los válidos)
- [ ] Guardar bigin_id o equivalente en custom_fields para idempotencia
- [ ] Preservar timestamps originales (created_at, updated_at)

### Post-migración
- [ ] Verificar counts por tabla y por pipeline/stage
- [ ] **Auditar duplicados por bigin_id dentro de cada pipeline** (script 04-post-audit.ts)
- [ ] Verificar vinculaciones (source_order_id chains)
- [ ] Verificar contactos sin orden y órdenes sin contacto
- [ ] Guardar log completo en archivo JSON

### Cleanup
- [ ] Script de cleanup idempotente por si necesitas re-ejecutar
- [ ] NO borrar contactos por custom_fields si pueden haber sido sobreescritos
- [ ] Usar bigin_id en orders como flag confiable de "dato migrado"

---

## Tiempos Observados (Supabase cloud, 20k+ registros)

| Operación | Velocidad | Notas |
|-----------|-----------|-------|
| Batch INSERT contacts (500/batch) | ~2,500/min | Fast |
| Batch INSERT orders (200/batch) | ~3,000/min | Fast |
| Batch INSERT order_products (200/batch) | ~3,000/min | Fast |
| Individual UPDATE (fix updated_at) | ~400/min | Slow — evitar |
| Individual SELECT (idempotency check) | ~600/min | Prohibitivo en volumen |

### Conclusión clave
Para migraciones de >10k registros contra Supabase cloud:
- **Batch inserts = minutos**
- **Individual operations = horas**
- **Deshabilitar triggers = evita post-fixes costosos**

---

## Versiones del Script

Fueron necesarias **3 iteraciones** del script:

### v1 (03-upload.ts original)
- Idempotency check por cada record (SELECT antes de INSERT)
- Batch contacts con upsert
- **Problemas**: Extremadamente lento (~200 orders en 3 min = días para 52k), upsert sobreescribía contactos, batch failure por phone NULL

### v2 (optimizado sin idempotency)
- Eliminó idempotency check, INSERT individual por orden
- INSERT-only para contactos (no upsert)
- Filtro de phones null
- **Problemas**: Aún lento por INSERT individual (~200/3min)

### v3 (batch 3-pasadas) — FINAL
- 3 pasadas batch: ventas → logísticas → envíos
- 200 records por batch INSERT
- Mapeo bigin_id → morfx_id entre pasadas
- **Resultado**: 52,267 órdenes en ~20 min (+ 60 min para fix updated_at)

---

## Arquitectura del Pipeline de Datos

```
Bigin API → 01-download.ts → data/pipelines.json (54,405 deals raw)
                                    ↓
                  02-normalize.ts → data/normalized/
                                    ├── contacts.json (20,058)
                                    ├── order-groups.json (24,587)
                                    ├── unmatched.json (1,959 ventas + 45 envíos)
                                    └── rematch-candidates.json (6 log + 39 env real)
                                    ↓
                  03-upload.ts → Supabase producción
                                    ├── contacts (20,009 nuevos)
                                    ├── orders (52,267 total → 50,308 post-cleanup)
                                    ├── order_products (25,574 → 25,179 post-cleanup)
                                    └── upload-log/migration-results.json
                                    ↓
                  04-post-audit.ts → Auditoría duplicados + vinculación
                  04b-cleanup-duplicates.ts → Eliminó 1,959 duplicados
                                    └── upload-log/cleanup-audit.json
```

## Estado Final Post-Cleanup

| Pipeline | Órdenes | Vinculadas | Productos |
|----------|---------|------------|-----------|
| Ventas | 24,195 bigin + 85 reales = 24,280 | — | 25,179 |
| Logística | 22,242 | 22,236 → ventas | — |
| Envíos | 3,871 | 3,832 → logísticas | — |
| **Total** | **50,393** | **26,068** | **25,179** |

- 0 duplicados bigin_id restantes
- 0 links rotos (source_order_id)
- 85 órdenes reales (equipo Somnio, Feb 17-20) sin bigin_id — intactas

## Notas Pendientes
- Los 564 órdenes sin contacto son deals cuyo teléfono no matcheaba con ningún contacto normalizado (phones en formato diferente, sin phone, etc.)
- Los 40 contactos sin phone fueron excluidos — si se necesitan, agregarlos manualmente
- Las 85 órdenes reales (sin bigin_id) tienen stage_ids que apuntan a stages eliminados — requieren reasignación de stage
- El script 03e-cleanup-partial.ts permite limpiar y re-ejecutar si es necesario
