/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Головна сторінка статичного сайту обслуговується на корені "/"
      // без зміни адреси. Дизайн сайту не змінюється.
      { source: '/', destination: '/index.html' },
    ];
  },
};

module.exports = nextConfig;
