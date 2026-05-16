/** Wrapper around the native `BarcodeDetector` API. Returns a small
 *  facade — the UI never touches the spec API directly so unsupported
 *  browsers fall through to a manual-entry input without conditionals
 *  scattered across the component tree.
 *
 *  Browsers: Chrome / Edge / Opera / Samsung Internet (full),
 *  iOS Safari 16.4+, macOS Safari 14+. Firefox doesn't ship it. We
 *  detect once at module load. */

/** Subset of the spec we actually use. Avoids pulling DOM types we
 *  don't have configured. */
interface BarcodeDetectorLike {
  detect(
    source: HTMLVideoElement | ImageBitmap,
  ): Promise<Array<{ rawValue: string; format: string }>>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
}

/** Common consumer-product barcode formats. EAN-13/UPC-A cover ~all of
 *  packaged groceries; EAN-8 for very small packages. Skip QR (it's a
 *  link, not a product) and Code 128 (warehouse stuff). */
const FORMATS = ["ean_13", "upc_a", "ean_8"];

export type BarcodeAvailability =
  | { kind: "supported"; createDetector: () => BarcodeDetectorLike }
  | { kind: "unsupported"; reason: string };

/** One-time check at module load. Idempotent; safe to call from SSR
 *  (returns "unsupported" because `window` is absent). */
export function detectBarcodeAvailability(): BarcodeAvailability {
  if (typeof window === "undefined") {
    return { kind: "unsupported", reason: "Server-side render" };
  }
  const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  if (!Ctor) {
    return {
      kind: "unsupported",
      reason: "Your browser doesn't support live barcode scanning.",
    };
  }
  return {
    kind: "supported",
    createDetector: () => new Ctor({ formats: FORMATS }),
  };
}

export type BarcodeStreamOptions = {
  video: HTMLVideoElement;
  onDetect: (code: string) => void;
  /** Test hook — defaults to the real API. */
  detector?: BarcodeDetectorLike;
  /** Test hook — defaults to `requestAnimationFrame`. Vitest fake
   *  timers don't patch rAF, so tests inject this. */
  raf?: (cb: () => void) => number;
  /** Test hook — defaults to `cancelAnimationFrame`. */
  cancelRaf?: (handle: number) => void;
};

/** Start a detection loop on the given video element. Calls `onDetect`
 *  the first time the same code is read two frames in a row (cuts
 *  false positives from blurry single frames). Returns a cleanup
 *  function the caller invokes on unmount or after handling the
 *  detected code. */
export function startBarcodeStream(opts: BarcodeStreamOptions): () => void {
  const raf = opts.raf ?? window.requestAnimationFrame.bind(window);
  const cancelRaf = opts.cancelRaf ?? window.cancelAnimationFrame.bind(window);
  const detector =
    opts.detector ??
    (() => {
      const avail = detectBarcodeAvailability();
      if (avail.kind !== "supported")
        throw new Error("startBarcodeStream called without BarcodeDetector");
      return avail.createDetector();
    })();

  let handle = 0;
  let lastSeen: string | null = null;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const results = await detector.detect(opts.video);
      const first = results[0]?.rawValue;
      if (first) {
        if (first === lastSeen) {
          // Two frames in a row with the same code — fire and stop.
          stopped = true;
          opts.onDetect(first);
          return;
        }
        lastSeen = first;
      } else {
        lastSeen = null;
      }
    } catch {
      // Detector throws when the video stream isn't ready yet (e.g.,
      // before the first frame paints). Just try again next frame.
    }
    if (!stopped) handle = raf(tick);
  };

  handle = raf(tick);
  return () => {
    stopped = true;
    cancelRaf(handle);
  };
}

/** Validate a user-typed barcode (for the manual-entry fallback on
 *  unsupported browsers). Returns the cleaned code or `null` if
 *  invalid. Accepts EAN-8/12/13/14, the practical product range. */
export function normalizeManualBarcode(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}
