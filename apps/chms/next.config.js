/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export served by Cloudflare Pages at app.bytheirfruit.church.
  // Authorization lives in Postgres (RLS); the browser talks to Supabase directly.
  output: 'export',
  // Shared check-in logic lives in packages/core as TypeScript source.
  transpilePackages: ['@btf/core'],
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false, dirs: ['src'] },
}

module.exports = nextConfig
