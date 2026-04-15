import { setRequestLocale } from 'next-intl/server';

export default async function MarketingLandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-5xl flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">MORFX S.A.S.</h1>
      <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
        Landing content coming in Plan 03.
      </p>
    </section>
  );
}
