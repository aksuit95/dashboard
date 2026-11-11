import { loadEnv } from "@/lib/env";
import { collectEtf } from "@/lib/etf/publication";
loadEnv();
collectEtf().then(p => console.log(`ETF 수집 완료: ${p.snapshots.map(s => s.asOf).join(", ")}`)).catch(e => { console.error(e instanceof Error ? e.message : "ETF 수집 실패"); process.exitCode = 1; });
