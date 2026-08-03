// next.config.mjs (hoặc next.config.js với "type": "module" trong package.json)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(__dirname, '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monorepo package exports TypeScript source — must be compiled by Next.
  transpilePackages: ['@aiagents-hub/workflow-nodes'],
  // Include files outside workers/web (packages/workflow-nodes) in the OpenNext trace.
  outputFileTracingRoot: monorepoRoot,
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

    // Optional / RN peers that MetaMask / Coinbase SDKs import but this app never uses.
    // Use false so webpack treats them as non-existent instead of failing the build.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
      '@x402/core': false,
      '@x402/core/client': false,
      '@x402/evm': false,
      '@x402/evm/exact/client': false,
      '@x402/svm': false,
      '@x402/svm/exact/client': false,
      '@aiagents-hub/workflow-nodes': path.join(
        monorepoRoot,
        'packages/workflow-nodes/src/index.ts',
      ),
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
