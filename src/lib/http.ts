const DEFAULT_HEADERS: HeadersInit = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const text = await fetchText(url, init);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from ${url}`);
  }
}

export async function fetchText(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<string> {
  const { timeoutMs = 25000, headers, ...rest } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...rest,
      headers: { ...DEFAULT_HEADERS, ...headers },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new HttpError(
        `HTTP ${response.status} for ${url}`,
        response.status,
        url,
      );
    }

    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJsonSafe<T>(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T | null> {
  try {
    return await fetchJson<T>(url, init);
  } catch {
    return null;
  }
}
