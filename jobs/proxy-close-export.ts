import { loadEnv } from "@/lib/env";
import { exportProxyPublication } from "@/lib/sources/proxy-publication";
loadEnv();
exportProxyPublication(undefined, undefined, undefined, { usOnly: process.argv.includes("--us-only") }).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
