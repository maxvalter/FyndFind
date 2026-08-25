"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SavedPlace } from "@/lib/types";
import { shortPlaceName } from "@/lib/utils-app";
import { Loader2, MapPin, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

const LocationMap = dynamic(
  () => import("./location-map").then((mod) => ({ default: mod.LocationMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Laddar karta…
      </div>
    ),
  },
);

interface LocationPickerProps {
  initialPlace: SavedPlace | null;
  applying: boolean;
  onClose: () => void;
  onConfirm: (place: SavedPlace) => void;
}

export function LocationPicker({
  initialPlace,
  applying,
  onClose,
  onConfirm,
}: LocationPickerProps) {
  const [query, setQuery] = useState("");
  const [center, setCenter] = useState(
    initialPlace ?? { lat: 59.3293, lng: 18.0686 },
  );
  const [marker, setMarker] = useState<SavedPlace | null>(initialPlace);
  const [lookingUp, setLookingUp] = useState(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");

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

  const lookupPoint = useCallback(async (lat: number, lng: number) => {
    setLookingUp(true);
    setNote("");
    setCenter({ lat, lng });
    setMarker((prev) => ({ label: prev?.label || "Vald plats", lat, lng }));
    try {
      const res = await fetch(`/api/place?lat=${lat}&lng=${lng}`);
      const data = (await res.json()) as {
        label?: string;
        locality?: string;
        city?: string;
        lat?: number;
        lng?: number;
      };
      const label = shortPlaceName(data) || data.label || "Vald plats";
      setMarker({ label, lat, lng });
    } catch {
      setMarker({ label: "Vald plats", lat, lng });
      setNote("Kunde inte namnge platsen, men du kan välja den ändå.");
    } finally {
      setLookingUp(false);
    }
  }, []);

  const searchPlace = async () => {
    const q = query.trim();
    if (!q) return;
    setLookingUp(true);
    setNote("");
    try {
      const res = await fetch(`/api/place?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setNote(`Kunde inte hitta “${q}”. Prova ett annat område.`);
        return;
      }
      const data = (await res.json()) as {
        label?: string;
        locality?: string;
        city?: string;
        lat: number;
        lng: number;
      };
      const label = shortPlaceName(data) || data.label || q;
      setMarker({ label, lat: data.lat, lng: data.lng });
      setCenter({ lat: data.lat, lng: data.lng });
    } catch {
      setNote(`Kunde inte hitta “${q}”. Prova ett annat område.`);
    } finally {
      setLookingUp(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setNote("Platstjänster saknas i webbläsaren. Sök eller klicka på kartan.");
      return;
    }
    setLocating(true);
    setNote("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void lookupPoint(pos.coords.latitude, pos.coords.longitude).finally(() => {
          setLocating(false);
        });
      },
      () => {
        setNote("Plats nekad. Sök eller klicka på kartan istället.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  const busy = lookingUp || locating || applying;
  const canConfirm = Boolean(marker) && !busy;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Välj plats"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border bg-background shadow-xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Välj plats</p>
            <p className="text-xs text-muted-foreground">
              Sök ett område eller klicka på kartan
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Stäng">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form
          className="flex gap-2 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            void searchPlace();
          }}
        >
          <Input
            placeholder="Område, t.ex. Älvsjö"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Sök område"
          />
          <Button type="submit" variant="outline" disabled={busy || !query.trim()}>
            Sök
          </Button>
        </form>

        <div className="relative mx-4 mb-3 h-72 overflow-hidden rounded-lg border sm:h-80" aria-hidden="true">
          <LocationMap center={center} marker={marker} onPick={(lat, lng) => void lookupPoint(lat, lng)} />
        </div>

        <div className="space-y-3 px-4 pb-4">
          <div className="flex min-h-5 items-center gap-2 text-sm">
            {(lookingUp || locating) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <MapPin className="h-4 w-4 text-primary" />
            <span className="font-medium">
              {marker?.label || (lookingUp || locating ? "Hittar plats…" : "Ingen plats vald")}
            </span>
          </div>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={useMyLocation} disabled={busy}>
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              Använd min plats
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} disabled={applying}>
              Avbryt
            </Button>
            <Button
              type="button"
              disabled={!canConfirm}
              onClick={() => marker && onConfirm(marker)}
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Välj plats
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
