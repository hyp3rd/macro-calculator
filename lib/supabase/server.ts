import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CONFIG } from "./env";

/** Server-side Supabase client for use inside Server Components and Route
 * Handlers. Reads + writes auth cookies via the Next.js cookie store so
 * sessions survive across requests. Returns `null` if env is missing. */
export async function getSupabaseServer(): Promise<SupabaseClient | null> {
  if (!SUPABASE_CONFIG) return null;
  const cookieStore = await cookies();
  return createServerClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.publishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Calling cookies().set in a Server Component throws — the
            // proxy.ts refreshes the session, so the failure here is
            // expected and harmless.
          }
        },
      },
    },
  );
}
