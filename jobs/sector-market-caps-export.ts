import { loadEnv } from "@/lib/env";
import { collectSectorCaps } from "@/lib/sources/sector-market-caps";
loadEnv();
collectSectorCaps().catch(error => { console.error(error instanceof Error ? error.message : "KRX 시총 수집 실패"); process.exitCode = 1; });
