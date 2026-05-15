"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Footer } from "./Footer";
import { MobileBottomNav } from "./MobileBottomNav";
import { Sidebar, type ViewKey } from "./Sidebar";
import { StorageBanner } from "./StorageBanner";
import { SyncManager } from "./SyncManager";
import { Topbar } from "./Topbar";

type Props = {
  current: ViewKey;
  onSelect: (key: ViewKey) => void;
  children: React.ReactNode;
};

/** Top-level app chrome: sidebar nav on the left (desktop) or bottom tab
 * bar (mobile), topbar on top, animated content area filling the rest.
 *
 * Layout invariant: the outer container is exactly viewport height
 * (`h-screen`), the main column is the only thing that scrolls. This keeps
 * the sidebar footer (UserMenu) pinned to the bottom and the mobile bottom
 * nav above the keyboard. The animated wrapper keys off `current` so
 * switching nav items produces a soft fade/translate transition. */
export function AppShell({ current, onSelect, children }: Props) {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <SyncManager />
      <Sidebar
        current={current}
        onSelect={onSelect}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <Topbar current={current} />
        <StorageBanner />
        <div className="relative flex flex-1 flex-col overflow-auto">
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
              // Bottom padding on mobile clears the fixed bottom tab bar
              // (h-14 + safe-area). Desktop has the sidebar instead, no
              // bottom obstruction → no extra padding needed.
              className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 lg:py-10"
            >
              {children}
            </motion.div>
          </AnimatePresence>
          {/* Footer sits at the bottom of the scrollable area — scrolls
              with content rather than pinning to the viewport. The
              mobile bottom nav still floats over it via fixed
              positioning. Mobile padding here clears the bottom nav. */}
          <div className="pb-24 md:pb-0">
            <Footer />
          </div>
        </div>
      </main>
      <MobileBottomNav
        current={current}
        onSelect={onSelect}
      />
    </div>
  );
}
