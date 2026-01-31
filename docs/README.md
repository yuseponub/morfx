# MorfX Platform - CRM + WhatsApp + IA Distribuida

> Parte del proyecto **Modelo de IA Distribuida** de Jose Romero

## Contexto

MorfX es la plataforma CRM + WhatsApp que unifica:
- **Agentes de Venta** (workflows en `/AGENTES-IA-FUNCIONALES-v3`)
- **Agentes Logísticos** (workflows en `/Agentes-logisticos`)
- **CRM propio** con integración WhatsApp nativa

## Estructura de esta Carpeta

```
MorfX-Platform/
├── README.md                          # Este archivo
├── docs/
│   ├── 01-analisis-plataforma.md      # Análisis completo de viabilidad
│   ├── 02-stack-tecnologico.md        # Tecnologías recomendadas
│   └── 03-roadmap.md                  # Fases de desarrollo
├── architecture/
│   ├── 01-ia-distribuida-v3.md        # Arquitectura de agentes
│   ├── 02-sistema-retroactivo.md      # Sistema de retroalimentación para State Analyzer
│   ├── 03-carolina-logistica.md       # Chatbot interno para operaciones
│   └── 04-database-schema.md          # Esquemas de base de datos
└── roadmap/
    └── features-por-fase.md           # Features detalladas por fase
```

## Relación con Otros Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                    MODELO IA DISTRIBUIDA                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │  AGENTES DE VENTA   │    │ AGENTES LOGÍSTICOS  │            │
│  │  (Carolina v3)      │    │ (Carolina Logística)│            │
│  │  - State Analyzer   │    │ - Procesador Guías  │            │
│  │  - Data Extractor   │    │ - Gestor Inventario │            │
│  │  - Order Manager    │    │ - Tracker Envíos    │            │
│  │  - Sistema Retroact.│    │ - Chatbot Interno   │            │
│  └──────────┬──────────┘    └──────────┬──────────┘            │
│             │                          │                        │
│             └──────────┬───────────────┘                        │
│                        ▼                                        │
│             ┌─────────────────────┐                            │
│             │   PLATAFORMA MORFX  │                            │
│             │   (CRM + WhatsApp)  │                            │
│             │   - Dashboard       │                            │
│             │   - Inbox unificado │                            │
│             │   - Pipelines       │                            │
│             │   - Reportes        │                            │
│             └─────────────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Estado Actual

| Componente | Estado | Ubicación |
|------------|--------|-----------|
| Agentes de Venta | ✅ Funcional | `/workflows`, `/docs` |
| Agentes Logísticos | 🟡 En desarrollo | `/Agentes-logisticos` |
| Sistema Retroactivo | 📋 Diseñado | `/architecture/02-sistema-retroactivo.md` |
| Carolina Logística | 📋 Diseñado | `/architecture/03-carolina-logistica.md` |
| Plataforma MorfX | 📋 Planificado | Esta carpeta |

## Próximos Pasos

1. Implementar Sistema Retroactivo en State Analyzer
2. Desarrollar Carolina Logística (chatbot interno)
3. Iniciar MVP de plataforma MorfX con v0 + Cursor

---
*Última actualización: 2026-01-23*
