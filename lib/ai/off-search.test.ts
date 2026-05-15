import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchOpenFoodFactsServer } from "./off-search";

// The helper hits upstream OFF directly via `fetch`. We mock global fetch
// so these tests stay offline and deterministic.
const originalFetch = globalThis.fetch;

function mockFetch(
  response: { hits?: unknown[] } | { error: string },
  ok = true,
) {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(response), {
        status: ok ? 200 : 502,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

describe("searchOpenFoodFactsServer", () => {
  beforeEach(() => {
    // Reset between specs so a leak from one doesn't poison the next.
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns [] for an empty query without hitting upstream", async () => {
    const result = await searchOpenFoodFactsServer("   ", 5);
    expect(result).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("normalizes hits with all macros into Food shape", async () => {
    mockFetch({
      hits: [
        {
          code: "123",
          product_name: "Greek Yogurt",
          brands: "Fage",
          nutriments: {
            proteins_100g: 10,
            carbohydrates_100g: 3.6,
            fat_100g: 0.4,
            "energy-kcal_100g": 59,
          },
        },
      ],
    });

    const result = await searchOpenFoodFactsServer("yogurt", 5);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "off:123",
      source: "off",
      name: "Greek Yogurt",
      protein: 10,
      carbs: 3.6,
      fat: 0.4,
      calories: 59,
      brand: "Fage",
    });
  });

  it("drops hits missing all macros (would surface as NaNs)", async () => {
    mockFetch({
      hits: [
        { code: "456", product_name: "Mystery Product", nutriments: {} },
        {
          code: "789",
          product_name: "Real Product",
          nutriments: { proteins_100g: 20 },
        },
      ],
    });

    const result = await searchOpenFoodFactsServer("mystery", 5);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Real Product");
  });

  it("falls back to energy-kcal alias when energy-kcal_100g is absent", async () => {
    mockFetch({
      hits: [
        {
          code: "alias",
          product_name: "Oats",
          nutriments: {
            proteins_100g: 13,
            carbohydrates_100g: 67,
            fat_100g: 7,
            "energy-kcal": 389, // alias path
          },
        },
      ],
    });

    const result = await searchOpenFoodFactsServer("oats", 5);
    expect(result[0].calories).toBe(389);
  });

  it("derives calories from 4/4/9 when neither energy field is present", async () => {
    mockFetch({
      hits: [
        {
          code: "noeng",
          product_name: "No Energy",
          nutriments: {
            proteins_100g: 10, // 40 kcal
            carbohydrates_100g: 20, // 80 kcal
            fat_100g: 5, // 45 kcal
          },
        },
      ],
    });

    const result = await searchOpenFoodFactsServer("anything", 5);
    expect(result[0].calories).toBe(165); // 40 + 80 + 45
  });

  it("extracts the first brand from an array", async () => {
    mockFetch({
      hits: [
        {
          code: "arr",
          product_name: "X",
          brands: ["Brand A", "Brand B"],
          nutriments: { proteins_100g: 1 },
        },
      ],
    });
    const result = await searchOpenFoodFactsServer("x", 5);
    expect(result[0].brand).toBe("Brand A");
  });

  it("extracts the first brand from a comma-separated string", async () => {
    mockFetch({
      hits: [
        {
          code: "str",
          product_name: "Y",
          brands: "Brand X, Brand Y, Brand Z",
          nutriments: { proteins_100g: 1 },
        },
      ],
    });
    const result = await searchOpenFoodFactsServer("y", 5);
    expect(result[0].brand).toBe("Brand X");
  });

  it("returns an empty array when upstream returns no hits field", async () => {
    mockFetch({});
    const result = await searchOpenFoodFactsServer("nope", 5);
    expect(result).toEqual([]);
  });

  it("throws a descriptive error when upstream returns non-2xx", async () => {
    mockFetch({ error: "internal" }, false);
    await expect(searchOpenFoodFactsServer("anything", 5)).rejects.toThrow(
      /Open Food Facts search failed/,
    );
  });

  it("clamps limit below 1 to 1 in the upstream page_size param", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ hits: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await searchOpenFoodFactsServer("x", 0);
    await searchOpenFoodFactsServer("x", -3);
    await searchOpenFoodFactsServer("x", 99); // clamped down to MAX_LIMIT=10

    const calls = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls;
    const pageSizes = calls.map((c) => {
      const url = new URL(String(c[0]));
      return url.searchParams.get("page_size");
    });
    expect(pageSizes).toEqual(["1", "1", "10"]);
  });

  it("times out after 5s when upstream hangs", async () => {
    vi.useFakeTimers();
    try {
      // Mock fetch that never resolves on its own — it only rejects when
      // the caller's AbortSignal fires, which is what we're testing.
      globalThis.fetch = vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const e = new Error("aborted");
              e.name = "AbortError";
              reject(e);
            });
          }),
      ) as unknown as typeof fetch;

      const pending = searchOpenFoodFactsServer("hangs", 5);
      // Surface unhandled rejections so the assertion can observe them.
      pending.catch(() => {});

      await vi.advanceTimersByTimeAsync(5_000);

      await expect(pending).rejects.toThrow(/timed out after 5s/);
    } finally {
      vi.useRealTimers();
    }
  });
});
