import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://localhost:3001/:path*" }];
  }
};

export default nextConfig;
