/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/apps/video',
  assetPrefix: '/apps/video',
  experimental: {
    serverActions: { bodySizeLimit: '5gb' },
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
