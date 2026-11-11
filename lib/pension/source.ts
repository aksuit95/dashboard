import fs from "node:fs/promises";
import path from "node:path";

type Filing = { corp_code: string; corp_name: string; stock_code: string; report_nm: string; rcept_no: string; rcept_dt: string; flr_nm: string; rm?: string };
export type PensionRow = { id: string; company: string; code: string; filedAt: string; type: "major" | "executive"; report: string; corrected: boolean; holding: number | null; changeRate: number | null; changeShares: number | null; reason: string | null; detailPending: boolean };
export type PensionPublication = { version: 1; month: string; collectedAt: string; rows: PensionRow[] };
export const pensionFile = path.join(process.cwd(), "data", "pension", "board.json");

export function numeric(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).replaceAll(",", "").trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return null;
  const num = Number(text); return Number.isFinite(num) ? num : null;
}
const iso = (date: string) => `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
export function pensionRow(filing: Filing, type: PensionRow["type"], details: Record<string, unknown>[]): PensionRow {
  if (!/^\d{14}$/.test(filing.rcept_no) || !/^\d{8}$/.test(filing.rcept_dt) || !/^\d{8}$/.test(filing.corp_code) || !filing.corp_name) throw new Error("DART 공시 식별자 오류");
  const rows = details.filter(row => row.rcept_no === filing.rcept_no && String(row.repror).replaceAll(" ", "") === "국민연금공단");
  if (rows.length > 1) throw new Error("DART 동일 공시 보고자 중복");
  const d = rows[0];
  return { id: filing.rcept_no, company: filing.corp_name, code: filing.stock_code ?? "", filedAt: iso(filing.rcept_dt), type,
    report: filing.report_nm, corrected: /정정/.test(filing.report_nm), holding: numeric(d?.[type === "major" ? "stkrt" : "sp_stock_lmp_rate"]),
    changeRate: numeric(d?.[type === "major" ? "stkrt_irds" : "sp_stock_lmp_irds_rate"]), changeShares: numeric(d?.[type === "major" ? "stkqy_irds" : "sp_stock_lmp_irds_cnt"]),
    reason: typeof d?.report_resn === "string" ? d.report_resn : typeof d?.isu_main_shrholdr === "string" ? d.isu_main_shrholdr : null, detailPending: !d };
}
async function request(endpoint: string, params: Record<string, string>, key: string, fetcher: typeof fetch) {
  let response: Response;
  try { response = await fetcher(`https://opendart.fss.or.kr/api/${endpoint}?${new URLSearchParams({ crtfc_key: key, ...params })}`, { cache: "no-store", signal: AbortSignal.timeout(25000) }); }
  catch { throw new Error("DART 네트워크 연결 실패"); }
  if (!response.ok) throw new Error(`DART HTTP ${response.status}`);
  const result = await response.json() as { status?: string; list?: Record<string, unknown>[]; total_page?: number };
  if (result.status !== "000" && result.status !== "013") throw new Error(`DART API 상태 ${result.status ?? "형식 오류"}`);
  return result;
}
export async function collectPension(month: string, now = new Date(), fetcher: typeof fetch = fetch, key = process.env.DART_API_KEY?.trim()): Promise<PensionPublication> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("조회 월 오류");
  if (!key) throw new Error("DART_API_KEY 설정이 필요합니다.");
  const start = `${month.replace("-", "")}01`, last = new Date(Date.UTC(+month.slice(0,4), +month.slice(5,7), 0)).toISOString().slice(0,10).replaceAll("-", "");
  const seoulToday = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0,10).replaceAll("-", "");
  const end = last < seoulToday ? last : seoulToday;
  if (end < start) throw new Error("미래 공시는 조회할 수 없습니다.");
  const rows: PensionRow[] = [];
  for (const [type, detail] of [["major", "D001"], ["executive", "D002"]] as const) {
    const filings: Filing[] = [];
    for (let page = 1; page <= 100; page++) {
      const result = await request("list.json", { bgn_de: start, end_de: end, pblntf_detail_ty: detail, page_count: "100", page_no: String(page), last_reprt_at: "N" }, key, fetcher);
      if (result.status === "013") break;
      if (!Array.isArray(result.list) || !Number.isInteger(result.total_page) || result.total_page! > 100) throw new Error("DART 공시 목록 페이지 오류");
      filings.push(...(result.list as Filing[]).filter(f => f.flr_nm?.replaceAll(" ", "") === "국민연금공단"));
      if (page >= result.total_page!) break;
    }
    const cache = new Map<string, Record<string, unknown>[]>();
    for (const filing of filings) {
      if (!cache.has(filing.corp_code)) {
        const detailData = await request(type === "major" ? "majorstock.json" : "elestock.json", { corp_code: filing.corp_code }, key, fetcher);
        cache.set(filing.corp_code, detailData.list ?? []);
      }
      rows.push(pensionRow(filing, type, cache.get(filing.corp_code)!));
    }
  }
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("DART 접수번호 중복");
  rows.sort((a,b) => b.id.localeCompare(a.id));
  return { version: 1, month, collectedAt: now.toISOString(), rows };
}
export async function readPension(file = pensionFile): Promise<PensionPublication | null> {
  try { const value = JSON.parse(await fs.readFile(file,"utf8")) as PensionPublication; if (value.version !== 1 || !/^\d{4}-\d{2}$/.test(value.month) || !Array.isArray(value.rows)) throw new Error("국민연금 공시 저장 형식 오류"); return value; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
export async function exportPension(now = new Date(), file = pensionFile) {
  const month = new Date(now.getTime()+9*3600000).toISOString().slice(0,7);
  const result = await collectPension(month, now);
  const previous = await readPension(file);
  if (previous?.month === result.month && JSON.stringify(previous.rows) === JSON.stringify(result.rows)) return previous;
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  try { await fs.writeFile(temp, JSON.stringify(result)+"\n", { flag: "wx" }); await fs.rename(temp,file); }
  finally { await fs.unlink(temp).catch(() => undefined); }
  return result;
}
