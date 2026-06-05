import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@bazarhq/shared'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
};

export default nextConfig;
