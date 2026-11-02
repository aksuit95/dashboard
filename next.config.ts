import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
};

export default function config(phase: string): NextConfig {
  return {
    ...nextConfig,
    // Keep development servers from overwriting production build assets.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
}
