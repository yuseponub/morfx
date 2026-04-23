import {
  ArrowRight,
  GitBranch,
  Mail,
  MessageCircle,
  MessageSquare,
  Send,
  Zap,
} from 'lucide-react';

/**
 * Modules grid — 5 cards en 12-col layout + mini-mockups inline.
 * Copy hardcoded español (D-LND-06 relajada). Reemplaza product-section.tsx (Plan 01 T7).
 */

// ============================================================================
// Sub-mockups (decorativos — no data real)
// ============================================================================

function CrmMini() {
  const rows: Array<{
    name: string;
    def: string;
    phone: string;
    city: string;
    tag: string;
    tagVariant?: 'red' | 'gold' | 'default';
  }> = [
    {
      name: 'Carolina Rodríguez',
      def: 'cliente VIP',
      phone: '+57 312 488 1092',
      city: 'Bogotá',
      tag: 'Pedido',
      tagVariant: 'red',
    },
    {
      name: 'Jorge Medina',
      def: 'recurrente',
      phone: '+57 301 772 0458',
      city: 'Medellín',
      tag: 'Seguimiento',
      tagVariant: 'gold',
    },
    {
      name: 'Mateo Suárez',
      def: 'nuevo',
      phone: '+57 320 911 3374',
      city: 'Cali',
      tag: 'Contacto',
      tagVariant: 'default',
    },
    {
      name: 'Andrea López',
      def: 'fidelizada',
      phone: '+57 315 223 6908',
      city: 'Bucaramanga',
      tag: 'Pedido',
      tagVariant: 'red',
    },
  ];

  const tagStyleFor = (variant: 'red' | 'gold' | 'default' | undefined) => {
    switch (variant) {
      case 'red':
        return {
          background: 'color-mix(in oklch, var(--rubric-2) 15%, var(--paper-0))',
          color: 'var(--rubric-1)',
        };
      case 'gold':
        return {
          background: 'color-mix(in oklch, var(--accent-gold) 20%, var(--paper-0))',
          color: 'oklch(0.45 0.08 80)',
        };
      default:
        return { background: 'var(--paper-3)', color: 'var(--ink-2)' };
    }
  };

  return (
    <div
      style={{
        padding: '14px 16px',
        fontFamily: 'var(--font-sans)',
        fontSize: '11px',
        height: '220px',
        overflow: 'hidden',
      }}
    >
      <div
        className="flex items-baseline justify-between"
        style={{
          borderBottom: '1px solid var(--ink-1)',
          paddingBottom: '6px',
          marginBottom: '10px',
        }}
      >
        <h4
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            margin: 0,
            fontWeight: 700,
          }}
        >
          Contactos
        </h4>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: 'var(--ink-3)',
          }}
        >
          p. 247 · 1.284 registros
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Contacto', 'Teléfono', 'Ciudad', 'Etapa'].map((h) => (
              <th
                key={h}
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                  textAlign: 'left',
                  padding: '4px 6px',
                  borderBottom: '1px solid var(--ink-1)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.phone}>
              <td
                style={{
                  fontSize: '11px',
                  padding: '6px',
                  borderBottom: '1px solid var(--border)',
                  fontWeight: 600,
                }}
              >
                {r.name}{' '}
                <span
                  style={{
                    fontStyle: 'italic',
                    color: 'var(--ink-3)',
                    fontSize: '10px',
                    fontWeight: 400,
                  }}
                >
                  {r.def}
                </span>
              </td>
              <td
                style={{
                  padding: '6px',
                  borderBottom: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                }}
              >
                {r.phone}
              </td>
              <td
                style={{
                  padding: '6px',
                  borderBottom: '1px solid var(--border)',
                  fontStyle: 'italic',
                  color: 'var(--ink-3)',
                  fontSize: '11px',
                }}
              >
                {r.city}
              </td>
              <td style={{ padding: '6px', borderBottom: '1px solid var(--border)' }}>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: '8px',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: '10px',
                    marginRight: '3px',
                    ...tagStyleFor(r.tagVariant),
                  }}
                >
                  {r.tag}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgMini() {
  return (
    <div
      style={{
        padding: '20px',
        height: '220px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '12px',
      }}
    >
      <div
        className="border border-[var(--ink-1)]"
        style={{ background: 'var(--paper-0)', padding: '12px 14px' }}
      >
        <div className="flex items-center justify-between">
          <div
            style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '12px' }}
          >
            Agente · Ventas
          </div>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--semantic-success)',
            }}
          >
            ● Activo
          </div>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--ink-3)',
            margin: '6px 0 10px',
          }}
        >
          claude-4-sonnet · tono formal-cercano
        </div>
        <div className="flex gap-4">
          {[
            { n: '847', l: 'Turnos hoy' },
            { n: '94%', l: 'Auto-resol.' },
            { n: '1.8s', l: 'Respuesta' },
          ].map((s) => (
            <div key={s.l}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '18px',
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                {s.n}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '9px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                  marginTop: '2px',
                }}
              >
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AutoMini() {
  const arrowStyle: React.CSSProperties = {
    textAlign: 'center',
    fontSize: '12px',
    color: 'var(--ink-3)',
  };

  return (
    <div
      style={{
        padding: '16px',
        height: '220px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Trigger */}
      <div
        className="flex items-center gap-[6px]"
        style={{
          background: 'var(--paper-0)',
          border: '1px solid var(--ink-1)',
          borderLeft: '3px solid var(--rubric-2)',
          padding: '8px 12px',
        }}
      >
        <Zap
          style={{ width: '12px', height: '12px', color: 'var(--ink-3)', flexShrink: 0 }}
          aria-hidden
        />
        <div>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            Nuevo pedido Shopify
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--ink-3)',
              fontWeight: 400,
            }}
          >
            when order.created
          </div>
        </div>
      </div>
      <div style={arrowStyle}>↓</div>

      {/* Condition */}
      <div
        className="flex items-center gap-[6px]"
        style={{
          background: 'var(--paper-0)',
          border: '1px solid var(--ink-1)',
          borderLeft: '3px solid var(--accent-gold)',
          padding: '8px 12px',
        }}
      >
        <GitBranch
          style={{ width: '12px', height: '12px', color: 'var(--ink-3)', flexShrink: 0 }}
          aria-hidden
        />
        <div>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            Si ciudad = Bogotá
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--ink-3)',
              fontWeight: 400,
            }}
          >
            condition
          </div>
        </div>
      </div>
      <div style={arrowStyle}>↓</div>

      {/* Action */}
      <div
        className="flex items-center gap-[6px]"
        style={{
          background: 'var(--paper-0)',
          border: '1px solid var(--ink-1)',
          borderLeft: '3px solid var(--accent-verdigris)',
          padding: '8px 12px',
        }}
      >
        <Send
          style={{ width: '12px', height: '12px', color: 'var(--ink-3)', flexShrink: 0 }}
          aria-hidden
        />
        <div>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            Enviar confirmación WA
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--ink-3)',
              fontWeight: 400,
            }}
          >
            template: order_conf_bog
          </div>
        </div>
      </div>
    </div>
  );
}

