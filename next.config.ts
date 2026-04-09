import type { NextConfig } from 'next'
import { getSecurityHeaders } from '@/lib/security-headers'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '**.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: '**.uploadthing.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: getSecurityHeaders(),
      },
    ]
  },
}

export default nextConfig
