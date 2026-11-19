import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  outputFileTracingIncludes: { "/etf-holdings": ["./data/etf/holdings.json"], "/api/investor-flow/pension": ["./data/pension/board.json"], "/risk": ["./public/data/market-indicators-live/*.json"], "/adr": ["./data/adr/board.json"], "/events": ["./data/events/board.json"], "/api/proxy/adr-premium": ["./data/proxy-close/board.json"], "/api/proxy/samsung-preferred": ["./data/proxy-close/board.json"], "/api/minervini": ["./data/minervini/board.json"], "/api/valuation/us-sectors": ["./data/us-sectors/board.json"],
    "/api/briefing": ["./public/data/market-indicators-live/kospi*.json", "./public/data/market-indicators-live/kosdaq*.json", "./data/sectors/board.json", "./data/investor-flow/board.json"],
    "/api/briefing/automatic": ["./public/data/briefing-archive/*.json"],
    "/api/briefing/automatic/pdf": ["./public/data/briefing-archive/*.json"],
    "/api/market-live": ["./data/sectors/board.json", "./data/valuation/market-caps.json", "./public/data/market-indicators-live/kospi*.json", "./public/data/market-indicators-live/kosdaq*.json"],
    "/api/market-live/archive": ["./data/sectors/board.json", "./data/market-live-publication/*.json"],
    "/api/rising": ["./data/sectors/board.json", "./data/sectors/market-caps.json"],
    "/api/valuation/sectors": ["./data/sectors/board.json", "./data/sectors/index-daily.json", "./data/sectors/market-caps.json"],
    "/api/investor-flow": ["./data/investor-flow/board.json"],
    "/api/investor-flow/toss": ["./data/investor-flow/board.json"],
    "/api/stock-returns": ["./data/stock-returns/board.json"],
    "/api/investment-risk": ["./data/valuation/market-caps.json"],
    "/api/investment-risk/outlook": ["./data/investment-risk/closes.json", "./data/financials/board.json", "./data/financials/kosdaq150.json"],
    "/api/financials": ["./data/financials/board.json", "./data/financials/kosdaq150.json", "./data/valuation/market-caps.json"],
    "/api/financials/[code]": ["./data/financials/board.json", "./data/financials/kosdaq150.json"],
    "/api/valuation/stocks/market-caps": ["./data/valuation/market-caps.json"] },
};

export default function config(phase: string): NextConfig {
  return {
    ...nextConfig,
    // Keep development servers from overwriting production build assets.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    ...(phase === PHASE_DEVELOPMENT_SERVER && {
      // Keep recently visited dashboard chunks available to open tabs.
      onDemandEntries: { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 12 },
    }),
  };
}
