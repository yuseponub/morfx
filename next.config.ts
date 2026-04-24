import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // pdfkit needs filesystem access to .afm font files bundled in node_modules
  // bwip-js has native bindings that break when bundled
  serverExternalPackages: ['pdfkit', 'bwip-js'],
  // Standalone `agent-forensics-panel` Plan 01 Task 8 (Pitfall 3 pre-register):
  // the audit API route (Plans 03/04 will create it) needs to `fs.readFile`
  // agent spec markdown files at runtime. Next.js 15 does NOT bundle arbitrary
  // files into Vercel lambdas by default — only `import`-ed modules. Without
  // this include the glob resolves to nothing now (no-op until Plan 03
  // creates the first spec), but once files exist they will be bundled.
  outputFileTracingIncludes: {
    '/api/agent-forensics/audit': ['./src/lib/agent-specs/**/*.md'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
