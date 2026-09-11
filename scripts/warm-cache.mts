/**
 * Fyller .data/deals/ med erbjudanden från standardbutiker.
 * Kör med: npm run cache:fetch
 */
import { getDealsForSelection } from "../src/lib/deals";
import { DEFAULT_STORES } from "../src/lib/types";

console.log("Hämtar erbjudanden för standardbutiker…");
const started = Date.now();

const result = await getDealsForSelection(DEFAULT_STORES, { refresh: true });

for (const status of result.statuses) {
  const label = status.ok
    ? `${status.chain}: ${status.dealCount ?? 0} erbjudanden (${status.durationMs}ms)`
    : `${status.chain}: FEL — ${status.error}`;
  console.log(label);
}

console.log(`\nKlart på ${((Date.now() - started) / 1000).toFixed(1)}s — ${result.deals.length} erbjudanden cachade i .data/deals/`);

const failed = result.statuses.filter((s) => !s.ok);
if (failed.length) process.exitCode = 1;
