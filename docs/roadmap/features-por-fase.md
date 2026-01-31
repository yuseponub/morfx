# Features Detalladas por Fase

---

## Fase 1: MVP

### 1.1 Autenticación

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Login con email | NextAuth con Magic Link o password | P0 |
| Sesión persistente | JWT con refresh tokens | P0 |
| Logout | Cerrar sesión correctamente | P0 |
| Recuperar contraseña | Email de reset (futuro) | P2 |

### 1.2 Dashboard

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Métricas principales | 4 cards: contactos, órdenes, mensajes, revenue | P0 |
| Actividad reciente | Lista de últimos eventos | P1 |
| Quick actions | Botones de acceso rápido | P2 |
| Gráficos básicos | Órdenes por día (futuro) | P2 |

### 1.3 Contactos

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Lista de contactos | Tabla con paginación | P0 |
| Búsqueda | Por nombre, teléfono, email | P0 |
| Filtros | Por tags, fecha, fuente | P1 |
| Vista de contacto | Detalle con historial | P0 |
| Editar contacto | Formulario de edición | P1 |
| Tags | Agregar/quitar tags | P0 |
| Exportar | CSV (futuro) | P2 |

### 1.4 Inbox WhatsApp

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Lista conversaciones | Ordenadas por último mensaje | P0 |
| Filtros | Por estado, tag, asignado | P1 |
| Vista conversación | Mensajes en tiempo real | P0 |
| Estado bot | Indicador on/off | P1 |
| Readonly | Solo visualización (MVP) | P0 |

### 1.5 Órdenes

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Vista Kanban | Columnas por stage | P0 |
| Drag & drop | Mover entre stages | P0 |
| Detalle orden | Vista completa | P0 |
| Crear orden manual | Formulario básico | P1 |
| Stages hardcodeados | 4 stages fijos | P0 |

### 1.6 Integración n8n

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Webhooks entrada | Recibir eventos de n8n | P0 |
| Webhooks salida | Enviar eventos a n8n | P1 |
| Sync tags | Bidireccional con Callbell | P0 |
| Sync órdenes | Crear desde bot Carolina | P1 |

---

## Fase 2: Features Avanzadas

### 2.1 Editor de Pipelines

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Crear pipeline | Formulario + nombre | P0 |
| Editar pipeline | Cambiar nombre, orden | P0 |
| Eliminar pipeline | Con confirmación | P1 |
| Crear stages | Agregar nuevos stages | P0 |
| Editar stages | Nombre, color, orden | P0 |
| Drag & drop stages | Reordenar visualmente | P1 |
| Eliminar stages | Migrar órdenes | P1 |

### 2.2 Campos Personalizados

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Definir campos | Para contactos y órdenes | P0 |
| Tipos de campo | Text, select, number, date | P0 |
| Opciones select | Lista editable | P0 |
| Campo requerido | Validación | P1 |
| Mostrar en tabla | Columnas dinámicas | P1 |
| Filtrar por campo | Filtros dinámicos | P2 |

### 2.3 WhatsApp Bidireccional

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Enviar mensajes | Desde CRM | P0 |
| Apagar bot | Por conversación | P0 |
| Templates | Mensajes predefinidos | P1 |
| Adjuntos | Enviar imágenes/docs | P2 |
| Notas internas | Solo visibles en CRM | P1 |

### 2.4 Reportes

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Órdenes por periodo | Gráfico + tabla | P0 |
| Conversión por fuente | De dónde vienen ventas | P1 |
| Performance agentes | Órdenes por agente | P1 |
| Exportar PDF | Reporte descargable | P2 |
| Dashboard analytics | Vista completa | P1 |

### 2.5 Automatizaciones

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Trigger por stage | Webhook al cambiar stage | P0 |
| Trigger por tag | Webhook al agregar tag | P1 |
| Acciones automáticas | Asignar, notificar | P2 |
| Logs de ejecución | Ver historial | P1 |

---

## Fase 3: Multi-SAAS

### 3.1 Workspaces

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Crear workspace | Signup con org | P0 |
| Subdominios | {org}.morfx.com | P1 |
| Invitar usuarios | Email invitation | P0 |
| Roles | Admin, member, viewer | P0 |
| Permisos granulares | Por módulo | P1 |

### 3.2 Billing

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Planes | Free, Pro, Enterprise | P0 |
| Stripe integration | Checkout + portal | P0 |
| Límites por plan | Contactos, usuarios, etc. | P0 |
| Upgrades/downgrades | Self-service | P1 |
| Facturación | Invoices automáticos | P1 |

### 3.3 Onboarding

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Wizard setup | Paso a paso inicial | P0 |
| Conectar WhatsApp | Integración guiada | P0 |
| Importar contactos | CSV/Excel | P1 |
| Tour guiado | Tooltips interactivos | P2 |

### 3.4 White Label

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Logo custom | Por workspace | P1 |
| Colores custom | Tema personalizado | P2 |
| Dominio custom | DNS CNAME | P2 |
| Email branding | Emails desde su dominio | P2 |

---

## Fase 4: IA Distribuida Avanzada

### 4.1 Sistema Retroactivo

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Comparador protocolo | Detectar fase de venta | P0 |
| Historial exitoso | DB de conversaciones ganadoras | P0 |
| Validación State Analyzer | Confirmar/corregir intents | P0 |
| Métricas retroactivo | Dashboard de accuracy | P1 |
| Auto-mejora | Agregar conversaciones exitosas | P2 |

### 4.2 Carolina Logística

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Intent analyzer | Detectar qué quiere el host | P0 |
| Manejo archivos | Excel, CSV, PDF | P0 |
| Ejecutar workflows | Llamar workflows n8n | P0 |
| Reportar resultados | Mensajes de respuesta | P0 |
| Permisos por rol | Limitar acciones | P1 |
| Panel en MorfX | Chat embebido | P2 |

### 4.3 Dashboard de Agentes

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Lista agentes | Carolina, Extractors, etc. | P0 |
| Estado en tiempo real | Activo/inactivo | P0 |
| Logs por agente | Últimas ejecuciones | P1 |
| Métricas | Mensajes procesados, errores | P1 |
| Configuración | Parámetros por agente | P2 |

---

## Dependencias entre Features

```
Fase 1:
  Autenticación ──► Dashboard ──► Contactos ──► Inbox
                                      │
                                      ▼
                                   Órdenes
                                      │
                                      ▼
                               Integración n8n

Fase 2:
  Editor Pipelines ──► Campos Custom ──► WhatsApp Bidireccional
                              │
                              ▼
                          Reportes ──► Automatizaciones

Fase 3:
  Workspaces ──► Billing ──► Onboarding
       │
       ▼
  White Label

Fase 4:
  Sistema Retroactivo ──► Carolina Logística ──► Dashboard Agentes
```

---

*Documento parte del proyecto Modelo IA Distribuida*
