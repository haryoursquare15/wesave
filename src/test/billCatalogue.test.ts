import { beforeEach, describe, expect, it, vi } from "vitest";
import { categoryKey, visibleCategories, isVisibleBiller, fetchBillCatalogue, readBillCache, writeBillCache } from "@/lib/billCatalogue";

beforeEach(() => localStorage.clear());
describe("bill catalogue rules", () => {
  it("handles the provider's misspelled combined betting category without changing the request key", () => {
    const raw = "BETTTING, LOTTERY AND GAMING";
    expect(categoryKey(raw)).toBe("Betting");
    expect(visibleCategories([raw, "Betting", "Airtime", "EDUCATION"])).toEqual([raw, "Airtime"]);
  });
  it("excludes lottery providers by name or identifier including MegaMillions", () => {
    expect([{ id: "25LOTTO", name: "Wallet top up" }, { id: "MEGAMILLIONS_NAIJA", name: "MEGAMILLIONS NAIJA" }, { id: "other", name: "Lottery" }, { id: "SPORTYBET", name: "SportyBet" }].filter(isVisibleBiller)).toEqual([{ id: "SPORTYBET", name: "SportyBet" }]);
  });
  it("reuses fresh lists and shares simultaneous catalogue requests", async () => {
    const fetcher = vi.fn(async () => ["plan"]);
    await Promise.all([fetchBillCatalogue("plans", fetcher), fetchBillCatalogue("plans", fetcher)]);
    await fetchBillCatalogue("plans", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("shows an older list while refreshing, but discards lists older than seven days", () => {
    writeBillCache("plans", ["plan"]);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now");
    clock.mockReturnValue(now + 13 * 60 * 60 * 1000);
    expect(readBillCache("plans")).toEqual(["plan"]);
    expect(readBillCache("plans", true)).toBeNull();
    clock.mockReturnValue(now + 8 * 24 * 60 * 60 * 1000);
    expect(readBillCache("plans")).toBeNull();
    clock.mockRestore();
  });
});