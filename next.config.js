/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/apps/alpha_tube',
  assetPrefix: '/apps/alpha_tube',
  experimental: {
    serverActions: { bodySizeLimit: '5gb' },
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
