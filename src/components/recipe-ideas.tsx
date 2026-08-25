"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getChainMeta } from "@/lib/chains";
import {
  fallbackRecipeUrl,
  hashSeed,
  localDayStamp,
  pickRecipeIngredients,
  toRecipeIngredient,
} from "@/lib/recipes";
import type { Deal, RecipeDish, RecipeIngredient, RecipesResponse } from "@/lib/types";
import { chainBadgeClass, formatPrice } from "@/lib/utils-app";
import { ChefHat, ExternalLink, Loader2, Shuffle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface RecipeIdeasProps {
  deals: Deal[];
  dealsLoading: boolean;
  storeKey: string;
}

export function RecipeIdeas({ deals, dealsLoading, storeKey }: RecipeIdeasProps) {
  const [shuffle, setShuffle] = useState(0);
  const [dishes, setDishes] = useState<RecipeDish[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [llmUnavailable, setLlmUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = useMemo(() => {
    const seed = hashSeed(`${localDayStamp()}|${storeKey}|${shuffle}`);
    return pickRecipeIngredients(deals, seed);
  }, [deals, storeKey, shuffle]);

  const proteins = pick.proteins.map(toRecipeIngredient);
  const vegetables = pick.vegetables.map(toRecipeIngredient);

  useEffect(() => {
    if (pick.proteins.length === 0) {
      setDishes([]);
      setLlmUnavailable(false);
      setError(null);
      setRecipesLoading(false);
      return;
    }

    const selectedProteins = pick.proteins.map(toRecipeIngredient);
    const selectedVegetables = pick.vegetables.map(toRecipeIngredient);
    const controller = new AbortController();
    setRecipesLoading(true);
    setError(null);
    setLlmUnavailable(false);
    setDishes([]);

    void fetchRecipes(selectedProteins, selectedVegetables, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.status === "missing_llm") {
          setLlmUnavailable(true);
          setDishes([]);
          return;
        }
        if (result.status === "error") {
          setError(result.message);
          setDishes([]);
          return;
        }
        setDishes(result.dishes);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRecipesLoading(false);
      });

    return () => controller.abort();
  }, [pick]);

  if (dealsLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (proteins.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ChefHat className="h-5 w-5" />
            Receptförslag
          </CardTitle>
          <CardDescription>
            Inget kött på rea just nu. Prova fler butiker eller sänk rabattnivån.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const searchUrl = fallbackRecipeUrl(proteins, vegetables);
  const meatCountLabel =
    proteins.length === 1 ? "Ett köttförslag" : `${proteins.length} köttförslag`;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <ChefHat className="h-5 w-5" />
            Tre rätter från veckans fynd
          </CardTitle>
          <CardDescription>
            {meatCountLabel} plus veckans grönsaker på rea. Länkarna går till ICA:s receptsök.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setShuffle((value) => value + 1)}
        >
          <Shuffle className="h-4 w-4" />
          Nytt förslag
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
          {proteins.map((item) => (
            <IngredientRow key={item.id} item={item} kind="Kött" />
          ))}
          {vegetables.map((item) => (
            <IngredientRow key={item.id} item={item} kind="Grönt" />
          ))}
        </ul>

        {recipesLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Tar fram tre rätter…
          </div>
        ) : dishes.length > 0 ? (
          <ul className="space-y-3">
            {dishes.map((dish) => (
              <li
                key={dish.title}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium leading-snug">{dish.title}</p>
                  {dish.whyCheap ? (
                    <p className="text-sm text-muted-foreground">{dish.whyCheap}</p>
                  ) : null}
                  {dish.extraIngredients.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Extra: {dish.extraIngredients.join(", ")}
                    </p>
                  ) : null}
                </div>
                <a
                  href={dish.recipeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-sm text-primary hover:underline"
                >
                  Öppna recept
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {llmUnavailable
                ? "Receptförslag kräver en LLM-nyckel. Sök på ICA med varorna tills vidare."
                : error
                  ? error
                  : "Inga receptförslag just nu."}
            </p>
            <a
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Sök recept på ICA
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IngredientRow({ item, kind }: { item: RecipeIngredient; kind: string }) {
  const chain = getChainMeta(item.chain);
  return (
    <li className="flex items-center gap-3 rounded-lg border bg-background p-2">
      {item.imageUrl ? (
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt="" className="h-full w-full object-contain p-0.5" />
        </div>
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-md bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {kind}
          {item.volume ? ` · ${item.volume}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold">{formatPrice(item.price)}</p>
        <Badge variant="outline" className={`text-[10px] ${chainBadgeClass(item.chain)}`}>
          {chain.name}
        </Badge>
      </div>
    </li>
  );
}

async function fetchRecipes(
  proteins: RecipeIngredient[],
  vegetables: RecipeIngredient[],
  signal: AbortSignal,
): Promise<{ status: "ok"; dishes: RecipeDish[] } | { status: "missing_llm" } | { status: "error"; message: string }> {
  try {
    const response = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proteins, vegetables }),
      signal,
    });
    const payload = (await response.json().catch(() => null)) as
      | (RecipesResponse & { error?: string })
      | null;
    if (response.status === 503 && payload?.error === "missing_llm") {
      return { status: "missing_llm" };
    }
    if (!response.ok) {
      return {
        status: "error",
        message: payload?.error?.trim() || "Kunde inte hämta receptförslag just nu.",
      };
    }
    if (!payload || !Array.isArray(payload.dishes) || payload.dishes.length === 0) {
      return { status: "error", message: "Tomt svar" };
    }
    return { status: "ok", dishes: payload.dishes };
  } catch (error) {
    if (signal.aborted) return { status: "error", message: "Avbruten" };
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Kunde inte hämta receptförslag",
    };
  }
}
