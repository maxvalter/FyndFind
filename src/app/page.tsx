import { DealsApp } from "@/components/deals-app";
import { readStoresCookie } from "@/lib/stores-cookie";
import { cookies } from "next/headers";

export default async function HomePage() {
  const cookieStore = await cookies();
  const hasSavedStores = Boolean(cookieStore.get("fynd-stores")?.value);
  const initialSelection = await readStoresCookie();

  return (
    <main className="min-h-screen bg-background">
      <DealsApp initialSelection={initialSelection} hasSavedStores={hasSavedStores} />
    </main>
  );
}
