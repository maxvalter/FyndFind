# Veckans fynd

Veckans fynd samlar veckans butikserbjudanden från **Willys**, **Hemköp**, **ICA**, **Coop** och **Lidl** på ett ställe. Appen hämtar data direkt från kedjornas publika API:er och webbsidor — ingen databas, ingen inloggning.

## Kom igång

```bash
npm install
npm run dev
```

Öppna [http://127.0.0.1:4371](http://127.0.0.1:4371).

Första laddningen kan ta **10–20 sekunder** eftersom erbjudanden hämtas live från fem kedjor parallellt.

## Funktioner

- **Geolocation vid första besök** — hittar närmaste butik per kedja och sparar valet i cookien `fynd-stores` (180 dagar).
- **Återbesök** — cookien läses server-side, ingen platsprompt.
- **Manuellt val** — klicka på en kedjekort för att söka och byta butik, eller använd **Använd min plats**.
- **Sök och filter** — fritextsökning och kategoriflikar (Kött & chark, Mejeri & ost, m.fl.).
- **Middagstips** — slumpar ett kött och grönsaker från aktuella erbjudanden och föreslår 1–3 billiga rätter med länk till ICA:s receptsök.
- **Uppdatera** — tvingar bort cache (`refresh=1`).

## API

### `GET /api/deals`

Hämtar aggregerade erbjudanden.

| Parameter | Beskrivning |
|-----------|-------------|
| `willys`, `hemkop`, `ica`, `coop`, `lidl` | Butiks-ID per kedja |
| `refresh=1` | Hoppar över cache |

**Svar:** `{ deals, statuses, fetchedAt, fromCache }`

### `POST /api/recipes`

Tar ett valt protein och grönsaker och returnerar 1–3 rättnamn med ICA-söklänkar. Kräver `LLM_API_KEY`.

**Kropp:** `{ protein, vegetables }` där varje vara har `id`, `name`, `chain`, `price`.

**Svar:** `{ dishes: [{ title, whyCheap, extraIngredients, recipeUrl }], fromCache }`

**Standardbutiker** om inga anges:

| Kedja | ID |
|-------|-----|
| Willys | `2258` |
| Hemköp | `4147` |
| ICA | `ica-nara-roslagstull-1003482` |
| Coop | `coop/coop-soder` |
| Lidl | `SE0335` |

### `GET /api/stores?chain=willys&q=fridhemsplan`

Söker butiker inom en kedja.

### `GET /api/nearest?lat=59.33&lng=18.07`

Hittar närmaste butik per kedja och sätter `fynd-stores`-cookien.

## Datakällor

| Kedja | Källa |
|-------|--------|
| Willys / Hemköp | Axfood butikskatalog + `/search/campaigns/offline` |
| ICA | Butikssök (`/api/store/search`) + veckans erbjudanden inbäddade i `/erbjudanden/{slug}/` |
| Coop | Coop Store API + DKE `/dke/offers/sorting-groups/{ledgerAccountNumber}` |
| Lidl | Lidl Plus butikskatalog (`stores.lidlplus.com`) + veckans reklamblad (`digital-leaflet.lidlplus.com`) |

Scrapers körs parallellt med felisolering — en kedja som fallerar stoppar inte de andra.

## Projektstruktur

```
src/
  app/              Next.js App Router + API routes
  components/       deals-app.tsx + shadcn/ui
  lib/
    scrapers/       En modul per kedja + index.ts
    cache.ts        30-minuters in-memory cache
    categories.ts   Nyckelordskategorisering
    chains.ts       Kedjemetadata
    types.ts        Delade typer
```

## Teknik

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4, shadcn/ui, lucide-react
- Dev-server på port **4371**

## Receptförslag (LLM)

Sätt miljövariabler i `.env.local`. OpenAI-nycklar (`sk-…`) använder standard-URL:en — kopiera inte Groq-raderna då.

```bash
LLM_API_KEY=sk-...
```

Groq (valfritt, bara med Groq-nyckel):

```bash
LLM_API_KEY=gsk_...
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile
```

Utan nyckel visas fortfarande de slumpade varorna, med en manuell ICA-söklänk.

## Pusha till GitHub

```bash
git init
gh repo create veckans-fynd --private --source=. --remote=origin --push
```
