import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  outputFileTracingIncludes: { "/api/investor-flow/pension": ["./data/pension/board.json"], "/risk": ["./public/data/market-indicators-live/*.json"], "/adr": ["./data/adr/board.json"], "/events": ["./data/events/board.json"], "/api/proxy/adr-premium": ["./data/proxy-close/board.json"], "/api/proxy/samsung-preferred": ["./data/proxy-close/board.json"], "/api/minervini": ["./data/minervini/board.json"], "/api/valuation/sectors": ["./data/sectors/board.json"], "/api/valuation/us-sectors": ["./data/us-sectors/board.json"],
    "/api/investor-flow": ["./data/investor-flow/board.json"],
    "/api/investor-flow/toss": ["./data/investor-flow/board.json"],
    "/api/financials": ["./data/financials/board.json", "./data/valuation/market-caps.json"],
    "/api/financials/[code]": ["./data/financials/board.json"],
    "/api/valuation/stocks/market-caps": ["./data/valuation/market-caps.json"] },
};

export default function config(phase: string): NextConfig {
  return {
    ...nextConfig,
    // Keep development servers from overwriting production build assets.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
}


