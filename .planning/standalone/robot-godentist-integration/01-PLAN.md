# Plan 01: Robot — Agregar campo `estado` al scraping

## Objetivo
Extraer la columna "Estado" de la tabla de citas para poder filtrar las canceladas en MorfX.

## Tareas

### T1: Agregar `estado: string` al tipo `Appointment`
- Archivo: `godentist/robot-godentist/src/types/index.ts`
- Agregar campo `estado` al interface

### T2: Extraer `estado` en `extractAppointments()`
- Archivo: `godentist/robot-godentist/src/adapters/godentist-adapter.ts`
- Columnas conocidas: Hora(0) | Paciente(1) | Estado(2) | Teléfono(3) | Doctor(4) | Tipo(5) | E(6) | C(7) | Comentarios(8)
- Usar `allTextContents()` SIN filtrar vacíos para mantener posición
- Extraer `estado` de `cells[2]` (raw, antes del filter)
- Mantener heurísticas existentes para hora/nombre/telefono como fallback

### T3: Deploy a Railway
- Push cambios al branch/repo del robot
- Verificar con scraping real que `estado` aparece en el output

## Criterios de Éxito
- [ ] Output del robot incluye campo `estado` en cada cita
- [ ] Citas con "Cancelada" tienen ese valor visible en el JSON
- [ ] Robot sigue funcionando correctamente (no romper extracción existente)
