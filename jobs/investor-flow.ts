import { getDb } from "@/lib/db/client";
import { loadEnv } from "@/lib/env";
import { collectInvestorDaily } from "@/lib/sources/investor-flow-daily";

loadEnv();
collectInvestorDaily(getDb()).then(result => {
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}).catch(error => { console.error(error); process.exitCode = 1; });
