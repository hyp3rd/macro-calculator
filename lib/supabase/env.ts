/** Centralised access to the Supabase env vars. We export `SUPABASE_CONFIG`
 * as `null` when the env vars are missing — that's "guest mode" and the
 * rest of the app treats it as "you're not signed in and never can be in
 * this session". The auth UI surfaces a clear "Supabase not configured"
 * message rather than crashing at runtime. */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const SUPABASE_CONFIG = url && anonKey ? { url, anonKey } : null;

export function isSupabaseConfigured(): boolean {
  return SUPABASE_CONFIG !== null;
}
