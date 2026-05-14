import type { Food } from "@/components/macro/types";

/** Server-side Open Food Facts search used by the AI meal-plan route as a
 * tool. Hits the upstream Search-a-licious endpoint directly (the
 * `/api/off-search` browser proxy adds CORS+cache for clients, neither
 * matters when we're already in a route handler). Returns `Food`-shaped
 * results so the AI route can splice them into the catalog the
 * `aiPlanToMeals` converter searches. */

const OFF_SEARCH_URL = "https://search.openfoodfacts.org/search";
const FIELDS = ["code", "product_name", "brands", "nutriments"].join(",");
const MAX_LIMIT = 10;
const USER_AGENT =
  "macro-calculator/0.1 (https://github.com/hyp3rd/macro-calculator)";

type OFFHit = {
  code?: string;
  product_name?: string;
  brands?: string | string[];
  nutriments?: {
    "energy-kcal_100g"?: number;
    "energy-kcal"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
};

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function firstBrand(brands: string | string[] | undefined): string | undefined {
  if (!brands) return undefined;
  if (Array.isArray(brands)) return brands[0]?.trim() || undefined;
  return brands.split(",")[0]?.trim() || undefined;
}

function hitToFood(h: OFFHit): Food | null {
  const name = (h.product_name ?? "").trim();
  if (!name) return null;
  const n = h.nutriments ?? {};
  const protein = num(n.proteins_100g);
  const carbs = num(n.carbohydrates_100g);
  const fat = num(n.fat_100g);
  const calories = num(n["energy-kcal_100g"]) ?? num(n["energy-kcal"]);
  // Drop anything missing macros — we can't rely on the AI guessing them.
  if (protein === undefined && carbs === undefined && fat === undefined) {
    return null;
  }
  return {
    id: `off:${h.code ?? name}`,
    source: "off",
    name,
    protein: protein ?? 0,
    carbs: carbs ?? 0,
    fat: fat ?? 0,
    calories:
      calories ??
      Math.round((protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9),
    brand: firstBrand(h.brands),
  };
}

/** Search OFF, returning normalized `Food[]`. Caller controls `limit`
 * (clamped to MAX_LIMIT). Errors throw with a message the AI loop can
 * surface back to the model. */
export async function searchOpenFoodFactsServer(
  query: string,
  limit: number = 10,
): Promise<Food[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const upstream = new URL(OFF_SEARCH_URL);
  upstream.searchParams.set("q", trimmed);
  upstream.searchParams.set(
    "page_size",
    String(Math.min(Math.max(1, limit), MAX_LIMIT)),
  );
  upstream.searchParams.set("fields", FIELDS);

  const res = await fetch(upstream.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    // Cache short-lived: subsequent identical AI tool calls within the
    // same plan won't re-hit upstream.
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Open Food Facts search failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { hits?: OFFHit[] };
  const hits = data.hits ?? [];
  return hits.map(hitToFood).filter((f): f is Food => f !== null);
}
