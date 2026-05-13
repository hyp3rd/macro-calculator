"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CONFIG } from "./env";

let cached: SupabaseClient | null = null;

/** Browser-side Supabase client. Returns `null` if env vars are missing
 * (the app runs in guest mode in that case). Callers should null-check
 * before using. */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (!SUPABASE_CONFIG) return null;
  cached ??= createBrowserClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  return cached;
}
