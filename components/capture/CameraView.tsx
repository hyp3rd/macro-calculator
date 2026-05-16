"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  detectBarcodeAvailability,
  normalizeManualBarcode,
  startBarcodeStream,
} from "@/lib/capture/barcode";
import { captureFrame, startCamera } from "@/lib/capture/camera";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, ScanLine } from "lucide-react";

/** Live camera + barcode-detect surface. Phase 1 scope: barcode only.
 *  Photo capture and manual-entry-fallback share the same shell so the
 *  follow-up phases (meal-photo, laptop pairing) plug in without
 *  reshuffling the layout. */

type Mode = "scan" | "photo";

type Props = {
  /** Which capture modes the host wants to expose. "both" shows a
   *  tab toggle; otherwise the single mode renders directly. Defaults
   *  to "both". */
  modes?: ReadonlyArray<Mode>;
  /** Default tab when `modes` includes both. */
  initialMode?: Mode;
  /** Fires once with the decoded barcode (digits only) when a stable
   *  detection lands. Caller is expected to unmount this component or
   *  close its host dialog after handling. */
  onBarcode: (code: string) => void;
  /** Optional handler for the manual-entry fallback when the browser
   *  doesn't support `BarcodeDetector`. Defaults to the same callback
   *  as `onBarcode`. */
  onManualBarcode?: (code: string) => void;
  /** Fires when the user clicks "Take photo" with a JPEG Blob of the
   *  current frame. Caller handles upload / AI identification. */
  onPhoto?: (blob: Blob) => void;
};

type Phase =
  | { kind: "starting" }
  | { kind: "scanning"; stream: MediaStream; stop: () => void }
  | { kind: "manual"; reason: string }
  | { kind: "error"; message: string };

