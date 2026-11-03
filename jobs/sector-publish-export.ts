import { exportSectorPublication } from "@/lib/sources/sector-publication";

exportSectorPublication(undefined, new Date(), undefined, process.argv.includes("--force")).then(({ changed, publication }) => {
  console.log(JSON.stringify({ changed, latestDate: publication.latestDate, publishedAt: publication.publishedAt, dates: Object.keys(publication.snapshots.kospi200).length }));
}).catch(error => { console.error(error); process.exitCode = 1; });
