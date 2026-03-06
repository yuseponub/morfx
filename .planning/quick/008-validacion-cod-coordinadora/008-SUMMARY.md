# Quick 008: Validacion COD en Robot Coordinadora

## Resultado

**Estado:** COMPLETO
**Commits:** 620959f (migration), 91a544c (validation gate)
**Fecha:** 2026-03-06

## Cambios

### 1. Migracion SQL: seed COD coverage (620959f)
- `supabase/migrations/20260306000001_seed_cod_coverage.sql`
- UPDATE carrier_coverage SET supports_cod=true para 1,180 ciudades del Excel "Poblaciones RCE"
- Las ~309 ciudades restantes mantienen supports_cod=false (solo pago anticipado)

### 2. Validacion COD en subirOrdenes (91a544c)
- `src/app/actions/comandos.ts` — paso 6c entre validacion de ciudad y creacion de robot job
- Logica: si orden es COD (sin tag P/A Y total_value > 0) y ciudad no soporta COD → rechazar
- Ordenes P/A y valor $0 pasan siempre sin importar COD
- Mensaje claro: "Ciudad X no soporta recaudo contra-entrega (COD). Use pago anticipado (tag P/A) o elija otra transportadora."

## Datos

| Metrica | Valor |
|---------|-------|
| Ciudades COD (supports_cod=true) | 1,180 |
| Ciudades solo prepaid | ~309 |
| Total carrier_coverage | 1,489 |
