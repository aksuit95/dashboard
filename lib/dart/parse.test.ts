import { describe, expect, it } from "vitest";
import { categorizeReport, parseDisclosure, passesMarketCapFilter, perFromEarnings } from "@/lib/dart/parse";

describe("DART 본문 파서", () => {
  it("잠정 실적에서 매출, 영업이익, 순이익을 읽는다", () => {
    const parsed = parseDisclosure("매출액: 328억\n영업익: 57억\n순이익: -126억");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.fields.revenue).toBe(328 * 1e8);
    expect(parsed.fields.operatingIncome).toBe(57 * 1e8);
    expect(parsed.fields.netIncome).toBe(-126 * 1e8);
  });

  it("공급계약 금액과 배당을 읽는다", () => {
    const contract = parseDisclosure("계약금액: 190억 (매출액대비 28.51%)");
    const dividend = parseDisclosure("1주당: 400원");
    expect(contract.ok && contract.fields.contractAmount).toBe(190 * 1e8);
    expect(dividend.ok && dividend.fields.dividendPerShare).toBe(400);
  });

  it("양식이 깨진 본문은 실패로 남긴다", () => {
    expect(parseDisclosure("오늘의 공시입니다. 숫자는 따로 없습니다.").ok).toBe(false);
    expect(parseDisclosure("   ").ok).toBe(false);
  });

  it("제목으로 분류하고 시총 1,000억 미만은 제외한다", () => {
    expect(categorizeReport("연결재무제표기준영업(잠정)실적(공정공시)")).toBe("earnings");
    expect(categorizeReport("단일판매ㆍ공급계약체결")).toBe("contract");
    expect(categorizeReport("현금ㆍ현물배당결정")).toBe("shareholder");
    expect(categorizeReport("기업설명회 개최")).toBe("other");
    expect(passesMarketCapFilter(null)).toBe("unknown");
    expect(passesMarketCapFilter(50_000_000_000)).toBe("exclude");
    expect(passesMarketCapFilter(150_000_000_000)).toBe("include");
    expect(perFromEarnings(1_000, 100)).toBe(10);
    expect(perFromEarnings(1_000, 0)).toBeNull();
  });
});