function IntMini() {
  const logos: Array<{ nm: string; tp: string; ok: boolean; small?: boolean }> = [
    { nm: 'Shopify', tp: 'E-commerce', ok: true },
    { nm: 'WhatsApp', tp: 'Business', ok: true },
    { nm: 'Coordinadora', tp: 'Envíos', ok: true },
    { nm: 'Inter Rapidísimo', tp: 'Envíos', ok: true, small: true },
    { nm: 'Claude', tp: 'LLM', ok: false },
    { nm: 'GPT', tp: 'LLM', ok: false },
  ];

  return (
    <div
      className="grid"
      style={{
        padding: '20px',
        height: '220px',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        alignContent: 'center',
      }}
    >
      {logos.map((l) => (
        <div
          key={l.nm}
          className="flex flex-col items-center justify-center text-center"
          style={{
            background: l.ok
              ? 'color-mix(in oklch, var(--semantic-success) 6%, var(--paper-0))'
              : 'var(--paper-0)',
            border: l.ok
              ? '1px solid var(--semantic-success)'
              : '1px solid var(--ink-1)',
            padding: '14px 10px',
            gap: '4px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: l.small ? '12px' : '13px',
              letterSpacing: '-0.01em',
            }}
          >
            {l.nm}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '9px',
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {l.tp}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChMini() {
  return (
    <div
      style={{
        padding: '18px',
        height: '220px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* WhatsApp — live */}
      <div
        className="flex items-center gap-[10px]"
        style={{
          border: '1px solid var(--ink-1)',
          background: 'var(--paper-0)',
          padding: '10px 12px',
        }}
      >
        <div
          className="grid place-items-center"
          style={{
            width: '28px',
            height: '28px',
            background: 'var(--paper-2)',
            border: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <MessageCircle
            style={{ width: '14px', height: '14px', color: '#25D366' }}
            aria-hidden
          />
        </div>
        <div
          className="flex-1"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          WhatsApp Business Platform
        </div>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '2px 6px',
            border: '1px solid var(--semantic-success)',
            color: 'var(--semantic-success)',
          }}
        >
          En vivo
        </span>
      </div>

      {/* Messenger — soon solid border */}
      <div
        className="flex items-center gap-[10px]"
        style={{
          border: '1px solid var(--ink-1)',
          background: 'var(--paper-0)',
          padding: '10px 12px',
        }}
      >
        <div
          className="grid place-items-center"
          style={{
            width: '28px',
            height: '28px',
            background: 'var(--paper-2)',
            border: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <MessageSquare
            style={{ width: '14px', height: '14px', color: '#0084FF' }}
            aria-hidden
          />
        </div>
        <div
          className="flex-1"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          Messenger{' '}
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 400,
              fontStyle: 'italic',
              color: 'var(--ink-3)',
              fontSize: '11px',
            }}
          >
            — Meta Direct
          </span>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '2px 6px',
            border: '1px solid var(--ink-3)',
            color: 'var(--ink-3)',
          }}
        >
          Próximo
        </span>
      </div>

      {/* Instagram — soon dashed */}
      <div
        className="flex items-center gap-[10px]"
        style={{
          border: '1px dashed var(--ink-1)',
          background: 'var(--paper-0)',
          padding: '10px 12px',
          opacity: 0.7,
        }}
      >
        <div
          className="grid place-items-center"
          style={{
            width: '28px',
            height: '28px',
            background: 'var(--paper-2)',
            border: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#E4405F"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
        </div>
        <div
          className="flex-1"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          Instagram Direct
        </div>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '2px 6px',
            border: '1px solid var(--ink-3)',
            color: 'var(--ink-3)',
          }}
        >
          Próximo
        </span>
      </div>

      {/* Email — exploring dashed */}
      <div
        className="flex items-center gap-[10px]"
        style={{
          border: '1px dashed var(--ink-1)',
          background: 'var(--paper-0)',
          padding: '10px 12px',
          opacity: 0.7,
        }}
      >
        <div
          className="grid place-items-center"
          style={{
            width: '28px',
            height: '28px',
            background: 'var(--paper-2)',
            border: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <Mail
            style={{ width: '14px', height: '14px', color: 'var(--ink-3)' }}
            aria-hidden
          />
        </div>
        <div
          className="flex-1"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          Correo electrónico
        </div>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '2px 6px',
            border: '1px solid var(--ink-3)',
            color: 'var(--ink-3)',
          }}
        >
          Explorando
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Module card primitive
// ============================================================================

type ModuleSize = 'wide' | 'narrow' | 'half' | 'full';

function ModuleCard({
  id,
  num,
  modNum,
  titleLead,
  titleEm,
  titleTail,
  desc,
  bullets,
  linkLabel,
  size,
  children,
}: {
  id: string;
  num: string;
  modNum: string;
  titleLead: string;
  titleEm: string;
  titleTail?: string;
  desc: string;
  bullets: string[];
  linkLabel: string;
  size: ModuleSize;
  children: React.ReactNode;
}) {
  const spanClass =
    size === 'wide'
      ? 'md:col-span-8'
      : size === 'narrow'
      ? 'md:col-span-4'
      : size === 'half'
      ? 'md:col-span-6'
      : 'md:col-span-12';

  return (
    <article
      id={id}
      className={`relative col-span-12 flex flex-col ${spanClass}`}
      style={{
        background: 'var(--paper-0)',
        border: '1px solid var(--ink-1)',
        padding: '32px',
        boxShadow:
          '0 1px 0 var(--ink-1), 0 12px 28px -18px oklch(0.3 0.04 60 / 0.3)',
      }}
    >
      {/* data-num corner */}
      <span
        aria-hidden
        className="absolute"
        style={{
          top: '14px',
          right: '18px',
          fontFamily: 'var(--font-display)',
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--ink-4)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {num}
      </span>

      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--ink-3)',
          letterSpacing: '0.1em',
        }}
      >
        {modNum}
      </div>

      <h3
        className="text-[var(--ink-1)]"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '30px',
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          margin: '6px 0 0',
        }}
      >
        {titleLead}{' '}
        <em className="italic" style={{ color: 'var(--rubric-2)', fontStyle: 'italic' }}>
          {titleEm}
        </em>
        {titleTail}
      </h3>

      <p
        className="text-[var(--ink-2)]"
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '15px',
          lineHeight: 1.55,
          margin: '14px 0 18px',
          textWrap: 'pretty',
        }}
      >
        {desc}
      </p>

      <ul className="m-0 mb-[22px] flex list-none flex-col gap-2 p-0">
        {bullets.map((b) => (
          <li
            key={b}
            className="relative"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--ink-2)',
              paddingLeft: '20px',
              lineHeight: 1.45,
            }}
          >
            <span
              aria-hidden
              className="absolute left-0"
              style={{
                color: 'var(--rubric-2)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
              }}
            >
              §
            </span>
            {b}
          </li>
        ))}
      </ul>

      <a
        href="#"
        className="inline-flex items-center gap-[6px] no-underline hover:underline"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--rubric-2)',
          marginTop: '10px',
        }}
      >
        {linkLabel}
        <ArrowRight style={{ width: '12px', height: '12px' }} aria-hidden />
      </a>

      <div
        className="mt-auto overflow-hidden"
        style={{
          background: 'var(--paper-1)',
          border: '1px solid var(--ink-1)',
          marginTop: 'auto',
          position: 'relative',
        }}
      >
        {children}
      </div>
    </article>
  );
}

