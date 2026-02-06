/**
 * Somnio Sales Agent - Intent Definitions
 * Phase 14: Agente Ventas Somnio - Plan 01
 *
 * All 20 intents the Somnio agent can recognize, plus 11 hola+X combinations.
 * Each intent has a name, description, and example messages for training.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Definition of an intent with metadata for detection
 */
export interface IntentDefinition {
  /** Intent identifier (e.g., 'precio', 'hola+precio') */
  name: string
  /** Human-readable description of what this intent means */
  description: string
  /** Example customer messages that should match this intent */
  examples: string[]
  /** Optional triggers/keywords that strongly indicate this intent */
  triggers?: string[]
  /** Category for grouping: informativo, flujo_compra, escape, combinacion */
  category: 'informativo' | 'flujo_compra' | 'escape' | 'combinacion'
}

// ============================================================================
// Informational Intents (13)
// ============================================================================

const INTENTS_INFORMATIVOS: IntentDefinition[] = [
  {
    name: 'hola',
    description: 'Saludo inicial del cliente sin otra pregunta',
    examples: [
      'Hola',
      'Buenos dias',
      'Buenas tardes',
      'Buenas',
      'Hola, buenas',
    ],
    triggers: ['hola', 'buenos dias', 'buenas tardes', 'buenas noches'],
    category: 'informativo',
  },
  {
    name: 'precio',
    description: 'Cliente pregunta por el precio del producto',
    examples: [
      'Cuanto vale?',
      'Cual es el precio?',
      'A como el producto?',
      'Precio por favor',
      'Cuanto cuesta la melatonina?',
    ],
    triggers: ['precio', 'cuanto vale', 'cuanto cuesta', 'a como', 'valor'],
    category: 'informativo',
  },
  {
    name: 'info_promociones',
    description: 'Cliente quiere saber sobre promociones y paquetes disponibles',
    examples: [
      'Que promociones tienen?',
      'Tienen paquetes?',
      'Hay algun descuento?',
      'Que combos manejan?',
      'Tienen ofertas?',
    ],
    triggers: ['promocion', 'promo', 'paquete', 'descuento', 'combo', 'oferta'],
    category: 'informativo',
  },
  {
    name: 'contenido_envase',
    description: 'Cliente pregunta que contiene el producto o cuantas pastillas trae',
    examples: [
      'Cuantas pastillas trae?',
      'Que contiene?',
      'Cuantos comprimidos vienen?',
      'De que esta hecho?',
      'Cuanto trae el frasco?',
    ],
    triggers: ['pastillas', 'comprimidos', 'contiene', 'trae', 'frasco', 'envase'],
    category: 'informativo',
  },
  {
    name: 'como_se_toma',
    description: 'Cliente pregunta como tomar el producto, dosis o instrucciones',
    examples: [
      'Como se toma?',
      'Cual es la dosis?',
      'Cuantas me tomo al dia?',
      'Como debo tomarlo?',
      'A que hora se toma?',
    ],
    triggers: ['como se toma', 'dosis', 'tomar', 'cuantas', 'a que hora'],
    category: 'informativo',
  },
  {
    name: 'modopago',
    description: 'Cliente pregunta por formas de pago en general',
    examples: [
      'Como puedo pagar?',
      'Aceptan tarjeta?',
      'Reciben transferencia?',
      'Formas de pago?',
      'Se puede pagar con nequi?',
    ],
    triggers: ['pagar', 'pago', 'tarjeta', 'transferencia', 'nequi', 'daviplata'],
    category: 'informativo',
  },
  {
    name: 'metodos_de_pago',
    description: 'Cliente quiere conocer todos los metodos de pago disponibles',
    examples: [
      'Que metodos de pago manejan?',
      'Cuales son las opciones de pago?',
      'Con que puedo pagar?',
      'Aceptan efectivo y tarjeta?',
    ],
    triggers: ['metodos de pago', 'opciones de pago', 'formas de pago'],
    category: 'informativo',
  },
  {
    name: 'modopago2',
    description: 'Cliente confirma o pregunta especificamente por pago contraentrega',
    examples: [
      'Puedo pagar cuando llegue?',
      'Es contraentrega?',
      'Pago al recibir?',
      'Puedo pagar en efectivo cuando me llegue?',
    ],
    triggers: ['contraentrega', 'cuando llegue', 'al recibir', 'cuando me llegue'],
    category: 'informativo',
  },
  {
    name: 'envio',
    description: 'Cliente pregunta sobre envio, cobertura o tiempo de entrega',
    examples: [
      'Hacen envios a Medellin?',
      'Cuanto se demora el envio?',
      'El envio es gratis?',
      'Envian a todo el pais?',
      'A donde hacen envios?',
    ],
    triggers: ['envio', 'envian', 'demora', 'entrega', 'llega'],
    category: 'informativo',
  },
  {
    name: 'invima',
    description: 'Cliente pregunta por registro sanitario, INVIMA o legalidad',
    examples: [
      'Tiene registro INVIMA?',
      'Es legal el producto?',
      'Tienen registro sanitario?',
      'Esta aprobado por el INVIMA?',
    ],
    triggers: ['invima', 'registro sanitario', 'legal', 'aprobado'],
    category: 'informativo',
  },
  {
    name: 'ubicacion',
    description: 'Cliente pregunta desde donde envian o donde estan ubicados',
    examples: [
      'Desde donde envian?',
      'Donde estan ubicados?',
      'De que ciudad son?',
      'Tienen tienda fisica?',
    ],
    triggers: ['ubicacion', 'donde estan', 'de donde', 'tienda fisica'],
    category: 'informativo',
  },
  {
    name: 'contraindicaciones',
    description: 'Cliente pregunta sobre efectos secundarios, contraindicaciones o seguridad',
    examples: [
      'Tiene efectos secundarios?',
      'Es seguro tomarlo?',
      'Tiene contraindicaciones?',
      'Se puede tomar con otros medicamentos?',
      'Es natural?',
    ],
    triggers: ['efectos', 'secundarios', 'contraindicaciones', 'seguro', 'natural'],
    category: 'informativo',
  },
  {
    name: 'sisirve',
    description: 'Cliente pregunta si el producto realmente funciona o es efectivo',
    examples: [
      'Si funciona?',
      'Es efectivo?',
      'Si me va a servir?',
      'Tienen testimonios?',
      'De verdad ayuda a dormir?',
    ],
    triggers: ['funciona', 'sirve', 'efectivo', 'testimonios', 'ayuda'],
    category: 'informativo',
  },
]

