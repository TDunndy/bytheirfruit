/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Type and lint errors fail the build. The two legacy components still opt
  // out of type checking with `// @ts-nocheck`; everything new is strict.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false, dirs: ['src'] },
}

module.exports = nextConfig
