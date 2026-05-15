"use client";

import type { ViewKey } from "./Sidebar";
import { SyncStatusPill } from "./SyncStatusPill";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

const LABELS: Record<ViewKey, string> = {
  calculator: "Calculator",
  plan: "Meal Plan",
  progress: "Progress",
  foods: "My Foods",
  recipes: "Recipes",
  settings: "Settings",
};

type Props = { current: ViewKey };

export function Topbar({ current }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-sm sm:px-6">
      <h1 className="text-sm font-semibold tracking-tight text-foreground">
        {LABELS[current]}
      </h1>
      <div className="flex items-center gap-3">
        <SyncStatusPill />
        <ThemeToggle />
        {/* The UserMenu lives in the desktop sidebar footer; mirror it in
            the topbar on mobile so sign-out / display-name stay reachable
            without scrolling around for them. */}
        <div className="md:hidden">
          <UserMenu compact />
        </div>
      </div>
    </header>
  );
}
