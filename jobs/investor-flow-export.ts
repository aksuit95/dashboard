import { getDb } from "@/lib/db/client";
import { loadEnv } from "@/lib/env";
import { exportInvestorPublication } from "@/lib/sources/investor-flow-publication";

loadEnv();
exportInvestorPublication(getDb(), new Date(), undefined, undefined, process.argv.includes("--retry-failed")).then(result => {
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}).catch(error => { console.error(error); process.exitCode = 1; });
