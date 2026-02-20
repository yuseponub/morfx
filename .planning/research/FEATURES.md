# Feature Landscape: Logistics Module for COD E-commerce CRM

**Domain:** Shipping robot automation, command-based logistics operations
**Researched:** 2026-02-20
**Confidence:** MEDIUM-HIGH

## What Already Exists in MorfX

- Order fields: `carrier`, `tracking_number`, `shipping_address`, `shipping_city`, `shipping_department`
- Pipeline stages recognize: "despachado", "enviado", "en reparto", "devuelto", "entregado"
- `order.stage_changed` automation trigger with shipping context variables
- `duplicate_order` action for cross-pipeline workflows

## Table Stakes

| Feature | Complexity | Notes |
|---------|------------|-------|
| **Pipeline stage → robot trigger** | Medium | Stage change = robot trigger. Core workflow |
| **Carrier assignment per order** | Low | Already exists as free text. Needs dropdown |
| **Guide number storage/display** | Low | `tracking_number` field exists. Needs bulk update |
| **Shipping address validation** | High | 1,122 municipalities, many similar names |
| **City-to-DANE-code mapping** | High | Carriers require DANE codes (5-digit). ~1,122 codes |
| **Bulk order selection for shipping** | Medium | Select multiple orders → execute robot for all |
| **Command interface for operations** | Medium | Replaces Slack. Must feel like chat, not forms |
| **Robot execution status/feedback** | Medium | Real-time: "Processing 23/50... 2 errors" |
| **Order-to-carrier data formatting** | Medium | Each carrier needs specific format |
| **Carrier config per workspace** | Medium | Credentials, default carrier, pickup address |

## Differentiators

| Feature | Value | Complexity |
|---------|-------|------------|
| **Inline command chat** | No context switching (vs Slack) | Medium |
| **Real-time robot progress** | Live updates per order (vs N8N blind wait) | Medium |
| **Cross-pipeline logistics tracking** | Order syncs between Ventas and Despachos pipelines | Medium |
| **Carrier-aware city autocomplete** | Show only valid cities per carrier | High |
| **Failed delivery workflow** | Auto-trigger WhatsApp + task on "novedad" | Medium |
| **Batch command history** | Audit trail + quick re-run of failed orders | Low |

## Anti-Features (DO NOT Build)

| Anti-Feature | Why Avoid | Do Instead |
|--------------|-----------|------------|
| **Real-time carrier tracking API** | Unreliable, rate-limited, changes without notice | Store guide number, link to carrier tracking page |
| **Multi-carrier rate shopping** | 1000+ city pairs × 4 carriers, rates change monthly | Let team choose based on experience |
| **Carrier API integration** | No public API or unstable. Playwright is battle-tested | Keep Playwright approach |
| **Warehouse management (WMS)** | COD ships from small warehouses. WMS adds no value | Simple pick list: orders ready to ship |
| **Autonomous robot scheduling** | Dangerous without human oversight | Always require human trigger |
| **Custom shipping label designer** | Carrier labels are standard | Use carrier-generated labels |

## Dependency Order

```
1. City/DANE Code Database
     |
     v
2. Carrier Configuration (per workspace)
     |
     +------→ 3. Command Chat Interface
     |
     v
4. Robot Engine (Playwright)
     |
     +------→ 5a. Coordinadora Robot (MVP)
     +------→ 5b. Inter Robot (future)
     +------→ 5c. Envia Robot (future)
```

## Colombian Carrier Specifics

### Coordinadora (PRIMARY - v3.0 scope)
- Portal: ff.coordinadora.com (Playwright automation)
- Needs: DANE code, recipient, phone, address, city, dept, pieces, weight, declared value, COD value
- ~700+ municipalities, strong in Antioquia/Eje Cafetero
- 1,488 cities validated + 1,181 COD cities

### Inter, Envia, Bogota (documented for future)
- Inter: Portal automation OR PDF label generation
- Envia: Excel bulk upload to portal
- Bogota: Local carrier, simplified process

## City/DANE Code System

- 5-digit code (2 dept + 3 municipality): 11001=Bogota, 05001=Medellin, 76001=Cali
- ~1,122 municipalities total
- Data model: `dane_municipalities` table + `carrier_coverage` mapping

## MVP Recommendation

1. DANE municipality database (foundation)
2. Carrier configuration per workspace (credentials)
3. Command chat interface (basic, hardcoded commands)
4. Coordinadora robot (single carrier first, prove the pattern)

---
*Research completed: 2026-02-20*
