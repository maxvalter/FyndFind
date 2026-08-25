"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

const STOCKHOLM = { lat: 59.3293, lng: 18.0686 };

function leafletFrom(mod: typeof import("leaflet") & { default?: typeof import("leaflet") }) {
  return mod.default ?? mod;
}

export function LocationMap({
  center,
  marker,
  onPick,
}: {
  center: { lat: number; lng: number };
  marker: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  const [ready, setReady] = useState(false);
  onPickRef.current = onPick;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    void import("leaflet").then((mod) => {
      if (cancelled || !containerRef.current) return;
      const L = leafletFrom(mod);
      const start = Number.isFinite(center.lat) ? center : STOCKHOLM;
      const map = L.map(containerRef.current, {
        center: [start.lat, start.lng],
        zoom: 13,
        scrollWheelZoom: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      map.on("click", (event) => {
        onPickRef.current(event.latlng.lat, event.latlng.lng);
      });
      mapRef.current = map;
      setReady(true);
      window.setTimeout(() => map.invalidateSize(), 80);
    });

    return () => {
      cancelled = true;
      setReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Map is created once; later center updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
    map.setView([center.lat, center.lng], Math.max(map.getZoom(), 13));
  }, [ready, center.lat, center.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    void import("leaflet").then((mod) => {
      if (!mapRef.current) return;
      const L = leafletFrom(mod);
      if (!marker) {
        markerRef.current?.remove();
        markerRef.current = null;
        return;
      }
      if (markerRef.current) {
        markerRef.current.setLatLng([marker.lat, marker.lng]);
        return;
      }
      const icon = L.divIcon({
        className: "fynd-map-pin",
        html: `<span class="fynd-map-pin-mark"></span>`,
        iconSize: [28, 40],
        iconAnchor: [14, 38],
      });
      markerRef.current = L.marker([marker.lat, marker.lng], { icon, keyboard: false }).addTo(
        mapRef.current,
      );
    });
  }, [ready, marker?.lat, marker?.lng, marker]);

  return <div ref={containerRef} className="h-full w-full" />;
}