// ============================================================================
// Main grid
// ============================================================================

export function ModulesGrid() {
  return (
    <section
      id="producto"
      className="border-b border-[var(--ink-1)]"
      style={{ padding: '96px 0 72px' }}
    >
      <div className="mx-auto max-w-[1200px] px-8">
        {/* Section head */}
        <div className="mb-[56px] grid items-end gap-8 md:grid-cols-[auto_1fr]">
          <div
            className="justify-self-start md:justify-self-auto"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--rubric-2)',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              borderLeft: '1px solid var(--rubric-2)',
              paddingLeft: '10px',
            }}
          >
            § Producto
          </div>
          <div>
            <h2
              className="m-0"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 'clamp(36px, 4.4vw, 52px)',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                textWrap: 'balance',
              }}
            >
              Cinco módulos,{' '}
              <em
                className="italic"
                style={{ color: 'var(--rubric-2)', fontStyle: 'italic' }}
              >
                un solo hilo
              </em>
              .
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '17px',
                lineHeight: 1.55,
                color: 'var(--ink-3)',
                maxWidth: '520px',
                margin: '12px 0 0',
              }}
            >
              Cada interacción queda asociada al cliente correcto, con historial completo y estado
              sincronizado entre WhatsApp, pedidos y pipelines.
            </p>
          </div>
        </div>

        {/* 12-col grid */}
        <div className="grid grid-cols-12 gap-8">
          <ModuleCard
            id="crm"
            num="01"
            modNum="Módulo 01"
            titleLead="CRM unificado para"
            titleEm="comercio electrónico"
            desc="Concentramos contactos, conversaciones, pedidos y etapas comerciales en una sola vista. Cada interacción queda asociada al cliente correcto."
            bullets={[
              'Contactos unificados con historial completo de mensajes y pedidos.',
              'Pipelines configurables por línea de negocio, con etapas personalizables.',
              'Tags, notas y tareas sincronizadas entre CRM y bandeja de WhatsApp.',
            ]}
            linkLabel="Ver módulo CRM"
            size="wide"
          >
            <CrmMini />
          </ModuleCard>

          <ModuleCard
            id="agentes"
            num="02"
            modNum="Módulo 02"
            titleLead="Agentes"
            titleEm="IA"
            desc="Agentes de atención y ventas sobre Claude y GPT, con guardrails y control total del tono."
            bullets={[
              'Atención 24/7 con estilo configurable por marca.',
              'Observabilidad por turno: eventos auditables.',
              'Escala a humano cuando detecta ambigüedad.',
            ]}
            linkLabel="Ver agentes"
            size="narrow"
          >
            <AgMini />
          </ModuleCard>

          <ModuleCard
            id="automatizaciones"
            num="03"
            modNum="Módulo 03"
            titleLead="Automatizaciones"
            titleEm="sin código"
            desc="Constructor visual con asistente de IA. 10 triggers y 11 acciones sobre contactos, pedidos, etapas y mensajes."
            bullets={[
              'Pedidos nuevos, cambios de etapa, mensajes entrantes.',
              'Enviar mensaje, mover etapa, asignar tag, crear tarea.',
              'Asistente IA que explica y valida cada flujo.',
            ]}
            linkLabel="Ver automatizaciones"
            size="narrow"
          >
            <AutoMini />
          </ModuleCard>

          <ModuleCard
            id="integraciones"
            num="04"
            modNum="Módulo 04"
            titleLead="Integraciones con tu"
            titleEm="stack de e-commerce"
            desc="Conectamos con las plataformas que ya usan las empresas colombianas. Pedidos, guías y pagos fluyen sin planillas intermedias."
            bullets={[
              'Shopify: pedidos, productos y clientes en tiempo real.',
              'Coordinadora e Inter Rapidísimo: creación y seguimiento de guías.',
              'Webhooks y API interna para sistemas propios.',
            ]}
            linkLabel="Ver integraciones"
            size="half"
          >
            <IntMini />
          </ModuleCard>

          <ModuleCard
            id="canales"
            num="05"
            modNum="Módulo 05"
            titleLead="Multi-canal,"
            titleEm="WhatsApp"
            titleTail=" primero"
            desc="Operamos hoy sobre WhatsApp Business Platform. Facebook Messenger e Instagram Direct en habilitación vía Meta Direct."
            bullets={[
              'Plantillas, sesiones y campañas sobre WhatsApp Business.',
              'Un solo hilo por contacto, independiente del canal.',
              'Registro auditable de cada mensaje entrante y saliente.',
            ]}
            linkLabel="Ver canales"
            size="half"
          >
            <ChMini />
          </ModuleCard>
        </div>
      </div>
    </section>
  );
}
