# Phase 35: Flujo Ofi Inter - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Detectar cuando un cliente quiere recogida en oficina de Interrapidisimo (en vez de envio a domicilio) y recolectar los campos de datos bifurcados correctos dentro del flujo de conversacion existente de Somnio. Solo aplica a Interrapidisimo (hardcoded, no generico para otros carriers).

</domain>

<decisions>
## Implementation Decisions

### Rutas de deteccion

- **Ruta 1 - Mencion directa:** Reconocer frases explicitas ("ofi inter", "oficina inter", "recojo en inter") Y variaciones ("quiero ir a recoger", "puedo pasar a buscar", "no necesito domicilio", "envia a la oficina"). Esta ruta domina: confirma inmediatamente sin esperar a ingest.
- **Ruta 2 - Municipio sin direccion via ingest:** Cuando ingest acumula municipio aislado (sin direccion/barrio ni otros datos de envio normales), al momento de pedir direccion el agente primero pregunta: "Deseas envio a domicilio o recoger en oficina de transportadora?" Solo se dispara si llego municipio sin otros datos de envio.
- **Ruta 3 - Municipio remoto (lista curada):** Cuando el cliente pregunta "envian a X?" y el municipio esta en una lista curada de municipios donde ofi inter es comun, responder: "Claro que si! Deseas envio a domicilio o recoger en oficina de transportadora?" La lista curada se mantiene manual basada en experiencia del negocio.
- **Prioridad:** Mencion directa domina (confirma inmediatamente). Las otras 2 rutas esperan al flujo normal.
- Si municipio + direccion llegan juntos, se asume domicilio automatico sin preguntar.

### Flujo de confirmacion

- Cuando ofi inter es confirmado, conservar todos los datos compatibles ya recolectados (nombre, apellido, telefono, etc.). Solo cambiar el set de campos faltantes.
- Si el cliente dice NO a ofi inter, continuar flujo normal sin interrupcion: "Perfecto, entonces necesito tu direccion completa"
- El cliente puede cambiar de opinion en cualquier momento (ej: confirmo ofi inter pero luego dice "mejor a domicilio"). El flujo se adapta conservando datos compatibles.
- Solo aplica a Interrapidisimo. Si en el futuro se agregan otros carriers, seria otra fase.

### Campos bifurcados

- **Flujo normal (8 campos):** nombre, apellido, telefono, direccion, barrio, municipio, departamento, correo
- **Flujo ofi inter (7 campos):** nombre, apellido, telefono, cedula de quien recoge, municipio, departamento, correo (sin direccion/barrio, con cedula)
- **Cedula de quien recoge:** Puede ser de otra persona (no necesariamente el cliente). El agente pregunta pero el campo es OPCIONAL -- si el cliente no quiere dar la cedula, el flujo continua sin ella.
- **Almacenamiento:** Cedula y flag ofi inter se almacenan en el campo "descripcion" de orders (investigar nombre exacto de la columna)
- **Resumen:** No cambia -- el resumen actual no incluye direccion, asi que es irrelevante.

### Estado de sesion

- Crear estado `collecting_data_inter` que se comporta igual que `collecting_data` en cuanto a duracion y transiciones, pero indica flujo ofi inter activo (diferentes campos faltantes).
- Al confirmar ofi inter, transicionar a `collecting_data_inter`.
- Si el cliente cambia de opinion, transicionar de vuelta a `collecting_data` (o viceversa).

### Claude's Discretion

- Frases exactas de deteccion para variaciones (basado en patrones de conversacion reales)
- Lista inicial de municipios remotos curados
- Mensajes de confirmacion y transicion del agente
- Implementacion tecnica del switch de campos en ingest
- Como adaptar el ingest classifier para distinguir datos ofi inter vs normal

</decisions>

<specifics>
## Specific Ideas

- Ruta municipio remoto: responder "Claro que si! Deseas envio a domicilio o recoger en oficina de transportadora?" (no asumir ofi inter, dar opcion)
- Mencion directa es la unica ruta que "asume" inmediatamente (pero igual confirma)
- Cedula es opcional: "puedes seguir el flujo si decides no dar la cedula"
- Estado `collecting_data_inter` como mecanismo para trackear el modo activo

</specifics>

<deferred>
## Deferred Ideas

- Flujo generico para multiples transportadoras (no solo Inter) -- futura fase
- UI/dashboard para gestionar lista curada de municipios remotos -- futura fase

</deferred>

---

*Phase: 35-flujo-ofi-inter*
*Context gathered: 2026-03-04*
