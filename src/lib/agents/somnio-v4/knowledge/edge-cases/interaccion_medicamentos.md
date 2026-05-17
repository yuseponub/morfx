---
topic: interaccion_medicamentos
keywords: [medicamento, tomo pastillas, antidepresivo, ansiolitico, anticoagulante, hipertension, diabetes, interaccion]
category: edge-cases
last_reviewed: 2026-05-16
reviewed_by: jose
related_topics: [contraindicaciones, dependencia, formula]
escalate_if:
  - cliente con medicamento recetado insiste en comprar sin consulta médica
  - polifarmacia
  - anticoagulantes con intención de compra
  - antidepresivos con intención de compra
  - ansiolíticos con intención de compra
  - inmunosupresores
tone_override: null
---

## Hechos del producto
ELIXIR DEL SUEÑO contiene melatonina (10mg) + citrato de magnesio (50mg). Aunque ambos ingredientes son naturales, pueden interactuar con varios grupos farmacológicos: antidepresivos (potencia serotoninérgica), ansiolíticos y benzodiacepinas (sedación aditiva), anticoagulantes (la melatonina afecta agregación plaquetaria), inmunosupresores (la melatonina modula respuesta inmune) y medicamentos para hipertensión (el magnesio puede alterar presión arterial). Solo el médico tratante conoce el cuadro completo del paciente y puede validar la combinación.

## Posición del negocio
Si el cliente toma cualquier medicamento recetado, la respuesta correcta es derivar a su médico tratante antes de combinar con ELIXIR DEL SUEÑO. NO improvisamos lista de medicamentos "compatibles". Si el cliente insiste en comprar igual a pesar de la advertencia, el caso se escala a humano.

## Debe contener la respuesta
- [SIEMPRE] Recomendar consultar al médico tratante antes de combinar
- [SIEMPRE] Mencionar que melatonina + citrato de magnesio son naturales pero SÍ pueden interactuar con medicamentos recetados
- [SI APLICA] Si el cliente nombra una familia específica (antidepresivos, ansiolíticos, anticoagulantes, hipertensión) → confirmar que esa familia está dentro de las que pueden interactuar
- [SI APLICA] Si el cliente solo pregunta sin comprometerse a comprar → respuesta canónica + queda como información
- [SI APLICA] Si el cliente con medicamento recetado insiste en comprar sin consulta médica → escalar a humano

## NUNCA decir
- afirmar que "no hay interacciones con ningún medicamento"
- decir "es natural, no afecta nada"
- aprobar la combinación con cualquier medicamento recetado
- improvisar lista de medicamentos "compatibles"
- sugerir que el cliente "deje de tomar su medicamento" para usar el suplemento
- dar opinión sobre dosis combinadas
- mencionar valeriana ni cualquier otro ingrediente que no sea melatonina + citrato de magnesio
- usar palabras como "te derivo", "te paso", "asesor humano", "tomo nota"

## Cuándo escalar a humano
- cliente con medicamento recetado insiste en comprar sin consulta médica
- cliente reporta polifarmacia (varios recetados activos) y pide validación
- cliente con anticoagulantes, antidepresivos, ansiolíticos o inmunosupresores con intención de compra clara
- cliente pregunta interacción con un medicamento específico no listado en este KB
