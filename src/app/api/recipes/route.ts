import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import {
  buildRecipePrompt,
  extractJsonPayload,
  isRecipeIngredient,
  MAX_PROTEINS,
  parseRecipeDishes,
} from "@/lib/recipes";
import type { RecipeIngredient, RecipesResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const RECIPES_TTL_SECONDS = 60 * 60;
const MAX_VEGETABLES_IN_PROMPT = 16;

interface RecipesRequestBody {
  protein?: unknown;
  proteins?: unknown;
  vegetables?: unknown;
}

export async function POST(request: NextRequest) {
  let body: RecipesRequestBody;
  try {
    body = (await request.json()) as RecipesRequestBody;
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const proteins = readProteins(body);
  if (proteins.length === 0) {
    return NextResponse.json({ error: "Saknar protein" }, { status: 400 });
  }
  const vegetables = Array.isArray(body.vegetables)
    ? body.vegetables.filter(isRecipeIngredient).slice(0, MAX_VEGETABLES_IN_PROMPT)
    : [];

  const cacheKey = recipeCacheKey(proteins, vegetables);
  const cached = await readCachedRecipes(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const apiKey = readLlmApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "missing_llm", message: "LLM_API_KEY saknas" },
      { status: 503 },
    );
  }

  try {
    const dishes = await completeRecipeDishes(proteins, vegetables, apiKey);
    if (dishes.length === 0) {
      return NextResponse.json({ error: "Tomt LLM-svar" }, { status: 502 });
    }
    const payload: RecipesResponse = { dishes, fromCache: false };
    try {
      await cacheSet(cacheKey, JSON.stringify({ dishes }), RECIPES_TTL_SECONDS);
    } catch (error) {
      console.error("[recipes] cache write failed", error);
    }
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte skapa receptförslag";
    console.error("[recipes]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function readLlmApiKey(): string | undefined {
  const raw = process.env.LLM_API_KEY?.trim();
  if (!raw) return undefined;
  return raw.replace(/^[\u2026.\s]+/, "").trim() || undefined;
}

function readProteins(body: RecipesRequestBody): RecipeIngredient[] {
  const fromList = Array.isArray(body.proteins)
    ? body.proteins.filter(isRecipeIngredient).slice(0, MAX_PROTEINS)
    : [];
  if (fromList.length > 0) return fromList;
  return isRecipeIngredient(body.protein) ? [body.protein] : [];
}

async function completeRecipeDishes(
  proteins: RecipeIngredient[],
  vegetables: RecipeIngredient[],
  apiKey: string,
): Promise<RecipesResponse["dishes"]> {
  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const payload = {
    model,
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: "Du svarar bara med giltig JSON enligt användarens schema.",
      },
      { role: "user", content: buildRecipePrompt(proteins, vegetables) },
    ],
  };

  let response = await callLlm(baseUrl, apiKey, { ...payload, response_format: { type: "json_object" } });
  if (response.status === 400) {
    response = await callLlm(baseUrl, apiKey, payload);
  }

  if (!response.ok) {
    const detail = await llmErrorDetail(response);
    throw new Error(detail);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM-svar saknade innehåll");
  return parseRecipeDishes(extractJsonPayload(content));
}

async function callLlm(
  baseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
}

async function llmErrorDetail(response: Response): Promise<string> {
  let hint = "";
  try {
    const body = (await response.json()) as { error?: { message?: string } | string };
    const message = typeof body.error === "string" ? body.error : body.error?.message;
    if (message) hint = `: ${message.slice(0, 180)}`;
  } catch {
    /* ignore */
  }
  if (response.status === 401) {
    return `LLM-nyckeln avvisades (401)${hint}`;
  }
  return `LLM-anrop misslyckades (${response.status})${hint}`;
}

function recipeCacheKey(proteins: RecipeIngredient[], vegetables: RecipeIngredient[]): string {
  const ids = [...proteins.map((item) => item.id), ...vegetables.map((item) => item.id)]
    .sort()
    .join("|");
  const digest = createHash("sha256").update(ids).digest("hex").slice(0, 32);
  return `recipes:v2:${digest}`;
}

async function readCachedRecipes(key: string): Promise<RecipesResponse | null> {
  const raw = await cacheGet(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { dishes?: unknown };
    const dishes = parseRecipeDishes(parsed);
    if (dishes.length === 0) return null;
    return { dishes, fromCache: true };
  } catch {
    return null;
  }
}
