import { generateShareSlug } from "@/lib/share-slug";
import { getSupabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Mint a share slug for a recipe the caller owns. Idempotent: if the
 *  recipe is already shared, the existing slug is returned without
 *  minting a new one — re-clicking "Share" gives the user the same URL
 *  so they don't fragment the share with multiple slugs.
 *
 *  Auth-gated. Owner-only via the existing `recipes_owner_all` RLS
 *  policy — a non-owner's UPDATE returns 0 rows and we 404 below. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing recipe id." }, { status: 400 });
  }

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Check if already shared (idempotent path). RLS restricts the SELECT
  // to the caller's own recipes, so a missing row here means
  // not-owned-or-not-found.
  const { data: existing, error: getError } = await supabase
    .from("recipes")
    .select("id, share_slug")
    .eq("id", id)
    .maybeSingle();
  if (getError) {
    return NextResponse.json({ error: getError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }
  if (existing.share_slug) {
    return NextResponse.json({ slug: existing.share_slug });
  }

  // Mint a slug. The `share_slug` column is UNIQUE; on the (vanishingly
  // unlikely) collision the UPDATE returns a unique-violation and we
  // retry with a fresh slug. 5 attempts is generous — a real collision
  // means the alphabet space is exhausted, which won't happen at
  // realistic scale.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateShareSlug();
    const { data: updated, error: updateError } = await supabase
      .from("recipes")
      .update({ share_slug: slug })
      .eq("id", id)
      .select("share_slug")
      .maybeSingle();
    if (!updateError && updated?.share_slug) {
      return NextResponse.json({ slug: updated.share_slug });
    }
    // 23505 = unique_violation in Postgres. Anything else is fatal.
    if (updateError && updateError.code !== "23505") {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }
  return NextResponse.json(
    { error: "Failed to mint a unique share slug." },
    { status: 500 },
  );
}

/** Revoke a recipe's share. Owner-only via RLS. The page at
 *  `/r/<slug>` will 404 immediately after this returns. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing recipe id." }, { status: 400 });
  }

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { error } = await supabase
    .from("recipes")
    .update({ share_slug: null })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
