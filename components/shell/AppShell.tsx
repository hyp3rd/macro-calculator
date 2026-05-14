"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sidebar, type ViewKey } from "./Sidebar";
import { StorageBanner } from "./StorageBanner";
import { SyncManager } from "./SyncManager";
import { Topbar } from "./Topbar";

type Props = {
  current: ViewKey;
  onSelect: (key: ViewKey) => void;
  children: React.ReactNode;
};

/** Top-level app chrome: sidebar nav on the left, topbar on top, animated
 * content area filling the rest. The animated wrapper keys off `current` so
 * switching sidebar items produces a soft fade/translate transition. */
export function AppShell({ current, onSelect, children }: Props) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <SyncManager />
      <Sidebar
        current={current}
        onSelect={onSelect}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <Topbar current={current} />
        <StorageBanner />
        <div className="relative flex-1 overflow-auto">
          <AnimatePresence
            mode="wait"
            initial={false}
          >
            <motion.div
              key={current}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="mx-auto w-full max-w-6xl px-6 py-8 lg:py-10"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
