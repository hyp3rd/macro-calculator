"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUser } from "@/hooks/use-user";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { LogIn, LogOut } from "lucide-react";
import Link from "next/link";

/** Sidebar footer chip. Three states:
 *   - Loading: muted "…" placeholder while the auth client resolves.
 *   - Signed out (or unconfigured): "Sign in" link to /login.
 *   - Signed in: avatar + email + dropdown with Sign out. */
export function UserMenu() {
  const { user, isLoaded, isUnconfigured } = useUser();

  if (!isLoaded) {
    return (
      <div className="flex h-9 items-center gap-2.5 rounded-md px-2.5">
        <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
        <div className="h-2 w-16 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        title={
          isUnconfigured
            ? "Supabase not configured — see README"
            : "Sign in for multi-device sync"
        }
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
          <LogIn className="h-3 w-3" />
        </div>
        <span className="flex-1 text-left">
          {isUnconfigured ? "Guest" : "Sign in"}
        </span>
      </Link>
    );
  }

  const email = user.email ?? "Signed in";
  const initial = (user.email?.[0] ?? "?").toUpperCase();

  async function signOut() {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[11px] font-medium text-background">
            {initial}
          </div>
          <span className="flex-1 truncate text-left">{email}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        className="w-56"
      >
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={signOut}
          className="gap-2"
        >
          <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
