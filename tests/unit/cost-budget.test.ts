import { describe, it, expect } from "vitest";
import { budgetLevel, dailyBudgetUsd, DEFAULT_DAILY_BUDGET_USD } from "@/lib/cost-budget";

/** Slice H5 — cost-budget thresholds, pure. */
describe("budgetLevel", () => {
  it("ok under 80%, warn at 80%, exceeded at 100%", () => {
    expect(budgetLevel(10, 25)).toBe("ok");
    expect(budgetLevel(19.99, 25)).toBe("ok");
    expect(budgetLevel(20, 25)).toBe("warn");
    expect(budgetLevel(24.99, 25)).toBe("warn");
    expect(budgetLevel(25, 25)).toBe("exceeded");
    expect(budgetLevel(100, 25)).toBe("exceeded");
  });
});

describe("dailyBudgetUsd", () => {
  it("reads a valid env override; falls back on junk, zero, or unset", () => {
    expect(dailyBudgetUsd("40")).toBe(40);
    expect(dailyBudgetUsd("0")).toBe(DEFAULT_DAILY_BUDGET_USD);
    expect(dailyBudgetUsd("-5")).toBe(DEFAULT_DAILY_BUDGET_USD);
    expect(dailyBudgetUsd("banana")).toBe(DEFAULT_DAILY_BUDGET_USD);
    expect(dailyBudgetUsd(undefined)).toBe(DEFAULT_DAILY_BUDGET_USD);
  });
});
