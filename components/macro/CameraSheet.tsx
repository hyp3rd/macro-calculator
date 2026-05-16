"use client";

import { CameraView } from "@/components/capture/CameraView";
import type { Food } from "@/components/macro/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

/** Entry-point dialog opened from AddFoodForm's "Scan barcode" button.
 *  Phase 1: barcode lookup only. The Phase 2 "Take photo" tab and the
 *  Phase 3 "Pair phone" tab will live alongside the current barcode
 *  pane without reshuffling. */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires when a Food has been resolved (via OFF barcode lookup).
   *  The parent (AddFoodForm via macro-calculator) should pipe it
   *  through `handleFoodSelect` exactly like a typed-search pick. */
  onFoodPicked: (food: Food) => void;
};

type Phase =
  | { kind: "scan" }
  | { kind: "looking-up"; code: string }
  | { kind: "error"; message: string };

export function CameraSheet({ open, onOpenChange, onFoodPicked }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-lg">
        {open && (
          <CameraSheetBody
            onPicked={(food) => {
              onFoodPicked(food);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CameraSheetBody({ onPicked }: { onPicked: (food: Food) => void }) {
  // `key` cycles when the user clicks "Scan again" so CameraView
  // remounts cleanly (re-acquires camera, restarts the detect loop).
  const [resetKey, setResetKey] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "scan" });

  async function lookup(code: string) {
    setPhase({ kind: "looking-up", code });
    try {
      const res = await fetch(`/api/off-barcode/${encodeURIComponent(code)}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Lookup failed (HTTP ${res.status})`);
      }
      const data = (await res.json()) as { food?: Food };
      if (!data.food) throw new Error("OFF returned no food.");
      onPicked(data.food);
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Lookup failed.",
      });
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Scan barcode</DialogTitle>
        <DialogDescription>
          Point your camera at a packaged-food barcode. The product&apos;s
          per-100g macros come from Open Food Facts.
        </DialogDescription>
      </DialogHeader>

      <div className="py-2">
        {phase.kind === "scan" && (
          <CameraView
            key={resetKey}
            onBarcode={lookup}
            onManualBarcode={lookup}
          />
        )}

        {phase.kind === "looking-up" && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Looking up {phase.code}…</span>
          </div>
        )}

        {phase.kind === "error" && (
          <div className="space-y-3 py-4">
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>{phase.message}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setPhase({ kind: "scan" });
                setResetKey((k) => k + 1);
              }}
            >
              Scan again
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
