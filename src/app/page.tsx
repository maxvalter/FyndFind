import { DealsApp } from "@/components/deals-app";
import { readPlaceCookie, readStoresCookie } from "@/lib/stores-cookie";
import { cookies } from "next/headers";

export default async function HomePage() {
  const cookieStore = await cookies();
  const hasSavedStores = Boolean(cookieStore.get("fynd-stores")?.value);
  const [initialSelection, initialPlace] = await Promise.all([
    readStoresCookie(),
    readPlaceCookie(),
  ]);

  return (
    <main className="min-h-screen bg-background">
      <DealsApp
        initialSelection={initialSelection}
        hasSavedStores={hasSavedStores}
        initialPlace={initialPlace}
      />
    </main>
  );
}
