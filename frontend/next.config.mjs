/** @type {import('next').NextConfig} */
const nextConfig = {
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
