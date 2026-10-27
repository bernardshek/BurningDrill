import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@poker-trainer/pack-format"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
