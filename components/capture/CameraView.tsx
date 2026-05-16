"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  detectBarcodeAvailability,
  normalizeManualBarcode,
  startBarcodeStream,
} from "@/lib/capture/barcode";
import { startCamera } from "@/lib/capture/camera";
import { useEffect, useRef, useState } from "react";
import { Loader2, ScanLine } from "lucide-react";

/** Live camera + barcode-detect surface. Phase 1 scope: barcode only.
 *  Photo capture and manual-entry-fallback share the same shell so the
 *  follow-up phases (meal-photo, laptop pairing) plug in without
 *  reshuffling the layout. */

type Props = {
  /** Fires once with the decoded barcode (digits only) when a stable
   *  detection lands. Caller is expected to unmount this component or
   *  close its host dialog after handling. */
  onBarcode: (code: string) => void;
  /** Optional handler for the manual-entry fallback when the browser
   *  doesn't support `BarcodeDetector`. Defaults to the same callback
   *  as `onBarcode`. */
  onManualBarcode?: (code: string) => void;
};

type Phase =
  | { kind: "starting" }
  | { kind: "scanning"; stream: MediaStream; stop: () => void }
  | { kind: "manual"; reason: string }
  | { kind: "error"; message: string };

export function CameraView({ onBarcode, onManualBarcode }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  // Latest-ref pattern: keeps the camera-start effect to a one-shot
  // (deps `[]`) while still letting the detect callback see the
  // current `onBarcode` prop if the parent ever swaps it. Avoids
  // tearing down the live MediaStream on every parent re-render.
  // Ref-update in its own effect to satisfy `react-hooks/refs`.
  const onBarcodeRef = useRef(onBarcode);
  useEffect(() => {
    onBarcodeRef.current = onBarcode;
  }, [onBarcode]);
  // Two-step commit so React's strict-mode double-mount doesn't tear
  // down the live stream prematurely.
  const cleanupRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    // All state writes happen inside the async IIFE so the lint
    // rule's "no synchronous setState in effect" stays satisfied.
    (async () => {
      const availability = detectBarcodeAvailability();
      if (availability.kind !== "supported") {
        if (!cancelled)
          setPhase({ kind: "manual", reason: availability.reason });
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      const result = await startCamera({ video, facingMode: "environment" });
      if (cancelled) {
        if (result.ok) result.stop();
        return;
      }
      if (!result.ok) {
        setPhase({ kind: "error", message: result.message });
        return;
      }
      const stopScan = startBarcodeStream({
        video,
        detector: availability.createDetector(),
        onDetect: (code) => {
          // Pause the loop, tear down the stream, then call the parent
          // via the latest-ref. We don't unmount ourselves — the host
          // (CameraSheet) controls open/close based on this callback.
          stopScan();
          result.stop();
          onBarcodeRef.current(code);
        },
      });
      cleanupRef.current = () => {
        stopScan();
        result.stop();
      };
      setPhase({
        kind: "scanning",
        stream: result.stream,
        stop: cleanupRef.current,
      });
    })();
    return () => {
      cancelled = true;
      cleanupRef.current();
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border/60 bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
        />
        {phase.kind === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            Starting camera…
          </div>
        )}
        {phase.kind === "scanning" && (
          <div
            className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse rounded-full bg-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.7)]"
            aria-hidden
          />
        )}
      </div>

      {phase.kind === "scanning" && (
        <p className="flex items-center gap-1.5 text-center text-xs text-muted-foreground">
          <ScanLine className="h-3.5 w-3.5" />
          Point the camera at a product barcode — detection is automatic.
        </p>
      )}

      {phase.kind === "error" && (
        <p
          role="alert"
          className="text-xs text-destructive"
        >
          {phase.message}
        </p>
      )}

      {phase.kind === "manual" && (
        <ManualBarcodeEntry
          reason={phase.reason}
          onSubmit={(code) => (onManualBarcode ?? onBarcode)(code)}
        />
      )}
    </div>
  );
}

function ManualBarcodeEntry({
  reason,
  onSubmit,
}: {
  reason: string;
  onSubmit: (code: string) => void;
}) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handle(e: React.FormEvent) {
    e.preventDefault();
    const code = normalizeManualBarcode(raw);
    if (!code) {
      setError("Enter 8–14 digits from the barcode below the bars.");
      return;
    }
    setError(null);
    onSubmit(code);
  }

  return (
    <form
      onSubmit={handle}
      className="space-y-2"
    >
      <p className="text-xs text-muted-foreground">{reason}</p>
      <Label
        htmlFor="manual-barcode"
        className="text-xs font-medium text-muted-foreground"
      >
        Type the barcode digits
      </Label>
      <Input
        id="manual-barcode"
        inputMode="numeric"
        pattern="[0-9]*"
        autoFocus
        value={raw}
        onChange={(e) => setRaw(e.target.value.replace(/\D/g, "").slice(0, 14))}
        placeholder="e.g. 5901234123457"
        className="font-mono tabular-nums"
      />
      {error && (
        <p
          role="alert"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
      <Button
        type="submit"
        size="sm"
        disabled={raw.length < 8}
      >
        Look up
      </Button>
    </form>
  );
}
