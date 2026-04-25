import { getTranslations } from 'next-intl/server';
import { Mail, MessageSquare } from 'lucide-react';

const WA_URL = 'https://wa.me/573137549286';
const EMAIL = 'morfx.colombia@gmail.com';
const PHONE_DISPLAY = '+57 313 754 9286';
const PHONE_TEL = '+573137549286';

/**
 * CTA closing — cta-card con ornament ❊ ❊ ❊ + headline rubric-em + contact line.
 *
 * El headline contiene un <em rubric-2> alrededor de "empezar?" / "started?";
 * usamos t.rich con placeholder <em>...</em>.
 *
 * El contact-line tiene 2 anchors inline (teléfono + email) — usamos t.rich
 * con placeholders <phone>/<email> que renderizan los <a> con tel:/mailto:
 * y los valores hardcoded de PHONE_DISPLAY / EMAIL (datos de contacto reales,
 * no traducibles).
 */
export async function CTA() {
  const t = await getTranslations('Landing.Cta');

  return (
    <section
      className="relative border-b border-[var(--ink-1)]"
      style={{ padding: '96px 0', background: 'var(--paper-2)' }}
    >
      <div className="mx-auto max-w-[1200px] px-8">
        <div
          className="relative mx-auto text-center"
          style={{
            maxWidth: '860px',
            background: 'var(--paper-0)',
            border: '1px solid var(--ink-1)',
            padding: '64px 28px 56px',
            boxShadow:
              '0 1px 0 var(--ink-1), 0 24px 48px -24px oklch(0.3 0.04 60 / 0.3)',
          }}
        >
          {/* Ornament */}
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '18px',
              color: 'var(--rubric-3)',
              letterSpacing: '0.8em',
              textAlign: 'center',
              marginBottom: '24px',
            }}
          >
            ❊ ❊ ❊
          </div>

          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(36px, 4.2vw, 52px)',
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              margin: '0 0 18px',
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
            className="mx-auto"
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '17px',
              lineHeight: 1.55,
              color: 'var(--ink-2)',
              maxWidth: '600px',
              margin: '0 auto 32px',
              textWrap: 'pretty',
            }}
          >
            {t('description')}
          </p>

          <div className="flex flex-wrap justify-center gap-3">
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
              {t('primaryButton')}
            </a>

            {/* Secondary — editorial outline */}
            <a
              href={`mailto:${EMAIL}`}
              className="inline-flex items-center gap-[7px] rounded-[4px] border border-[var(--ink-1)] bg-[var(--paper-0)] px-[18px] py-[11px] text-[14px] font-semibold text-[var(--ink-1)] no-underline hover:bg-[var(--paper-3)] active:translate-y-px"
              style={{
                fontFamily: 'var(--font-sans)',
                boxShadow: '0 1px 0 var(--ink-1)',
              }}
            >
              <Mail className="h-4 w-4" aria-hidden />
              {t('secondaryButton')}
            </a>
          </div>

          {/* Contact line */}
          <p
            style={{
              marginTop: '28px',
              fontFamily: 'var(--font-serif)',
              fontSize: '13px',
              fontStyle: 'italic',
              color: 'var(--ink-3)',
            }}
          >
            {t.rich('contactLine', {
              phone: () => (
                <a
                  href={`tel:${PHONE_TEL}`}
                  style={{
                    color: 'var(--rubric-2)',
                    textDecoration: 'none',
                    fontStyle: 'normal',
                    fontWeight: 500,
                  }}
                >
                  {PHONE_DISPLAY}
                </a>
              ),
              email: () => (
                <a
                  href={`mailto:${EMAIL}`}
                  style={{
                    color: 'var(--rubric-2)',
                    textDecoration: 'none',
                    fontStyle: 'normal',
                    fontWeight: 500,
                  }}
                >
                  {EMAIL}
                </a>
              ),
            })}
          </p>
        </div>
      </div>
    </section>
  );
}
