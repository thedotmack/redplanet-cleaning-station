import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  transpilePackages: ["tripoli"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      tripoli: path.resolve(__dirname, ".."),
    };
    return config;
  },
};

export default nextConfig;
