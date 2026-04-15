import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Link as LocaleLink } from '@/i18n/navigation';

export async function Footer() {
  const t = await getTranslations('Footer');

  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          {/* Column 1: Logo + tagline */}
          <div className="space-y-4">
            <div className="flex items-center">
              <Image
                src="/logo-light.png"
                alt="MORFX"
                width={85}
                height={32}
                className="block h-8 w-auto dark:hidden"
              />
              <Image
                src="/logo-dark.png"
                alt="MORFX"
                width={135}
                height={32}
                className="hidden h-8 w-auto dark:block"
              />
            </div>
            <p className="text-sm text-muted-foreground">{t('tagline')}</p>
          </div>

          {/* Column 2: Producto */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">{t('product')}</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <LocaleLink href="/#crm" className="hover:text-foreground">
                  {t('crm')}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink href="/#agents" className="hover:text-foreground">
                  {t('agents')}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink href="/#automations" className="hover:text-foreground">
                  {t('automations')}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink href="/#integrations" className="hover:text-foreground">
                  {t('integrations')}
                </LocaleLink>
              </li>
            </ul>
          </div>

          {/* Column 3: Legal */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">{t('legal')}</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <LocaleLink href="/privacy" className="hover:text-foreground">
                  {t('privacy')}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink href="/terms" className="hover:text-foreground">
                  {t('terms')}
                </LocaleLink>
              </li>
              <li>
                <Link href="/login" className="hover:text-foreground">
                  {t('login')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Contacto */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">{t('contact')}</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <span className="block text-xs uppercase tracking-wider">
                  {t('phone')}
                </span>
                <a href="tel:+573137549286" className="hover:text-foreground">
                  +57 313 754 9286
                </a>
              </li>
              <li>
                <span className="block text-xs uppercase tracking-wider">
                  {t('email')}
                </span>
                <a
                  href="mailto:morfx.colombia@gmail.com"
                  className="hover:text-foreground"
                >
                  morfx.colombia@gmail.com
                </a>
              </li>
              <li>
                <span className="block text-xs uppercase tracking-wider">
                  {t('whatsapp')}
                </span>
                <a
                  href="https://wa.me/573137549286"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground"
                >
                  wa.me/573137549286
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom legal bar — NOT translated (same in ES and EN) */}
        <div className="mt-10 border-t pt-6 text-center text-xs text-muted-foreground">
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
