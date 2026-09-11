import { fetchJson, fetchText } from "../src/lib/http.ts";
import { coopSlugToPath } from "../src/lib/scrapers/coop.ts";
import { scrapeCoop } from "../src/lib/scrapers/coop.ts";

function extractLedgerAccount(html: string): string | undefined {
  const pageId = html.match(/store_page_id"\s*:\s*"(\d{4,6})"/i)?.[1];
  const raw =
    pageId ?? html.match(/ledgerAccountNumber["']?\s*:\s*"?(\d{4,6})"?/i)?.[1];
  return raw ? raw.padStart(6, "0") : undefined;
}

const slug = "coop/coop-alvsjo";
const path = coopSlugToPath(slug);
const html = await fetchText(`https://www.coop.se${path}`);
const ledger = extractLedgerAccount(html)!;

const DKE_KEY = "32895bd5b86e4a5ab6e94fb0bc8ae234";
const data = await fetchJson<{
  sortingGroups?: { offers?: Array<{
    content?: { title?: string };
    priceInformation?: {
      discountValue?: number;
      minimumAmount?: number;
      dealType?: string;
    };
    unifiedSplash?: { tag?: string; prefix?: string; value?: string };
    clusterInteriorOffers?: unknown[];
  }> };
}>(
  `https://external.api.coop.se/dke/offers/sorting-groups/${ledger}?api-version=v2&clustered=true&grouped=true`,
  {
    headers: {
      Accept: "application/json",
      "ocp-apim-subscription-key": DKE_KEY,
      Origin: "https://www.coop.se",
      Referer: "https://www.coop.se/",
    },
  },
);

const offers = data.sortingGroups?.[0]?.offers ?? [];
const multi = offers.filter((o) => (o.priceInformation?.minimumAmount ?? 1) > 1);
console.log("Raw multi-buy offers:", multi.length);
for (const o of multi.slice(0, 10)) {
  const pi = o.priceInformation!;
  const s = o.unifiedSplash;
  console.log({
    title: o.content?.title,
    discountValue: pi.discountValue,
    minimumAmount: pi.minimumAmount,
    dealType: pi.dealType,
    splash: s,
  });
}

const scraped = await scrapeCoop(slug);
const scrapedMulti = scraped.deals.filter((d) => (d.promotionLabel ?? "").includes("för"));
console.log("\nScraped with för in label:", scrapedMulti.length);
for (const d of scrapedMulti.slice(0, 10)) {
  console.log({
    name: d.name,
    price: d.price,
    promotionLabel: d.promotionLabel,
  });
}

import { parseMultiBuyOffer } from "../src/lib/utils-app.ts";
for (const d of scrapedMulti.slice(0, 10)) {
  console.log(d.promotionLabel, "->", parseMultiBuyOffer(d.promotionLabel));
}
