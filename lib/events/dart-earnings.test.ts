import { describe, expect, it } from "vitest";
import { parseEarningsNotice, parseEarningsIR, selectTopCompanies } from "./dart-earnings";
const row = (...cells:string[]) => `<TR>${cells.map(c=>`<TE>${c}</TE>`).join("")}</TR>`;
describe("DART earnings notices", () => {
  it("uses the amended notice body instead of old correction dates and leaves time unknown", () => {
    const xml = `<TABLE>${row("정정항목","정정전","정정후")}${row("결산실적 공시예정일","2026-07-28","2026-08-04")}${row("3. 결산실적 공시예정일","2026-08-04")}${row("4. 기타", "상기 결산실적 공시예정일은 변경될 수 있습니다") }</TABLE>`;
    expect(parseEarningsNotice(xml)).toEqual({date:"2026-08-04",time:null});
  });
  it("does not resurrect the previous date when a correction makes it unknown", () => {
    const xml = `<TABLE>${row("결산실적 공시예정일", "2026-07-28", "미정")}${row("3. 결산실적 공시예정일", "미정")}</TABLE>`;
    expect(parseEarningsNotice(xml)).toEqual({date:null,time:null});
  });
  it("does not invent a date from surrounding text when the cell is unknown", () => {
    expect(parseEarningsNotice(`<TABLE>${row("3. 결산실적 공시예정일","미정")}${row("4. 기타","2026-11-10")}</TABLE>`)).toEqual({date:null,time:null});
  });
  it("distinguishes an earnings IR time from the earnings release", () => {
    expect(parseEarningsIR("<p>1. 일시 및 장소 일시 2026-11-18 10:00 장소 온라인</p><p>3. 개최목적 3분기 경영실적 발표</p>")).toEqual({date:"2026-11-18",time:"10:00"});
    expect(parseEarningsIR("<p>기업 홍보 행사</p>")).toBeNull();
  });
  it("ranks only mapped KOSPI common companies by regular-close market cap", () => {
    const codes:Record<string,string>={};
    const rows=Array.from({length:31},(_,i)=>{const code=String(i+1).padStart(6,"0"); codes[code]=String(i+1).padStart(8,"0");return {ISU_SRT_CD:code,ISU_ABBRV:`기업${i}`,MKT_ID:"STK",MKTCAP:String((i+1)*100),TDD_CLSPRC:"100",LIST_SHRS:String(i+1)};});
    rows.push({ISU_SRT_CD:"999999",ISU_ABBRV:"우선주",MKT_ID:"STK",MKTCAP:"9999999",TDD_CLSPRC:"1",LIST_SHRS:"9999999"});
    const top=selectTopCompanies(rows,codes);
    expect(top).toHaveLength(30);expect(top[0].code).toBe("000031");expect(top.some(c=>c.code==="999999")).toBe(false);
  });
});
