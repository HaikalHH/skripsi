import { describe, expect, it } from "vitest";
import {
  isLikelySavingTransactionText,
  resolveSavingGoalSelection
} from "@/lib/services/transactions/saving-intent-service";

describe("saving intent service", () => {
  it("detects saving transactions from natural language", () => {
    expect(isLikelySavingTransactionText("nabung 500 ribu")).toBe(true);
    expect(isLikelySavingTransactionText("setor tabungan 1 juta")).toBe(true);
    expect(isLikelySavingTransactionText("mau nabung 50 juta")).toBe(false);
    expect(isLikelySavingTransactionText("kalau nabung 2 juta/bulan 5 tahun jadi berapa")).toBe(false);
  });

  it("extracts goal selection from contextual saving text", () => {
    expect(resolveSavingGoalSelection("nabung buat motor 1 juta")).toEqual({
      goalType: "VEHICLE",
      goalName: "Beli Kendaraan",
      goalQuery: "Beli Kendaraan"
    });

    expect(resolveSavingGoalSelection("nabung untuk nikahan 750 ribu")).toEqual({
      goalType: "CUSTOM",
      goalName: "Nikahan",
      goalQuery: "Nikahan"
    });
  });
});
