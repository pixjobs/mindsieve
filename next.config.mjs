// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,

  // Minimal, compatible CSP for your UI (streaming, markdown, GSAP)
  async headers() {
    const csp = `
      default-src 'self';
      script-src 'self' 'unsafe-inline' 'unsafe-eval';
      style-src 'self' 'unsafe-inline';
      img-src 'self' blob: data:;
      font-src 'self';
      object-src 'none';
      base-uri 'self';
      form-action 'self';
      frame-ancestors 'none';
      upgrade-insecure-requests;
    `.replace(/\s{2,}/g, ' ').trim();

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },

  images: {
    // you’re not using next/image for external domains right now
    remotePatterns: [],
  },

  experimental: {
    // keep if you actually import from these libs in the app bundle;
    // it helps tree-shake and reduce client bundle size
    optimizePackageImports: ['lodash', 'date-fns'],

    /**
     * Critical for Cloud Run: prevents Next from trying to bundle
     * server-only Google/Elastic SDKs into the client.
     * (REST is fine; these stay server-side.)
     */
    serverExternalPackages: [
      'firebase-admin',
      '@google-cloud/secret-manager',
      '@elastic/elasticsearch',
      'google-auth-library',
    ],

    /**
     * ⬇️ You can DROP outputFileTracingIncludes now:
     * we’re not using @google-cloud/tasks client anymore,
     * so no special file tracing needed.
     */
    // outputFileTracingIncludes: {},
  },
};

export default nextConfig;
