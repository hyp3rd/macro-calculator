/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { notifyDataChanged, subscribeDataChanged } from "./data-bus";

describe("data-bus", () => {
  it("delivers notifications to subscribers of the matching table only", () => {
    const profileCb = vi.fn();
    const customCb = vi.fn();
    const unsub1 = subscribeDataChanged("profile", profileCb);
    const unsub2 = subscribeDataChanged("customFoods", customCb);

    notifyDataChanged("profile");
    expect(profileCb).toHaveBeenCalledTimes(1);
    expect(customCb).not.toHaveBeenCalled();

    notifyDataChanged("customFoods");
    expect(profileCb).toHaveBeenCalledTimes(1);
    expect(customCb).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });

  it("supports multiple subscribers on the same table", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeDataChanged("recipes", a);
    const unsubB = subscribeDataChanged("recipes", b);

    notifyDataChanged("recipes");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    unsubA();
    unsubB();
  });

  it("unsubscribe removes only the specified callback", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeDataChanged("mealTemplates", a);
    subscribeDataChanged("mealTemplates", b);

    unsubA();
    notifyDataChanged("mealTemplates");

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("isolates a throwing subscriber so peers still receive", () => {
    const thrower = vi.fn(() => {
      throw new Error("boom");
    });
    const peer = vi.fn();
    const unsub1 = subscribeDataChanged("dailyLogs", thrower);
    const unsub2 = subscribeDataChanged("dailyLogs", peer);

    expect(() => notifyDataChanged("dailyLogs")).not.toThrow();
    expect(thrower).toHaveBeenCalledTimes(1);
    expect(peer).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });
});
