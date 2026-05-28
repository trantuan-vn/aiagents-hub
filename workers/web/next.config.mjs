// next.config.mjs (hoặc next.config.js với "type": "module" trong package.json)
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // compiler: {
  //   removeConsole: process.env.NODE_ENV === "production",
  // },
  async redirects() {
    return [
      {
        source: '/dashboard',
        destination: '/dashboard/control/overview',
        permanent: false,
      },
    ];
  },
  // Webpack configuration với cú pháp hiện đại
  webpack: (config, { isServer }) => {
    // Thêm các externals cần thiết
    config.externals.push(
      'pino-pretty',
      'lokijs', 
      'encoding'
    );

    // Tối ưu hóa cho server/client bundle
    if (!isServer) {
      // Client-side optimizations
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    // Handle React Native modules that MetaMask SDK tries to import
    // Use false to ignore the module (webpack will treat it as non-existent)
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
    };

    return config;
  },

  // Experimental features for Next.js 15
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      '@heroicons/react/24/outline',
    ],
  },

  // Logging configuration
  logging: {
    fetches: {
      fullUrl: true,
    },
  },  
}

export default withNextIntl(nextConfig);
