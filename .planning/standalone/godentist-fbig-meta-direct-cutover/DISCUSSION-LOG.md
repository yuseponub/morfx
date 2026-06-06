# godentist-fbig-meta-direct-cutover — Discussion Log

> **Audit trail only.** Do not use as input to planning/research/execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-06
**Standalone:** godentist-fbig-meta-direct-cutover
**Areas discussed:** Gate de dispatch, Secuencia de cutover, Credenciales ManyChat, Feature flag, Scope de decommission

---

## Gate de dispatch (agente vs human-only)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto por routing rule | routeAgent resuelve por (workspace, canal); agente→dispatch, null→human-only. Sin config nueva. | ✓ |
| Flag explícito por workspace | Toggle 'agente habilitado' además de provider. Más piezas. | |
| Allowlist de workspace | Hardcodear ws GoDentist. Frágil, no escala. | |

**User's choice:** Auto por routing rule.
**Notes:** Mismo patrón que godentist-fb-ig (sin flag). Varixcenter sin rule → human-only preservado (Regla 6).

---

## Secuencia de cutover (anti-doble-respuesta)

| Option | Description | Selected |
|--------|-------------|----------|
| Desconectar ManyChat primero | Cero doble-respuesta, breve downtime. | |
| Conectar Meta primero, luego desconectar ManyChat | Sin downtime; ventana de solape mitigada por dedup. | ✓ |
| Ventana de mantenimiento off-hours | Minimiza impacto, requiere agendar. | |

**User's choice:** Conectar Meta primero, luego desconectar ManyChat.
**Notes:** Mitigación de solape vía dedup por message id + desconexión inmediata tras verificar.

---

## Credenciales ManyChat

| Option | Description | Selected |
|--------|-------------|----------|
| Dejarlas (rollback rápido) | No borrar keys. | |
| Borrarlas en el cutover | Settings limpio. | ✓ (parte de decommission) |

**User's choice:** Borrarlas.

---

## Feature flag para el código nuevo

| Option | Description | Selected |
|--------|-------------|----------|
| Sin flag — el gate ES la routing rule | Resolución de agente como control. | ✓ (implícito) |
| Flag explícito por workspace | Gate extra. | |

**User's choice (free text):** "después de esto, quiero eliminar todo el código que tenga que ver con manychat y esta conexión. ya no lo necesitaremos."
**Notes:** El usuario pivotó a un scope mayor: decommission total de ManyChat. Se interpreta como "sin flag" + nueva área de scope.

---

## Scope de decommission de ManyChat (área surgida del free-text)

**Hallazgo grounded presentado al usuario (prod 2026-06-06):**
- 4 de 5 workspaces con provider manychat (Valoraciones, GoDentist, Somnio, Pruebas).
- Tráfico FB/IG: solo GoDentist Valoraciones activo (fb=979, 18/7d, único con agente FB/IG). GoDentist=0, Somnio=17 (0 en 37d, sin agente FB/IG), Pruebas=1 test.

| Option | Description | Selected |
|--------|-------------|----------|
| Diferir decommission a standalone futuro | Solo cutover Valoraciones ahora. | |
| Ampliar este standalone a los 4 workspaces (migrar con páginas) | Mucho riesgo, toca Somnio productivo a fondo. | |
| Borrar código igual (verificando tráfico primero) | Eliminar ManyChat aceptando apagar FB/IG dormido de los 3. | ✓ |
| **Confirmación final:** Sí: cutover + decommission total ManyChat | Tras mostrar evidencia de tráfico, el usuario confirmó. | ✓ |

**User's choice:** Sí: cutover GoDentist Valoraciones + decommission total ManyChat (reapuntar los otros 3 fuera de manychat + borrar todo el código/keys/env). Acepta que GoDentist/Somnio/Pruebas (dormidos) dejen de recibir FB/IG por ManyChat.
**Notes:** Se añadió checkpoint de seguridad (D-08): el borrado de código ocurre DESPUÉS de verificar el cutover de Valoraciones en prod. WhatsApp queda en 360dialog en todos (no se toca).

## Claude's Discretion
- Estructura interna del wire + orden de borrado de archivos (typecheck/build verde por commit).

## Deferred Ideas
- Migrar FB/IG real de GoDentist/Somnio/Pruebas con páginas conectadas (hoy solo se apagan).
- Bug contact_id null FB/IG → standalone channel-contact-resolution.
- Re-smokes en vivo Phase 41 (media IG/FB).
