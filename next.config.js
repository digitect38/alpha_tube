/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/apps/video_stream',
  assetPrefix: '/apps/video_stream',
  experimental: {
    serverActions: { bodySizeLimit: '5gb' },
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
