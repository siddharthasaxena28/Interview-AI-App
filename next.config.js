/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // pdf-parse reads test fixtures at module load when bundled by webpack;
      // aliasing canvas to false stops that without affecting PDF text extraction.
      config.resolve.alias.canvas = false
    }
    return config
  },
}

module.exports = nextConfig
