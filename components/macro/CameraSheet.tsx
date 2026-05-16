"use client";

import type { ResolvedMealPhoto } from "@/app/api/identify-meal/route";
import { CameraView } from "@/components/capture/CameraView";
import type { DietPreference, Food } from "@/components/macro/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listCustomFoods } from "@/lib/db";
import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

/** Entry-point dialog opened from AddFoodForm's "Camera" button.
 *  Phase 1: barcode lookup. Phase 2: meal photo → AI identification.
 *  Phase 3 (deferred): laptop pairing tab. */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether AI identification is wired (env + auth). When false, the
   *  Photo tab is hidden so the user isn't presented with a button
   *  that 503s. The barcode path always works (no AI). */
  aiAvailable: boolean;
  /** Profile's diet preference — sent to /api/identify-meal so the
   *  seed catalog the AI sees matches the user's universe. */
  dietPreference?: DietPreference;
  /** Show a "Pair phone" footer link that lets the user delegate the
   *  capture to their phone. Only visible on desktop — on mobile it
   *  makes no sense (the camera *is* the phone). */
  pairPhoneAvailable: boolean;
  /** Fires when a Food has been resolved (via OFF barcode lookup).
   *  The parent should pipe it through `handleFoodSelect`. */
  onFoodPicked: (food: Food) => void;
  /** Fires after the AI returns a resolved meal-photo identification.
   *  The parent owns opening MealPhotoReviewDialog with this result. */
  onMealPhotoResolved: (result: ResolvedMealPhoto) => void;
  /** Called when the user clicks the "Pair phone" link. The parent
   *  closes this sheet and opens PairPhoneDialog. */
  onSwitchToPairPhone: () => void;
};

type Phase =
  | { kind: "capture" }
  | { kind: "looking-up"; code: string }
  | { kind: "identifying" }
  | { kind: "error"; message: string };

export function CameraSheet({
  open,
  onOpenChange,
  aiAvailable,
  dietPreference,
  pairPhoneAvailable,
  onFoodPicked,
  onMealPhotoResolved,
  onSwitchToPairPhone,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-lg">
        {open && (
          <CameraSheetBody
            aiAvailable={aiAvailable}
            dietPreference={dietPreference}
            pairPhoneAvailable={pairPhoneAvailable}
            onPicked={(food) => {
              onFoodPicked(food);
              onOpenChange(false);
            }}
            onMealPhotoResolved={(result) => {
              onMealPhotoResolved(result);
              onOpenChange(false);
            }}
            onSwitchToPairPhone={() => {
              onSwitchToPairPhone();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CameraSheetBody({
  aiAvailable,
  dietPreference,
  pairPhoneAvailable,
  onPicked,
  onMealPhotoResolved,
  onSwitchToPairPhone,
}: {
  aiAvailable: boolean;
  dietPreference?: DietPreference;
  pairPhoneAvailable: boolean;
  onPicked: (food: Food) => void;
  onMealPhotoResolved: (result: ResolvedMealPhoto) => void;
  onSwitchToPairPhone: () => void;
}) {
  // `resetKey` cycles when the user clicks "Try again" so CameraView
  // remounts cleanly (re-acquires camera, restarts the detect loop).
  const [resetKey, setResetKey] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "capture" });

  // Build the modes array based on whether AI is available. Without
  // AI the user still gets the full barcode flow — the Photo tab is
  // simply absent.
  const modes: Array<"scan" | "photo"> = aiAvailable
    ? ["scan", "photo"]
    : ["scan"];

  async function lookupBarcode(code: string) {
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

  async function identifyMeal(blob: Blob) {
    setPhase({ kind: "identifying" });
    try {
      const base64 = await blobToBase64(blob);
      // Load custom foods at call time so the AI's seed catalog matches
      // what the user has saved — matches GenerateRecipeDialog's pattern
      // and keeps macro-calculator from plumbing the list through.
      const customs = await listCustomFoods().catch(() => []);
      const res = await fetch("/api/identify-meal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          mediaType: "image/jpeg",
          dietPreference,
          customFoods: customs.map((c) => ({
            name: c.name,
            protein: c.protein,
            carbs: c.carbs,
            fat: c.fat,
            calories: c.calories,
            category: c.category,
            subCategory: c.subCategory,
            brand: c.brand,
            dietKind: c.dietKind,
          })),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          data.error ?? `Identification failed (HTTP ${res.status})`,
        );
      }
      const result = (await res.json()) as ResolvedMealPhoto;
      if (result.foods.length === 0 && result.unmatched.length === 0) {
        throw new Error("No foods identified in the photo.");
      }
      onMealPhotoResolved(result);
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Identification failed.",
      });
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Camera</DialogTitle>
        <DialogDescription>
          {aiAvailable
            ? "Scan a barcode or take a photo of a meal — the AI estimates portions, you confirm before adding."
            : "Scan a packaged-food barcode. Per-100g macros come from Open Food Facts."}
        </DialogDescription>
      </DialogHeader>

      <div className="py-2">
        {phase.kind === "capture" && (
          <>
            <CameraView
              key={resetKey}
              modes={modes}
              onBarcode={lookupBarcode}
              onManualBarcode={lookupBarcode}
              onPhoto={identifyMeal}
            />
            {pairPhoneAvailable && (
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Better camera nearby?{" "}
                <button
                  type="button"
                  onClick={onSwitchToPairPhone}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Pair your phone instead
                </button>
              </p>
            )}
          </>
        )}

        {phase.kind === "looking-up" && (
          <CenteredSpinner label={`Looking up ${phase.code}…`} />
        )}

        {phase.kind === "identifying" && (
          <CenteredSpinner label="Identifying foods in your photo…" />
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
                setPhase({ kind: "capture" });
                setResetKey((k) => k + 1);
              }}
            >
              Try again
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

/** Convert a Blob to a bare base64 string (no data: prefix), which is
 *  what /api/identify-meal expects. FileReader is the most compatible
 *  path across browsers. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read frame."));
        return;
      }
      // `data:image/jpeg;base64,...` → strip the prefix.
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read frame."));
    reader.readAsDataURL(blob);
  });
}
