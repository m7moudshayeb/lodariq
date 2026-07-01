/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.LODARIQ_NEXT_DIST_DIR ?? '.next',
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
