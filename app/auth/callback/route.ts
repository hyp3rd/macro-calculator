import { getSupabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Magic-link landing route. Supabase appends `?code=…` to the redirect
 * URL when the user clicks the email link; this exchanges the code for a
 * session cookie, then sends the user to the app. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing-code", url));
  }

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return NextResponse.redirect(new URL("/login?error=not-configured", url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url),
    );
  }

  return NextResponse.redirect(new URL(next, url));
}