// ============================================================================
// Purchase Flow Intents (7)
// ============================================================================

const INTENTS_FLUJO_COMPRA: IntentDefinition[] = [
  {
    name: 'captura_datos_si_compra',
    description: 'Cliente indica que quiere comprar, iniciar captura de datos',
    examples: [
      'Quiero comprar',
      'Me interesa, como hago?',
      'Lo quiero',
      'Voy a llevar uno',
      'Listo, quiero ordenar',
      'Si, deseo adquirirlo',
    ],
    triggers: ['quiero comprar', 'lo quiero', 'ordenar', 'comprar', 'adquirir', 'llevar'],
    category: 'flujo_compra',
  },
  {
    name: 'ofrecer_promos',
    description: 'Momento de mostrar promociones (auto-triggered cuando datos completos)',
    examples: [
      'Listo ya tengo mis datos',
      'Esos son mis datos',
    ],
    triggers: [],
    category: 'flujo_compra',
  },
  {
    name: 'resumen_1x',
    description: 'Cliente selecciona pack de 1 unidad',
    examples: [
      'Quiero el de 1',
      'Me llevo uno solo',
      'El individual',
      'Solo una unidad',
      '1x por favor',
    ],
    triggers: ['1x', 'uno solo', 'individual', 'una unidad'],
    category: 'flujo_compra',
  },
  {
    name: 'resumen_2x',
    description: 'Cliente selecciona pack de 2 unidades',
    examples: [
      'Quiero el de 2',
      'Me llevo el pack de dos',
      'El combo 2x',
      'Dos unidades',
      '2x',
    ],
    triggers: ['2x', 'dos', 'pack de dos', 'dos unidades'],
    category: 'flujo_compra',
  },
  {
    name: 'resumen_3x',
    description: 'Cliente selecciona pack de 3 unidades',
    examples: [
      'Quiero el de 3',
      'Me llevo el triple',
      'El combo 3x',
      'Tres unidades',
      '3x',
    ],
    triggers: ['3x', 'tres', 'triple', 'tres unidades'],
    category: 'flujo_compra',
  },
  {
    name: 'compra_confirmada',
    description: 'Cliente confirma la compra despues de ver el resumen',
    examples: [
      'Si, confirmo',
      'Listo, eso es correcto',
      'Todo bien, confirmo el pedido',
      'Si, proceder',
      'Confirmo',
    ],
    triggers: ['confirmo', 'si', 'listo', 'correcto', 'proceder'],
    category: 'flujo_compra',
  },
  {
    name: 'no_confirmado',
    description: 'Cliente duda o rechaza en el momento de confirmar',
    examples: [
      'Dejame pensarlo',
      'No estoy seguro',
      'Tengo que consultarlo',
      'Luego te escribo',
      'Mmm, no se',
    ],
    triggers: ['pensarlo', 'no estoy seguro', 'consultarlo', 'luego', 'no se'],
    category: 'flujo_compra',
  },
]

// ============================================================================
// Escape Intent (1)
// ============================================================================

const INTENT_ESCAPE: IntentDefinition = {
  name: 'fallback',
  description: 'Mensaje que no se puede clasificar, derivar a humano',
  examples: [
    'Quiero hablar con alguien',
    'Me pueden llamar?',
    'Necesito un asesor',
    'asdfgh',
    'Tienen trabajo?',
  ],
  triggers: ['hablar con', 'llamar', 'asesor', 'humano'],
  category: 'escape',
}

// ============================================================================
// No Interest Intent (1 - part of flow but often grouped separately)
// ============================================================================

