import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_CONFIG } from "./env";

/** Refreshes the auth session cookie on every request so it stays valid.
 * Returns a `NextResponse` that has the latest cookies attached — the
 * middleware should return this (or a response built from it). */
export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  // Always pass the request through; if Supabase isn't configured the
  // app runs in guest mode and there's nothing to refresh.
  let supabaseResponse = NextResponse.next({ request });

  if (!SUPABASE_CONFIG) return supabaseResponse;

  const supabase = createServerClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          for (const { name, value } of toSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of toSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touching `getUser()` triggers the SDK to refresh and re-issue cookies
  // when the access token is near expiry. We discard the result; the auth
  // state is read elsewhere via the browser client or server client.
  await supabase.auth.getUser();

  return supabaseResponse;
}
