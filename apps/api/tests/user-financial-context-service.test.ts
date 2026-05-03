import { describe, expect, it } from "vitest";
import { buildUserFinancialContextSummary } from "@/lib/services/user/user-financial-context-service";

describe("user financial context service", () => {
  it("includes onboarding expense details in the AI context summary", () => {
    const summary = buildUserFinancialContextSummary({
      registrationStatus: "COMPLETED",
      onboardingStatus: "COMPLETED",
      analysisReady: true,
      hasAssets: true,
      hasPassiveIncome: false,
      monthlyIncomeTotal: 10000000,
      monthlyExpenseTotal: 4000000,
      potentialMonthlySaving: 6000000,
      savingRate: 60,
      expenseBuckets: [
        { categoryKey: "food", amount: 900000 },
        { categoryKey: "entertainment", amount: 50000 }
      ],
      manualExpenseDetails: [
        { label: "spotify", amount: 50000, bucket: "entertainment" },
        { label: "sembako", amount: 900000, bucket: "food" }
      ],
      goals: [
        {
          goalName: "Dana Darurat",
          targetAmount: 24000000,
          status: "ACTIVE",
          estimatedMonthsToGoal: 4,
          currentProgress: 6000000,
          remainingAmount: 18000000,
          progressPercent: 25
        }
      ],
      assets: [
        {
          assetName: "Antam 24 karat",
          assetType: "GOLD",
          estimatedValue: 10000000
        }
      ],
      recentExpenseDetailTags: ["Spotify", "Groceries"],
      recentMessages: []
    });

    expect(summary).toContain("onboardingExpenseDetails=");
    expect(summary).toContain("spotify:");
    expect(summary).toContain("->entertainment");
    expect(summary).toContain("assets=");
    expect(summary).toContain("goals=");
    expect(summary).toContain("hasPassiveIncome=no");
  });
});

