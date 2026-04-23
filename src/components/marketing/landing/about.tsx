import { getTranslations } from 'next-intl/server';

/**
 * About — 2-col editorial con ledger legal card + blockquote objeto social.
 * Preserva i18n keys existentes (eyebrow, heading, intro, objetoSocial, objetoSocialLabel,
 * objetoSocialSource). Datos corporativos hardcoded (ya eran byte-exact en el componente anterior).
 */
export async function About() {
  const t = await getTranslations('Landing.About');

  const ledgerRows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: 'Razón social', value: 'MORFX S.A.S.' },
    { label: 'NIT', value: '902.052.328-5', mono: true },
    { label: 'Domicilio', value: 'Bucaramanga, Santander, Colombia' },
    { label: 'Año de constitución', value: '2026', mono: true },
    { label: 'Código CIIU', value: '6201', mono: true },
    { label: 'Representante legal', value: 'Jose Mario Romero Rincón' },
  ];

  return (
    <section
      id="nosotros"
      className="border-b border-[var(--ink-1)]"
      style={{ padding: '96px 0' }}
    >
      <div className="mx-auto max-w-[1200px] px-8">
        {/* Section head */}
        <div
          className="grid items-end gap-8 md:grid-cols-[auto_1fr]"
          style={{ marginBottom: '40px' }}
        >
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
            § Quiénes somos
          </div>
          <div />
        </div>

        {/* 2-col body */}
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
          {/* LEFT: headline + intro + objeto social blockquote */}
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 'clamp(32px, 3.8vw, 44px)',
                lineHeight: 1.15,
                letterSpacing: '-0.015em',
                margin: '12px 0 24px',
                textWrap: 'balance',
              }}
            >
              Una empresa{' '}
              <em
                className="italic"
                style={{ color: 'var(--rubric-2)', fontStyle: 'italic' }}
              >
                colombiana
              </em>{' '}
              dedicada a plataformas de IA para empresas.
            </h2>

            <p
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '16px',
                lineHeight: 1.7,
                color: 'var(--ink-2)',
                textWrap: 'pretty',
              }}
            >
              {t('intro')}
            </p>

            {/* Objeto social */}
            <div style={{ marginTop: '32px' }}>
              <div
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--rubric-2)',
                  marginBottom: '10px',
                }}
              >
                Objeto social
              </div>
              <blockquote
                style={{
                  borderLeft: '2px solid var(--rubric-2)',
                  padding: '2px 0 2px 20px',
                  fontFamily: 'var(--font-serif)',
                  fontStyle: 'italic',
                  fontSize: '15px',
                  lineHeight: 1.6,
                  color: 'var(--ink-1)',
                  margin: '24px 0 10px',
                }}
              >
                {t('objetoSocial')}
              </blockquote>
              <p
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontStyle: 'italic',
                  fontSize: '12px',
                  color: 'var(--ink-3)',
                  margin: 0,
                }}
              >
                {t('objetoSocialSource')}
              </p>
            </div>
          </div>

          {/* RIGHT: ledger card */}
          <div>
            <div
              className="relative"
              style={{
                background: 'var(--paper-0)',
                border: '1px solid var(--ink-1)',
                boxShadow:
                  '0 1px 0 var(--ink-1), 0 12px 28px -18px oklch(0.3 0.04 60 / 0.3)',
              }}
            >
              {/* Ledger header */}
              <div
                className="flex items-baseline justify-between"
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--ink-1)',
                  background: 'var(--paper-1)',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '15px',
                  }}
                >
                  Datos legales
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--ink-3)',
                    letterSpacing: '0.08em',
                  }}
                >
                  Registro mercantil · 2026
                </div>
              </div>

              {/* Ledger body */}
              <dl style={{ padding: '4px 0', margin: 0 }}>
                {ledgerRows.map((row, i) => (
                  <div
                    key={row.label}
                    className="grid items-baseline"
                    style={{
                      gridTemplateColumns: '140px 1fr',
                      padding: '12px 20px',
                      borderBottom:
                        i === ledgerRows.length - 1
                          ? '0'
                          : '1px solid var(--border)',
                      gap: '20px',
                    }}
                  >
                    <dt
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'var(--ink-3)',
                      }}
                    >
                      {row.label}
                    </dt>
                    <dd
                      style={{
                        fontFamily: row.mono ? 'var(--font-mono)' : 'var(--font-serif)',
                        fontSize: row.mono ? '13px' : '15px',
                        color: 'var(--ink-1)',
                        margin: 0,
                        fontWeight: 500,
                      }}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
