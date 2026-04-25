import { getTranslations } from 'next-intl/server';
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
 * Strings i18n via getTranslations('Landing.ModulesGrid').
 *
 * Hardcoded por ser strings técnicas/no traducibles:
 * - "claude-4-sonnet" (model name)
 * - "when order.created", "condition", "template: order_conf_bog" (DSL/code references)
 * - "WhatsApp Business Platform", "Messenger", "Instagram Direct", "Meta Direct"
 *   (product names propios)
 * - Logo names (Shopify, WhatsApp, Coordinadora, Inter Rapidísimo, Claude, GPT)
 */

// ============================================================================
// Types for mockup data
// ============================================================================

type CrmRow = {
  name: string;
  def: string;
  phone: string;
  city: string;
  tag: string;
  tagVariant?: 'red' | 'gold' | 'default';
};

type AgStat = { n: string; l: string };

type IntLogo = { nm: string; tp: string; ok: boolean; small?: boolean };

type ChCopy = {
  whatsapp: { title: string; status: string };
  messenger: { titleSuffix: string; status: string };
  instagram: { title: string; status: string };
  email: { title: string; status: string };
};

// ============================================================================
// Sub-mockups (decorativos — no data real)
// ============================================================================

function CrmMini({
  tableTitle,
  pagination,
  headers,
  rows,
}: {
  tableTitle: string;
  pagination: string;
  headers: string[];
  rows: CrmRow[];
}) {
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
          {tableTitle}
        </h4>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: 'var(--ink-3)',
          }}
        >
          {pagination}
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {headers.map((h) => (
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

function AgMini({
  agentName,
  active,
  modelTone,
  stats,
}: {
  agentName: string;
  active: string;
  modelTone: string;
  stats: AgStat[];
}) {
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
            {agentName}
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
            {`● ${active}`}
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
          {modelTone}
        </div>
        <div className="flex gap-4">
          {stats.map((s) => (
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

function AutoMini({
  triggerTitle,
  conditionTitle,
  actionTitle,
}: {
  triggerTitle: string;
  conditionTitle: string;
  actionTitle: string;
}) {
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
            {triggerTitle}
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
            {conditionTitle}
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
            {actionTitle}
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

function IntMini({ logos }: { logos: IntLogo[] }) {
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

function ChMini({ copy }: { copy: ChCopy }) {
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
          {copy.whatsapp.title}
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
          {copy.whatsapp.status}
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
            {copy.messenger.titleSuffix}
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
          {copy.messenger.status}
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
          {copy.instagram.title}
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
          {copy.instagram.status}
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
          {copy.email.title}
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
          {copy.email.status}
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

export async function ModulesGrid() {
  const t = await getTranslations('Landing.ModulesGrid');

  // CRM mockup
  const crmRows = t.raw('modules.crm.mockup.rows') as CrmRow[];
  const crmHeaders = t.raw('modules.crm.mockup.headers') as string[];

  // Agents mockup
  const agStats = t.raw('modules.agents.mockup.stats') as AgStat[];

  // Integrations mockup — logos with names hardcoded (product names),
  // type label translated.
  const intLogos: IntLogo[] = [
    { nm: 'Shopify', tp: t('modules.integrations.mockup.types.ecommerce'), ok: true },
    { nm: 'WhatsApp', tp: t('modules.integrations.mockup.types.business'), ok: true },
    { nm: 'Coordinadora', tp: t('modules.integrations.mockup.types.shipping'), ok: true },
    {
      nm: 'Inter Rapidísimo',
      tp: t('modules.integrations.mockup.types.shipping'),
      ok: true,
      small: true,
    },
    { nm: 'Claude', tp: 'LLM', ok: false },
    { nm: 'GPT', tp: 'LLM', ok: false },
  ];

  // Channels mockup
  const chCopy: ChCopy = {
    whatsapp: {
      title: 'WhatsApp Business Platform',
      status: t('modules.channels.mockup.whatsapp.status'),
    },
    messenger: {
      titleSuffix: '— Meta Direct',
      status: t('modules.channels.mockup.messenger.status'),
    },
    instagram: {
      title: 'Instagram Direct',
      status: t('modules.channels.mockup.instagram.status'),
    },
    email: {
      title: t('modules.channels.mockup.email.title'),
      status: t('modules.channels.mockup.email.status'),
    },
  };

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
            {t('sectionMarker')}
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
              {t.rich('headline', {
                em: (chunks) => (
                  <em
                    className="italic"
                    style={{ color: 'var(--rubric-2)', fontStyle: 'italic' }}
                  >
                    {chunks}
                  </em>
                ),
              })}
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
              {t('description')}
            </p>
          </div>
        </div>

        {/* 12-col grid */}
        <div className="grid grid-cols-12 gap-8">
          <ModuleCard
            id="crm"
            num="01"
            modNum={t('modules.crm.label')}
            titleLead={t('modules.crm.titleLead')}
            titleEm={t('modules.crm.titleEm')}
            desc={t('modules.crm.description')}
            bullets={t.raw('modules.crm.bullets') as string[]}
            linkLabel={t('modules.crm.ctaLabel')}
            size="wide"
          >
            <CrmMini
              tableTitle={t('modules.crm.mockup.tableTitle')}
              pagination={t('modules.crm.mockup.pagination')}
              headers={crmHeaders}
              rows={crmRows}
            />
          </ModuleCard>

          <ModuleCard
            id="agentes"
            num="02"
            modNum={t('modules.agents.label')}
            titleLead={t('modules.agents.titleLead')}
            titleEm={t('modules.agents.titleEm')}
            desc={t('modules.agents.description')}
            bullets={t.raw('modules.agents.bullets') as string[]}
            linkLabel={t('modules.agents.ctaLabel')}
            size="narrow"
          >
            <AgMini
              agentName={t('modules.agents.mockup.agentName')}
              active={t('modules.agents.mockup.active')}
              modelTone={t('modules.agents.mockup.modelTone')}
              stats={agStats}
            />
          </ModuleCard>

          <ModuleCard
            id="automatizaciones"
            num="03"
            modNum={t('modules.automations.label')}
            titleLead={t('modules.automations.titleLead')}
            titleEm={t('modules.automations.titleEm')}
            desc={t('modules.automations.description')}
            bullets={t.raw('modules.automations.bullets') as string[]}
            linkLabel={t('modules.automations.ctaLabel')}
            size="narrow"
          >
            <AutoMini
              triggerTitle={t('modules.automations.mockup.triggerTitle')}
              conditionTitle={t('modules.automations.mockup.conditionTitle')}
              actionTitle={t('modules.automations.mockup.actionTitle')}
            />
          </ModuleCard>

          <ModuleCard
            id="integraciones"
            num="04"
            modNum={t('modules.integrations.label')}
            titleLead={t('modules.integrations.titleLead')}
            titleEm={t('modules.integrations.titleEm')}
            desc={t('modules.integrations.description')}
            bullets={t.raw('modules.integrations.bullets') as string[]}
            linkLabel={t('modules.integrations.ctaLabel')}
            size="half"
          >
            <IntMini logos={intLogos} />
          </ModuleCard>

          <ModuleCard
            id="canales"
            num="05"
            modNum={t('modules.channels.label')}
            titleLead={t('modules.channels.titleLead')}
            titleEm={t('modules.channels.titleEm')}
            titleTail={t('modules.channels.titleTail')}
            desc={t('modules.channels.description')}
            bullets={t.raw('modules.channels.bullets') as string[]}
            linkLabel={t('modules.channels.ctaLabel')}
            size="half"
          >
            <ChMini copy={chCopy} />
          </ModuleCard>
        </div>
      </div>
    </section>
  );
}
