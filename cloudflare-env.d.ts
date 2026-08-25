declare global {
  interface CloudflareEnv {
    DEALS_KV: KVNamespace;
    CRON_SECRET?: string;
    LLM_API_KEY?: string;
    LLM_BASE_URL?: string;
    LLM_MODEL?: string;
  }
}

export {};
