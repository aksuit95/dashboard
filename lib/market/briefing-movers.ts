type Stock = { code: string; name: string; sector: string; price: number | null; returns: { "1d": number | null } };

/** Both snapshots must already have passed KRX publication validation. */
export function summarizeBriefingMovers(rows: Stock[], baseRows: Stock[] | undefined, weekly: boolean) {
  const base = new Map(baseRows?.map(row => [row.code, row.price]) ?? []);
  const values = rows.map(row => {
    const previous = base.get(row.code);
    const value = weekly ? row.price != null && previous != null && row.price > 0 && previous > 0 ? (row.price / previous - 1) * 100 : null : row.returns["1d"];
    return { code: row.code, name: row.name, sector: row.sector, value: value != null && Number.isFinite(value) ? value : null };
  });
  const valid = values.filter((row): row is typeof row & { value: number } => row.value !== null);
  const sorted = [...valid].sort((a, b) => b.value - a.value || a.code.localeCompare(b.code));
  return {
    total: values.length,
    up: valid.filter(row => row.value > 0).length,
    flat: valid.filter(row => row.value === 0).length,
    down: valid.filter(row => row.value < 0).length,
    missing: values.length - valid.length,
    leaders: sorted.filter(row => row.value > 0).slice(0, 3),
    laggards: [...valid].filter(row => row.value < 0).sort((a, b) => a.value - b.value || a.code.localeCompare(b.code)).slice(0, 3),
  };
}
