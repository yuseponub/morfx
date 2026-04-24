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
  // agent-forensics-panel Plan 04: bundle agent spec markdown files into the
  // audit API route lambda. Next.js 15 does NOT bundle arbitrary fs-read
  // files by default — only `import`-ed modules. Without this include, the
  // audit route's `fs.readFile(src/lib/agent-specs/<id>.md)` fails in Vercel
  // lambdas with ENOENT.
  // Re-added in Plan 04 after Plan 01 rollback (see 01-SUMMARY.md Post-ship
  // Issue 1: Vercel rejects includes pointing to routes that don't yet
  // exist; the route is created in this same Plan 04 Task 3).
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
