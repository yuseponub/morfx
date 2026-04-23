import Link from 'next/link';

import { Link as LocaleLink } from '@/i18n/navigation';

/**
 * Footer dark — bg ink-1, color paper-1. 4-col grid (1.4fr/1fr/1fr/1.2fr) + legal bottom mono.
 * Copy hardcoded español (D-LND-06 relajada). El mock v2.1 migra footer de paper-3 claro a ink-1 oscuro.
 */
export function Footer() {
  const linkBase: React.CSSProperties = {
    color: 'color-mix(in oklch, var(--paper-0) 85%, transparent)',
    textDecoration: 'none',
  };
  const linkHover = 'hover:[color:var(--paper-0)]';

  const colHead: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: 'color-mix(in oklch, var(--paper-0) 55%, transparent)',
    margin: '0 0 16px',
  };

  const liItem: React.CSSProperties = {
    fontFamily: 'var(--font-serif)',
    fontSize: '14px',
  };

  const contactLabel: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'color-mix(in oklch, var(--paper-0) 50%, transparent)',
    display: 'block',
    marginBottom: '2px',
  };

  return (
    <footer
      style={{
        background: 'var(--ink-1)',
        color: 'var(--paper-1)',
        padding: '72px 0 32px',
      }}
    >
      <div className="mx-auto max-w-[1200px] px-8">
        {/* 4-col grid — stack a 2col @960, 1col @560 */}
        <div
          className="grid grid-cols-1 gap-10 pb-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]"
          style={{
            borderBottom:
              '1px solid color-mix(in oklch, var(--paper-0) 20%, transparent)',
          }}
        >
          {/* Col 1: footer-wm morf·x + tagline */}
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: '32px',
                color: 'var(--paper-0)',
                letterSpacing: '-0.02em',
                marginBottom: '14px',
              }}
            >
              morf
              <b style={{ color: 'var(--rubric-3)' }}>·</b>x
            </div>
            <p
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '14px',
                lineHeight: 1.55,
                color: 'color-mix(in oklch, var(--paper-0) 70%, transparent)',
                maxWidth: '280px',
                margin: 0,
              }}
            >
              CRM y automatización de WhatsApp Business con IA para e-commerce.
            </p>
          </div>

          {/* Col 2: Producto */}
          <div>
            <h5 style={colHead}>Producto</h5>
            <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
              <li style={liItem}>
                <LocaleLink href="/#crm" style={linkBase} className={linkHover}>
                  CRM unificado
                </LocaleLink>
              </li>
              <li style={liItem}>
                <LocaleLink href="/#agentes" style={linkBase} className={linkHover}>
                  Agentes de IA
                </LocaleLink>
              </li>
              <li style={liItem}>
                <LocaleLink
                  href="/#automatizaciones"
                  style={linkBase}
                  className={linkHover}
                >
                  Automatizaciones
                </LocaleLink>
              </li>
              <li style={liItem}>
                <LocaleLink
                  href="/#integraciones"
                  style={linkBase}
                  className={linkHover}
                >
                  Integraciones
                </LocaleLink>
              </li>
            </ul>
          </div>

          {/* Col 3: Legal */}
          <div>
            <h5 style={colHead}>Legal</h5>
            <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
              <li style={liItem}>
                <LocaleLink href="/privacy" style={linkBase} className={linkHover}>
                  Política de privacidad
                </LocaleLink>
              </li>
              <li style={liItem}>
                <LocaleLink href="/terms" style={linkBase} className={linkHover}>
                  Términos de servicio
                </LocaleLink>
              </li>
              <li style={liItem}>
                <Link href="/login" style={linkBase} className={linkHover}>
                  Iniciar sesión
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Contacto */}
          <div>
            <h5 style={colHead}>Contacto</h5>
            <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
              <li style={liItem}>
                <span style={contactLabel}>Teléfono</span>
                <a
                  href="tel:+573137549286"
                  style={linkBase}
                  className={linkHover}
                >
                  +57 313 754 9286
                </a>
              </li>
              <li style={liItem}>
                <span style={contactLabel}>Email</span>
                <a
                  href="mailto:morfx.colombia@gmail.com"
                  style={linkBase}
                  className={linkHover}
                >
                  morfx.colombia@gmail.com
                </a>
              </li>
              <li style={liItem}>
                <span style={contactLabel}>WhatsApp</span>
                <a
                  href="https://wa.me/573137549286"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={linkBase}
                  className={linkHover}
                >
                  wa.me/573137549286
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom legal strip — mono */}
        <div
          className="text-center"
          style={{
            paddingTop: '24px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            lineHeight: 1.7,
            color: 'color-mix(in oklch, var(--paper-0) 55%, transparent)',
          }}
        >
          <p style={{ margin: '2px 0' }}>© 2026 MORFX S.A.S. — NIT 902.052.328-5</p>
          <p style={{ margin: '2px 0' }}>
            Carrera 38 # 42 - 17 Apartamento 1601B, Bucaramanga, Santander, Colombia
          </p>
          <p style={{ margin: '2px 0' }}>
            CIIU 6201 — Actividades de desarrollo de sistemas informáticos
          </p>
        </div>
      </div>
    </footer>
  );
}
