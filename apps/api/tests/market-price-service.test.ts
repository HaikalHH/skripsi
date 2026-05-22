import { describe, expect, it } from "vitest";
import { resolveMarketSymbol } from "@/lib/services/market/quote";

describe("market symbol resolver", () => {
  it("resolves gold aliases", () => {
    expect(resolveMarketSymbol("emas")).toEqual({ kind: "gold", symbol: "XAU" });
  });

  it("does not resolve removed crypto symbols", () => {
    expect(resolveMarketSymbol("btc")).toBeNull();
  });

  it("resolves stock symbol", () => {
    expect(resolveMarketSymbol("bbca")).toEqual({ kind: "stock", symbol: "BBCA" });
  });

  it("normalizes common stock aliases", () => {
    expect(resolveMarketSymbol("goog")).toEqual({ kind: "stock", symbol: "GOOGL" });
  });
});

