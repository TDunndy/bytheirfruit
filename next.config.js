/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Rewrites: redirect old hash-based church URLs that arrive as path segments
  async rewrites() {
    return [
      // Keep /church/[id] and /church/[id]/[slug] as real routes (handled by app router)
    ];
  },
}

module.exports = nextConfig
