import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'public/short-selling-data');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const [name, source] of [['sample', 'examples/short-selling'], ['live', 'data']]) {
  const from = resolve(root, source);
  if (!existsSync(resolve(from, 'summary.json'))) continue;
  const target = resolve(output, name);
  await mkdir(target, { recursive: true });
  for (const file of ['summary.json', 'stocks.json', 'market_history.json']) {
    if (existsSync(resolve(from, file))) await cp(resolve(from, file), resolve(target, file));
  }
  if (existsSync(resolve(from, 'history'))) await cp(resolve(from, 'history'), resolve(target, 'history'), { recursive: true });
}
