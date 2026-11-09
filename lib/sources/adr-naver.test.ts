import { describe, expect, it } from "vitest";
import { calculateAdr, listStocksOnce, mergeAdrHistory } from "./adr-naver";
describe("네이버 ADR 계산", () => {
  it("20거래일 상승과 하락의 합을 사용하고 결측은 제외한다", () => {
    const dates = Array.from({length: 22}, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
    const rising = dates.map((date, i) => ({ date, close: 100 + i }));
    const falling = dates.map((date, i) => ({ date, close: 200 - i }));
    const missing = dates.map((date, i) => ({ date, close: i === 10 ? null : 100 + i }));
    const result = calculateAdr(dates, [rising, falling, missing]);
    expect(result[18].value).toBeNull();
    expect(result[19].value).toBe(190);
    expect(result[19]).toMatchObject({advancers: 2, decliners: 1});
  });
  it("겹치는 이력은 5년까지 누적하고 공백이 있으면 이전 이력을 합치지 않는다", () => {
    const day = (date:string) => ({date,advancers:1,decliners:1,unchanged:0,value:100});
    const old = [day("2020-01-01"),day("2022-01-01"),day("2025-01-01")];
    const updated = [day("2025-01-01"),day("2026-01-01")];
    expect(mergeAdrHistory(old,updated,"2026-01-01").map(x=>x.date)).toEqual(["2022-01-01","2025-01-01","2026-01-01"]);
    expect(mergeAdrHistory(old,[day("2026-01-01")],"2026-01-01").map(x=>x.date)).toEqual(["2026-01-01"]);
    expect(mergeAdrHistory(old,[{...day("2025-01-01"),value:null},day("2026-01-01")],"2026-01-01").find(x=>x.date === "2025-01-01")?.value).toBe(100);
  });
  it("시장 목록의 페이지 누락이나 중복을 허용하지 않는다", async () => {
    const response = (duplicate: boolean) => (async (input: RequestInfo | URL) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      const stocks = Array.from({length:100},(_,i) => ({stockEndType:"stock",itemCode:String(duplicate && page===4 && i===0 ? 1 : (page-1)*100+i+1).padStart(6,"0"),stockExchangeType:{name:"KOSPI"},tradableStatus:"tradable"}));
      return Response.json({stocks,totalCount:600});
    }) as typeof fetch;
    expect(await listStocksOnce("KOSPI",response(false))).toHaveLength(600);
    await expect(listStocksOnce("KOSPI",response(true))).rejects.toThrow("중복");
  });
});
