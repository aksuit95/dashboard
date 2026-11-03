import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  outputFileTracingIncludes: { "/api/valuation/sectors": ["./data/sectors/board.json"],
    "/api/investor-flow": ["./data/investor-flow/board.json"],
    "/api/investor-flow/toss": ["./data/investor-flow/board.json"] },
};

export default function config(phase: string): NextConfig {
  return {
    ...nextConfig,
    // Keep development servers from overwriting production build assets.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
}
