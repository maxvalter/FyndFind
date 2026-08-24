"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CHAINS, getChainMeta } from "@/lib/chains";
import type {
  ChainId,
  ChainStatus,
  Deal,
  DealCategory,
  DealsResponse,
  StoreLocation,
  StoreSelection,
} from "@/lib/types";
import { DEAL_CATEGORIES, DEFAULT_STORES } from "@/lib/types";
import {
  chainBadgeClass,
  filterDeals,
  formatDistance,
  formatPrice,
} from "@/lib/utils-app";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Store,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface DealsAppProps {
  initialSelection: StoreSelection;
  hasSavedStores: boolean;
}

interface StoreSearchState {
  open: boolean;
  chain: ChainId | null;
  query: string;
  results: StoreLocation[];
  loading: boolean;
}

export function DealsApp({ initialSelection, hasSavedStores }: DealsAppProps) {
  const [selection, setSelection] = useState<StoreSelection>(initialSelection);
  const [locationNote, setLocationNote] = useState<string>("");
  const [needsLocation, setNeedsLocation] = useState(!hasSavedStores);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [statuses, setStatuses] = useState<ChainStatus[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<DealCategory>("Alla");
  const [storeSearch, setStoreSearch] = useState<StoreSearchState>({
    open: false,
    chain: null,
    query: "",
    results: [],
    loading: false,
  });

  const fetchDeals = useCallback(
    async (sel: StoreSelection, refresh = false) => {
      const params = new URLSearchParams({
        willys: sel.willys ?? DEFAULT_STORES.willys!,
        hemkop: sel.hemkop ?? DEFAULT_STORES.hemkop!,
        ica: sel.ica ?? DEFAULT_STORES.ica!,
        coop: sel.coop ?? DEFAULT_STORES.coop!,
        lidl: sel.lidl ?? DEFAULT_STORES.lidl!,
      });
      if (refresh) params.set("refresh", "1");

      const response = await fetch(`/api/deals?${params.toString()}`);
      if (!response.ok) throw new Error("Kunde inte hämta erbjudanden");
      const data = (await response.json()) as DealsResponse;
      setDeals(data.deals);
      setStatuses(data.statuses);
      setFetchedAt(data.fetchedAt);
    },
    [],
  );

  const loadDeals = useCallback(
    async (sel: StoreSelection, refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      try {
        await fetchDeals(sel, refresh);
      } catch {
        setStatuses((prev) =>
          prev.length
            ? prev
            : CHAINS.map((c) => ({
                chain: c.id,
                ok: false,
                error: "Kunde inte hämta erbjudanden",
              })),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchDeals],
  );

  useEffect(() => {
    if (!needsLocation) {
      void loadDeals(selection);
    }
  }, [needsLocation, selection, loadDeals]);

  const filteredDeals = useMemo(
    () => filterDeals(deals, search, category),
    [deals, search, category],
  );

  const dealCountByChain = useMemo(() => {
    const counts: Partial<Record<ChainId, number>> = {};
    for (const deal of deals) {
      counts[deal.chain] = (counts[deal.chain] ?? 0) + 1;
    }
    return counts;
  }, [deals]);

  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setLocationNote("Din webbläsare stödjer inte platstjänster. Standardbutiker används.");
      setNeedsLocation(false);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `/api/nearest?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`,
          );
          if (!res.ok) throw new Error("nearest failed");
          const data = (await res.json()) as {
            selection: StoreSelection;
            stores: StoreLocation[];
          };
          setSelection(data.selection);
          setLocationNote(
            data.stores[0]?.city
              ? `Butiker nära ${data.stores[0].city} valda automatiskt.`
              : "Närmaste butiker valda utifrån din plats.",
          );
          setNeedsLocation(false);
        } catch {
          setLocationNote("Kunde inte hitta närmaste butiker. Standardbutiker används.");
          setNeedsLocation(false);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocationNote("Plats nekad. Vi använder standardbutiker tills du väljer egna.");
        setNeedsLocation(false);
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 15000 },
    );
  }, []);

  useEffect(() => {
    if (needsLocation) void requestLocation();
  }, [needsLocation, requestLocation]);

  const openStorePicker = (chain: ChainId) => {
    setStoreSearch({ open: true, chain, query: "", results: [], loading: false });
  };

  const searchStores = async (chain: ChainId, query: string) => {
    setStoreSearch((s) => ({ ...s, query, loading: true }));
    try {
      const res = await fetch(
        `/api/stores?chain=${chain}&q=${encodeURIComponent(query)}`,
      );
      const data = (await res.json()) as { stores: StoreLocation[] };
      setStoreSearch((s) => ({ ...s, results: data.stores ?? [], loading: false }));
    } catch {
      setStoreSearch((s) => ({ ...s, results: [], loading: false }));
    }
  };

  const selectStore = (chain: ChainId, store: StoreLocation) => {
    const next = { ...selection, [chain]: store.id };
    setSelection(next);
    setStoreSearch({ open: false, chain: null, query: "", results: [], loading: false });
    void loadDeals(next, true);
  };

  if (needsLocation && locating) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <h2 className="text-xl font-semibold">Hittar dina butiker</h2>
        <p className="text-muted-foreground">
          Vi frågar om din plats för att välja närmaste Willys, Hemköp, ICA, Coop och Lidl.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Veckans fynd</h1>
          <p className="text-sm text-muted-foreground">
            {locationNote || "Jämför veckans erbjudanden från fem kedjor på ett ställe."}
          </p>
          {fetchedAt && (
            <p className="text-xs text-muted-foreground">
              Senast uppdaterad:{" "}
              {new Date(fetchedAt).toLocaleString("sv-SE", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void requestLocation()} disabled={locating}>
            <MapPin className="h-4 w-4" />
            Använd min plats
          </Button>
          <Button
            variant="default"
            onClick={() => void loadDeals(selection, true)}
            disabled={loading || refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Uppdatera
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {CHAINS.map((chain) => {
          const status = statuses.find((s) => s.chain === chain.id);
          const count = dealCountByChain[chain.id] ?? status?.dealCount ?? 0;
          return (
            <Card
              key={chain.id}
              className="cursor-pointer transition hover:shadow-md"
              onClick={() => openStorePicker(chain.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base" style={{ color: chain.color }}>
                    {chain.name}
                  </CardTitle>
                  {status && !status.ok && (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                </div>
                <CardDescription className="line-clamp-2 text-xs">
                  {status?.storeName ?? "Välj butik"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{count} erbjudanden</span>
                  <Store className="h-4 w-4 text-muted-foreground" />
                </div>
                {status?.error && (
                  <p className="text-xs text-destructive line-clamp-2">{status.error}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      {storeSearch.open && storeSearch.chain && (
        <Card>
          <CardHeader>
            <CardTitle>Välj {getChainMeta(storeSearch.chain).name}-butik</CardTitle>
            <CardDescription>Sök på stad, område eller butiksnamn</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="t.ex. Fridhemsplan, Göteborg..."
                value={storeSearch.query}
                onChange={(e) =>
                  setStoreSearch((s) => ({ ...s, query: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && storeSearch.chain) {
                    void searchStores(storeSearch.chain, storeSearch.query);
                  }
                }}
              />
              <Button
                onClick={() =>
                  storeSearch.chain &&
                  void searchStores(storeSearch.chain, storeSearch.query)
                }
              >
                Sök
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  setStoreSearch({
                    open: false,
                    chain: null,
                    query: "",
                    results: [],
                    loading: false,
                  })
                }
              >
                Stäng
              </Button>
            </div>
            {storeSearch.loading && <Skeleton className="h-20 w-full" />}
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                {storeSearch.results.map((store) => (
                  <button
                    key={`${store.chain}-${store.id}`}
                    type="button"
                    className="flex w-full items-start justify-between rounded-lg border p-3 text-left hover:bg-muted/50"
                    onClick={() => selectStore(storeSearch.chain!, store)}
                  >
                    <div>
                      <p className="font-medium">{store.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[store.address, store.city].filter(Boolean).join(", ")}
                      </p>
                    </div>
                    {store.distanceKm != null && (
                      <span className="text-xs text-muted-foreground">
                        {formatDistance(store.distanceKm)}
                      </span>
                    )}
                  </button>
                ))}
                {!storeSearch.loading && storeSearch.results.length === 0 && storeSearch.query && (
                  <p className="text-sm text-muted-foreground">Inga butiker hittades.</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <Separator />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Sök produkter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Visar {filteredDeals.length} av {deals.length} erbjudanden
        </p>
      </div>

      <Tabs value={category} onValueChange={(v) => setCategory(v as DealCategory)}>
        <ScrollArea className="w-full whitespace-nowrap">
          <TabsList className="inline-flex h-auto w-max flex-wrap justify-start gap-1 bg-transparent p-0">
            {DEAL_CATEGORIES.map((cat) => (
              <TabsTrigger
                key={cat}
                value={cat}
                className="border data-[state=active]:border-primary data-[state=active]:bg-primary/10"
              >
                {cat}
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>
        <TabsContent value={category} className="mt-4">
          {loading ? (
            <DealGridSkeleton />
          ) : filteredDeals.length === 0 ? (
            <EmptyState search={search} category={category} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredDeals.map((deal) => (
                <DealCard key={deal.id} deal={deal} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DealCard({ deal }: { deal: Deal }) {
  const chain = getChainMeta(deal.chain);

  return (
    <Card className="overflow-hidden">
      {deal.imageUrl && (
        <div className="relative aspect-[4/3] bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={deal.imageUrl}
            alt={deal.name}
            className="h-full w-full object-contain p-3"
            loading="lazy"
          />
        </div>
      )}
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={chainBadgeClass(deal.chain)} variant="outline">
            {chain.name}
          </Badge>
          {deal.memberOnly && (
            <Badge variant="secondary">Medlemspris</Badge>
          )}
          {deal.savingsPercent != null && deal.savingsPercent > 0 && (
            <Badge className="bg-emerald-100 text-emerald-800" variant="outline">
              −{deal.savingsPercent}%
            </Badge>
          )}
        </div>
        <CardTitle className="text-base leading-snug">{deal.name}</CardTitle>
        {deal.volume && (
          <CardDescription>{deal.volume}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold">{formatPrice(deal.price)}</span>
          {deal.originalPrice != null && deal.originalPrice > deal.price && (
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(deal.originalPrice)}
            </span>
          )}
        </div>
        {deal.promotionLabel && (
          <p className="text-sm font-medium text-primary">{deal.promotionLabel}</p>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{deal.category}</span>
          {deal.productUrl && (
            <a
              href={deal.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Till butiken
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DealGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i}>
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <CardHeader>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ search, category }: { search: string; category: string }) {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center">
      <p className="text-lg font-medium">Inga erbjudanden matchar filtret</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {search
          ? `Inget resultat för "${search}"${category !== "Alla" ? ` i kategorin ${category}` : ""}.`
          : category !== "Alla"
            ? `Inga erbjudanden i kategorin ${category} just nu.`
            : "Prova att uppdatera eller välja en annan butik."}
      </p>
    </div>
  );
}
