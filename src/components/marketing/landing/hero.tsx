import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ArrowRight, Clock, MessageSquare } from 'lucide-react';

const WA_URL = 'https://wa.me/573137549286';

/**
 * Inserta <em> italic rubric-2 sobre la palabra 'automatizados' dentro del
 * headline traducido, preservando el i18n key existente byte-exact.
 * Si el idioma es inglés la key no contiene 'automatizados' — se muestra plain.
 */
function HeadlineWithEm({ text }: { text: string }) {
  const idx = text.indexOf('automatizados');
  if (idx === -1) {
    // en.json: "CRM and automated WhatsApp Business with artificial intelligence"
    const idxEn = text.indexOf('automated');
    if (idxEn === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idxEn)}
        <em
          className="italic"
          style={{ color: 'var(--rubric-2)', fontStyle: 'italic', fontWeight: 700 }}
        >
          automated
        </em>
        {text.slice(idxEn + 'automated'.length)}
      </>
    );
  }
  return (
    <>
      {text.slice(0, idx)}
      <em
        className="italic"
        style={{ color: 'var(--rubric-2)', fontStyle: 'italic', fontWeight: 700 }}
      >
        automatizados
      </em>
      {text.slice(idx + 'automatizados'.length)}
    </>
  );
}

export async function Hero() {
  const t = await getTranslations('Landing.Hero');

  return (
    <section
      id="top"
      className="relative border-b border-[var(--ink-1)]"
      style={{ padding: '64px 0 88px' }}
    >
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-16 px-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* LEFT COLUMN */}
        <div>
          {/* Stamp chip */}
          <span
            className="inline-flex items-center gap-2 rounded-[3px] border px-[10px] py-[5px] text-[10px] font-bold uppercase"
            style={{
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.18em',
              color: 'var(--rubric-2)',
              borderColor: 'var(--rubric-2)',
              background: 'color-mix(in oklch, var(--rubric-2) 6%, var(--paper-0))',
            }}
          >
            <span
              aria-hidden
              className="inline-block h-[6px] w-[6px] rounded-full"
              style={{ background: 'var(--rubric-2)' }}
            />
            {t('badge')}
          </span>

          {/* Headline con <em>automatizados</em> rubric-2 */}
          <h1
            className="mt-5 text-[var(--ink-1)]"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'clamp(44px, 5.4vw, 68px)',
              lineHeight: 1.02,
              letterSpacing: '-0.025em',
              textWrap: 'balance',
            }}
          >
            <HeadlineWithEm text={t('headline')} />
          </h1>

          {/* Subhead */}
          <p
            className="mt-6 text-[var(--ink-2)]"
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '19px',
              lineHeight: 1.55,
              maxWidth: '560px',
              textWrap: 'pretty',
            }}
          >
            {t('subhead')}
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap gap-3">
            {/* Primary — rubric-2 press */}
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-[7px] rounded-[4px] border border-[var(--rubric-1)] bg-[var(--rubric-2)] px-[18px] py-[11px] text-[14px] font-semibold text-[var(--paper-0)] no-underline hover:bg-[var(--rubric-1)] active:translate-y-px"
              style={{
                fontFamily: 'var(--font-sans)',
                boxShadow: '0 1px 0 var(--rubric-1)',
              }}
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
              {t('primaryCTA')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>

            {/* Secondary — default editorial button */}
            <Link
              href="/login"
              className="inline-flex items-center gap-[7px] rounded-[4px] border border-[var(--ink-1)] bg-[var(--paper-0)] px-[18px] py-[11px] text-[14px] font-semibold text-[var(--ink-1)] no-underline hover:bg-[var(--paper-3)] active:translate-y-px"
              style={{
                fontFamily: 'var(--font-sans)',
                boxShadow: '0 1px 0 var(--ink-1)',
              }}
            >
              {t('secondaryCTA')}
            </Link>
          </div>

          {/* Meta line — clock + italic */}
          <p
            className="mt-7 flex items-center gap-2 text-[var(--ink-3)]"
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: '13px',
            }}
          >
            <Clock
              className="h-4 w-4"
              style={{ color: 'var(--semantic-success)' }}
              aria-hidden
            />
            {t('responseTag')}
          </p>
        </div>

        {/* RIGHT COLUMN — mockup frame with tape corners */}
        <div
          aria-hidden="true"
          className="relative border border-[var(--ink-1)] bg-[var(--paper-0)]"
          style={{
            transform: 'rotate(0.6deg)',
            boxShadow:
              '0 1px 0 var(--ink-1), 0 24px 48px -20px oklch(0.3 0.04 60 / 0.35)',
          }}
        >
          {/* Tape corners */}
          <span
            className="absolute"
            style={{
              width: '72px',
              height: '22px',
              top: '-11px',
              left: '24px',
              transform: 'rotate(-4deg)',
              background:
                'color-mix(in oklch, var(--accent-gold) 35%, var(--paper-0))',
              border: '1px solid color-mix(in oklch, var(--accent-gold) 60%, var(--ink-3))',
              opacity: 0.9,
              zIndex: 5,
            }}
          />
          <span
            className="absolute"
            style={{
              width: '72px',
              height: '22px',
              top: '-11px',
              right: '24px',
              transform: 'rotate(5deg)',
              background:
                'color-mix(in oklch, var(--accent-gold) 35%, var(--paper-0))',
              border: '1px solid color-mix(in oklch, var(--accent-gold) 60%, var(--ink-3))',
              opacity: 0.9,
              zIndex: 5,
            }}
          />
          <span
            className="absolute"
            style={{
              width: '72px',
              height: '22px',
              bottom: '-11px',
              left: '40px',
              transform: 'rotate(3deg)',
              background:
                'color-mix(in oklch, var(--accent-gold) 35%, var(--paper-0))',
              border: '1px solid color-mix(in oklch, var(--accent-gold) 60%, var(--ink-3))',
              opacity: 0.9,
              zIndex: 5,
            }}
          />
          <span
            className="absolute"
            style={{
              width: '72px',
              height: '22px',
              bottom: '-11px',
              right: '40px',
              transform: 'rotate(-4deg)',
              background:
                'color-mix(in oklch, var(--accent-gold) 35%, var(--paper-0))',
              border: '1px solid color-mix(in oklch, var(--accent-gold) 60%, var(--ink-3))',
              opacity: 0.9,
              zIndex: 5,
            }}
          />

          {/* WhatsApp miniature */}
          <div
            className="grid overflow-hidden"
            style={{ gridTemplateColumns: '140px 1fr', height: '420px' }}
          >
            {/* Conversation list */}
            <aside
              className="overflow-hidden border-r"
              style={{
                background: 'var(--paper-2)',
                borderRightColor: 'var(--border)',
              }}
            >
              <div
                className="border-b px-3 py-[10px] text-[11px] font-bold uppercase"
                style={{
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.1em',
                  color: 'var(--ink-3)',
                  borderBottomColor: 'var(--border)',
                }}
              >
                Bandeja · 12
              </div>

              {/* Active chat */}
              <div
                className="border-b px-[8px] py-[9px]"
                style={{
                  background: 'var(--paper-0)',
                  borderLeft: '2px solid var(--rubric-2)',
                  borderBottomColor: 'var(--border)',
                }}
              >
                <div
                  className="flex justify-between text-[11px] font-semibold"
                  style={{ color: 'var(--ink-1)' }}
                >
                  <span>Carolina R.</span>
                  <span style={{ fontWeight: 400, fontSize: '9px', color: 'var(--ink-3)' }}>
                    14:32
                  </span>
                </div>
                <div
                  className="mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap text-[10px]"
                  style={{ color: 'var(--ink-3)' }}
                >
                  Hola, ¿ya salió mi envío?
                </div>
                <div className="mt-1 flex gap-[3px]">
                  <span
                    className="rounded-[8px] border px-[5px] py-[1px] text-[8px] font-semibold"
                    style={{
                      background: 'color-mix(in oklch, var(--rubric-2) 15%, var(--paper-0))',
                      color: 'var(--rubric-1)',
                      borderColor: 'color-mix(in oklch, var(--rubric-2) 35%, transparent)',
                    }}
                  >
                    IA
                  </span>
                  <span
                    className="rounded-[8px] px-[5px] py-[1px] text-[8px] font-semibold"
                    style={{ background: 'var(--paper-3)', color: 'var(--ink-2)' }}
                  >
                    VIP
                  </span>
                </div>
              </div>

              {/* Jorge */}
              <div
                className="border-b px-[10px] py-[9px]"
                style={{ borderBottomColor: 'var(--border)' }}
              >
                <div
                  className="flex justify-between text-[11px] font-semibold"
                  style={{ color: 'var(--ink-1)' }}
                >
                  <span>Jorge M.</span>
                  <span style={{ fontWeight: 400, fontSize: '9px', color: 'var(--ink-3)' }}>
                    14:28
                  </span>
                </div>
                <div
                  className="mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap text-[10px]"
                  style={{ color: 'var(--ink-3)' }}
                >
                  Confirmo la dirección…
                </div>
                <div className="mt-1 flex gap-[3px]">
                  <span
                    className="rounded-[8px] px-[5px] py-[1px] text-[8px] font-semibold"
                    style={{ background: 'var(--paper-3)', color: 'var(--ink-2)' }}
                  >
                    Pedido
                  </span>
                </div>
              </div>

              {/* Mateo */}
              <div
                className="border-b px-[10px] py-[9px]"
                style={{ borderBottomColor: 'var(--border)' }}
              >
                <div
                  className="flex justify-between text-[11px] font-semibold"
                  style={{ color: 'var(--ink-1)' }}
                >
                  <span>Mateo S.</span>
                  <span style={{ fontWeight: 400, fontSize: '9px', color: 'var(--ink-3)' }}>
                    14:11
                  </span>
                </div>
                <div
                  className="mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap text-[10px]"
                  style={{ color: 'var(--ink-3)' }}
                >
                  ¿Tienen talla M?
                </div>
                <div className="mt-1 flex gap-[3px]">
                  <span
                    className="rounded-[8px] border px-[5px] py-[1px] text-[8px] font-semibold"
                    style={{
                      background: 'color-mix(in oklch, var(--rubric-2) 15%, var(--paper-0))',
                      color: 'var(--rubric-1)',
                      borderColor: 'color-mix(in oklch, var(--rubric-2) 35%, transparent)',
                    }}
                  >
                    IA
                  </span>
                </div>
              </div>

              {/* Andrea */}
              <div
                className="border-b px-[10px] py-[9px]"
                style={{ borderBottomColor: 'var(--border)' }}
              >
                <div
                  className="flex justify-between text-[11px] font-semibold"
                  style={{ color: 'var(--ink-1)' }}
                >
                  <span>Andrea L.</span>
                  <span style={{ fontWeight: 400, fontSize: '9px', color: 'var(--ink-3)' }}>
                    13:55
                  </span>
                </div>
                <div
                  className="mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap text-[10px]"
                  style={{ color: 'var(--ink-3)' }}
                >
                  Perfecto, muchas gracias 🙏
                </div>
              </div>

              {/* Esteban */}
              <div className="px-[10px] py-[9px]">
                <div
                  className="flex justify-between text-[11px] font-semibold"
                  style={{ color: 'var(--ink-1)' }}
                >
                  <span>Esteban P.</span>
                  <span style={{ fontWeight: 400, fontSize: '9px', color: 'var(--ink-3)' }}>
                    13:40
                  </span>
                </div>
                <div
                  className="mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap text-[10px]"
                  style={{ color: 'var(--ink-3)' }}
                >
                  Quiero cambiar la fecha…
                </div>
                <div className="mt-1 flex gap-[3px]">
                  <span
                    className="rounded-[8px] px-[5px] py-[1px] text-[8px] font-semibold"
                    style={{ background: 'var(--paper-3)', color: 'var(--ink-2)' }}
                  >
                    Seguimiento
                  </span>
                </div>
              </div>
            </aside>

            {/* Conversation */}
            <div className="flex flex-col" style={{ background: 'var(--paper-1)' }}>
              {/* Convo header */}
              <div
                className="flex items-center gap-2 border-b px-3 py-2"
                style={{ borderBottomColor: 'var(--border)' }}
              >
                <div
                  className="grid h-[26px] w-[26px] place-items-center rounded-full border"
                  style={{
                    background: 'var(--paper-3)',
                    borderColor: 'var(--border)',
                    fontFamily: 'var(--font-display)',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--ink-2)',
                  }}
                >
                  C
                </div>
                <div className="flex-1">
                  <div className="text-[11px] font-semibold" style={{ color: 'var(--ink-1)' }}>
                    Carolina Rodríguez
                  </div>
                  <div
                    className="text-[9px]"
                    style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}
                  >
                    +57 312 488 1092 · Pedido #10482
                  </div>
                </div>
                <span
                  className="border px-[6px] py-[2px] text-[9px] font-bold uppercase"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    letterSpacing: '0.1em',
                    color: 'var(--rubric-2)',
                    borderColor: 'var(--rubric-2)',
                  }}
                >
                  Auto
                </span>
              </div>

              {/* Messages */}
              <div className="flex flex-1 flex-col gap-2 overflow-hidden p-3">
                {/* In */}
                <div
                  className="max-w-[75%] self-start rounded-[8px] border px-[10px] py-[7px] text-[11px]"
                  style={{
                    background: 'var(--paper-0)',
                    borderColor: 'var(--border)',
                    lineHeight: 1.4,
                  }}
                >
                  Hola, ¿ya salió mi envío?
                  <div className="mt-[3px] text-[8px]" style={{ color: 'var(--ink-4)' }}>
                    14:31
                  </div>
                </div>

                {/* Out AI */}
                <div
                  className="max-w-[75%] self-end rounded-[8px] border px-[10px] py-[7px] text-[11px]"
                  style={{
                    background: 'color-mix(in oklch, var(--rubric-2) 12%, var(--paper-0))',
                    borderColor: 'color-mix(in oklch, var(--rubric-2) 30%, transparent)',
                    color: 'var(--ink-1)',
                    lineHeight: 1.4,
                  }}
                >
                  <div
                    className="mb-[2px] text-[8px] font-bold uppercase"
                    style={{ letterSpacing: '0.1em', color: 'var(--rubric-2)' }}
                  >
                    ✦ Agente IA
                  </div>
                  ¡Hola Carolina! Tu pedido <strong>#10482</strong> fue despachado hoy a las 11:24
                  con <strong>Coordinadora</strong>. Guía <strong>CO-8847124</strong>. Te llega
                  mañana.
                  <div className="mt-[3px] text-[8px]" style={{ color: 'var(--ink-4)' }}>
                    14:32 ✓✓
                  </div>
                </div>

                {/* In short */}
                <div
                  className="max-w-[75%] self-start rounded-[8px] border px-[10px] py-[7px] text-[11px]"
                  style={{
                    background: 'var(--paper-0)',
                    borderColor: 'var(--border)',
                    lineHeight: 1.4,
                  }}
                >
                  ¡Gracias!
                  <div className="mt-[3px] text-[8px]" style={{ color: 'var(--ink-4)' }}>
                    14:32
                  </div>
                </div>
              </div>

              {/* Composer */}
              <div
                className="flex items-center gap-[6px] border-t px-3 py-2"
                style={{
                  background: 'var(--paper-2)',
                  borderTopColor: 'var(--border)',
                }}
              >
                <div
                  className="flex h-[24px] flex-1 items-center rounded-[12px] border px-[10px] text-[10px] italic"
                  style={{
                    background: 'var(--paper-0)',
                    borderColor: 'var(--border)',
                    color: 'var(--ink-4)',
                  }}
                >
                  Escribe una respuesta…
                </div>
                <span
                  className="rounded-[10px] border px-[8px] py-[3px] text-[9px] font-semibold"
                  style={{
                    background: 'var(--paper-0)',
                    borderColor: 'var(--rubric-2)',
                    color: 'var(--rubric-2)',
                  }}
                >
                  ✦ Sugerencia
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
