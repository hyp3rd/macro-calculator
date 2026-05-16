"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  decodeOnce,
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
  // Single-shot "Capture & scan" fallback button state. Lets the user
  // force a detection when the live loop is starved (autofocus hunting
  // forever, partial format support, …) without falling all the way
  // back to manual digit entry.
  const [manualScanBusy, setManualScanBusy] = useState(false);
  const [manualScanFailed, setManualScanFailed] = useState(false);
  // Whether the browser supports BarcodeDetector *and* one of the
  // product-barcode formats we care about. `null` until the first
  // effect tick resolves it (detectBarcodeAvailability is async because
  // it has to call BarcodeDetector.getSupportedFormats() to know).
  // Promoted to state (not a ref) so the render path can read it
  // without violating react-hooks/refs.
  const [detectorAvailable, setDetectorAvailable] = useState<boolean | null>(
    null,
  );
  // Cache the built detector so the mode-flip effect doesn't have to
  // re-check format support on every flip, and the manual fallback
  // button can call detect() on a captured frame without rebuilding.
  // The detector itself is stateless across calls — one per session is
  // enough.
  type Detector = Parameters<typeof decodeOnce>[0];
  const detectorRef = useRef<Detector | null>(null);
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
      // Now async — has to await getSupportedFormats() to know whether
      // the browser's BarcodeDetector actually supports EAN/UPC and not
      // just QR. See lib/capture/barcode.ts for the gotcha.
      const availability = await detectBarcodeAvailability();
      if (cancelled) return;
      const supported = availability.kind === "supported";
      setDetectorAvailable(supported);
      detectorRef.current = supported ? availability.createDetector() : null;
      // If the user can only scan, and detection isn't supported,
      // surface the manual-entry path immediately. Photo mode still
      // works without BarcodeDetector — only block when scan is the
      // only available mode.
      if (!supported && modes.length === 1 && modes[0] === "scan") {
        setPhase({
          kind: "manual",
          reason:
            availability.kind === "unsupported"
              ? availability.reason
              : "Live scanning isn't supported here.",
        });
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
  // mode changes — only the detect work pauses. Uses the detector
  // cached in `detectorRef` so we don't have to re-await format
  // support on every flip.
  useEffect(() => {
    if (phase.kind !== "scanning") return;
    if (mode !== "scan") {
      stopScanRef.current();
      stopScanRef.current = () => {};
      return;
    }
    if (detectorAvailable !== true) return;
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector) return;
    const stop = startBarcodeStream({
      video,
      detector,
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

  /** Fallback for the case where the live-detect loop never fires —
   *  user lines up the barcode, taps the button, we capture the
   *  current frame and run `detect()` on it once. Works even when
   *  autofocus is hunting and the rAF loop never sees a sharp frame. */
  async function handleManualScan() {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector || manualScanBusy) return;
    setManualScanBusy(true);
    setManualScanFailed(false);
    try {
      // Reuse the same canvas helper the photo flow uses so the frame
      // is high-resolution (1920×1080 at full quality).
      const blob = await captureFrame(video, 1);
      const bitmap = await createImageBitmap(blob);
      try {
        const code = await decodeOnce(detector, bitmap);
        if (code) {
          cleanupRef.current();
          onBarcodeRef.current(code);
          return;
        }
        setManualScanFailed(true);
      } finally {
        bitmap.close();
      }
    } catch {
      setManualScanFailed(true);
    } finally {
      setManualScanBusy(false);
    }
  }

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

  // Tabs render whenever more than one mode is configured. We do NOT
  // hide the Scan tab just because BarcodeDetector is missing — the
  // tab still works via manual-entry fallback rendered inline below
  // the video. Hiding the tab made it impossible to access the OFF
  // lookup at all on iOS Safari (where the API isn't shipped despite
  // some compat tables claiming 16.4+ support).
  const showTabs = modes.length > 1;
  // Show the manual-entry input when scan mode is active and the
  // browser can't do live detection. Same input either way — the
  // user types the digits, we look up via OFF.
  const showManualEntry =
    phase.kind === "scanning" && mode === "scan" && detectorAvailable === false;

  return (
    <div className="space-y-3">
      {showTabs && phase.kind !== "manual" && (
        <div className="flex gap-1 rounded-md border border-border/60 bg-muted/30 p-1">
          {modes.includes("scan") && (
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
          {modes.includes("photo") && (
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
        {phase.kind === "scanning" &&
          mode === "scan" &&
          detectorAvailable === true && (
            <div
              className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse rounded-full bg-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.7)]"
              aria-hidden
            />
          )}
      </div>

      {phase.kind === "scanning" &&
        mode === "scan" &&
        detectorAvailable === true && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-center text-xs text-muted-foreground">
              <ScanLine className="h-3.5 w-3.5" />
              Point the camera at a product barcode — detection is automatic.
            </p>
            {/* Manual fallback. Live detection on phones can stall when
                autofocus hunts and never delivers a sharp frame; this
                button takes a single high-res snapshot and decodes
                that. Always visible so users can reach it without
                guessing whether the loop is broken. */}
            <div className="flex flex-col items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleManualScan}
                disabled={manualScanBusy}
                className="gap-1.5"
              >
                <ScanLine className="h-3.5 w-3.5" />
                {manualScanBusy ? "Reading frame…" : "Tap to capture & scan"}
              </Button>
              {manualScanFailed && (
                <p
                  role="status"
                  className="text-[11px] text-muted-foreground"
                >
                  No barcode found in that frame. Hold steady and try again.
                </p>
              )}
            </div>
          </div>
        )}

      {showManualEntry && (
        <ManualBarcodeEntry
          reason="Live scanning isn't supported in this browser. Type the digits below."
          onSubmit={(code) => (onManualBarcode ?? onBarcode)(code)}
        />
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
