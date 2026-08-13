import { linguiMacroSwcPlugin } from '@lingui/swc-plugin/options';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Next's development tools available without covering the collapsed
  // workspace rail controls anchored to the bottom-left corner.
  devIndicators: { position: 'bottom-right' },
  distDir: process.env.LODARIQ_NEXT_DIST_DIR ?? '.next',
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // Deployment CI and the Docker build both run TypeScript checks first. The
  // image build omits workspace declarations to avoid rebuilding them in a
  // memory-constrained builder, so do not repeat Next's type pass in that
  // explicitly scoped build profile. Normal builds still typecheck.
  typescript: {
    ignoreBuildErrors: process.env.LODARIQ_DEPLOYMENT_BUNDLE === 'true',
  },
  experimental: {
    swcPlugins: [linguiMacroSwcPlugin()],
  },
};

export default nextConfig;
