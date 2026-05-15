"use client";

import { cn } from "@/lib/utils";
import * as React from "react";
import {
  Activity,
  Calculator,
  ChefHat,
  LineChart,
  Settings,
  Utensils,
} from "lucide-react";
import { motion } from "motion/react";
import { UserMenu } from "./UserMenu";

export type ViewKey =
  | "calculator"
  | "plan"
  | "progress"
  | "foods"
  | "recipes"
  | "settings";

type NavItem = {
  key: ViewKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

const NAV: NavItem[] = [
  { key: "calculator", label: "Calculator", icon: Calculator },
  { key: "plan", label: "Meal Plan", icon: Utensils },
  { key: "progress", label: "Progress", icon: LineChart },
  { key: "foods", label: "My Foods", icon: Activity },
  { key: "recipes", label: "Recipes", icon: ChefHat },
  { key: "settings", label: "Settings", icon: Settings },
];

type Props = { current: ViewKey; onSelect: (key: ViewKey) => void };

export function Sidebar({ current, onSelect }: Props) {
  return (
    <aside
      aria-label="Primary navigation"
      // h-full + overflow-hidden + flex-col makes the inner <nav> the only
      // scrolling area, so the footer (UserMenu) stays pinned to the bottom
      // even with a long nav list. Parent (AppShell) is h-screen so this
      // resolves to viewport height.
      className="hidden h-full overflow-hidden md:flex md:w-60 md:flex-col md:border-r md:border-border/60 md:bg-background"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-5">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground text-background">
          <span className="text-[10px] font-bold leading-none">μ</span>
        </div>
        <span className="text-sm font-semibold tracking-tight">Maqro</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === current;
          const isDisabled = !!item.badge;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => !isDisabled && onSelect(item.key)}
              disabled={isDisabled}
              className={cn(
                "relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                isDisabled
                  ? "cursor-not-allowed text-muted-foreground/60"
                  : isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && !isDisabled && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-md bg-accent"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <Icon className="relative h-4 w-4 shrink-0" />
              <span className="relative flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className="relative rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border/60 p-2">
        <UserMenu />
      </div>
    </aside>
  );
}
