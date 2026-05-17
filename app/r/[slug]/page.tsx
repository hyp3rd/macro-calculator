import type { RecipeIngredient } from "@/components/macro/types";
import { isValidShareSlug } from "@/lib/share-slug";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecipePageActions } from "./RecipePageActions";

/** Public recipe view at `/r/<slug>`. Anyone with the URL can view —
 *  the `recipes_public_read_shared` RLS policy (migration 0009) opens
 *  a read window for rows where share_slug IS NOT NULL. Server-
 *  rendered so the page works without JS and is print-friendly out of
 *  the box.
 *
 *  Signed-in visitors get an "Import to my recipes" button that posts
 *  to `/api/recipes/import/[slug]` and inserts a fresh copy owned by
 *  them. Signed-out visitors get a "Sign in to import" link. Both
 *  variants live in [RecipePageActions.tsx](./RecipePageActions.tsx)
 *  because they need client state (auth) and we want the page shell
 *  itself to stay a Server Component. */

type SharedRecipe = {
  name: string;
  ingredients: RecipeIngredient[];
  cuisine: string | null;
  notes: string | null;
};

async function fetchShared(slug: string): Promise<SharedRecipe | null> {
  if (!isValidShareSlug(slug)) return null;
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("recipes")
    .select("name, ingredients, cuisine, notes")
    .eq("share_slug", slug)
    .maybeSingle();
  return (data as SharedRecipe) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const recipe = await fetchShared(slug);
  if (!recipe) {
    return { title: "Recipe not found — Maqro" };
  }
  return {
    title: `${recipe.name} — Maqro`,
    description: recipe.cuisine
      ? `${recipe.name} (${recipe.cuisine}) — shared recipe with macros.`
      : `${recipe.name} — shared recipe with macros.`,
  };
}

export default async function PublicRecipePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const recipe = await fetchShared(slug);
  if (!recipe) {
    notFound();
  }

  const totals = recipe.ingredients.reduce(
    (acc, ing) => {
      const ratio = ing.portionGrams / 100;
      return {
        protein: acc.protein + ing.macrosPer100g.protein * ratio,
        carbs: acc.carbs + ing.macrosPer100g.carbs * ratio,
        fat: acc.fat + ing.macrosPer100g.fat * ratio,
        calories: acc.calories + ing.macrosPer100g.calories * ratio,
      };
    },
    { protein: 0, carbs: 0, fat: 0, calories: 0 },
  );
  const totalGrams = recipe.ingredients.reduce(
    (a, ing) => a + ing.portionGrams,
    0,
  );

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-10 print:py-4">
      {/* Topbar — hidden on print. */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to app
        </Link>
        <RecipePageActions slug={slug} />
      </div>

      <header className="mt-6 print:mt-0">
        <h1 className="text-3xl font-semibold tracking-tight">{recipe.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {recipe.cuisine && (
            <span className="rounded bg-muted px-2 py-0.5 font-medium text-foreground">
              {recipe.cuisine}
            </span>
          )}
          <span>
            {recipe.ingredients.length} ingredient
            {recipe.ingredients.length === 1 ? "" : "s"}
          </span>
          {totalGrams > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{Math.round(totalGrams)} g total</span>
            </>
          )}
        </div>
      </header>

      <section className="mt-6 rounded-lg border border-border/60 bg-card p-4 print:border-foreground/30">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Macros (full recipe)
        </h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 font-mono tabular-nums sm:grid-cols-4">
          <MacroCell
            label="Calories"
            value={`${Math.round(totals.calories)} kcal`}
          />
          <MacroCell
            label="Protein"
            value={`${totals.protein.toFixed(1)} g`}
            cssVar="--macro-protein"
          />
          <MacroCell
            label="Carbs"
            value={`${totals.carbs.toFixed(1)} g`}
            cssVar="--macro-carbs"
          />
          <MacroCell
            label="Fat"
            value={`${totals.fat.toFixed(1)} g`}
            cssVar="--macro-fat"
          />
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold tracking-tight">
          Ingredients
        </h2>
        <ul className="divide-y divide-border/60 rounded-md border border-border/60 bg-card print:border-foreground/30">
          {recipe.ingredients.map((ing, idx) => {
            const ratio = ing.portionGrams / 100;
            return (
              <li
                key={`${ing.foodName}-${idx}`}
                className="flex items-baseline gap-3 px-4 py-3"
              >
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {ing.foodName}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {ing.portionGrams} g
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {Math.round(ing.macrosPer100g.calories * ratio)} kcal · P
                  {(ing.macrosPer100g.protein * ratio).toFixed(1)} · C
                  {(ing.macrosPer100g.carbs * ratio).toFixed(1)} · F
                  {(ing.macrosPer100g.fat * ratio).toFixed(1)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {recipe.notes && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold tracking-tight">Notes</h2>
          <p className="whitespace-pre-line rounded-md border border-border/60 bg-card px-4 py-3 text-sm leading-relaxed text-foreground print:border-foreground/30">
            {recipe.notes}
          </p>
        </section>
      )}

      <footer className="mt-10 border-t border-border/60 pt-4 text-[11px] text-muted-foreground print:mt-6 print:border-foreground/30">
        Shared via{" "}
        <Link
          href="/"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Maqro
        </Link>
        . Macros are estimates — verify against actual product labels.
      </footer>
    </div>
  );
}

function MacroCell({
  label,
  value,
  cssVar,
}: {
  label: string;
  value: string;
  cssVar?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className="text-lg font-semibold text-foreground"
        style={cssVar ? { color: `hsl(var(${cssVar}))` } : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
