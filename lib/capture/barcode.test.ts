/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const realDetector = (globalThis as unknown as { BarcodeDetector?: unknown })
  .BarcodeDetector;

/** Reset the per-tab cache the real module keeps for getSupportedFormats(). */
async function freshModule() {
  vi.resetModules();
  return import("./barcode");
}

afterEach(() => {
  (globalThis as unknown as { BarcodeDetector?: unknown }).BarcodeDetector =
    realDetector;
  vi.resetModules();
});

beforeEach(() => {
  vi.resetModules();
});

describe("detectBarcodeAvailability", () => {
  it("reports 'supported' when BarcodeDetector exists and exposes product-barcode formats", async () => {
    class FakeDetector {
      detect = vi.fn();
      static async getSupportedFormats() {
        return ["ean_13", "upc_a", "qr_code"];
      }
    }
    (
      globalThis as unknown as { BarcodeDetector: typeof FakeDetector }
    ).BarcodeDetector = FakeDetector;
    const { detectBarcodeAvailability } = await freshModule();
    const result = await detectBarcodeAvailability();
    expect(result.kind).toBe("supported");
    if (result.kind === "supported") {
      const detector = result.createDetector();
      expect(detector).toBeInstanceOf(FakeDetector);
    }
  });

  it("reports 'unsupported' when BarcodeDetector exists but only supports QR (iOS Safari partial impl)", async () => {
    class FakeDetector {
      detect = vi.fn();
      static async getSupportedFormats() {
        return ["qr_code"];
      }
    }
    (
      globalThis as unknown as { BarcodeDetector: typeof FakeDetector }
    ).BarcodeDetector = FakeDetector;
    const { detectBarcodeAvailability } = await freshModule();
    const result = await detectBarcodeAvailability();
    expect(result.kind).toBe("unsupported");
    if (result.kind === "unsupported") {
      expect(result.reason).toMatch(/product barcodes/);
    }
  });

  it("reports 'unsupported' with a readable reason when the API is missing", async () => {
    delete (globalThis as unknown as { BarcodeDetector?: unknown })
      .BarcodeDetector;
    const { detectBarcodeAvailability } = await freshModule();
    const result = await detectBarcodeAvailability();
    expect(result.kind).toBe("unsupported");
    if (result.kind === "unsupported") {
      expect(result.reason).toMatch(/doesn't support/);
    }
  });
});

describe("startBarcodeStream", () => {
  it("fires onDetect on the first successful read (no two-frame requirement)", async () => {
    const { startBarcodeStream } = await freshModule();
    const code = "5901234123457";
    const detector = {
      detect: vi
        .fn()
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

    // Drain ticks until we get a detection (max 4 — the first call
    // should fire immediately).
    for (let i = 0; i < 4 && onDetect.mock.calls.length === 0; i++) {
      const next = queue.shift();
      if (!next) break;
      next();
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(onDetect).toHaveBeenCalledWith(code);
    expect(onDetect).toHaveBeenCalledTimes(1);
  });

  it("retries after empty frames until a code is read", async () => {
    const { startBarcodeStream } = await freshModule();
    const code = "5901234123457";
    const detector = {
      detect: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ rawValue: code, format: "ean_13" }]),
    };
    const onDetect = vi.fn();
    const video = document.createElement("video");

    const queue: Array<() => void> = [];
    const raf = (cb: () => void) => {
      queue.push(cb);
      return 1;
    };

    startBarcodeStream({ video, detector, onDetect, raf, cancelRaf: () => {} });

    for (let i = 0; i < 8 && onDetect.mock.calls.length === 0; i++) {
      const next = queue.shift();
      if (!next) break;
      next();
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(onDetect).toHaveBeenCalledWith(code);
    expect(onDetect).toHaveBeenCalledTimes(1);
  });
});

describe("decodeOnce", () => {
  it("returns the rawValue of the first detected code", async () => {
    const { decodeOnce } = await freshModule();
    const detector = {
      detect: vi.fn().mockResolvedValue([
        { rawValue: "12345678", format: "ean_8" },
        { rawValue: "99", format: "ean_8" },
      ]),
    };
    const bitmap = {} as ImageBitmap; // pass-through mock
    const code = await decodeOnce(detector, bitmap);
    expect(code).toBe("12345678");
  });

  it("returns null when the detector finds nothing", async () => {
    const { decodeOnce } = await freshModule();
    const detector = { detect: vi.fn().mockResolvedValue([]) };
    const bitmap = {} as ImageBitmap;
    const code = await decodeOnce(detector, bitmap);
    expect(code).toBeNull();
  });

  it("swallows detector errors and returns null", async () => {
    const { decodeOnce } = await freshModule();
    const detector = { detect: vi.fn().mockRejectedValue(new Error("boom")) };
    const bitmap = {} as ImageBitmap;
    const code = await decodeOnce(detector, bitmap);
    expect(code).toBeNull();
  });
});

describe("normalizeManualBarcode", () => {
  it("strips non-digits and returns the cleaned code", async () => {
    const { normalizeManualBarcode } = await freshModule();
    expect(normalizeManualBarcode(" 5901-234 123 457 ")).toBe("5901234123457");
  });

  it("returns null for codes shorter than 8 digits", async () => {
    const { normalizeManualBarcode } = await freshModule();
    expect(normalizeManualBarcode("12345")).toBeNull();
  });

  it("returns null for codes longer than 14 digits", async () => {
    const { normalizeManualBarcode } = await freshModule();
    expect(normalizeManualBarcode("1".repeat(15))).toBeNull();
  });

  it("accepts EAN-8, UPC-A (12), EAN-13, and ITF-14 lengths", async () => {
    const { normalizeManualBarcode } = await freshModule();
    expect(normalizeManualBarcode("12345678")).toBe("12345678");
    expect(normalizeManualBarcode("123456789012")).toBe("123456789012");
    expect(normalizeManualBarcode("1234567890123")).toBe("1234567890123");
    expect(normalizeManualBarcode("12345678901234")).toBe("12345678901234");
  });
});
