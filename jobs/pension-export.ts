import { loadEnv } from "@/lib/env";
import { exportPension } from "@/lib/pension/source";
loadEnv();
exportPension().then(result => console.log(JSON.stringify({ month: result.month, count: result.rows.length, collectedAt: result.collectedAt, detailPending: result.rows.filter(r => r.detailPending).length }))).catch(error => { console.error(error.message); process.exitCode = 1; });
