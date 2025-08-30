/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't resolve 'canvas' module on the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
      };
    }
    return config;
  },
  experimental: {
    turbo: {
      root: __dirname
    }
  }
};

module.exports = nextConfig;