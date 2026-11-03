import { loadEnv } from "@/lib/env";
import { exportProxyPublication } from "@/lib/sources/proxy-publication";
loadEnv();
exportProxyPublication().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
