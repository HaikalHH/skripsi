import { describe, expect, it } from "vitest";
import { extractJsonObject, geminiExtractionSchema } from "@finance/shared";

describe("Gemini extraction parsing", () => {
  it("parses valid JSON wrapped by markdown fence", () => {
    const raw = `
\`\`\`json
{
  "intent": "RECORD_TRANSACTION",
  "type": "EXPENSE",
  "amount": 45000,
  "category": "Food",
  "merchant": "Warung",
  "note": "Lunch",
  "occurredAt": "2026-02-15T12:00:00+07:00",
  "reportPeriod": null,
  "adviceQuery": null
}
\`\`\`
`;

    const parsed = geminiExtractionSchema.parse(extractJsonObject(raw));
    expect(parsed.intent).toBe("RECORD_TRANSACTION");
    expect(parsed.amount).toBe(45000);
    expect(parsed.category).toBe("Food");
    expect(parsed.adviceQuery).toBeNull();
  });

  it("rejects invalid payload shape", () => {
    const raw = `{"intent":"RECORD_TRANSACTION","type":"EXPENSE","amount":"abc","category":"Food","merchant":null,"note":null,"occurredAt":null,"reportPeriod":null}`;
    expect(() => geminiExtractionSchema.parse(extractJsonObject(raw))).toThrowError();
  });

  it("rejects retired financial advice intent", () => {
    const raw =
      '{"intent":"REQUEST_FINANCIAL_ADVICE","type":null,"amount":null,"category":null,"merchant":null,"note":null,"occurredAt":null,"reportPeriod":null,"adviceQuery":"Boleh beli HP bulan ini?"}';

    expect(() => geminiExtractionSchema.parse(extractJsonObject(raw))).toThrowError();
  });

  it("parses saving transaction intent", () => {
    const raw =
      '{"intent":"RECORD_TRANSACTION","type":"SAVING","amount":500000,"category":"Tabungan","merchant":"Tabungan Pribadi","note":null,"occurredAt":null,"reportPeriod":null,"adviceQuery":null}';

    const parsed = geminiExtractionSchema.parse(extractJsonObject(raw));
    expect(parsed.intent).toBe("RECORD_TRANSACTION");
    expect(parsed.type).toBe("SAVING");
    expect(parsed.amount).toBe(500000);
  });
});
