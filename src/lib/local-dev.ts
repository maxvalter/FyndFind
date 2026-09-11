/** Lightweight local dev: file cache, no miniflare, no live scraping unless refresh=1. */
export function isLocalDevMode(): boolean {
  return process.env.FYND_LOCAL === "1";
}

export function isCacheOnlyMode(): boolean {
  return isLocalDevMode() || process.env.FYND_CACHE_ONLY === "1";
}
