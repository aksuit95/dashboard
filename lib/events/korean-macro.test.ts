import { describe, expect, it } from "vitest";
import { matchConsensus, parseOfficialResult, parseStatsSchedule } from "./korean-macro";
import { parseMyfxbookConsensus, type KoreanConsensusQuote } from "./korean-consensus";

const board = (text: string) => `<div class="board_content">${text}</div>`;

describe("Korean macro releases", () => {
  it("keeps the published KST date and time and ignores local statistics and stale year rows", () => {
    const html = `<select name="oa_mm"></select><table>
      <tr><td>12.02.( 수 )</td><td>08:00</td><td>2026년 11월 소비자물가동향</td></tr>
      <tr><td>12.02.( 수 )</td><td>08:00</td><td>2026년 11월 서울 소비자물가동향</td></tr>
      <tr><td>12.02.( 수 )</td><td>08:00</td><td>2025년 11월 소비자물가동향</td></tr>
    </table>`;
    expect(parseStatsSchedule(html, "2026-12", "krCpi", "https://www.kostat.go.kr")).toEqual([
      { date: "2026-12-02", time: "08:00", period: "2026-11", source: "https://www.kostat.go.kr" },
    ]);
  });

  it("uses the named series, comparison and direction from official releases", () => {
    expect(parseOfficialResult("krCpi", board("소비자물가지수는 전월대비 0.2%, 전년동월대비 2.8% 각각 상승"))?.actual).toBe("2.8%");
    expect(parseOfficialResult("krJobs", board("실업률은 2.0%로 하락. 계절조정 실업률은 2.5%로 전월대비 0.1%p 하락"))?.actual).toBe("2.5%");
    expect(parseOfficialResult("krIndustry", board("전산업생산은 광공업(9.0%) 등에서 생산이 줄어 전월대비 1.3% 감소"))?.actual).toBe("-1.3%");
    expect(parseOfficialResult("krGdp", "실질 국내총생산(GDP)은 전기대비 1.0% 성장, 전년동기대비 3.4% 성장")?.actual).toBe("1.0%");
    expect(parseOfficialResult("krRate", "한국은행 기준금리를 현재의 3.00% 수준에서 3.25%로 상향 조정")).toEqual({ actual:"3.25%", previous:"3.00%" });
    expect(parseOfficialResult("krRate", "한국은행 기준금리를 현재의 3.00% 수준에서 유지")).toEqual({ actual:"3.00%", previous:"3.00%" });
    expect(parseOfficialResult("krRate", "한국은행 기준금리를 현 수준(2.50%)에서 유지")).toEqual({ actual:"2.50%", previous:"2.50%" });
    expect(parseOfficialResult("krExports", "수출 <b>1,153</b>억 달러, 수입 728억 달러로 전년동기대비 수출 93.7%(557.6억 달러↑) 증가")?.actual).toBe("93.7%");
  });

  it("uses only an unambiguous consensus for the same series, reference period and Korean release date", () => {
    const release = { date:"2026-12-02", time:"08:00", period:"2026-11", source:"https://www.kostat.go.kr" };
    const quote: KoreanConsensusQuote = { indicator:"krCpi", date:"2026-12-02", time:"08:00", period:"2026-11", value:"2.8%" };
    expect(matchConsensus("krCpi", release, [quote])?.value).toBe("2.8%");
    expect(matchConsensus("krCpi", release, [quote, quote])).toBeUndefined();
    expect(matchConsensus("krCpi", release, [{...quote, period:"2026-10"}])).toBeUndefined();
    expect(matchConsensus("krCpi", release, [{...quote, time:"09:00"}])).toBeUndefined();
    expect(matchConsensus("krCpi", release, [{...quote, indicator:"krJobs"}])).toBeUndefined();
  });

  it("reads the widget's consensus column and converts UTC and reference periods across year boundaries", () => {
    const row = (title: string, timestamp: string, value: string, currency="KRW") => `
      <div data-calendar-row="1">
        <div data-time-left="${Date.parse(timestamp)}">2 days</div>
        <div class="calendar-title">${title}</div>
        <div class="calendar-results"><div>Act: 2.7%</div><div>Cons: ${value}</div><div>Prev: 2.8%</div></div>
        <div class="calendar-country">${currency}</div>
      </div><div data-event-description></div>`;
    const html = '<div id="calendarMobile">' + [
      row("Inflation Rate YoY (Dec)", "2026-12-31T23:00:00Z", "3%"),
      row("GDP Growth Rate QoQ (Q4)", "2027-01-27T23:00:00Z", "-0.1%"),
      row("Inflation Rate MoM (Dec)", "2026-12-31T23:00:00Z", "0%"),
      row("Industrial Production MoM (Dec)", "2027-01-27T23:00:00Z", "-4%"),
      row("Inflation Rate YoY (Dec)", "2026-12-31T23:00:00Z", "4%", "EUR"),
      row("Unemployment Rate (Dec)", "2027-01-12T23:00:00Z", ""),
    ].join("") + "</div>";
    expect(parseMyfxbookConsensus(html)).toEqual([
      { indicator:"krCpi", date:"2027-01-01", time:"08:00", period:"2026-12", value:"3%" },
      { indicator:"krGdp", date:"2027-01-28", time:"08:00", period:"2026-Q4", value:"-0.1%" },
    ]);
    expect(() => parseMyfxbookConsensus("<title>Service unavailable</title>")).toThrow("형식 변경");
  });
});
