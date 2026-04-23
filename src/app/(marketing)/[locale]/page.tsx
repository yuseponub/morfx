import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { Hero } from '@/components/marketing/landing/hero';
import { Manifest } from '@/components/marketing/landing/manifest';
import { ModulesGrid } from '@/components/marketing/landing/modules-grid';
import { Flow } from '@/components/marketing/landing/flow';
import { About } from '@/components/marketing/landing/about';
import { CTA } from '@/components/marketing/landing/cta';

const SITE_URL = 'https://morfx.app';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = routing.locales.includes(
    locale as (typeof routing.locales)[number]
  )
    ? locale
    : routing.defaultLocale;

  const t = await getTranslations({
    locale: safeLocale,
    namespace: 'Landing.Meta',
  });

  const path = safeLocale === routing.defaultLocale ? '' : `/${safeLocale}`;
  const url = `${SITE_URL}${path}`;
  const title = t('title');
  const description = t('description');

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates: {
      canonical: url,
      languages: {
        es: `${SITE_URL}/`,
        en: `${SITE_URL}/en`,
        'x-default': `${SITE_URL}/`,
      },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: 'MORFX',
      locale: safeLocale === 'es' ? 'es_CO' : 'en_US',
      type: 'website',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'MORFX S.A.S.',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og-image.png'],
    },
  };
}

export default async function MarketingLandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Orden final landing v2.1 (Plan 04 T8):
  // Hero → Manifest → ModulesGrid → Flow → About → CTA
  return (
    <>
      <Hero />
      <Manifest />
      <ModulesGrid />
      <Flow />
      <About />
      <CTA />
    </>
  );
}
