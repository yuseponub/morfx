/**
 * Genera Varix-Cuestionario-Diseno.docx desde el cuestionario de diseño del agente.
 * Run: node scripts/generate-varix-cuestionario-docx.mjs
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, HeadingLevel
} from 'docx'
import * as fs from 'fs'

const BLUE = '1B4F72'
const TEAL = '148F77'
const RED = '922B21'
const LIGHT_BLUE = 'D6EAF8'
const LIGHT_YELLOW = 'FEF9E7'
const WHITE = 'FFFFFF'

function h1(t) { return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 500, after: 200 }, children: [new TextRun({ text: t, bold: true, size: 32, color: BLUE })] }) }
function h2(t) { return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 120 }, children: [new TextRun({ text: t, bold: true, size: 26, color: BLUE })] }) }
function p(t, o = {}) { return new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: t, size: 21, ...o })] }) }
function q(label, t, blocker = false) {
  return [
    new Paragraph({
      spacing: { before: 200, after: 60 },
      children: [
        new TextRun({ text: (blocker ? '🔴 ' : '') + label + ' — ', bold: true, size: 22, color: blocker ? RED : TEAL }),
        new TextRun({ text: t, size: 21 }),
      ]
    }),
    new Paragraph({
      spacing: { after: 140 },
      shading: { type: ShadingType.SOLID, color: LIGHT_YELLOW },
      children: [new TextRun({ text: 'RESPUESTA: ', bold: true, size: 21 }), new TextRun({ text: ' '.repeat(80), size: 21 })]
    }),
  ]
}
function table(headers, rows, widths) {
  const hRow = new TableRow({
    children: headers.map((t, i) => new TableCell({
      shading: { type: ShadingType.SOLID, color: BLUE },
      width: { size: widths[i], type: WidthType.DXA },
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 19, color: WHITE })] })]
    }))
  })
  const dRows = rows.map(cells => new TableRow({
    children: cells.map((cell, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: i === cells.length - 1 && cell === '' ? { type: ShadingType.SOLID, color: LIGHT_YELLOW } : undefined,
      children: [new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: String(cell), size: 18 })] })]
    }))
  }))
  return new Table({ rows: [hRow, ...dRows], width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA } })
}
const spacer = () => new Paragraph({ spacing: { after: 120 }, children: [] })

const children = [
  h1('Cuestionario de Diseño — Agente Conversacional Varixcenter'),
  p('Basado en el análisis de 362 conversaciones reales de WhatsApp/Facebook/Instagram (abril–junio 2026). Cada pregunta trae lo que observamos en las conversaciones; confirma o corrige en el espacio RESPUESTA. Las preguntas marcadas en rojo 🔴 son indispensables para poder construir el agente.', { italics: true }),
  spacer(),

  h2('Contexto: lo que dicen los datos'),
  p('• El 66% de las conversaciones pregunta PRECIO (la mayoría llega con un "¿Precio?" seco desde la pauta).'),
  p('• Solo el 12% termina en cita confirmada. El 55% recibe la información y se enfría sin que nadie haga seguimiento.'),
  p('• El 10% escribe desde otras ciudades (Cúcuta, Valledupar, Barrancabermeja, Cali…).'),
  p('• El flujo actual del equipo: saludo → ¿ciudad? + ¿varices grandes o vasitos? → info según tipo → ¿mañana o tarde? → nombre → cita.'),
  p('• El agente automatizaría ese flujo 24/7 y haría las retomas que hoy no se hacen.'),
  spacer(),

  h2('A. Datos del negocio (confirmar vigencia)'),
  p('A1. Precios vistos en conversaciones — confirmar o corregir:'),
  table(
    ['Concepto', 'Visto en chats', 'Vigente / Corrección'],
    [
      ['Consulta de valoración', '$100.000 (incluye escaneo venoso)', ''],
      ['Sesión escleroterapia (vasitos)', '$95.000', ''],
      ['Cita de control', '$110.000 + traer medias largas', ''],
      ['Dúplex / Doppler', '$180.000 una pierna / $260.000 dos', ''],
      ['Medias compresión 20/30', 'muslo $175.000 / panty $190.000', ''],
    ],
    [3200, 3600, 2800]
  ),
  spacer(),
  ...q('A2', '¿El bot puede DAR PRECIOS por chat? ¿Cuáles sí y cuáles no? (Hoy el equipo da precio de consulta y sesión, pero nunca del tratamiento completo: "depende del diagnóstico").', true),
  ...q('A3', 'Horarios de citas: Lunes a viernes 8:00–11:30am y 2:30–3:30pm; sábados 8:00am–12:00pm. ¿Correcto?'),
  ...q('A4', 'Dirección única: Cra 34 # 52-125, segundo piso, Bucaramanga. ¿Hay otra sede o planes de abrir?'),
  ...q('A5', '¿Cómo presenta el bot al médico? (vimos "Dr. Ciro", "médico flebólogo", "28 años de experiencia" y también "30 años").'),
  ...q('A6', 'Financiación Addi/Sistecrédito: ¿el bot la ofrece proactivamente cuando el cliente duda por precio, o solo si preguntan? ¿Condiciones actuales?'),
  ...q('A7', 'EPS/prepagadas: ¿confirmamos "somos totalmente particular" como respuesta oficial?'),
  ...q('A8', 'Clientes de otras ciudades (10% del tráfico): ¿respuesta oficial? ¿Se les ofrece agendar para cuando viajen?'),
  ...q('A9', '¿Qué servicios NO se ofrecen y el bot debe negar? (vimos fleboterapia; ¿láser endovascular sí o no?)'),

  h1('B. Agendamiento — LO MÁS IMPORTANTE'),
  ...q('B1', '¿Cómo se gestiona la agenda de citas hoy? ¿Software médico (cuál)? ¿Google Calendar? ¿Agenda física/Excel?', true),
  ...q('B2', '¿Qué debe hacer el bot al agendar? Opción A: consulta disponibilidad real y agenda directo (requiere integración con su sistema). Opción B: captura datos + jornada preferida y un humano confirma la hora. Opción C: solo registra la solicitud y el equipo llama.', true),
  ...q('B3', 'Datos para agendar: hoy piden nombre completo, a veces cédula, y jornada mañana/tarde. ¿La cédula es obligatoria? ¿Algún otro dato?'),
  ...q('B4', 'El recordatorio "un día antes": ¿lo manda el bot automáticamente o lo sigue haciendo el equipo?'),
  ...q('B5', 'Reagendar/cancelar citas: ¿lo gestiona el bot o pasa a un humano?'),

  h1('C. Alcance del agente'),
  ...q('C1', '¿Canales desde el día 1? WhatsApp + Facebook + Instagram, ¿o WhatsApp primero?', true),
  ...q('C2', 'Pacientes antiguos / citas de control (8.5% del tráfico): ¿el bot los maneja en V1 o los pasa a humano?', true),
  ...q('C3', 'Los mensajes de reactivación que ustedes envían a pacientes antiguos: cuando el paciente responde, ¿contesta el bot o el equipo?'),
  ...q('C4', 'Notas de voz (frecuentes): proponemos que el bot pida una vez "¿me lo puedes escribir? 🙏" y si insiste con audio pase a humano. ¿OK?'),
  ...q('C5', 'Fotos de piernas: proponemos NUNCA pre-diagnosticar; agradecer, explicar que el Dr. evalúa en la valoración e invitar a agendar. ¿OK?'),
  ...q('C6', 'Preguntas médicas específicas (alergias, diabetes, embarazo): proponemos responder "eso lo determina el Dr. en la valoración" + invitar a agendar; si insiste, humano. ¿OK?'),
  ...q('C7', 'Quejas: proponemos pasar a humano de inmediato con disculpa breve. ¿OK?'),
  ...q('C8', '¿El bot atiende 24/7? (Hoy se pierden los "¿Precio?" de la noche y fines de semana.)'),
  ...q('C9', '¿El bot se presenta como asistente virtual con nombre propio (como goBot 🤖 de GoDentist) o como asesor sin identificarse como bot? ¿Tono? (el equipo actual es cálido: "mi reina", emojis ✨)'),

  h1('D. Seguimientos (retomas)'),
  p('El 55% de los interesados pregunta precio y se enfría sin seguimiento. Proponemos retomas automáticas a los 2-3 minutos de silencio en cada fase (igual que GoDentist) y opcionalmente una retoma a las 24 horas ("¿sigues interesad@ en tu valoración?").'),
  ...q('D1', '¿Aprobado el esquema de retomas cortas (2-3 min)? ¿Quieren también la retoma de 24 horas?'),

  h1('E. Activación y métricas'),
  ...q('E1', 'El agente se construye y prueba SIN tocar la operación actual; se activa solo cuando ustedes lo decidan. ¿OK?'),
  ...q('E2', 'Métrica de éxito propuesta: subir el % de conversaciones que terminan en cita confirmada (hoy 12%) + responder de inmediato 24/7. ¿Otra métrica que les importe?'),
]

const doc = new Document({ sections: [{ children }] })
const buf = await Packer.toBuffer(doc)
fs.writeFileSync('Varix-Cuestionario-Diseno.docx', buf)
console.log('Wrote Varix-Cuestionario-Diseno.docx')
