import { scrapeIca } from "../src/lib/scrapers/ica.ts";
import { parseMultiBuyOffer } from "../src/lib/utils-app.ts";

const r = await scrapeIca("ica-nara-alvsjo-1004436");

for (const d of r.deals) {
  const parsed = parseMultiBuyOffer(d.promotionLabel);
  const looksMulti = /f[öo]r/i.test(d.promotionLabel ?? "");
  if (looksMulti || parsed) {
    console.log({
      name: d.name.slice(0, 40),
      label: d.promotionLabel,
      price: d.price,
      parsed,
      showSingle: !parsed ? format(d.price) : null,
    });
  }
}

function format(p: number) {
  return `${p.toFixed(2)} kr`;
}

console.log("\nAll deals with quantity mechanics:");
for (const d of r.deals) {
  if (d.promotionLabel?.match(/\d+\s*f[öo]r/i)) {
    const p = parseMultiBuyOffer(d.promotionLabel);
    if (!p) console.log("FAIL", d.promotionLabel, d.price);
    else if (Math.abs(d.price - p.total) < 0.05)
      console.log("TOTAL AS PRICE", d.promotionLabel, d.price);
  }
}
