import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Link as LocaleLink } from '@/i18n/navigation';

export async function Footer() {
  const t = await getTranslations('Footer');

  return (
    <footer className="border-t border-[var(--ink-2)] bg-[var(--paper-3)] py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          {/* Column 1: Logo + tagline */}
          <div className="space-y-4">
            <div className="flex items-center">
              <Image
                src="/logo-light.png"
                alt="MORFX"
                width={85}
                height={32}
                className="block h-8 w-auto"
              />
            </div>
            <p className="mx-body text-[13px] text-[var(--ink-2)]">
              {t('tagline')}
            </p>
          </div>

          {/* Column 2: Producto */}
          <div>
            <h3 className="mx-smallcaps mb-4 text-[11px] tracking-[0.12em] text-[var(--ink-3)]">
              {t('product')}
            </h3>
            <ul className="space-y-2">
              <li>
                <LocaleLink
                  href="/#crm"
                  className="text-[13px] text-[var(--ink-2)] underline-offset-[3px] transition-colors hover:text-[var(--ink-1)] hover:underline"
                >
                  {t('crm')}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink
                  href="/#agents"
                  className="text-[13px] text-[var(--ink-2)] underline-offset-[3px] transition-colors hover:text-[var(--ink-1)] hover:underline"
                >
                  {t('agents')}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink
                  href="/#automations"
                  className="text-[13px] text-[var(--ink-2)] underline-offset-[3px] transition-colors hover:text-[var(--ink-1)] hover:underline"
                >
                  {t('automations')}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink
                  href="/#integrations"
                  className="text-[13px] text-[var(--ink-2)] underline-offset-[3px] transition-colors hover:text-[var(--ink-1)] hover:underline"
                >
                  {t('integrations')}
                </LocaleLink>
              </li>
            </ul>
          </div>

          {/* Column 3: Legal */}
          <div>
            <h3 className="mx-smallcaps mb-4 text-[11px] tracking-[0.12em] text-[var(--ink-3)]">
              {t('legal')}
            </h3>
            <ul className="space-y-2">
              <li>
                <LocaleLink
                  href="/privacy"
                  className="text-[13px] text-[var(--ink-2)] underline-offset-[3px] transition-colors hover:text-[var(--ink-1)] hover:underline"
                >
                  {t('privacy')}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink
                  href="/terms"
                  className="text-[13px] text-[var(--ink-2)] underline-offset-[3px] transition-colors hover:text-[var(--ink-1)] hover:underline"
                >
                  {t('terms')}
                </LocaleLink>
              </li>
              <li>
                <Link
                  href="/login"
                  className="text-[13px] text-[var(--ink-2)] underline-offset-[3px] transition-colors hover:text-[var(--ink-1)] hover:underline"
                >
                  {t('login')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Contacto */}
          <div>
            <h3 className="mx-smallcaps mb-4 text-[11px] tracking-[0.12em] text-[var(--ink-3)]">
              {t('contact')}
            </h3>
            <ul className="space-y-3">
              <li>
                <span className="mx-smallcaps block text-[10px] tracking-[0.12em] text-[var(--ink-4)]">
                  {t('phone')}
                </span>
                <a
                  href="tel:+573137549286"
                  className="mt-1 block font-mono text-[12px] text-[var(--ink-2)] tracking-[0.02em] transition-colors hover:text-[var(--ink-1)]"
                >
                  +57 313 754 9286
                </a>
              </li>
              <li>
                <span className="mx-smallcaps block text-[10px] tracking-[0.12em] text-[var(--ink-4)]">
                  {t('email')}
                </span>
                <a
                  href="mailto:morfx.colombia@gmail.com"
                  className="mt-1 block font-mono text-[12px] text-[var(--ink-2)] tracking-[0.02em] transition-colors hover:text-[var(--ink-1)]"
                >
                  morfx.colombia@gmail.com
                </a>
              </li>
              <li>
                <span className="mx-smallcaps block text-[10px] tracking-[0.12em] text-[var(--ink-4)]">
                  {t('whatsapp')}
                </span>
                <a
                  href="https://wa.me/573137549286"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block font-mono text-[12px] text-[var(--ink-2)] tracking-[0.02em] transition-colors hover:text-[var(--ink-1)]"
                >
                  wa.me/573137549286
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom legal bar — NOT translated (same in ES and EN) */}
        <div
          className="mt-12 border-t border-[var(--ink-2)] pt-6 text-center font-mono text-[11px] tracking-[0.02em] text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <p>© 2026 MORFX S.A.S. — NIT 902.052.328-5</p>
          <p className="mt-1">
            Carrera 38 # 42 - 17 Apartamento 1601B, Bucaramanga, Santander, Colombia
          </p>
          <p className="mt-1">
            CIIU 6201 — Actividades de desarrollo de sistemas informáticos
          </p>
        </div>
      </div>
    </footer>
  );
}
