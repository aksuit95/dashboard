import { describe, expect, it } from "vitest";
import { summarizeMarketLiveStocks, type MarketLiveMember, type MarketLiveQuote } from "./market-live";

const asOf = "2026-11-20T10:00:00+09:00";
const cutoff = Date.parse(asOf) - 90_000;

describe("market live buy strength", () => {
  it("ranks the full rising universe by turnover relative to market cap before applying per-market limits", () => {
    const largeCaps = Array.from({ length: 13 }, (_, i) => String(i + 1).padStart(6, "0"));
    const lowTurnover = "000100";
    const kosdaq = "000200";
    const codes = [...largeCaps, lowTurnover, kosdaq];
    const members: MarketLiveMember[] = codes.map(code => ({
      code, name: code, sector: "반도체", market: code === kosdaq ? "KOSDAQ" : "KOSPI",
    }));
    const quotes = codes.map(code => ({ code, price: 110, asOf, turnover: code === lowTurnover ? 50 : 100 }));
    const closes = new Map(codes.map(code => [code, 100]));
    const caps = new Map(codes.map(code => [code, code === lowTurnover ? 1_000 : 10_000]));

    const board = summarizeMarketLiveStocks(members, quotes, closes, cutoff, "turnover", caps);

    expect(board.leaders.some(stock => stock.code === lowTurnover)).toBe(false);
    expect(board.buyStrengthLeaders?.[0]).toMatchObject({ code: lowTurnover, marketCap: 1_000, buyStrengthPct: 5 });
    expect(board.buyStrengthLeaders?.filter(stock => stock.market === "KOSPI")).toHaveLength(12);
    expect(board.buyStrengthLeaders?.filter(stock => stock.market === "KOSDAQ")).toHaveLength(1);
  });

  it("requires a fresh rising quote, positive turnover and a verified market cap", () => {
    const codes = ["000001", "000002", "000003", "000004", "000005", "000006"];
    const members: MarketLiveMember[] = codes.map(code => ({ code, name: code, market: "KOSPI", sector: "반도체" }));
    const quotes: MarketLiveQuote[] = [
      { code: codes[0], price: 110, turnover: 50, asOf },
      { code: codes[1], price: 99, turnover: 50, asOf },
      { code: codes[2], price: 110, turnover: 0, asOf },
      { code: codes[3], price: 110, turnover: 50, asOf: "2026-11-20T09:58:00+09:00" },
      { code: codes[4], price: 110, turnover: 50, asOf },
      { code: codes[5], price: 110, turnover: 50, asOf },
    ];
    const closes = new Map(codes.slice(0, -1).map(code => [code, 100]));
    const caps = new Map(codes.filter(code => code !== codes[4]).map(code => [code, 1_000]));

    expect(summarizeMarketLiveStocks(members, quotes, closes, cutoff, "turnover", caps).buyStrengthLeaders?.map(stock => stock.code))
      .toEqual([codes[0]]);
    expect(summarizeMarketLiveStocks(members, quotes, closes, cutoff, "change").buyStrengthLeaders).toBeUndefined();
  });
});
