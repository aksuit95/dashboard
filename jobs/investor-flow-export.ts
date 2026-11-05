import { getDb } from "@/lib/db/client";
import { loadEnv } from "@/lib/env";
import { exportInvestorPublication } from "@/lib/sources/investor-flow-publication";
import { collectInvestorDaily } from "@/lib/sources/investor-flow-daily";

loadEnv();
const recover = process.argv.includes("--recover-previous-session");
const collect: typeof collectInvestorDaily = (db, now, retry) => collectInvestorDaily(db, now, retry, recover);
exportInvestorPublication(getDb(), new Date(), undefined, collect, process.argv.includes("--retry-failed")).then(result => {
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}).catch(error => { console.error(error); process.exitCode = 1; });
