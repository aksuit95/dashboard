import { crc32, inflateRawSync } from "node:zlib";
import { createInvestorKrxWebQuery } from "@/lib/sources/investor-flow-krx-web";
import { extractCorpXml, parseCorpCodes } from "@/lib/financials/source";
import { minerviniSession } from "@/lib/market/minervini-session";
import { addDays, seoulDate, type MarketEvent } from "./calendar";

export type EarningsCompany = { code: string; corpCode: string; name: string; marketCap: number; status: "예정" | "발표완료" | "확인되지 않음" | "공시 확인 필요"; note?: string; source?: string };
export type DartEarnings = { updatedAt: string | null; error: string | null; capAsOf: string | null; companies: EarningsCompany[]; events: MarketEvent[] };
export type Filing = { corp_code: string; report_nm: string; rcept_no: string; rcept_dt: string };
type Company = Omit<EarningsCompany, "status">;
const API = "https://opendart.fss.or.kr/api/";

/** ZIP members are read in memory, with bounded sizes and verified CRC. */
export function extractDocuments(zip: Buffer): string[] {
  if (zip.length > 20_000_000 || zip.length < 22) throw new Error("DART 원문 ZIP 크기 오류");
  let end = -1;
  for (let i=zip.length-22; i>=Math.max(0,zip.length-65557); i--) if (zip.readUInt32LE(i) === 0x06054b50) { end=i; break; }
  if (end < 0) throw new Error("DART 원문 ZIP 형식 오류");
  let offset=zip.readUInt32LE(end+16), total=0; const docs:string[]=[];
  for (let i=0; i<zip.readUInt16LE(end+10); i++) {
    if (offset+46>zip.length || zip.readUInt32LE(offset)!==0x02014b50) throw new Error("DART ZIP 디렉터리 오류");
    const nameLen=zip.readUInt16LE(offset+28), extra=zip.readUInt16LE(offset+30), comment=zip.readUInt16LE(offset+32);
    const name=zip.subarray(offset+46,offset+46+nameLen).toString("utf8");
    const method=zip.readUInt16LE(offset+10), packed=zip.readUInt32LE(offset+20), size=zip.readUInt32LE(offset+24), local=zip.readUInt32LE(offset+42), crc=zip.readUInt32LE(offset+16);
    if (/\.xml$/i.test(name)) {
      total+=size;
      if (total>30_000_000 || (zip.readUInt16LE(offset+8)&1) || local+30>zip.length || zip.readUInt32LE(local)!==0x04034b50) throw new Error("DART ZIP 항목 검증 오류");
      const start=local+30+zip.readUInt16LE(local+26)+zip.readUInt16LE(local+28);
      if (start+packed>zip.length) throw new Error("DART ZIP 범위 오류");
      const bytes=zip.subarray(start,start+packed);
      const output=method===0 ? bytes : method===8 ? inflateRawSync(bytes,{maxOutputLength:30_000_000}) : null;
      if (!output || output.length!==size || crc32(output)!==crc) throw new Error("DART ZIP 무결성 오류");
      const head=output.subarray(0,250).toString("ascii");
      docs.push(new TextDecoder(/encoding\s*=\s*["'](?:euc-kr|ks_c_5601-1987)/i.test(head) ? "euc-kr" : "utf-8").decode(output));
    }
    offset+=46+nameLen+extra+comment;
  }
  if (!docs.length) throw new Error("DART 공시 XML 없음");
  return docs;
}
function clean(text:string):string { return text.replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/g,"&").replace(/&#x([\da-f]+);/gi,(_,n:string)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n:string)=>String.fromCodePoint(Number(n))).replace(/\s+/g," ").trim(); }
function dateParts(value:string):string|null {
  const m=value.match(/\b(20\d{2})\s*[-.\/년]\s*(\d{1,2})\s*[-.\/월]\s*(\d{1,2})(?:\s*일)?/);
  if(!m)return null; const d=`${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  return Number.isFinite(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0,10)===d ? d : null;
}
export function parseEarningsNotice(xml:string): {date:string|null; time:string|null} {
  const rows=[...xml.matchAll(/<TR\b[^>]*>([\s\S]*?)<\/TR>/gi)];
  const candidates: (string | null)[]=[];
  for(const row of rows) {
    const cells=[...row[1].matchAll(/<(?:TD|TH|TE)\b[^>]*>([\s\S]*?)<\/(?:TD|TH|TE)>/gi)].map(m=>clean(m[1]));
    for(let i=0;i<cells.length;i++) {
      if(!/^(?:\d+\s*[.．]\s*)?(?:결산\s*실적\s*)?공시\s*예정\s*일(?:자)?\s*[:：]?$/.test(cells[i])) continue;
      const dates=[dateParts(cells[i]),...cells.slice(i+1).map(dateParts)].filter((d):d is string=>!!d);
      candidates.push(dates.at(-1) ?? null);
    }
  }
  // The final body row follows any correction table and contains the amended date.
  return {date:candidates.at(-1) ?? null,time:null};
}
export function parseEarningsIR(xml:string): {date:string|null;time:string|null} | null {
  const text=clean(xml); if(!/(분기|반기|연간|결산).{0,20}(실적|경영성과)|실적\s*발표/.test(text)) return null;
  const matches=[...text.matchAll(/(?:1\.\s*)?일시\s*(?:및\s*장소)?\s*일시/g)];
  const tail=matches.length ? text.slice(matches.at(-1)!.index! + matches.at(-1)![0].length, matches.at(-1)!.index!+130).split(/장소|참가\s*대상/)[0] : "";
  const date=dateParts(tail); const time=tail.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return {date,time:time ? `${time[1].padStart(2,"0")}:${time[2]}` : null};
}
export async function findLatestEarningsIR(filings:Filing[], read:(filing:Filing)=>Promise<string>, today:string):Promise<{filing:Filing; date:string; time:string|null}|null> {
  for(const filing of filings.filter(f=>/기업\s*설명회.*개최/.test(f.report_nm)).sort((a,b)=>b.rcept_no.localeCompare(a.rcept_no))) {
    const parsed=parseEarningsIR(await read(filing));
    if(!parsed) {
      if(/철회|취소/.test(filing.report_nm)) throw new Error("설명회 취소 공시 확인 필요");
      continue;
    }
    // The newest earnings-related IR supersedes older ones. Never revive a
    // superseded original after a correction or unparseable amendment.
    if(!parsed.date) throw new Error("실적 설명회 일시 확인 필요");
    if(parsed.date<today)return null;
    return {filing,date:parsed.date,time:parsed.time};
  }
  return null;
}
export function selectTopCompanies(rows:Record<string,unknown>[], codes:Record<string,string>): Company[] {
  const list:Company[]=[];
  for(const row of rows) {
    const code=String(row.ISU_SRT_CD ?? ""), corpCode=codes[code], name=String(row.ISU_ABBRV ?? row.ISU_NM ?? "").trim();
    const marketCap=Number(String(row.MKTCAP ?? "").replaceAll(",","")), close=Number(String(row.TDD_CLSPRC ?? "").replaceAll(",","")), shares=Number(String(row.LIST_SHRS ?? "").replaceAll(",",""));
    if(row.MKT_ID!=="STK" || !corpCode || !name)continue;
    if(!Number.isSafeInteger(marketCap)||!Number.isSafeInteger(close)||!Number.isSafeInteger(shares)||marketCap<=0||close<=0||close*shares!==marketCap)throw new Error("KRX 시총·종가 검증 실패");
    list.push({code,corpCode,name,marketCap});
  }
  list.sort((a,b)=>b.marketCap-a.marketCap || a.code.localeCompare(b.code));
  if(list.length<30 || new Set(list.slice(0,30).map(c=>c.corpCode)).size!==30) throw new Error("코스피 상위 30개 기업 확인 실패");
  return list.slice(0,30);
}
async function dartFetch(endpoint:string, params:Record<string,string>, key:string):Promise<Response> {
  let response:Response|undefined;
  for(let i=0;i<3;i++) {
    try { response=await fetch(`${API}${endpoint}?${new URLSearchParams({...params,crtfc_key:key})}`,{signal:AbortSignal.timeout(25000)}); if(response.ok || (response.status!==429 && response.status<500))break; }
    catch { if(i===2)throw new Error("DART 네트워크 연결 실패"); }
    await new Promise(r=>setTimeout(r,400*(i+1)));
  }
  if(!response?.ok)throw new Error(`DART HTTP ${response?.status ?? "실패"}`); return response;
}
async function listFilings(c:Company, today:string,key:string):Promise<Filing[]> {
  const result:Filing[]=[];
  for(let page=1;page<=20;page++) {
    const response=await dartFetch("list.json",{corp_code:c.corpCode,bgn_de:addDays(today,-150).replaceAll("-",""),end_de:today.replaceAll("-",""),pblntf_ty:"I",page_count:"100",page_no:String(page),last_reprt_at:"N"},key);
    const body=await response.json() as {status?:string;total_page?:number;list?:Filing[]};
    if(body.status==="013")return result;
    if(body.status!=="000" || !Array.isArray(body.list) || !Number.isInteger(body.total_page) || body.total_page!>20)throw new Error(`DART 목록 오류 (${body.status ?? "형식"})`);
    if(body.list.some(x=>x.corp_code!==c.corpCode || !/^\d{14}$/.test(x.rcept_no) || !/^\d{8}$/.test(x.rcept_dt)))throw new Error("DART 공시 식별자 오류");
    result.push(...body.list); if(page>=body.total_page!)return result;
  }
  throw new Error("DART 공시 페이지 초과");
}
async function document(f:Filing,key:string):Promise<string> {
  const response=await dartFetch("document.xml",{rcept_no:f.rcept_no},key);
  const data=Buffer.from(await response.arrayBuffer());
  return extractDocuments(data).join("\n");
}
export async function collectDartEarnings(now=new Date(), key=process.env.DART_API_KEY?.trim()):Promise<DartEarnings> {
  if(!key)throw new Error("DART_API_KEY 설정 필요");
  const asOf=minerviniSession(now), today=seoulDate(now);
  const corpResponse=await dartFetch("corpCode.xml",{},key);
  const codes=parseCorpCodes(extractCorpXml(Buffer.from(await corpResponse.arrayBuffer())));
  const payload=await createInvestorKrxWebQuery()("MDCSTAT01501",{trdDd:asOf.replaceAll("-",""),mktId:"STK"});
  if(!Array.isArray(payload.OutBlock_1))throw new Error("KRX 코스피 시총 누락");
  const top=selectTopCompanies(payload.OutBlock_1 as Record<string,unknown>[],codes);
  const companies:EarningsCompany[]=[], events:MarketEvent[]=[];
  for(const company of top) {
    const filings=await listFilings(company,today,key);
    const ordered=filings.sort((a,b)=>b.rcept_no.localeCompare(a.rcept_no));
    const result=ordered.find(f=>/영업\s*\(?잠정\)?\s*실적|매출액\s*또는\s*손익구조/.test(f.report_nm.replaceAll(" ","")));
    const notice=ordered.find(f=>/결산\s*실적\s*공시\s*예고/.test(f.report_nm));
    let state:EarningsCompany["status"]="확인되지 않음", note:string|undefined;
    if(notice && /철회|취소/.test(notice.report_nm)) {state="공시 확인 필요";note="철회·취소 공시 확인 필요";}
    else if(notice) {
      try {
        const parsed=parseEarningsNotice(await document(notice,key));
        if(!parsed.date){state="공시 확인 필요";note="공시 예정일을 확인하지 못했습니다.";}
        else if(result && result.rcept_no>notice.rcept_no && result.rcept_dt>=parsed.date.replaceAll("-","") && parsed.date<=today){state="발표완료";}
        else if(parsed.date<today){state="공시 확인 필요";note="예정일이 지났으나 발표 여부 확인 필요";}
        else {state="예정";events.push({id:`dart-${company.code}-notice`,date:parsed.date,time:parsed.time,country:"KR",category:"실적",title:`${company.name} 실적 공시 예정`,detail:`${/정정/.test(notice.report_nm)?"정정 공시 반영 · ":""}DART 접수 ${notice.rcept_dt.slice(0,4)}-${notice.rcept_dt.slice(4,6)}-${notice.rcept_dt.slice(6,8)} · 공시 예정일`,source:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${notice.rcept_no}`,sourceName:"DART"});}
      } catch {state="공시 확인 필요";note="공시 원문을 읽지 못했습니다.";}
    } else if(result && result.rcept_dt>=addDays(today,-45).replaceAll("-","")) {
      // A recent actual release without a newer notice is already published.
      state="발표완료";
    }
    try {
      const ir=await findLatestEarningsIR(ordered, filing=>document(filing,key), today);
      if(ir) {
        events.push({id:`dart-${company.code}-ir`,date:ir.date,time:ir.time,country:"KR",category:"실적",title:`${company.name} 실적 설명회`,detail:`${/정정/.test(ir.filing.report_nm)?"정정 공시 반영 · ":""}실적 공시 시각과 다를 수 있음`,source:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${ir.filing.rcept_no}`,sourceName:"DART"});
        if(state==="확인되지 않음" || state==="발표완료")state="예정";
      }
    } catch { if(state!=="예정"){state="공시 확인 필요";note="설명회 원문 또는 일정 확인 필요";} }
    companies.push({...company,status:state,...(note?{note}:{}),...(notice?{source:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${notice.rcept_no}`}:{})});
  }
  return {updatedAt:now.toISOString(),error:null,capAsOf:asOf,companies,events};
}


