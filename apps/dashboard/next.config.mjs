/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Next's development tools available without covering the collapsed
  // workspace rail controls anchored to the bottom-left corner.
  devIndicators: { position: 'bottom-right' },
  distDir: process.env.LODARIQ_NEXT_DIST_DIR ?? '.next',
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
