"use client";

import type { ViewKey } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";

const LABELS: Record<ViewKey, string> = {
  calculator: "Calculator",
  plan: "Meal Plan",
  progress: "Progress",
  foods: "My Foods",
  settings: "Settings",
};

type Props = { current: ViewKey };

export function Topbar({ current }: Props) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-6 backdrop-blur-sm">
      <h1 className="text-sm font-semibold tracking-tight text-foreground">
        {LABELS[current]}
      </h1>
      <div className="flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  );
}
