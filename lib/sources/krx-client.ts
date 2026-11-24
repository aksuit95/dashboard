/** KRX's own authenticated statistics. Cookies and credentials stay server-side. */
import { readHttpsResponse } from "./https-response";

const ORIGIN = "https://data.krx.co.kr";
const LOGIN = `${ORIGIN}/contents/MDC/COMS/client/view/login.jsp?site=mdc`;
export class KrxClient {
  private cookies = new Map<string, string>();
  private pending?: Promise<void>;
  private authenticatedAt = 0;
  private failure?: { until: number; message: string };
  constructor(private fetchImpl: typeof fetch = fetch, private transport?: typeof readHttpsResponse) {}
  private request<T>(url: string, read: (response: Response) => T | Promise<T>, body?: Record<string, string>) {
    // Keep upstream response headers and bodies out of the values awaited by server components.
    const init: RequestInit = {
      method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(20_000),
      headers: { "user-agent": "Mozilla/5.0", referer: LOGIN, "X-Requested-With": "XMLHttpRequest",
        ...(this.cookies.size ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
        ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      }, body: body ? new URLSearchParams(body).toString() : undefined,
    };
    const consume = (response: Response) => {
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(";", 1)[0];
        const eq = pair.indexOf("=");
        if (eq > 0) this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
      if (!response.ok) throw new Error(`KRX 통계 HTTP ${response.status}`);
      return read(response);
    };
    return this.transport ? this.transport(url, init, consume) : this.fetchImpl(url, init).then(consume);
  }
  private async login() {
    if (this.failure && this.failure.until > Date.now()) throw new Error(this.failure.message);
    if (Date.now() - this.authenticatedAt < 25 * 60_000) return;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      if (!process.env.KRX_ID || !process.env.KRX_PW) throw new Error("KRX_ID / KRX_PW 환경변수 설정이 필요합니다.");
      this.cookies.clear();
      await this.request(LOGIN, () => undefined);
      const code = await this.request(`${ORIGIN}/contents/MDC/COMS/client/MDCCOMS001D1.cmd`, response => response.json().then(data => data._error_code as unknown), {
        mbrId: process.env.KRX_ID, pw: process.env.KRX_PW, skipDup: "Y",
      });
      if (code !== "CD001") throw new Error(`KRX 로그인 실패 (${String(code ?? "응답 형식 오류")})`);
      this.authenticatedAt = Date.now();
    })();
    try { await this.pending; this.failure = undefined; }
    catch (error) { this.failure = { until: Date.now() + 60_000, message: error instanceof Error ? error.message : "KRX 인증 실패" }; throw error; }
    finally { this.pending = undefined; }
  }
  async query(bld: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    return this.queryProjected(bld, params, data => data);
  }
  async queryProjected<T>(bld: string, params: Record<string, string>, project: (data: Record<string, unknown>) => T): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.login();
      const read = (response: Response) => response.text().then(raw => {
        if (raw.trim() === "LOGOUT") return { expired: true } as const;
        let data: Record<string, unknown>;
        try { data = JSON.parse(raw); } catch { throw new Error("KRX 통계 JSON 응답 오류"); }
        return { expired: false, value: project(data) } as const;
      });
      const result = await this.request(`${ORIGIN}/comm/bldAttendant/getJsonData.cmd`, read, {
        bld: bld.startsWith("dbms/") ? bld : `dbms/MDC/STAT/standard/${bld}`,
        locale: "ko_KR", money: "1", share: "1", csvxls_isNo: "false", ...params,
      });
      if (result.expired) { this.authenticatedAt = 0; continue; }
      return result.value;
    }
    throw new Error("KRX 로그인 세션 만료 · 재시도 필요");
  }
}
export const krxClient = new KrxClient(undefined, readHttpsResponse);
