import { describe, expect, it } from "vitest";
import { parseKrxFundMetrics } from "./fund-metrics";
const fetchedAt = "2026-11-11T04:00:00Z";
describe("KRX ETF daily metrics", () => {
  it("uses the exact KRX date and raw shares and net assets", () => {
    const data = parseKrxFundMetrics({output:[{TRD_DD:"2026/11/10",LIST_SHRS:"261,450,000",INVSTASST_NETASST_TOTAMT:"6,940,051,336,601",NAV:"26,539.39",MKTCAP:"6,916,659,750,000"}]}, fetchedAt);
    expect(data.get("2026-11-10")).toEqual({asOf:"2026-11-10", sharesOutstanding:261450000, netAssetsKrw:6940051336601, source:"KRX_ETF_DAILY", fetchedAt});
  });
  it("does not replace missing values with market cap or NAV and rejects duplicate dates", () => {
    const row={TRD_DD:"2026/11/10",LIST_SHRS:"-",INVSTASST_NETASST_TOTAMT:"0",NAV:"400",MKTCAP:"1000"};
    expect(parseKrxFundMetrics({output:[row]},fetchedAt).get("2026-11-10")).toMatchObject({sharesOutstanding:null,netAssetsKrw:null});
    expect(() => parseKrxFundMetrics({output:[row,row]},fetchedAt)).toThrow();
    expect(() => parseKrxFundMetrics({output:[]},fetchedAt)).toThrow();
  });
});
