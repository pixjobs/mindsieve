// next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  // =========================================================================
  // CORE & DEPLOYMENT CONFIGURATION
  // =========================================================================
  output: 'standalone',
  reactStrictMode: true,
  productionBrowserSourceMaps: false,

  // =========================================================================
  // SECURITY HEADERS
  // =========================================================================
  async headers() {
    const cspHeader = `
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
          { key: 'Content-Security-Policy', value: cspHeader },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },

  // =========================================================================
  // IMAGE OPTIMIZATION & SECURITY
  // =========================================================================
  images: {
    remotePatterns: [
      // Whitelist external domains for Next/Image here if needed.
    ],
  },

  // =========================================================================
  // BUNDLE OPTIMIZATIONS
  // =========================================================================
  experimental: {
    optimizePackageImports: ['lodash', 'date-fns'],

    /**
     * ✅ CRITICAL FIX:
     * Forces Next.js's file tracer to include files that it often misses
     * due to dynamic imports in Google Cloud libraries. This prevents
     * "Cannot find module" errors at runtime in the container.
     */
    outputFileTracingIncludes: {
      // For the Cloud Tasks client used in the card enqueue route
      '/api/cards/enqueue': [
        './node_modules/@google-cloud/tasks/build/esm/src/v2/**/*',
      ],
      // For the Firestore client (via firebase-admin) used in sessions and turns
      '/api/sessions': ['./node_modules/google-gax/build/src/**/*'],
      '/api/turns': ['./node_modules/google-gax/build/src/**/*'],
    },

    /**
     * Excludes server-side-only Google Cloud SDKs from the client bundle.
     * This is correct for using Firestore, Cloud Tasks, etc., in API routes.
     */
    serverExternalPackages: [
      "@google-cloud/firestore",
      "@google-cloud/tasks",
    ],
  },
};

export default nextConfig;