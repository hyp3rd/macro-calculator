/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectBarcodeAvailability,
  normalizeManualBarcode,
  startBarcodeStream,
} from "./barcode";

const realDetector = (globalThis as unknown as { BarcodeDetector?: unknown })
  .BarcodeDetector;

afterEach(() => {
  (globalThis as unknown as { BarcodeDetector?: unknown }).BarcodeDetector =
    realDetector;
});

describe("detectBarcodeAvailability", () => {
  it("reports 'supported' when window.BarcodeDetector exists", () => {
    class FakeDetector {
      detect = vi.fn();
    }
    (
      globalThis as unknown as { BarcodeDetector: typeof FakeDetector }
    ).BarcodeDetector = FakeDetector;
    const result = detectBarcodeAvailability();
    expect(result.kind).toBe("supported");
    if (result.kind === "supported") {
      const detector = result.createDetector();
      expect(detector).toBeInstanceOf(FakeDetector);
    }
  });

  it("reports 'unsupported' with a readable reason when the API is missing", () => {
    delete (globalThis as unknown as { BarcodeDetector?: unknown })
      .BarcodeDetector;
    const result = detectBarcodeAvailability();
    expect(result.kind).toBe("unsupported");
    if (result.kind === "unsupported") {
      expect(result.reason).toMatch(/doesn't support/);
    }
  });
});

describe("startBarcodeStream", () => {
  it("requires two consecutive frames with the same code before firing onDetect", async () => {
    const code = "5901234123457";
    const detector = {
      // Three frames: code → different code → code → code. The
      // implementation should fire only after seeing `code` twice in a
      // row (frames 3 + 4), not the isolated single hit on frame 1.
      detect: vi
        .fn()
        .mockResolvedValueOnce([{ rawValue: code, format: "ean_13" }])
        .mockResolvedValueOnce([
          { rawValue: "1111111111111", format: "ean_13" },
        ])
        .mockResolvedValueOnce([{ rawValue: code, format: "ean_13" }])
        .mockResolvedValueOnce([{ rawValue: code, format: "ean_13" }]),
    };
    const onDetect = vi.fn();
    const video = document.createElement("video");

    // Capture each scheduled tick callback into a queue we drain manually.
    const queue: Array<() => void> = [];
    const raf = (cb: () => void) => {
      queue.push(cb);
      return 1;
    };

    startBarcodeStream({ video, detector, onDetect, raf, cancelRaf: () => {} });

    // Drain up to 6 ticks — each await yields so the detector promise
    // resolves before we run the next callback.
    for (let i = 0; i < 6 && onDetect.mock.calls.length === 0; i++) {
      const next = queue.shift();
      if (!next) break;
      next();
      // Yield twice: once for the awaited detect promise to settle,
      // once for the microtask scheduling the next rAF.
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(onDetect).toHaveBeenCalledWith(code);
    expect(onDetect).toHaveBeenCalledTimes(1);
  });
});

describe("normalizeManualBarcode", () => {
  it("strips non-digits and returns the cleaned code", () => {
    expect(normalizeManualBarcode(" 5901-234 123 457 ")).toBe("5901234123457");
  });

  it("returns null for codes shorter than 8 digits", () => {
    expect(normalizeManualBarcode("12345")).toBeNull();
  });

  it("returns null for codes longer than 14 digits", () => {
    expect(normalizeManualBarcode("1".repeat(15))).toBeNull();
  });

  it("accepts EAN-8, UPC-A (12), EAN-13, and ITF-14 lengths", () => {
    expect(normalizeManualBarcode("12345678")).toBe("12345678");
    expect(normalizeManualBarcode("123456789012")).toBe("123456789012");
    expect(normalizeManualBarcode("1234567890123")).toBe("1234567890123");
    expect(normalizeManualBarcode("12345678901234")).toBe("12345678901234");
  });
});
