import { fetchJson } from "../src/lib/http.ts";
import { parseAxfoodCampaignItem } from "../src/lib/scrapers/willys.ts";
import { parseMultiBuyOffer } from "../src/lib/utils-app.ts";

const BASE = "https://www.willys.se";
const storeId = "2219";
const storeUrl = `${BASE}/erbjudanden`;

interface Promo {
  qualifyingCount?: number;
  rewardLabel?: string;
  conditionLabelFormatted?: string;
  cartLabel?: string;
  savePrice?: string;
}

const data = await fetchJson<{ results?: Array<{ name?: string; potentialPromotions?: Promo[] }> }>(
  `${BASE}/search/campaigns/offline?q=${storeId}&type=PERSONAL_GENERAL&page=0&size=400`,
  {
    headers: {
      Accept: "application/json",
      Referer: `${BASE}/erbjudanden`,
      Origin: BASE,
    },
  },
);

for (const item of data.results ?? []) {
  const promo = item.potentialPromotions?.[0];
  if (!promo || (promo.qualifyingCount ?? 0) <= 1) continue;
  const deal = parseAxfoodCampaignItem(item as never, "willys", storeUrl);
  if (!deal) continue;
  const parsed = parseMultiBuyOffer(deal.promotionLabel);
  const priceIsTotal = parsed && Math.abs(deal.price - parsed.total) < 0.05;
  const noParse = !parsed;
  if (noParse || priceIsTotal) {
    console.log({
      name: item.name,
      qc: promo.qualifyingCount,
      rewardLabel: promo.rewardLabel,
      condition: promo.conditionLabelFormatted,
      cart: promo.cartLabel,
      dealPrice: deal.price,
      label: deal.promotionLabel,
      parsed,
      priceIsTotal,
    });
  }
}
