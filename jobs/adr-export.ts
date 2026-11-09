import { exportAdr } from "@/lib/sources/adr-naver";
exportAdr({ backfill5y: process.argv.includes("--backfill-5y") }).then(data => console.log(`ADR 수집 완료 ${data.asOf}`)).catch(error => { console.error(error); process.exitCode = 1; });
