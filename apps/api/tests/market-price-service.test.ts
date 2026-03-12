import { describe, expect, it } from "vitest";
import { resolveMarketSymbol } from "@/lib/services/market/market-price-service";

describe("market symbol resolver", () => {
  it("resolves gold aliases", () => {
    expect(resolveMarketSymbol("emas")).toEqual({ kind: "gold", symbol: "XAU" });
  });

  it("resolves crypto symbols", () => {
    expect(resolveMarketSymbol("btc")).toEqual({ kind: "crypto", symbol: "BTC" });
  });

  it("resolves stock symbol", () => {
    expect(resolveMarketSymbol("bbca")).toEqual({ kind: "stock", symbol: "BBCA" });
  });
});

