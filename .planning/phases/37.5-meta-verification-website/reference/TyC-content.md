# Términos y Condiciones MORFX S.A.S. — Contenido de referencia

Documento original: `reference/TyC-original.docx` (aportado por el usuario 2026-04-14)

**IMPORTANTE — correcciones necesarias antes de publicar:**

1. **NIT está incorrecto en el documento original.** El documento dice `902.058.328-5`. El NIT real según Cámara de Comercio + RUT es `902052328-5` (o formateado `902.052.328-5`). Corregir en todas las ocurrencias.
2. **Consistencia de razón social:** el documento usa "morfx S.A.S." en minúsculas. Los documentos oficiales dicen "MORFX S.A.S." en mayúsculas. Decidir una grafía y aplicarla consistentemente (recomendado: MORFX S.A.S. para coincidir con documentos oficiales).
3. **Eliminar mención a 360dialog** (Sección 3): el documento original dice *"WhatsApp a través de 360dialog"*. Cambiar a *"WhatsApp Business Platform"* (sin mencionar BSP intermedio). Razón: (a) los T&C deben reflejar el producto visible al cliente, no la arquitectura interna; (b) da flexibilidad para cambiar BSP o ir Meta Direct sin actualizar los T&C; (c) evita que Meta reviewer se confunda o que el cliente asocie MORFX con un BSP específico.

   Aplicar la misma lógica en cualquier otra sección que nombre proveedores específicos: en Sección 7.6 (Subencargados) usar categorías genéricas ("proveedores de infraestructura cloud", "proveedores de modelos de lenguaje", "plataformas de mensajería integradas") sin nombres comerciales. La lista detallada de subencargados se mantiene disponible en el Acuerdo de Servicios (documento privado con cada cliente), no en los T&C públicos.

---

## Estructura del documento (para dividir en /terms y /privacy)

El documento original incluye TANTO Terms of Service COMO Privacy Policy en un solo documento. Para Meta Business Verification y mejor UX, recomendado dividir:

### `/terms` — Términos y Condiciones del Servicio

Usar secciones:
- 1. Identificación del Titular
- 2. Definiciones
- 3. Objeto y Naturaleza del Servicio
- 4. Disponibilidad Geográfica y Limitaciones Jurisdiccionales
- 5. Registro, Acceso y Condiciones de Uso de la Plataforma
- 6. Modelo de Facturación y Condiciones Comerciales
- 9. Propiedad Intelectual
- 10. Niveles de Servicio (SLA)
- 11. Limitaciones de Responsabilidad
- 12. Vigencia y Terminación
- 13. Resolución de Disputas y Ley Aplicable
- 14. Disposiciones Generales
- 15. Canales de Contacto
- 16. Entrada en Vigencia

### `/privacy` — Política de Privacidad y Tratamiento de Datos

Usar secciones:
- 7. Protección de Datos Personales (completo: 7.1 a 7.8)
- 8. Política de Cookies y Tecnologías de Seguimiento
- 15. Canales de Contacto (adaptar)
- 16. Entrada en Vigencia (adaptar)

Con enlaces cruzados entre ambas páginas y al landing.

---

## Datos clave extraídos del documento

- **Razón social:** MORFX S.A.S. (usar mayúsculas consistentemente)
- **NIT correcto:** 902052328-5
- **Domicilio:** Bucaramanga, Colombia
- **Email de contacto:** morfx.colombia@gmail.com (cambiar a info@morfx.app cuando se configure en Bloque B)
- **Jurisdicción:** Tribunales de Bucaramanga, Colombia
- **Ley aplicable:** Ley 1581 de 2012, Decreto 1377 de 2013, Ley 1480 de 2011 (Estatuto del Consumidor)
- **Cobertura:** Colombia y Ecuador. Ciudades Colombia: Bogotá, Medellín, Cali, Barranquilla, Bucaramanga
- **Modelo comercial:** Híbrido — suscripción mensual (Starter, Growth, Business, Enterprise) + Créditos AI
- **SLA aplica a:** Planes Business y Enterprise
- **Tope responsabilidad:** Valor facturado en 6 meses previos al incidente
- **Vigencia:** 12 meses con renovación automática
- **Preaviso terminación:** 30-60 días según causal

## Objeto social (del documento)

> morfx provee a las Empresas Clientes acceso a su Plataforma de agente conversacional con inteligencia artificial, orientada a la automatización de procesos de logística, gestión de pedidos y servicio al cliente para operaciones de comercio electrónico (e-commerce), actualmente disponible en Colombia y Ecuador.

Servicios incluyen:
- Agentes Conversacionales con human-like performance
- Infraestructura tecnológica avanzada (NLP, integraciones)
- Integraciones con Shopify, operadores logísticos, WhatsApp (vía 360dialog actualmente)
- Soporte técnico y mantenimiento
- Capacitación inicial

## Obligaciones regulatorias cumplidas

El documento ya cubre:
- ✅ Ley 1581 de 2012 (Protección de Datos Colombia)
- ✅ Decreto 1377 de 2013
- ✅ Ley 1480 de 2011 (Estatuto del Consumidor)
- ✅ Flujo de consentimiento informado para Consumidores Finales
- ✅ Rol dual: Responsable (de Usuarios Administradores) y Encargado (de Consumidores Finales)
- ✅ Derechos ARCO
- ✅ Notificación de incidentes de seguridad (72h)
- ✅ Subencargados (cloud, LLMs, mensajería)
- ✅ Retención y eliminación de datos
- ✅ Cookies y tecnologías de seguimiento

## Texto completo del documento

Guardado como `.docx` en `reference/TyC-original.docx`. Extracto completo en texto plano también disponible en la conversación donde se aportó (2026-04-14).

La instancia encargada del Bloque A debe:
1. Leer el documento `.docx` (con Read tool o python/pandoc si necesario)
2. Aplicar las 3 correcciones listadas arriba
3. Dividir en `/terms` y `/privacy` según estructura sugerida
4. Renderizar en Next.js como páginas públicas
5. Estilo tipográfico legible (no pared de texto — usar headings, listas, secciones colapsables)
6. Incluir fecha "Última actualización: 2026-04-14"
