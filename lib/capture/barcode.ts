/** Wrapper around the native `BarcodeDetector` API. Returns a small
 *  facade — the UI never touches the spec API directly so unsupported
 *  browsers fall through to a manual-entry input without conditionals
 *  scattered across the component tree.
 *
 *  Browsers: Chrome / Edge / Opera / Samsung Internet (full),
 *  iOS Safari 16.4+, macOS Safari 14+. Firefox doesn't ship it.
 *
 *  Important gotcha — *and the reason this file looks complicated*:
 *  several mobile browsers (including iOS Safari on real-world builds)
 *  expose `window.BarcodeDetector` but only support `qr_code`. If we
 *  hand the detector our EAN/UPC formats anyway, it silently returns
 *  empty results forever — the loop spins, the scan line animates, and
 *  nothing ever fires. So we ask the browser which formats it actually
 *  supports via the static `getSupportedFormats()` method (it's async,
 *  hence the async surface here) and only call ourselves "supported"
 *  when at least one product-barcode format is on the list. */

/** Subset of the spec we actually use. Avoids pulling DOM types we
 *  don't have configured. */
interface BarcodeDetectorLike {
  detect(
    source:
      | HTMLVideoElement
      | HTMLCanvasElement
      | HTMLImageElement
      | ImageBitmap
      | OffscreenCanvas
      | ImageData
      | Blob,
  ): Promise<Array<{ rawValue: string; format: string }>>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

/** Common consumer-product barcode formats. EAN-13/UPC-A cover ~all of
 *  packaged groceries; EAN-8 for very small packages. We deliberately
 *  skip QR (it's a link, not a product) and Code 128 (warehouse stuff). */
const FORMATS = ["ean_13", "upc_a", "ean_8"] as const;

export type BarcodeAvailability =
  | { kind: "supported"; createDetector: () => BarcodeDetectorLike }
  | { kind: "unsupported"; reason: string };

/** Per-tab cache of the supported-formats lookup. The browser doesn't
 *  change its mind about which formats it can read mid-session, so one
 *  network/native trip is enough. */
let supportedFormatsPromise: Promise<readonly string[]> | null = null;

function fetchSupportedFormats(): Promise<readonly string[]> {
  if (supportedFormatsPromise) return supportedFormatsPromise;
  if (typeof window === "undefined") {
    supportedFormatsPromise = Promise.resolve([]);
    return supportedFormatsPromise;
  }
  const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  if (!Ctor || typeof Ctor.getSupportedFormats !== "function") {
    // Constructor missing, or older browser that doesn't expose the
    // static method. Treat as "no formats" — caller falls back to
    // manual entry.
    supportedFormatsPromise = Promise.resolve([]);
    return supportedFormatsPromise;
  }
  supportedFormatsPromise = Ctor.getSupportedFormats().catch(() => []);
  return supportedFormatsPromise;
}

/** Async; awaited from the React effects in CameraView. Safe to call
 *  from SSR (returns "unsupported" because `window` is absent). */
export async function detectBarcodeAvailability(): Promise<BarcodeAvailability> {
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
  const supported = await fetchSupportedFormats();
  const usable = FORMATS.filter((f) => supported.includes(f));
  if (usable.length === 0) {
    return {
      kind: "unsupported",
      // Phrased to land between "your browser is broken" (we don't
      // know that) and "you typed the wrong thing" (they didn't yet).
      // iOS Safari users land here today.
      reason:
        "Your browser's barcode reader doesn't support product barcodes. Type the digits below.",
    };
  }
  return {
    kind: "supported",
    createDetector: () => new Ctor({ formats: [...usable] }),
  };
}

/** One-shot detect on a single frame source. Used by the "Capture &
 *  scan" fallback button — bypasses the rAF loop entirely, so it works
 *  even when the live-detect path is starved (e.g. autofocus is
 *  hunting and never delivers a sharp frame). Returns the decoded
 *  digits or `null` if nothing recognized. */
export async function decodeOnce(
  detector: BarcodeDetectorLike,
  source:
    | HTMLVideoElement
    | HTMLCanvasElement
    | HTMLImageElement
    | ImageBitmap
    | ImageData
    | Blob,
): Promise<string | null> {
  try {
    const results = await detector.detect(source);
    return results[0]?.rawValue ?? null;
  } catch {
    return null;
  }
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

/** Start a detection loop on the given video element. Fires `onDetect`
 *  on the *first* successful read and stops. Returns a cleanup function
 *  the caller invokes on unmount or after handling the code.
 *
 *  Previously this required two consecutive frames with the same code
 *  to debounce false positives. In practice that made detection feel
 *  broken on phones: the camera autofocus hunts, frames blur, and the
 *  detector reads the code once but rarely twice in a row. Product
 *  barcodes (EAN/UPC) carry a checksum the detector already validates
 *  before returning a `rawValue`, so a single positive read is safe to
 *  trust. */
export function startBarcodeStream(opts: BarcodeStreamOptions): () => void {
  const raf = opts.raf ?? window.requestAnimationFrame.bind(window);
  const cancelRaf = opts.cancelRaf ?? window.cancelAnimationFrame.bind(window);
  // Detector creation is now async (must consult getSupportedFormats),
  // so we accept a pre-built detector from the caller instead of
  // building one here. The CameraView always passes one in; the
  // fallback below exists only for callers that already know a
  // detector is available.
  if (!opts.detector) {
    throw new Error(
      "startBarcodeStream requires a detector — build one with detectBarcodeAvailability() first.",
    );
  }
  const detector = opts.detector;

  let handle = 0;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const results = await detector.detect(opts.video);
      const first = results[0]?.rawValue;
      if (first) {
        stopped = true;
        opts.onDetect(first);
        return;
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