export function CameraView({
  modes = ["scan"],
  initialMode,
  onBarcode,
  onManualBarcode,
  onPhoto,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [mode, setMode] = useState<Mode>(initialMode ?? modes[0] ?? "scan");
  const [photoBusy, setPhotoBusy] = useState(false);
  // Whether the browser supports BarcodeDetector. `null` until the
  // first effect tick resolves it. Promoted to state (not a ref) so
  // the render path can read it without violating react-hooks/refs.
  const [detectorAvailable, setDetectorAvailable] = useState<boolean | null>(
    null,
  );
  // Latest-ref pattern: keeps the camera-start effect to a one-shot
  // (deps `[]`) while still letting the detect callback see the
  // current `onBarcode` prop if the parent ever swaps it. Avoids
  // tearing down the live MediaStream on every parent re-render.
  // Ref-update in its own effect to satisfy `react-hooks/refs`.
  const onBarcodeRef = useRef(onBarcode);
  useEffect(() => {
    onBarcodeRef.current = onBarcode;
  }, [onBarcode]);
  const onPhotoRef = useRef(onPhoto);
  useEffect(() => {
    onPhotoRef.current = onPhoto;
  }, [onPhoto]);
  // Two-step commit so React's strict-mode double-mount doesn't tear
  // down the live stream prematurely.
  const cleanupRef = useRef<() => void>(() => {});
  // Latest stopScan, so we can toggle the loop on/off when the user
  // flips between Scan and Photo tabs without restarting the camera.
  const stopScanRef = useRef<() => void>(() => {});

  // Camera startup — one-shot. The scan-loop start/stop is in a
  // separate effect below so flipping tabs doesn't tear down the
  // camera.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const availability = detectBarcodeAvailability();
      if (!cancelled) setDetectorAvailable(availability.kind === "supported");
      // If the user can only scan, and detection isn't supported,
      // surface the manual-entry path immediately. Photo mode still
      // works without BarcodeDetector — only block when scan is the
      // only available mode.
      if (
        availability.kind !== "supported" &&
        modes.length === 1 &&
        modes[0] === "scan"
      ) {
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
      cleanupRef.current = () => {
        stopScanRef.current();
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
  }, [modes]);

  // Start / stop the barcode loop when mode flips, conditional on
  // detector availability. Camera (above effect) keeps running across
  // mode changes — only the detect work pauses.
  useEffect(() => {
    if (phase.kind !== "scanning") return;
    if (mode !== "scan") {
      stopScanRef.current();
      stopScanRef.current = () => {};
      return;
    }
    if (detectorAvailable !== true) return;
    const video = videoRef.current;
    if (!video) return;
    const availability = detectBarcodeAvailability();
    if (availability.kind !== "supported") return;
    const stop = startBarcodeStream({
      video,
      detector: availability.createDetector(),
      onDetect: (code) => {
        stop();
        // Tear down the camera here — we're done.
        cleanupRef.current();
        onBarcodeRef.current(code);
      },
    });
    stopScanRef.current = stop;
    return stop;
  }, [mode, phase.kind, detectorAvailable]);

  // Auto-switch off scan mode when the browser turns out to lack
  // BarcodeDetector (iOS Safari is the common case — the API claims
  // 16.4+ support but in practice it isn't shipped). Without this the
  // user would land on the default "scan" mode with no way to switch
  // since the Scan tab gets filtered out — leaving a live video
  // preview with no working controls. Switch to photo if it's offered.
  useEffect(() => {
    if (
      detectorAvailable === false &&
      mode === "scan" &&
      modes.includes("photo")
    ) {
      // Deferred to a microtask so the setState doesn't fire
      // synchronously inside the effect body — react-hooks/set-state-
      // in-effect is strict about that.
      queueMicrotask(() => setMode("photo"));
    }
  }, [detectorAvailable, mode, modes]);

  async function handleCapturePhoto() {
    const video = videoRef.current;
    if (!video || photoBusy) return;
    setPhotoBusy(true);
    try {
      const blob = await captureFrame(video);
      // Tear down camera before invoking the callback — the host will
      // unmount us right after, but stopping the stream first keeps
      // the LED off promptly on Macs.
      cleanupRef.current();
      onPhotoRef.current?.(blob);
    } catch (err) {
      setPhase({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Failed to capture frame.",
      });
      setPhotoBusy(false);
    }
  }

  // Show the tab toggle only when more than one mode is offered AND
  // we're past the initial camera-start (so the user isn't picking
  // tabs while the video is still black). If BarcodeDetector turned
  // out to be missing, hide the Scan tab so the user isn't presented
  // with a non-functional option — they can still take photos.
  const availableModes = modes.filter(
    (m) => m !== "scan" || detectorAvailable !== false,
  );
  const showTabs = availableModes.length > 1;

  return (
    <div className="space-y-3">
      {showTabs && phase.kind !== "manual" && (
        <div className="flex gap-1 rounded-md border border-border/60 bg-muted/30 p-1">
          {availableModes.includes("scan") && (
            <button
              type="button"
              onClick={() => setMode("scan")}
              className={`flex-1 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
                mode === "scan"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <ScanLine className="h-3 w-3" />
                Scan barcode
              </span>
            </button>
          )}
          {availableModes.includes("photo") && (
            <button
              type="button"
              onClick={() => setMode("photo")}
              className={`flex-1 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
                mode === "photo"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Camera className="h-3 w-3" />
                Take photo
              </span>
            </button>
          )}
        </div>
      )}

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
        {phase.kind === "scanning" && mode === "scan" && (
          <div
            className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse rounded-full bg-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.7)]"
            aria-hidden
          />
        )}
      </div>

      {phase.kind === "scanning" && mode === "scan" && (
        <p className="flex items-center gap-1.5 text-center text-xs text-muted-foreground">
          <ScanLine className="h-3.5 w-3.5" />
          Point the camera at a product barcode — detection is automatic.
        </p>
      )}

      {phase.kind === "scanning" && mode === "photo" && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-center text-xs text-muted-foreground">
            Frame the meal and tap the button — the AI will identify each food
            and estimate portions.
          </p>
          <Button
            type="button"
            onClick={handleCapturePhoto}
            disabled={photoBusy}
            className="gap-1.5"
          >
            <Camera className="h-3.5 w-3.5" />
            {photoBusy ? "Capturing…" : "Take photo"}
          </Button>
        </div>
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

  function handle(e: React.FormEvent<HTMLFormElement>) {
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
