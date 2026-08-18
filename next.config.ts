
import type {NextConfig} from 'next';
const isProd = process.env.NODE_ENV === 'production';
const nextConfig: NextConfig = {
  output: 'export',
  // El dev server y el build de producción usaban el MISMO `.next`: correr
  // `npm run gate` con la app levantada la mataba a mitad de sesión. Separados,
  // se puede verificar en el lienzo mientras el gate corre.
  distDir: isProd ? '.next' : '.next-dev',
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  trailingSlash: true,
};

export default nextConfig;
