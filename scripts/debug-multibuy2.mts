import { scrapeCoop } from "../src/lib/scrapers/coop.ts";
import { scrapeWillys } from "../src/lib/scrapers/willys.ts";
import { scrapeIca } from "../src/lib/scrapers/ica.ts";
import { parseMultiBuyOffer } from "../src/lib/utils-app.ts";
import type { Deal } from "../src/lib/types.ts";

function findBroken(deals: Deal[]) {
  return deals.filter((d) => {
    const parsed = parseMultiBuyOffer(d.promotionLabel);
    if (parsed) return false;
    // price equals a likely multi-buy total: round number and promotion hints
    if (d.promotionLabel?.match(/\d+\s*f[öo]r/i)) return true;
    // price looks like total when label mentions multi-buy elsewhere in name
    if (/f[öo]r\s*\d/i.test(d.promotionLabel ?? "")) return true;
    return false;
  });
}

function findTotalAsUnit(deals: Deal[]) {
  return deals.filter((d) => {
    const parsed = parseMultiBuyOffer(d.promotionLabel);
    if (!parsed) return false;
    // If displayed as single price would show total
    return Math.abs(d.price - parsed.total) < 0.05;
  });
}

function findMultiWithoutLabel(deals: Deal[]) {
  return deals.filter((d) => {
    if (d.promotionLabel) return false;
    // Suspicious round prices common in multi-buy
    return Number.isInteger(d.price) && d.price >= 20 && d.price <= 200;
  });
}

async function run(label: string, deals: Deal[]) {
  console.log(`\n=== ${label} (${deals.length}) ===`);
  const broken = findBroken(deals);
  const totalAsUnit = findTotalAsUnit(deals);
  const noLabel = findMultiWithoutLabel(deals).slice(0, 5);

  console.log(`broken labels: ${broken.length}`);
  broken.slice(0, 6).forEach((d) =>
    console.log(`  "${d.promotionLabel}" price=${d.price} name=${d.name.slice(0, 40)}`),
  );

  console.log(`price=total (should be per-unit): ${totalAsUnit.length}`);
  totalAsUnit.slice(0, 6).forEach((d) =>
    console.log(`  "${d.promotionLabel}" price=${d.price}`),
  );

  const multiNoParse = deals.filter((d) => !parseMultiBuyOffer(d.promotionLabel));
  const withFor = multiNoParse.filter((d) => /f[öo]r/i.test(d.promotionLabel ?? ""));
  console.log(`has 'för' but no parse: ${withFor.length}`);
  withFor.slice(0, 8).forEach((d) =>
    console.log(`  "${d.promotionLabel}" price=${d.price}`),
  );
}

await run("Coop", (await scrapeCoop("coop/coop-alvsjo")).deals);
await run("Willys", (await scrapeWillys("2219")).deals);
await run("ICA", (await scrapeIca("ica-nara-alvsjo-1004436")).deals);
