import { describe, expect, it } from "vitest";
import { parseHyperliquidLive } from "./hyperliquid-live";

describe("Hyperliquid live asset context", () => {
  it("maps mark price, volume, interest and hourly funding", () => {
    expect(parseHyperliquidLive({ channel: "activeAssetCtx", data: { coin: "xyz:SMSN", ctx: {
      markPx: "120", dayNtlVlm: "2300", openInterest: "40", funding: "-0.0001",
    } } }, ["xyz:SMSN"])).toEqual({ symbol: "xyz:SMSN", markUsd: 120, quoteVolumeUsd: 2300, openInterest: 40, fundingHourly: -0.0001 });
  });
  it("rejects malformed prices, other symbols and non-market messages", () => {
    expect(parseHyperliquidLive({ channel: "pong" }, ["xyz:SMSN"])).toBeNull();
    expect(parseHyperliquidLive({ channel: "activeAssetCtx", data: { coin: "BTC", ctx: { markPx: "5" } } }, ["xyz:SMSN"])).toBeNull();
    expect(parseHyperliquidLive({ channel: "activeAssetCtx", data: { coin: "xyz:SMSN", ctx: { markPx: "" } } }, ["xyz:SMSN"])).toBeNull();
  });
});
