import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreSrc = path.resolve(__dirname, "../src");

const nextConfig: NextConfig = {
  distDir: process.env.SMARTVIBE_BUILD_DIR || ".next",
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@smartvibe": coreSrc,
    };
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
