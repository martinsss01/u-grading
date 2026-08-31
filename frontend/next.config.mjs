// When testing through a tunnel (see docker-compose.yml's NEXT_PUBLIC_APP_URL),
// the phone's requests to dev-only endpoints (HMR websocket included) come
// from that tunnel's origin, which Next's dev server blocks by default —
// this allow-lists it. Harmless/no-op when the env var is unset.
const tunnelHost = process.env.NEXT_PUBLIC_APP_URL
  ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
  : undefined;

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(tunnelHost ? { allowedDevOrigins: [tunnelHost] } : {}),
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
