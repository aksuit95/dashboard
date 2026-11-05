import fs from "node:fs";
import { collectFinancials, enrichFinancialAccounts, reclassifySavedFinancials } from "@/lib/financials/source";
for (const name of [".env.local", ".env"]) if (fs.existsSync(name)) process.loadEnvFile(name);
const codesArg = process.argv.find(a => a.startsWith("--codes="));
const codes = codesArg?.slice(8).split(",");
const limitArg = process.argv.find(a => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice(8)) : undefined;
if (limit != null && (!Number.isInteger(limit) || limit < 1 || limit > 210)) throw new Error("--limit는 1~210 정수여야 합니다.");
const work = process.argv.includes("--enrich") ? enrichFinancialAccounts().then(r => { if (r.failed) process.exitCode = 1; return r.publication; }) : process.argv.includes("--reclassify") ? reclassifySavedFinancials() : collectFinancials({ refresh: process.argv.includes("--refresh"), retryFailed: process.argv.includes("--retry-failed"), codes, limit, onProgress: console.log });
work.then(p => {
  console.log(`재무 데이터 저장 완료: ${p.companies.filter(c => c.reports.length).length}/${p.companies.length}개 기업 · data/financials/board.json`);
  const errors = p.companies.filter(c => c.errors.length);
  if (errors.length) console.log(`미완료·확인 필요: ${errors.length}개 기업. 기존 성공 자료는 유지됩니다. --retry-failed로 재시도할 수 있습니다.`);
  if (!p.companies.some(c => c.reports.length) || errors.length) process.exitCode = 1;
}).catch((e: unknown) => { console.error(e instanceof Error ? e.message : "재무 수집 실패"); process.exitCode = 1; });
