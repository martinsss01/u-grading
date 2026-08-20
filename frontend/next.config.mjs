/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    qualities: [75, 100],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
