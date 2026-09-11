import { fetchJson, fetchText } from "../src/lib/http.ts";
import { coopSlugToPath } from "../src/lib/scrapers/coop.ts";

function extractLedgerAccount(html: string): string | undefined {
  const pageId = html.match(/store_page_id"\s*:\s*"(\d{4,6})"/i)?.[1];
  const raw =
    pageId ?? html.match(/ledgerAccountNumber["']?\s*:\s*"?(\d{4,6})"?/i)?.[1];
  return raw ? raw.padStart(6, "0") : undefined;
}

const slug = "coop/coop-alvsjo";
const html = await fetchText(`https://www.coop.se${coopSlugToPath(slug)}`);
const ledger = extractLedgerAccount(html)!;

const data = await fetchJson<{
  sortingGroups?: {
    offers?: Array<{
      content?: { title?: string };
      priceInformation?: {
        discountValue?: number;
        minimumAmount?: number;
        dealType?: string;
      };
      unifiedSplash?: { prefix?: string; value?: string; tag?: string };
    }>;
  }[];
}>(
  `https://external.api.coop.se/dke/offers/sorting-groups/${ledger}?api-version=v2&clustered=true&grouped=true`,
  {
    headers: {
      Accept: "application/json",
      "ocp-apim-subscription-key": "32895bd5b86e4a5ab6e94fb0bc8ae234",
      Origin: "https://www.coop.se",
      Referer: "https://www.coop.se/",
    },
  },
);

for (const offer of data.sortingGroups?.[0]?.offers ?? []) {
  const pi = offer.priceInformation ?? {};
  const splash = offer.unifiedSplash;
  const splashText =
    splash?.prefix && splash?.value
      ? `${splash.prefix} ${splash.value}`
      : splash?.value ?? splash?.tag ?? "";
  const qty = pi.minimumAmount ?? 1;
  const total = pi.discountValue ?? 0;
  const multiSplash = /\d+\s*f[öo]r/i.test(splashText);
  const mismatch = multiSplash && qty <= 1;
  if (mismatch || (qty > 1 && !splashText)) {
    console.log({
      title: offer.content?.title,
      qty,
      total,
      dealType: pi.dealType,
      splash: splashText,
      mismatch,
    });
  }
}

console.log("\nAll offers:");
for (const offer of data.sortingGroups?.[0]?.offers ?? []) {
  const pi = offer.priceInformation ?? {};
  const splash = offer.unifiedSplash;
  const splashText =
    splash?.prefix && splash?.value
      ? `${splash.prefix} ${splash.value}`
      : splash?.value ?? "";
  console.log(
    `${offer.content?.title}: min=${pi.minimumAmount ?? 1} total=${pi.discountValue} splash="${splashText}" type=${pi.dealType}`,
  );
}
