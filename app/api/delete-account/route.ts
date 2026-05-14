import { getSupabaseSecretConfig } from "@/lib/supabase/env";
import { getSupabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Permanently deletes the calling user's `auth.users` row, which cascades
 * to every app table via `ON DELETE CASCADE`. Two clients are involved:
 *
 *  - the cookie-bound server client (publishable key) identifies *which*
 *    user is calling, so we can never delete someone else by accident,
 *  - a short-lived admin client (service-role key) actually issues the
 *    delete because `auth.admin.deleteUser` requires a privileged key.
 *
 * If the service-role key isn't configured the route responds 503 so the
 * UI can surface that gracefully rather than appearing broken. */
export async function POST(): Promise<NextResponse> {
  const cookieClient = await getSupabaseServer();
  if (!cookieClient) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await cookieClient.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const secret = getSupabaseSecretConfig();
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Account deletion is not configured on this deployment (SUPABASE_SECRET_KEY missing).",
      },
      { status: 503 },
    );
  }

  const admin = createClient(secret.url, secret.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
