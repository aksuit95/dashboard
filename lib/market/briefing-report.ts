import fs from "node:fs/promises";
import path from "node:path";
import { resolvePeriod } from "@/lib/market/briefing";
import { readSectorPublication } from "@/lib/sources/sector-publication";
import { readInvestorPublication } from "@/lib/sources/investor-flow-publication";
import { summarizeBriefingMovers } from "@/lib/market/briefing-movers";

type Point = { date: string; value: number };
export async function buildBriefing(type: "daily" | "weekly", selected: string, root = process.cwd(), now = new Date()) {
    const period = resolvePeriod(type, selected, now);
    const indices = await Promise.all(["kospi", "kosdaq"].map(async (id) => {
      try {
        const dir = path.join(root, "public/data/market-indicators-live");
        const [points, meta] = await Promise.all([fs.readFile(path.join(dir, `${id}.json`), "utf8").then(JSON.parse) as Promise<Point[]>, fs.readFile(path.join(dir, `${id}.meta.json`), "utf8").then(JSON.parse)]);
        if (meta.status !== "ok" || meta.basis !== `KRX 정규장 ${meta.asOf === "2026-11-19" ? "16:30" : "15:30"} KST` || meta.source !== "KRX 정보데이터시스템" || meta.asOf < period.end) throw new Error("KRX 종가 출처 또는 기준일을 확인할 수 없습니다.");
        const allDates = [period.base, ...period.days];
        const values = allDates.map(date => ({ date, value: points.find(x => x.date === date)?.value ?? null }));
        if (values.some(x => typeof x.value !== "number" || !Number.isFinite(x.value) || x.value <= 0)) throw new Error("대상 거래일 또는 비교일의 KRX 종가가 없습니다.");
        const base = values[0].value as number, close = values.at(-1)!.value as number;
        return { id, values, close, change: close - base, percent: (close / base - 1) * 100, fetchedAt: meta.fetchedAt, error: null };
      } catch (error) { return { id, values: [], close: null, change: null, percent: null, fetchedAt: null, error: (error as Error).message }; }
    }));
    const sectors = await readSectorPublication(path.join(root, "data/sectors/board.json")).then(pub => ["kospi200", "kosdaq150"].map(universe => {
      const snapshots = pub?.snapshots[universe as "kospi200" | "kosdaq150"];
      const last = snapshots?.[period.end], base = snapshots?.[period.base];
      if (!last || (type === "weekly" && !base)) return { universe, rows: [], fetchedAt: null, error: "해당 날짜의 섹터 스냅샷이 없습니다." };
      const groups = new Map<string, { total: number; values: number[] }>();
      for (const row of last.rows) {
        const group = groups.get(row.sector) ?? { total: 0, values: [] }; group.total++;
        const previous = base?.rows.find(r => r.code === row.code)?.price;
        const value = type === "daily" ? row.returns["1d"] : row.price != null && previous != null && previous > 0 ? (row.price / previous - 1) * 100 : null;
        if (value != null && Number.isFinite(value)) group.values.push(value);
        groups.set(row.sector, group);
      }
      const rows = [...groups].map(([name, g]) => ({ name, total: g.total, valid: g.values.length, value: g.values.length ? g.values.reduce((a, b) => a + b, 0) / g.values.length : null })).filter(r => r.value !== null).sort((a, b) => b.value! - a.value! || a.name.localeCompare(b.name, "ko"));
      const movers = summarizeBriefingMovers(last.rows, base?.rows, type === "weekly");
      const hasMissing = [...groups.values()].some(group => group.values.length < group.total);
      return { universe, rows, movers, hasMissing, fetchedAt: last.fetchedAt, error: rows.length ? null : "유효한 섹터 수익률이 없습니다." };
    })).catch(() => ["kospi200", "kosdaq150"].map(universe => ({ universe, rows: [], fetchedAt: null, error: "섹터 자료를 읽거나 검증할 수 없습니다." })));
    const flows = await readInvestorPublication(path.join(root, "data/investor-flow/board.json")).then(pub => ["kospi200", "kosdaq150"].map(universe => {
      const row = pub?.snapshots.find(s => s.as_of === period.end && s.universe === universe && s.view === "index" && !s.error && s.toss);
      if (!row?.toss) return { universe, points: [], collectedAt: null, updatedAt: null, missing: period.days, error: "해당 기준일 수급 스냅샷이 없습니다." };
      const data = JSON.parse(row.toss) as { asOf: string; collectedAt: string; latestUpdatedAt: string; points: { date: string; individual: number | null; foreign: number | null; institution: number | null }[] };
      const points = period.days.map(date => data.points.find(x => x.date === date)).filter((x): x is NonNullable<typeof x> => !!x);
      const missing = period.days.filter(date => !points.some(x => x.date === date && [x.individual, x.foreign, x.institution].every(v => typeof v === "number" && Number.isFinite(v))));
      return { universe, points, collectedAt: data.collectedAt, updatedAt: data.latestUpdatedAt, missing, error: missing.length ? "일부 거래일 수급이 결측입니다." : null };
    })).catch(() => ["kospi200", "kosdaq150"].map(universe => ({ universe, points: [], collectedAt: null, updatedAt: null, missing: period.days, error: "수급 자료를 읽거나 검증할 수 없습니다." })));
    return { type, period, indices, sectors, flows, createdAt: now.toISOString() };
}
