import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  outputFileTracingIncludes: { "/api/proxy/adr-premium": ["./data/proxy-close/board.json"], "/api/proxy/samsung-preferred": ["./data/proxy-close/board.json"], "/api/minervini": ["./data/minervini/board.json"], "/api/valuation/sectors": ["./data/sectors/board.json"],
    "/api/investor-flow": ["./data/investor-flow/board.json"],
    "/api/investor-flow/toss": ["./data/investor-flow/board.json"],
    "/api/financials": ["./data/financials/board.json"] },
};

export default function config(phase: string): NextConfig {
  return {
    ...nextConfig,
    // Keep development servers from overwriting production build assets.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
}