const INTENT_NO_INTERESA: IntentDefinition = {
  name: 'no_interesa',
  description: 'Cliente indica que no tiene interes',
  examples: [
    'No me interesa',
    'No gracias',
    'No quiero nada',
    'Gracias pero no',
    'Ya no lo necesito',
  ],
  triggers: ['no me interesa', 'no gracias', 'no quiero'],
  category: 'flujo_compra',
}

// ============================================================================
// Combination Intents (11) - hola + another intent
// ============================================================================

const INTENTS_COMBINACIONES: IntentDefinition[] = [
  {
    name: 'hola+precio',
    description: 'Saludo con pregunta de precio',
    examples: [
      'Hola, cuanto vale?',
      'Buenas, precio del producto?',
      'Hola buenas tardes, me gustaria saber el precio',
    ],
    category: 'combinacion',
  },
  {
    name: 'hola+como_se_toma',
    description: 'Saludo con pregunta de como tomar',
    examples: [
      'Hola, como se toma la melatonina?',
      'Buenas, cual es la dosis?',
      'Hola, cuantas pastillas debo tomar?',
    ],
    category: 'combinacion',
  },
  {
    name: 'hola+envio',
    description: 'Saludo con pregunta de envio',
    examples: [
      'Hola, hacen envios a Bogota?',
      'Buenas, cuanto demora el envio?',
      'Hola, el envio es gratis?',
    ],
    category: 'combinacion',
  },
  {
    name: 'hola+modopago',
    description: 'Saludo con pregunta de pago',
    examples: [
      'Hola, como puedo pagar?',
      'Buenas, aceptan tarjeta?',
      'Hola, se puede pagar contraentrega?',
    ],
    category: 'combinacion',
  },
  {
    name: 'hola+ubicacion',
    description: 'Saludo con pregunta de ubicacion',
    examples: [
      'Hola, de donde envian?',
      'Buenas, donde estan ubicados?',
      'Hola, tienen tienda fisica?',
    ],
    category: 'combinacion',
  },
  {
    name: 'hola+contenido_envase',
    description: 'Saludo con pregunta de contenido',
    examples: [
      'Hola, cuantas pastillas trae?',
      'Buenas, que contiene el producto?',
      'Hola, de que esta hecho?',
    ],
    category: 'combinacion',
  },
  {
    name: 'hola+invima',
    description: 'Saludo con pregunta de INVIMA',
    examples: [
      'Hola, tiene registro INVIMA?',
      'Buenas, el producto es legal?',
      'Hola, tienen registro sanitario?',
    ],
    category: 'combinacion',
  },
  {
    name: 'hola+contraindicaciones',
    description: 'Saludo con pregunta de contraindicaciones',
    examples: [
      'Hola, tiene efectos secundarios?',
      'Buenas, es seguro tomarlo?',
      'Hola, puedo tomarlo si estoy embarazada?',
    ],
    category: 'combinacion',
  },
  {
    name: 'hola+sisirve',
    description: 'Saludo con pregunta de efectividad',
    examples: [
      'Hola, si funciona el producto?',
      'Buenas, es efectivo?',
      'Hola, si me va a ayudar a dormir?',
    ],
    category: 'combinacion',
  },
  {
    name: 'hola+info_promociones',
    description: 'Saludo con pregunta de promociones',
    examples: [
      'Hola, tienen promociones?',
      'Buenas, que combos manejan?',
      'Hola, hay algun descuento?',
    ],
    category: 'combinacion',
  },
  {
    name: 'hola+captura_datos_si_compra',
    description: 'Saludo con intencion de compra directa',
    examples: [
      'Hola, quiero comprar',
      'Buenas, me interesa ordenar',
      'Hola, como hago para pedir?',
    ],
    category: 'combinacion',
  },
]

// ============================================================================
// Exports
// ============================================================================

/**
 * All Somnio intents (20 base + 11 combinations = 31 total)
 */
export const SOMNIO_INTENTS: IntentDefinition[] = [
  // 13 informativos
  ...INTENTS_INFORMATIVOS,
  // 7 flujo de compra (includes no_interesa)
  ...INTENTS_FLUJO_COMPRA,
  INTENT_NO_INTERESA,
  // 1 escape
  INTENT_ESCAPE,
  // 11 combinaciones
  ...INTENTS_COMBINACIONES,
]

/**
 * Get intent by name
 */
export function getIntentByName(name: string): IntentDefinition | undefined {
  return SOMNIO_INTENTS.find((i) => i.name === name)
}

/**
 * Get all intent names
 */
export function getIntentNames(): string[] {
  return SOMNIO_INTENTS.map((i) => i.name)
}

/**
 * Check if intent is a combination (hola+X)
 */
export function isCombinationIntent(name: string): boolean {
  return name.includes('+')
}

/**
 * Split combination intent into parts
 * @returns [firstIntent, secondIntent] or [intent, null] if not a combination
 */
export function splitCombinationIntent(name: string): [string, string | null] {
  if (!name.includes('+')) {
    return [name, null]
  }
  const parts = name.split('+')
  return [parts[0], parts[1]]
}
