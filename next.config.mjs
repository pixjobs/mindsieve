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
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ];
  },

  // =========================================================================
  // IMAGE OPTIMIZATION & SECURITY
  // =========================================================================
  images: {
    /**
     * Whitelist of external domains that Next/Image is allowed to optimize.
     * Start with an empty list for maximum security. Add domains as needed.
     * For example, if you ever need to display images directly from arXiv papers.
     */
    remotePatterns: [
      // Example for allowing images from arXiv papers:
      // {
      //   protocol: 'https',
      //   hostname: 'arxiv.org',
      //   pathname: '/html/**/assets/**', // Be as specific as possible
      // },
    ],
  },

  // =========================================================================
  // BUNDLE OPTIMIZATIONS
  // =========================================================================
  experimental: {
    optimizePackageImports: ['lodash', 'date-fns'],

    /**
     * Excludes server-side-only Google Cloud SDKs from the client bundle.
     * This is correct for using Firestore, Cloud Tasks, etc., in API routes.
     * In Next.js 14, this must be inside the 'experimental' block.
     */
    serverExternalPackages: [
      "@google-cloud/firestore",
      "@google-cloud/tasks",
    ],
  },
};

export default nextConfig;