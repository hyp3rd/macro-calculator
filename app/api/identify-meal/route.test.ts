import * as plan from "@/lib/ai/plan";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: mockCreate };
  }
  const ctor = MockAnthropic as unknown as typeof MockAnthropic & {
    RateLimitError: new (message?: string) => Error;
    AuthenticationError: new (message?: string) => Error;
  };
  ctor.RateLimitError = class extends Error {};
  ctor.AuthenticationError = class extends Error {};
  return { default: ctor };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1", email: "u@example.com" } },
      })),
    },
  })),
}));

vi.mock("@/lib/ai/env", () => ({
  getAnthropicConfig: vi.fn(() => ({ apiKey: "sk-test" })),
}));

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/identify-meal", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const SAMPLE_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAA="; // 1x1 PNG
const SAMPLE_BODY = {
  imageBase64: SAMPLE_IMAGE,
  mediaType: "image/jpeg" as const,
  dietPreference: "omnivore" as const,
};

describe("/api/identify-meal POST", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("sends an image content block on the user message and resolves the response", async () => {
    // Capture into an array so TS doesn't treat the closure-assigned
    // variable as `never` after narrowing — same workaround the
    // meal-plan/recipes route tests use.
    const captured: Array<{ messages: unknown[] }> = [];
    mockCreate.mockImplementation(async (params: { messages: unknown[] }) => {
      captured.push(structuredClone(params));
      return {
        id: "m1",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "submit_meal_foods",
            input: {
              foods: [
                // 'Chicken Breast' exists in the built-in catalog.
                {
                  name: "Chicken Breast",
                  portionGrams: 150,
                  confidence: "high",
                },
              ],
            },
          },
        ],
        stop_reason: "tool_use",
      };
    });

    const res = await POST(makeRequest(SAMPLE_BODY));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      foods: Array<{ name: string; portionGrams: number; confidence: string }>;
      unmatched: string[];
    };
    expect(json.foods).toHaveLength(1);
    expect(json.foods[0].name).toBe("Chicken Breast");
    expect(json.foods[0].portionGrams).toBe(150);
    expect(json.foods[0].confidence).toBe("high");
    expect(json.unmatched).toEqual([]);

    // The Anthropic call must include an `image` content block on the
    // user message — that's the load-bearing assertion for vision.
    expect(captured).toHaveLength(1);
    const messages = captured[0].messages;
    const userMsg = messages[0] as {
      role: string;
      content: Array<{ type: string }>;
    };
    expect(userMsg.role).toBe("user");
    expect(userMsg.content.some((b) => b.type === "image")).toBe(true);
  });

  it("surfaces names that don't resolve into `unmatched`", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "m1",
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "submit_meal_foods",
          input: {
            foods: [
              { name: "Oats", portionGrams: 80, confidence: "high" },
              { name: "Unicorn Bacon", portionGrams: 60, confidence: "low" },
            ],
          },
        },
      ],
      stop_reason: "tool_use",
    });

    const res = await POST(makeRequest(SAMPLE_BODY));
    const json = (await res.json()) as {
      foods: Array<{ name: string }>;
      unmatched: string[];
    };
    expect(json.foods.map((f) => f.name)).toEqual(["Oats"]);
    expect(json.unmatched).toEqual(["Unicorn Bacon"]);
  });

  it("uses matchPick (substring fallback) so paraphrased names still resolve", async () => {
    const spy = vi.spyOn(plan, "matchPick");
    mockCreate.mockResolvedValueOnce({
      id: "m1",
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "submit_meal_foods",
          input: {
            foods: [
              // "rolled oats" should substring-match the built-in "Oats".
              { name: "rolled oats", portionGrams: 50, confidence: "medium" },
            ],
          },
        },
      ],
      stop_reason: "tool_use",
    });

    const res = await POST(makeRequest(SAMPLE_BODY));
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalled();
    const json = (await res.json()) as { foods: Array<{ name: string }> };
    expect(json.foods).toHaveLength(1);
    expect(json.foods[0].name).toBe("Oats"); // resolved to the catalog name
  });

  it("clamps portionGrams to [5, 500] on the 5g grid", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "m1",
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "submit_meal_foods",
          input: {
            foods: [
              { name: "Oats", portionGrams: 9999, confidence: "high" },
              { name: "Olive Oil", portionGrams: 0.5, confidence: "high" },
              { name: "Chicken Breast", portionGrams: 123, confidence: "high" },
            ],
          },
        },
      ],
      stop_reason: "tool_use",
    });

    const res = await POST(makeRequest(SAMPLE_BODY));
    const json = (await res.json()) as {
      foods: Array<{ name: string; portionGrams: number }>;
    };
    expect(json.foods.find((f) => f.name === "Oats")?.portionGrams).toBe(500);
    expect(json.foods.find((f) => f.name === "Olive Oil")?.portionGrams).toBe(
      5,
    );
    expect(
      json.foods.find((f) => f.name === "Chicken Breast")?.portionGrams,
    ).toBe(125); // 123 → snaps to nearest 5
  });

  it("returns 400 on missing imageBase64", async () => {
    const res = await POST(makeRequest({ mediaType: "image/jpeg" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on unsupported mediaType", async () => {
    const res = await POST(
      makeRequest({ imageBase64: SAMPLE_IMAGE, mediaType: "image/heic" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 when ANTHROPIC_API_KEY is missing", async () => {
    const aiEnv = await import("@/lib/ai/env");
    vi.mocked(aiEnv.getAnthropicConfig).mockReturnValueOnce(null);
    const res = await POST(makeRequest(SAMPLE_BODY));
    expect(res.status).toBe(503);
  });
});
