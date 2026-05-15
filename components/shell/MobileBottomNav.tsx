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
import type { ViewKey } from "./Sidebar";

type NavItem = {
  key: ViewKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: NavItem[] = [
  { key: "calculator", label: "Calc", icon: Calculator },
  { key: "plan", label: "Plan", icon: Utensils },
  { key: "progress", label: "Progress", icon: LineChart },
  { key: "foods", label: "Foods", icon: Activity },
  { key: "recipes", label: "Recipes", icon: ChefHat },
  { key: "settings", label: "Settings", icon: Settings },
];

type Props = { current: ViewKey; onSelect: (key: ViewKey) => void };

/** Mobile-only bottom tab bar. Mirrors the desktop sidebar nav so users
 * on small screens can still navigate. Pinned to the viewport bottom with
 * a backdrop so it stays out of the content scroll. The `pb-[…safe-area]`
 * trick keeps it clear of the iOS home-indicator notch. */
export function MobileBottomNav({ current, onSelect }: Props) {
  return (
    <nav
      aria-label="Primary navigation (mobile)"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-border/60 bg-background/95 backdrop-blur",
        "md:hidden",
        // Respect iOS safe-area inset on devices with a home indicator.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {NAV.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === current;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {isActive && (
              <motion.span
                layoutId="mobile-nav-active"
                className="absolute inset-x-3 top-0 h-0.5 rounded-b bg-foreground"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Icon className="h-5 w-5" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
