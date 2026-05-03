import { describe, expect, it } from "vitest";
import { applyBossFinanceEmojiStyle } from "@/lib/services/messaging/bot-text-style-service";

describe("bot text boss finance emoji styling", () => {
  it("uses a finance emoji for cashflow messages", () => {
    expect(applyBossFinanceEmojiStyle("Cashflow kamu masih cukup aman minggu ini.")).toBe(
      "\u{1F4B8} Cashflow kamu masih cukup aman minggu ini."
    );
  });

  it("styles multiple lines with contextual emojis instead of only the first line", () => {
    expect(
      applyBossFinanceEmojiStyle(
        "Ringkasan cashflow bulan ini\nTarget dana darurat belum cukup\nBalas pilihan targetnya ya Boss."
      )
    ).toBe(
      "Ringkasan cashflow bulan ini\n\u26A0\uFE0F Target dana darurat belum cukup\nBalas pilihan targetnya ya Boss."
    );
  });

  it("does not add another emoji when the message already has one", () => {
    expect(
      applyBossFinanceEmojiStyle("\u2705 Portofolio kamu masih rapi.\nTarget rumah masih jalan.")
    ).toBe("\u2705 Portofolio kamu masih rapi.\nTarget rumah masih jalan.");
  });

  it("still adds a warning when the message already has an emoji and the warning is important", () => {
    expect(
      applyBossFinanceEmojiStyle("\u2705 Portofolio kamu masih rapi.\nTagihan jatuh tempo besok.")
    ).toBe("\u2705 Portofolio kamu masih rapi.\n\u26A0\uFE0F Tagihan jatuh tempo besok.");
  });

  it("preserves leading reminder markers and styles the visible message lines", () => {
    expect(
      applyBossFinanceEmojiStyle(
        "Reminder Cashflow 2026-04-24\nBuffer kamu mulai tipis.\nBalas nominalnya ya Boss.",
        {
          preserveLeadingMarker: true
        }
      )
    ).toBe(
      `Reminder Cashflow 2026-04-24\n\u26A0\uFE0F Buffer kamu mulai tipis.\nBalas nominalnya ya Boss.`
    );
  });

  it("keeps numbered list markers while injecting contextual emojis per item", () => {
    expect(
      applyBossFinanceEmojiStyle("Pilihan:\n1. Dana darurat\n2. Pengeluaran bulanan", {
        preserveLeadingMarker: true
      })
    ).toBe(`Pilihan:\n1. \u{1F3AF} Dana darurat\n2. Pengeluaran bulanan`);
  });
});
