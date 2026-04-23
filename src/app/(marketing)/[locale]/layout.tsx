import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';

import { routing } from '@/i18n/routing';
import { Header } from '@/components/marketing/header';
import { Footer } from '@/components/marketing/footer';
import { ebGaramond, inter, jetbrainsMono } from '../fonts';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: 'MORFX — CRM + WhatsApp Business con IA',
  description:
    'MORFX S.A.S. — Plataforma de CRM y automatización de WhatsApp Business con agentes de IA para e-commerce.',
};

export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div
        className={`${ebGaramond.variable} ${inter.variable} ${jetbrainsMono.variable} theme-editorial flex min-h-screen flex-col`}
      >
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </NextIntlClientProvider>
  );
}
