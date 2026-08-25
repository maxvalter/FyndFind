"use client";

import { LocationPicker } from "@/components/location-picker";
import { RecipeIdeas } from "@/components/recipe-ideas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CHAINS, getChainMeta, storeOffersUrl, type ChainMeta } from "@/lib/chains";
import {
  readFavoriteDeals,
  refreshFavoriteDeals,
  writeFavoriteDeals,
} from "@/lib/favorites";
import type {
  ChainId,
  ChainStatus,
  Deal,
  DealCategory,
  DealsResponse,
  SavedPlace,
  StoreLocation,
  StoreSelection,
} from "@/lib/types";
import { DEAL_CATEGORIES, DEFAULT_STORES } from "@/lib/types";
import {
  chainBadgeClass,
  DISCOUNT_LEVELS,
  filterDeals,
  formatCompactSek,
  formatDistance,
  formatMultiBuyHero,
  formatPrice,
  formatVariantCount,
  isRedundantPriceLabel,
  isTemporaryOfferLabel,
  parseMultiBuyOffer,
  shortPlaceName,
  type MinDiscount,
} from "@/lib/utils-app";
import {
  AlertCircle,
  Check,
  ChefHat,
  ChevronDown,
  ExternalLink,
  Heart,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface DealsAppProps {
  initialSelection: StoreSelection;
  hasSavedStores: boolean;
  initialPlace: SavedPlace | null;
}

interface StoreSearchState {
  open: boolean;
  chain: ChainId | null;
  query: string;
  results: StoreLocation[];
  loading: boolean;
}

const ALL_CHAIN_IDS: ChainId[] = CHAINS.map((chain) => chain.id);
const closedStoreSearch: StoreSearchState = {
  open: false,
  chain: null,
  query: "",
  results: [],
  loading: false,
};

interface FavoriteGroup {
  chain: ChainMeta;
  storeName: string;
  items: Deal[];
}

function storeCountLabel(count: number) {
  return count === 1 ? "1 butik" : `${count} butiker`;
}

function discountLevelLabel(value: MinDiscount) {
  return value === 0 ? "Alla rabatter" : `${value} %+`;
}

export function DealsApp({ initialSelection, hasSavedStores, initialPlace }: DealsAppProps) {
  const [selection, setSelection] = useState<StoreSelection>(initialSelection);
  const [place, setPlace] = useState<SavedPlace | null>(initialPlace);
  const [mapOpen, setMapOpen] = useState(false);
  const [locating, setLocating] = useState(!hasSavedStores);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [statuses, setStatuses] = useState<ChainStatus[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<DealCategory>("Alla");
  const [selectedChains, setSelectedChains] = useState<ChainId[]>(ALL_CHAIN_IDS);
  const [minDiscount, setMinDiscount] = useState<MinDiscount>(0);
  const [storesOpen, setStoresOpen] = useState(false);
  const storesMenuRef = useRef<HTMLDivElement>(null);
  const [storeSearch, setStoreSearch] = useState<StoreSearchState>({
    open: false,
    chain: null,
    query: "",
    results: [],
    loading: false,
  });
  const [favorites, setFavorites] = useState<Deal[]>([]);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [section, setSection] = useState<"recipes" | "deals">("recipes");
  const dealsRequestId = useRef(0);

  useEffect(() => {
    setFavorites(readFavoriteDeals());
    setFavoritesReady(true);
  }, []);

  useEffect(() => {
    if (!favoritesReady) return;
    writeFavoriteDeals(favorites);
  }, [favorites, favoritesReady]);

  const favoriteIds = useMemo(() => new Set(favorites.map((deal) => deal.id)), [favorites]);

  const toggleFavorite = useCallback((deal: Deal) => {
    setFavorites((prev) =>
      prev.some((item) => item.id === deal.id)
        ? prev.filter((item) => item.id !== deal.id)
        : [...prev, deal],
    );
  }, []);

  const fetchDeals = useCallback(async (sel: StoreSelection, refresh = false) => {
    const requestId = ++dealsRequestId.current;
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
    if (requestId !== dealsRequestId.current) return;
    setDeals(data.deals);
    setStatuses(data.statuses);
    setFetchedAt(data.fetchedAt);
    setFavorites((prev) => refreshFavoriteDeals(prev, data.deals));
  }, []);

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
    void loadDeals(selection);
  }, [selection, loadDeals]);

  const filteredDeals = useMemo(
    () =>
      filterDeals(deals, search, category, {
        chains: selectedChains,
        minDiscount,
      }),
    [deals, search, category, selectedChains, minDiscount],
  );

  const recipePool = useMemo(
    () =>
      filterDeals(deals, "", "Alla", {
        chains: selectedChains,
        minDiscount,
      }),
    [deals, selectedChains, minDiscount],
  );

  const recipeStoreKey = useMemo(
    () =>
      `${selectedChains.slice().sort().join(",")}|${selectedChains
        .map((chain) => selection[chain] ?? "")
        .join(",")}|${minDiscount}`,
    [selectedChains, selection, minDiscount],
  );

  const storesFiltered = selectedChains.length !== ALL_CHAIN_IDS.length;
  const discountFiltered = minDiscount > 0;
  const filtersActive = storesFiltered || discountFiltered;

  const closeStoresMenu = useCallback(() => {
    setStoresOpen(false);
    setStoreSearch(closedStoreSearch);
  }, []);

  useEffect(() => {
    if (!storesOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!storesMenuRef.current?.contains(event.target as Node)) {
        closeStoresMenu();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (storeSearch.chain) {
        setStoreSearch(closedStoreSearch);
      } else {
        closeStoresMenu();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [storesOpen, storeSearch.chain, closeStoresMenu]);

  const toggleChain = (chain: ChainId) => {
    setSelectedChains((prev) =>
      prev.includes(chain) ? prev.filter((id) => id !== chain) : [...prev, chain],
    );
  };

  const dealCountByChain = useMemo(() => {
    const counts: Partial<Record<ChainId, number>> = {};
    for (const deal of deals) {
      counts[deal.chain] = (counts[deal.chain] ?? 0) + 1;
    }
    return counts;
  }, [deals]);

  const applyNearest = useCallback(async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("nearest failed");
    const data = (await res.json()) as {
      selection: StoreSelection;
      stores: StoreLocation[];
      label?: string;
      locality?: string;
      city?: string;
      lat?: number;
      lng?: number;
    };
    setSelection(data.selection);
    const label =
      shortPlaceName(data) ||
      data.label ||
      data.stores.find((store) => store.city)?.city ||
      data.stores[0]?.city;
    if (label && Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
      setPlace({ label, lat: data.lat!, lng: data.lng! });
    } else if (label) {
      setPlace((prev) => ({
        label,
        lat: prev?.lat ?? 59.3293,
        lng: prev?.lng ?? 18.0686,
      }));
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocating(false);
      setMapOpen(true);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await applyNearest(
            `/api/nearest?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`,
          );
        } catch {
          setMapOpen(true);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setMapOpen(true);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, [applyNearest]);

  useEffect(() => {
    if (!hasSavedStores) requestLocation();
  }, [hasSavedStores, requestLocation]);

  const searchStores = async (chain: ChainId, query: string) => {
    setStoreSearch({ open: true, chain, query, results: [], loading: true });
    try {
      const params = new URLSearchParams({ chain, q: query });
      if (place) {
        params.set("lat", String(place.lat));
        params.set("lng", String(place.lng));
      }
      const res = await fetch(`/api/stores?${params.toString()}`);
      const data = (await res.json()) as { stores: StoreLocation[] };
      setStoreSearch((s) =>
        s.chain === chain && s.query === query
          ? { ...s, results: data.stores ?? [], loading: false }
          : s,
      );
    } catch {
      setStoreSearch((s) =>
        s.chain === chain ? { ...s, results: [], loading: false } : s,
      );
    }
  };

  const openStorePicker = (chain: ChainId) => {
    const query = place?.label ?? "";
    setStoresOpen(true);
    if (query) void searchStores(chain, query);
    else setStoreSearch({ open: true, chain, query: "", results: [], loading: false });
  };

  const confirmMapPlace = async (picked: SavedPlace) => {
    setLocating(true);
    try {
      await applyNearest(`/api/nearest?lat=${picked.lat}&lng=${picked.lng}`);
      setMapOpen(false);
    } catch {
    } finally {
      setLocating(false);
    }
  };

  const persistSelection = (sel: StoreSelection) => {
    void fetch("/api/selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sel),
    });
  };

  const selectStore = (chain: ChainId, store: StoreLocation) => {
    const next = { ...selection, [chain]: store.id };
    setSelection(next);
    persistSelection(next);
    setSelectedChains((prev) => (prev.includes(chain) ? prev : [...prev, chain]));
    setStoreSearch(closedStoreSearch);
  };

  const favoriteGroups = useMemo(() => {
    return CHAINS.map((chain) => {
      const items = favorites
        .filter((deal) => deal.chain === chain.id)
        .sort((a, b) => a.name.localeCompare(b.name, "sv"));
      if (items.length === 0) return null;
      const status = statuses.find((entry) => entry.chain === chain.id);
      return {
        chain,
        storeName: status?.storeName ?? chain.name,
        items,
      };
    }).filter((group): group is FavoriteGroup => group != null);
  }, [favorites, statuses]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Veckans fynd</h1>
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
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="relative shrink-0"
            aria-label="Favoriter"
            aria-haspopup="dialog"
            aria-expanded={favoritesOpen}
            onClick={() => {
              closeStoresMenu();
              setFavoritesOpen(true);
            }}
          >
            <Heart
              className={`h-5 w-5 ${
                favorites.length > 0 ? "fill-primary text-primary" : ""
              }`}
            />
            {favorites.length > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {favorites.length > 99 ? "99+" : favorites.length}
              </span>
            ) : null}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={locating}
            aria-haspopup="dialog"
            aria-expanded={mapOpen}
            onClick={() => {
              if (place || hasSavedStores) setMapOpen(true);
              else requestLocation();
            }}
          >
            {locating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
            <span className="max-w-[10rem] truncate">
              {locating ? "Hittar plats…" : place?.label ?? "Använd min plats"}
            </span>
            {(place || hasSavedStores) && !locating ? (
              <ChevronDown className="h-4 w-4 opacity-60" />
            ) : null}
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative" ref={storesMenuRef}>
            <Button
              type="button"
              variant="outline"
              aria-haspopup="dialog"
              aria-expanded={storesOpen}
              aria-label="Välj butiker"
              className={`min-w-[11.5rem] justify-between font-normal ${
                storesFiltered || storesOpen
                  ? "border-primary ring-2 ring-primary/20"
                  : ""
              }`}
              onClick={() => (storesOpen ? closeStoresMenu() : setStoresOpen(true))}
            >
              <span className="flex items-center gap-2">
                <Store className="h-4 w-4" />
                {storeCountLabel(selectedChains.length)}
              </span>
              <ChevronDown className="h-4 w-4 opacity-60" />
            </Button>
            {storesOpen && (
              <div
                role="dialog"
                aria-label="Butiker"
                className="absolute left-0 z-50 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
              >
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <p className="text-sm font-semibold">
                    {storeCountLabel(selectedChains.length)} valda
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!storesFiltered}
                    onClick={() => setSelectedChains(ALL_CHAIN_IDS)}
                  >
                    Välj alla
                  </Button>
                </div>
                <div className="max-h-[min(32rem,70vh)] space-y-2 overflow-y-auto">
                  {CHAINS.map((chain) => {
                    const selected = selectedChains.includes(chain.id);
                    const status = statuses.find((s) => s.chain === chain.id);
                    const count = dealCountByChain[chain.id] ?? status?.dealCount ?? 0;
                    const picking = storeSearch.chain === chain.id;
                    return (
                      <div
                        key={chain.id}
                        className={`rounded-lg border p-3 transition ${
                          selected ? "bg-background" : "opacity-60"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={selected}
                            aria-label={`${selected ? "Dölj" : "Visa"} ${chain.name}`}
                            className="flex min-w-0 flex-1 items-start gap-3 text-left"
                            onClick={() => toggleChain(chain.id)}
                          >
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-input bg-background"
                              }`}
                            >
                              {selected ? <Check className="h-3.5 w-3.5" /> : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className="flex items-center gap-1.5 font-medium"
                                style={{ color: chain.color }}
                              >
                                {chain.name}
                                {status && !status.ok ? (
                                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                                ) : null}
                              </span>
                              <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                                {status?.storeName ?? "Ingen butik vald"}
                              </span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {count} erbjudanden
                              </span>
                              {status?.error ? (
                                <span className="mt-1 block text-xs text-destructive">
                                  {status.error}
                                </span>
                              ) : null}
                            </span>
                          </button>
                          <Button
                            type="button"
                            variant={picking ? "secondary" : "outline"}
                            size="sm"
                            className="shrink-0"
                            onClick={() =>
                              picking
                                ? setStoreSearch(closedStoreSearch)
                                : openStorePicker(chain.id)
                            }
                          >
                            {picking ? "Stäng" : "Byt butik"}
                          </Button>
                        </div>
                        {picking && (
                          <div className="mt-3 space-y-2 border-t pt-3">
                            <p className="text-xs text-muted-foreground">
                              Sök på stad, område eller butiksnamn
                            </p>
                            <div className="flex gap-2">
                              <Input
                                autoFocus
                                placeholder="t.ex. Fridhemsplan, Göteborg..."
                                value={storeSearch.query}
                                onChange={(e) =>
                                  setStoreSearch((s) => ({
                                    ...s,
                                    query: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void searchStores(chain.id, storeSearch.query);
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                onClick={() =>
                                  void searchStores(chain.id, storeSearch.query)
                                }
                              >
                                Sök
                              </Button>
                            </div>
                            {storeSearch.loading && (
                              <Skeleton className="h-16 w-full" />
                            )}
                            <div className="max-h-48 space-y-1.5 overflow-y-auto">
                              {storeSearch.results.map((store) => (
                                <button
                                  key={`${store.chain}-${store.id}`}
                                  type="button"
                                  className="flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left hover:bg-muted/50"
                                  onClick={() => selectStore(chain.id, store)}
                                >
                                  <span>
                                    <span className="block text-sm font-medium">
                                      {store.name}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                      {[store.address, store.city]
                                        .filter(Boolean)
                                        .join(", ")}
                                    </span>
                                  </span>
                                  {store.distanceKm != null && (
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                      {formatDistance(store.distanceKm)}
                                    </span>
                                  )}
                                </button>
                              ))}
                              {!storeSearch.loading &&
                                storeSearch.results.length === 0 &&
                                storeSearch.query && (
                                  <p className="px-1 text-sm text-muted-foreground">
                                    Inga butiker hittades.
                                  </p>
                                )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <Select
            value={String(minDiscount)}
            onValueChange={(value) => setMinDiscount(Number(value) as MinDiscount)}
            onOpenChange={(open) => {
              if (open) closeStoresMenu();
            }}
          >
            <SelectTrigger
              aria-label="Filtrera rabattnivå"
              className={`w-[11.5rem] ${
                discountFiltered ? "border-primary ring-2 ring-primary/20" : ""
              }`}
            >
              <SelectValue placeholder="Alla rabatter" />
            </SelectTrigger>
            <SelectContent position="popper">
              {DISCOUNT_LEVELS.map((level) => (
                <SelectItem key={level.value} value={String(level.value)}>
                  {discountLevelLabel(level.value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
      </div>

      <Tabs
        value={section}
        onValueChange={(value) => setSection(value as "recipes" | "deals")}
      >
        <TabsList className="grid h-11 w-full grid-cols-2">
          <TabsTrigger value="recipes" className="gap-2">
            <ChefHat className="h-4 w-4" />
            Receptförslag
          </TabsTrigger>
          <TabsTrigger value="deals" className="gap-2">
            <ShoppingBag className="h-4 w-4" />
            Erbjudanden
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recipes" className="mt-4">
          <RecipeIdeas deals={recipePool} dealsLoading={loading} storeKey={recipeStoreKey} />
        </TabsContent>

        <TabsContent value="deals" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Sök vara, t.ex. kyckling"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Sök vara"
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
                <EmptyState
                  search={search}
                  category={category}
                  filtersActive={filtersActive}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredDeals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      favorited={favoriteIds.has(deal.id)}
                      onToggleFavorite={toggleFavorite}
                      storeUrl={storeOffersUrl(deal.chain, selection[deal.chain]) ?? deal.productUrl}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {mapOpen && (
        <LocationPicker
          initialPlace={place}
          applying={locating}
          onClose={() => setMapOpen(false)}
          onConfirm={(picked) => void confirmMapPlace(picked)}
        />
      )}

      {favoritesOpen && (
        <FavoritesPanel
          groups={favoriteGroups}
          selection={selection}
          currentDealIds={new Set(deals.map((deal) => deal.id))}
          onClose={() => setFavoritesOpen(false)}
          onToggleFavorite={toggleFavorite}
        />
      )}
    </div>
  );
}

function FavoriteButton({
  favorited,
  onToggle,
  className = "absolute right-2 top-2 z-10 bg-white/95 shadow-sm ring-1 ring-black/10 hover:bg-white",
}: {
  favorited: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={favorited}
      aria-label={favorited ? "Ta bort från favoriter" : "Spara som favorit"}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-foreground transition ${className}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
    >
      <Heart
        className={`h-5 w-5 ${favorited ? "fill-primary text-primary" : "text-muted-foreground"}`}
      />
    </button>
  );
}

function FavoriteListItem({
  deal,
  storeUrl,
  unavailable,
  onToggleFavorite,
}: {
  deal: Deal;
  storeUrl?: string;
  unavailable: boolean;
  onToggleFavorite: (deal: Deal) => void;
}) {
  const multiBuy = parseMultiBuyOffer(deal.promotionLabel);
  const priceLabel = multiBuy ? formatMultiBuyHero(multiBuy) : formatPrice(deal.price);

  return (
    <article
      className={`flex items-start gap-3 rounded-xl border bg-card p-3 ${
        unavailable ? "opacity-70" : ""
      }`}
    >
      {deal.imageUrl ? (
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={deal.imageUrl}
            alt=""
            className="h-full w-full object-contain p-1"
            loading="lazy"
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium leading-snug">{deal.name}</p>
        {deal.volume ? (
          <p className="text-xs text-muted-foreground">{deal.volume}</p>
        ) : null}
        {deal.variantCount != null && deal.variantCount > 1 ? (
          <p className="text-xs text-muted-foreground">
            {formatVariantCount(deal.variantCount)}
          </p>
        ) : null}
        <p className="text-sm font-semibold">{priceLabel}</p>
        {unavailable ? (
          <p className="text-xs text-muted-foreground">
            Inte i veckans erbjudanden just nu
          </p>
        ) : null}
        {storeUrl ? (
          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Till butiken
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      <FavoriteButton
        favorited
        onToggle={() => onToggleFavorite(deal)}
        className="shrink-0 hover:bg-muted"
      />
    </article>
  );
}

function DealCard({
  deal,
  storeUrl,
  favorited,
  onToggleFavorite,
}: {
  deal: Deal;
  storeUrl?: string;
  favorited: boolean;
  onToggleFavorite: (deal: Deal) => void;
}) {
  const chain = getChainMeta(deal.chain);
  const multiBuy = parseMultiBuyOffer(deal.promotionLabel);
  const hasOriginal = deal.originalPrice != null && deal.originalPrice > deal.price;
  const temporaryLabel = isTemporaryOfferLabel(deal.promotionLabel)
    ? deal.promotionLabel
    : undefined;
  const unknownOriginal = !hasOriginal && !multiBuy;
  const campaignBadge = unknownOriginal ? temporaryLabel : undefined;
  const showPromotionCaption =
    Boolean(deal.promotionLabel) &&
    !multiBuy &&
    deal.promotionLabel !== campaignBadge &&
    !isRedundantPriceLabel(deal.promotionLabel, deal.price);

  return (
    <Card className="relative overflow-hidden">
      <FavoriteButton favorited={favorited} onToggle={() => onToggleFavorite(deal)} />
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
      <CardHeader className={`space-y-2 pb-2 ${deal.imageUrl ? "" : "pr-12"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={chainBadgeClass(deal.chain)} variant="outline">
            {chain.name}
          </Badge>
          {deal.memberOnly && (
            <Badge variant="secondary">Medlemspris</Badge>
          )}
          {deal.savingsPercent != null && deal.savingsPercent > 0 ? (
            <Badge className="bg-emerald-100 text-emerald-800" variant="outline">
              −{deal.savingsPercent}%
            </Badge>
          ) : (
            <Badge className="bg-emerald-100 text-emerald-800" variant="outline">
              −
            </Badge>
          )}
          {campaignBadge && (
            <Badge className="bg-amber-100 text-amber-900 border-amber-200" variant="outline">
              {campaignBadge}
            </Badge>
          )}
        </div>
        <CardTitle className="text-base leading-snug">{deal.name}</CardTitle>
        {(deal.volume || (deal.variantCount != null && deal.variantCount > 1)) && (
          <CardDescription>
            {[deal.volume, deal.variantCount != null && deal.variantCount > 1
              ? formatVariantCount(deal.variantCount)
              : null]
              .filter(Boolean)
              .join(" · ")}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {multiBuy ? (
          <div className="space-y-0.5">
            <p className="text-2xl font-bold leading-tight">
              {formatMultiBuyHero(multiBuy)}
            </p>
            {hasOriginal && (
              <p className="text-sm text-muted-foreground">
                ord. <span className="line-through">{formatCompactSek(deal.originalPrice!)}</span>/st
              </p>
            )}
            {deal.comparisonPrice && (
              <p className="text-xs text-muted-foreground">{deal.comparisonPrice}</p>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold">{formatPrice(deal.price)}</span>
              {hasOriginal ? (
                <span className="text-sm text-muted-foreground line-through">
                  {formatPrice(deal.originalPrice)}
                </span>
              ) : null}
            </div>
            {showPromotionCaption && (
              <p className="text-sm font-medium text-primary">{deal.promotionLabel}</p>
            )}
            {deal.comparisonPrice && (
              <p className="text-xs text-muted-foreground">{deal.comparisonPrice}</p>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{deal.category}</span>
          {storeUrl && (
            <a
              href={storeUrl}
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

function EmptyState({
  search,
  category,
  filtersActive,
}: {
  search: string;
  category: string;
  filtersActive: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center">
      <p className="text-lg font-medium">Inga erbjudanden matchar filtret</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {search
          ? `Inget resultat för "${search}"${category !== "Alla" ? ` i kategorin ${category}` : ""}.`
          : category !== "Alla"
            ? `Inga erbjudanden i kategorin ${category} just nu.`
            : filtersActive
              ? "Prova att visa fler butiker eller sänka rabattnivån."
              : "Prova att uppdatera eller välja en annan butik."}
      </p>
    </div>
  );
}

function FavoritesPanel({
  groups,
  selection,
  currentDealIds,
  onClose,
  onToggleFavorite,
}: {
  groups: FavoriteGroup[];
  selection: StoreSelection;
  currentDealIds: ReadonlySet<string>;
  onClose: () => void;
  onToggleFavorite: (deal: Deal) => void;
}) {
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Favoriter"
        className="flex h-full w-full max-w-lg flex-col bg-background shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 fill-primary text-primary" />
            <div>
              <p className="text-sm font-semibold">Favoriter</p>
              <p className="text-xs text-muted-foreground">
                {count === 0
                  ? "Inga sparade varor"
                  : count === 1
                    ? "1 vara, sorterat på butik"
                    : `${count} varor, sorterat på butik`}
              </p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Stäng">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {groups.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <Heart className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Inga favoriter ännu</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tryck på hjärtat på ett erbjudande för att spara det här.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.chain.id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <h2
                        className="text-sm font-semibold leading-tight"
                        style={{ color: group.chain.color }}
                      >
                        {group.chain.name}
                      </h2>
                      <p className="truncate text-xs text-muted-foreground">
                        {group.storeName}
                      </p>
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {group.items.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map((deal) => (
                      <FavoriteListItem
                        key={deal.id}
                        deal={deal}
                        unavailable={!currentDealIds.has(deal.id)}
                        storeUrl={
                          storeOffersUrl(deal.chain, selection[deal.chain]) ??
                          deal.productUrl
                        }
                        onToggleFavorite={onToggleFavorite}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
