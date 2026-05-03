import {
  AssetType,
  FinancialGoalStatus,
  FinancialGoalType,
  IncomeStability
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildSequentialTimeline,
  buildExpenseBreakdownSummaryLines,
  buildFinancialFreedomAllocationPlan,
  buildOnboardingPlanningAnalysis,
  calculateFinancialFreedomPlan,
  calculateTargetFeasibility,
  evaluateTargetAgainstCurrentPlan,
  generateFinalTimelineCopy
} from "@/lib/services/onboarding/onboarding-calculation-service";

describe("onboarding calculation service", () => {
  it("builds detailed expense breakdown summary lines for the final onboarding message", () => {
    const lines = buildExpenseBreakdownSummaryLines({
      food: 1200000,
      transport: 300000,
      bills: 850000,
      entertainment: 200000,
      others: 400000
    });

    expect(lines.join("\n")).toContain("Rincian pengeluaran bulanan yang saya catat:");
    expect(lines.join("\n")).toContain("Makan & kebutuhan harian");
    expect(lines.join("\n")).toContain("Tagihan & kewajiban rutin");
    expect(lines.join("\n")).toContain("Pengelompokan kategori yang saya pakai:");
    expect(lines.join("\n")).toContain("sembako");
    expect(lines.join("\n")).toContain("BPJS");
  });

  it("returns no lines when breakdown is empty", () => {
    expect(
      buildExpenseBreakdownSummaryLines({
        food: 0,
        transport: 0,
        bills: 0,
        entertainment: 0,
        others: 0
      })
    ).toEqual([]);
  });

  it("defers final financial freedom allocation when multiple goals are active", () => {
    const analysis = buildOnboardingPlanningAnalysis({
      incomeStability: IncomeStability.MIXED,
      monthlyIncomeTotal: 8_200_000,
      monthlyExpenseTotal: 3_500_000,
      goals: [
        {
          goalType: FinancialGoalType.EMERGENCY_FUND,
          goalName: "Dana Darurat",
          targetAmount: null,
          targetMonth: null,
          targetYear: null,
          status: FinancialGoalStatus.ACTIVE
        },
        {
          goalType: FinancialGoalType.CUSTOM,
          goalName: "Dana Nikah",
          targetAmount: 150_000_000,
          targetMonth: null,
          targetYear: null,
          status: FinancialGoalStatus.ACTIVE
        },
        {
          goalType: FinancialGoalType.FINANCIAL_FREEDOM,
          goalName: "Financial Freedom",
          targetAmount: 1_050_000_000,
          targetMonth: null,
          targetYear: null,
          status: FinancialGoalStatus.ACTIVE
        }
      ],
      assets: [
        {
          assetType: AssetType.SAVINGS,
          assetName: "Tabungan Bank",
          estimatedValue: 3_000_000
        },
        {
          assetType: AssetType.GOLD,
          assetName: "Antam 24 karat",
          estimatedValue: 18_000_000
        }
      ]
    });

    expect(analysis.activeGoalCount).toBe(3);
    expect(analysis.recommendedPriorityOrder).toEqual([
      "Dana Darurat",
      "Dana Nikah",
      "Financial Freedom"
    ]);
    expect(analysis.canFinancialFreedomBeCalculatedFinal).toBe(false);
    expect(analysis.financialFreedomResidualMonthlyAllocation).toBeNull();
    expect(analysis.suggestedNextQuestion).toBeNull();
    expect(analysis.emergencyFund.minimumTarget).toBe(21_000_000);
    expect(analysis.emergencyFund.recommendedTarget).toBe(31_500_000);
    expect(analysis.emergencyFund.mappedProgressAmount).toBe(3_000_000);
    expect(analysis.assetMapping[0]).toMatchObject({
      mappedUse: "EMERGENCY_BUFFER"
    });
    expect(analysis.assetMapping[1]).toMatchObject({
      mappedUse: "LONG_TERM_BUFFER"
    });
  });

  it("uses residual allocation for financial freedom when parallel goals have a clear pace", () => {
    const analysis = buildOnboardingPlanningAnalysis({
      incomeStability: IncomeStability.STABLE,
      monthlyIncomeTotal: 12_000_000,
      monthlyExpenseTotal: 4_000_000,
      goalExecutionMode: "PARALLEL",
      priorityGoalType: FinancialGoalType.CUSTOM,
      goals: [
        {
          goalType: FinancialGoalType.CUSTOM,
          goalName: "Dana Nikah",
          targetAmount: 48_000_000,
          targetMonth: 4,
          targetYear: 2028,
          status: FinancialGoalStatus.ACTIVE
        },
        {
          goalType: FinancialGoalType.FINANCIAL_FREEDOM,
          goalName: "Financial Freedom",
          targetAmount: 1_200_000_000,
          targetMonth: null,
          targetYear: null,
          status: FinancialGoalStatus.ACTIVE
        }
      ],
      assets: []
    });

    expect(analysis.recommendedAllocationMode).toBe("PARALLEL");
    expect(analysis.selectedPriorityGoalType).toBe(FinancialGoalType.CUSTOM);
    expect(analysis.canFinancialFreedomBeCalculatedFinal).toBe(true);
    expect(analysis.financialFreedomResidualMonthlyAllocation).toBeGreaterThan(0);
    expect(analysis.goalSummaries[0]).toMatchObject({
      goalType: FinancialGoalType.CUSTOM,
      targetDateLabel: expect.any(String),
      requiredMonthlyAllocation: expect.any(Number)
    });
  });

  it("puts financial freedom after all earlier sequential goals instead of only the first priority goal", () => {
    const plan = buildFinancialFreedomAllocationPlan({
      goals: [
        {
          goalType: FinancialGoalType.EMERGENCY_FUND,
          goalName: "Dana Darurat",
          targetAmount: null,
          targetMonth: null,
          targetYear: null,
          status: FinancialGoalStatus.ACTIVE
        },
        {
          goalType: FinancialGoalType.HOUSE,
          goalName: "Beli Rumah",
          targetAmount: 700_000_000,
          targetMonth: 6,
          targetYear: 2030,
          status: FinancialGoalStatus.ACTIVE
        },
        {
          goalType: FinancialGoalType.VEHICLE,
          goalName: "Beli Kendaraan",
          targetAmount: 300_000_000,
          targetMonth: 6,
          targetYear: 2032,
          status: FinancialGoalStatus.ACTIVE
        },
        {
          goalType: FinancialGoalType.FINANCIAL_FREEDOM,
          goalName: "Financial Freedom",
          targetAmount: 750_000_000,
          targetMonth: null,
          targetYear: null,
          status: FinancialGoalStatus.ACTIVE
        }
      ],
      potentialMonthlySaving: 6_700_000,
      financialFreedomTarget: 750_000_000,
      emergencyFundTarget: 22_500_000,
      monthlyExpenseTotal: 2_500_000,
      goalExecutionMode: "SEQUENTIAL",
      priorityGoalType: FinancialGoalType.EMERGENCY_FUND
    });

    expect(plan.projectionBasis).toBe("AFTER_PRIORITY_GOAL");
    expect(plan.monthlyAllocation).toBe(0);
    expect(plan.priorityGoalName).toContain("Dana Darurat");
    expect(plan.priorityGoalName).toContain("Beli Rumah");
    expect(plan.priorityGoalName).toContain("Beli Kendaraan");
    expect(plan.estimatedMonthsToGoal).toBeGreaterThan(200);
  });

  it("calculates target feasibility gaps against the current surplus", () => {
    const result = calculateTargetFeasibility({
      targetAmount: 250_000_000,
      currentSavedAmount: 0,
      targetDate: { month: 3, year: 2027 },
      monthlySurplus: 6_500_000
    });

    expect(result.requiredMonthly).toBeGreaterThan(20_000_000);
    expect(result.monthlySurplus).toBe(6_500_000);
    expect(result.gap).toBeGreaterThan(10_000_000);
    expect(result.feasible).toBe(false);
    expect(result.realisticMonths).toBeGreaterThan(30);
  });

  it("calculates financial freedom plans with explicit monthly contribution and gap values", () => {
    const result = calculateFinancialFreedomPlan({
      targetAmount: 1_200_000_000,
      targetDate: { month: 6, year: 2035 },
      monthlySurplus: 6_500_000
    });

    expect(result.requiredMonthlyContribution).toBeTypeOf("number");
    expect(result.availableMonthlyContribution).toBe(6_500_000);
    expect(result.gapMonthly).toBeGreaterThanOrEqual(0);
  });

  it("delays lower-priority goals in sequential mode instead of evaluating them from month one", () => {
    const analysis = buildOnboardingPlanningAnalysis({
      incomeStability: IncomeStability.STABLE,
      monthlyIncomeTotal: 10_000_000,
      monthlyExpenseTotal: 3_000_000,
      goalExecutionMode: "SEQUENTIAL",
      priorityGoalType: FinancialGoalType.HOUSE,
      goals: [
        {
          goalType: FinancialGoalType.HOUSE,
          goalName: "Beli Rumah",
          targetAmount: 84_000_000,
          targetMonth: null,
          targetYear: null,
          status: FinancialGoalStatus.ACTIVE
        },
        {
          goalType: FinancialGoalType.VACATION,
          goalName: "Liburan Jepang",
          targetAmount: 84_000_000,
          targetMonth: 4,
          targetYear: 2027,
          status: FinancialGoalStatus.ACTIVE
        }
      ],
      assets: []
    });

    const vacationSummary = analysis.goalSummaries.find((goal) => goal.goalType === FinancialGoalType.VACATION);

    expect(vacationSummary).toMatchObject({
      basis: "SEQUENTIAL_AFTER_PREVIOUS",
      availableMonthlyAllocation: 7_000_000,
      feasible: false
    });
    expect(vacationSummary?.startOffsetMonths).toBeGreaterThan(0);
    expect(vacationSummary?.startLabel).toBeTypeOf("string");
    expect(vacationSummary?.deadlineMissedBeforeStart).toBe(true);
    expect(vacationSummary?.effectiveMonthsUntilTarget).toBe(0);
    expect(vacationSummary?.requiredMonthlyAllocation).toBeNull();
    expect(vacationSummary?.realisticTargetLabel).toBeTypeOf("string");
  });

  it("surfaces the portfolio gap for parallel targets and uses residual capacity for non-priority goals", () => {
    const analysis = buildOnboardingPlanningAnalysis({
      incomeStability: IncomeStability.STABLE,
      monthlyIncomeTotal: 12_000_000,
      monthlyExpenseTotal: 5_000_000,
      goalExecutionMode: "PARALLEL",
      priorityGoalType: FinancialGoalType.CUSTOM,
      goals: [
        {
          goalType: FinancialGoalType.CUSTOM,
          goalName: "Dana Nikah",
          targetAmount: 48_000_000,
          targetMonth: 4,
          targetYear: 2027,
          status: FinancialGoalStatus.ACTIVE
        },
        {
          goalType: FinancialGoalType.HOUSE,
          goalName: "Beli Rumah",
          targetAmount: 72_000_000,
          targetMonth: 4,
          targetYear: 2027,
          status: FinancialGoalStatus.ACTIVE
        }
      ],
      assets: []
    });

    const houseSummary = analysis.goalSummaries.find((goal) => goal.goalType === FinancialGoalType.HOUSE);

    expect(analysis.portfolioRequiredMonthlyAllocation).toBe(10_909_092);
    expect(analysis.portfolioGapMonthly).toBe(3_909_092);
    expect(houseSummary).toMatchObject({
      basis: "PARALLEL_RESIDUAL",
      availableMonthlyAllocation: 2_636_363,
      gapMonthly: 3_909_092,
      feasible: false
    });
  });

  it("never produces a reversed timeline period when a target is impossible sequentially", () => {
    const periods = buildSequentialTimeline([
      {
        goalType: FinancialGoalType.VEHICLE,
        name: "Beli Kendaraan",
        amount: 300_000_000,
        desiredDate: {
          month: 6,
          year: 2032,
          monthsFromNow: 74,
          label: "Juni 2032"
        },
        realisticStartDate: {
          month: 6,
          year: 2035,
          monthsFromNow: 110,
          label: "Juni 2035"
        },
        realisticEndDate: {
          month: 2,
          year: 2039,
          monthsFromNow: 154,
          label: "Februari 2039"
        },
        requiredMonthlyForDesiredDate: 37_500_000,
        allocatedMonthly: 6_700_000,
        gapMonthly: 30_800_000,
        status: "impossible_sequential",
        userDecision: "pending",
        targetAmount: 300_000_000,
        targetDateLabel: "Juni 2032",
        basis: "SEQUENTIAL_AFTER_PREVIOUS",
        insight:
          "Tidak feasible dalam mode berurutan. Target ini baru bisa mulai setelah prioritas sebelumnya beres."
      }
    ]);

    expect(periods).toHaveLength(1);
    expect(periods[0]?.startDate.label).toBe("Juni 2035");
    expect(periods[0]?.endDate.label).toBe("Februari 2039");
    expect(periods[0]?.endDate.label).not.toBe("Juni 2032");
  });

  it("keeps an explicitly accepted impossible target on the requested deadline", () => {
    const periods = buildSequentialTimeline([
      {
        goalType: FinancialGoalType.CUSTOM,
        name: "Dana Nikah",
        amount: 250_000_000,
        desiredDate: {
          month: 3,
          year: 2027,
          monthsFromNow: 10,
          label: "Maret 2027"
        },
        realisticStartDate: {
          month: 10,
          year: 2026,
          monthsFromNow: 5,
          label: "Oktober 2026"
        },
        realisticEndDate: {
          month: 7,
          year: 2045,
          monthsFromNow: 231,
          label: "Juli 2045"
        },
        requiredMonthlyForDesiredDate: 41_666_667,
        allocatedMonthly: 6_700_000,
        gapMonthly: 41_666_667,
        status: "impossible_sequential",
        userDecision: "original",
        targetAmount: 250_000_000,
        targetDateLabel: "Maret 2027",
        basis: "PARALLEL_RESIDUAL",
        insight:
          "Tidak feasible dalam mode berurutan. Target ini baru bisa mulai setelah prioritas sebelumnya beres."
      }
    ]);

    expect(periods).toHaveLength(1);
    expect(periods[0]?.startDate.label).toBe("Oktober 2026");
    expect(periods[0]?.endDate.label).toBe("Maret 2027");
  });

  it("keeps final timeline in priority order when accepted deadlines need parallel setoran", () => {
    const timeline = generateFinalTimelineCopy({
      evaluations: [
        {
          goalType: FinancialGoalType.EMERGENCY_FUND,
          name: "Dana Darurat",
          amount: 22_500_000,
          desiredDate: {
            month: 9,
            year: 2026,
            monthsFromNow: 5,
            label: "September 2026"
          },
          realisticStartDate: {
            month: 6,
            year: 2026,
            monthsFromNow: 1,
            label: "Juni 2026"
          },
          realisticEndDate: {
            month: 9,
            year: 2026,
            monthsFromNow: 5,
            label: "September 2026"
          },
          requiredMonthlyForDesiredDate: 6_700_000,
          allocatedMonthly: 6_700_000,
          gapMonthly: 0,
          status: "feasible",
          userDecision: "original",
          targetAmount: 22_500_000,
          targetDateLabel: "September 2026",
          basis: "FULL_SURPLUS",
          insight: "Target ini masih aman di ritme sekarang."
        },
        {
          goalType: FinancialGoalType.HOUSE,
          name: "Beli Rumah",
          amount: 300_000_000,
          desiredDate: {
            month: 6,
            year: 2030,
            monthsFromNow: 50,
            label: "Juni 2030"
          },
          realisticStartDate: {
            month: 10,
            year: 2026,
            monthsFromNow: 6,
            label: "Oktober 2026"
          },
          realisticEndDate: {
            month: 6,
            year: 2030,
            monthsFromNow: 50,
            label: "Juni 2030"
          },
          requiredMonthlyForDesiredDate: 6_700_000,
          allocatedMonthly: 6_700_000,
          gapMonthly: 0,
          status: "feasible",
          userDecision: "original",
          targetAmount: 300_000_000,
          targetDateLabel: "Juni 2030",
          basis: "SEQUENTIAL_AFTER_PREVIOUS",
          insight: "Target ini masih aman di ritme sekarang."
        },
        {
          goalType: FinancialGoalType.VACATION,
          name: "Liburan",
          amount: 30_000_000,
          desiredDate: {
            month: 11,
            year: 2026,
            monthsFromNow: 7,
            label: "November 2026"
          },
          realisticStartDate: {
            month: 10,
            year: 2026,
            monthsFromNow: 6,
            label: "Oktober 2026"
          },
          realisticEndDate: {
            month: 5,
            year: 2033,
            monthsFromNow: 85,
            label: "Mei 2033"
          },
          requiredMonthlyForDesiredDate: 15_000_000,
          allocatedMonthly: 6_700_000,
          gapMonthly: 15_000_000,
          status: "impossible_sequential",
          userDecision: "original",
          targetAmount: 30_000_000,
          targetDateLabel: "November 2026",
          basis: "PARALLEL_RESIDUAL",
          insight:
            "Tidak feasible dalam mode berurutan. Target ini baru bisa mulai setelah prioritas sebelumnya beres."
        }
      ]
    });

    expect(timeline).toContain("Deadline versi Boss: November 2026");
    expect(timeline).toContain("Versi realistis berurutan: Mei 2033");
    expect(timeline).toContain("perlu jalan paralel");
    expect(timeline?.indexOf("Fokus: Beli Rumah")).toBeLessThan(
      timeline?.indexOf("Fokus: Liburan") ?? Number.MAX_SAFE_INTEGER
    );
  });

  it("shows the requested deadline even when the final timeline uses a realistic Financial Freedom end date", () => {
    const timeline = generateFinalTimelineCopy({
      evaluations: [
        {
          goalType: FinancialGoalType.FINANCIAL_FREEDOM,
          name: "Financial Freedom",
          amount: 6_000_000_000,
          desiredDate: {
            month: 5,
            year: 2036,
            monthsFromNow: 121,
            label: "Mei 2036"
          },
          realisticStartDate: {
            month: 8,
            year: 2036,
            monthsFromNow: 124,
            label: "Agustus 2036"
          },
          realisticEndDate: {
            month: 3,
            year: 2111,
            monthsFromNow: 1018,
            label: "Maret 2111"
          },
          requiredMonthlyForDesiredDate: 50_000_000,
          allocatedMonthly: 6_700_000,
          gapMonthly: 43_300_000,
          status: "needs_parallel",
          userDecision: "realistic",
          targetAmount: 6_000_000_000,
          targetDateLabel: null,
          basis: "PARALLEL_RESIDUAL",
          insight: "Deadline Financial Freedom versi Boss perlu tambahan setoran."
        }
      ]
    });

    expect(timeline).toContain("Agustus 2036 - Maret 2111");
    expect(timeline).toContain("Deadline versi Boss: Mei 2036");
    expect(timeline).toContain("Gap: Rp43.300.000/bulan");
    expect(timeline).not.toContain("Target ini masih aman di ritme sekarang.");
  });

  it("keeps custom targets inside the final timeline copy", () => {
    const analysis = buildOnboardingPlanningAnalysis({
      incomeStability: IncomeStability.STABLE,
      monthlyIncomeTotal: 12_000_000,
      monthlyExpenseTotal: 5_000_000,
      goalExecutionMode: "SEQUENTIAL",
      priorityGoalType: FinancialGoalType.CUSTOM,
      goals: [
        {
          goalType: FinancialGoalType.CUSTOM,
          goalName: "Dana Nikah",
          targetAmount: 48_000_000,
          targetMonth: 4,
          targetYear: 2028,
          status: FinancialGoalStatus.ACTIVE
        },
        {
          goalType: FinancialGoalType.HOUSE,
          goalName: "Beli Rumah",
          targetAmount: 240_000_000,
          targetMonth: 6,
          targetYear: 2030,
          status: FinancialGoalStatus.ACTIVE
        }
      ],
      assets: []
    });

    const timeline = generateFinalTimelineCopy({
      evaluations: analysis.goalSummaries.map((goal) =>
        evaluateTargetAgainstCurrentPlan({
          goal,
          userDecision: "original"
        })
      )
    });

    expect(timeline).toContain("Dana Nikah");
    expect(timeline).toContain("Beli Rumah");
    expect(timeline?.indexOf("Dana Nikah")).toBeLessThan(timeline?.indexOf("Beli Rumah") ?? 0);
  });

  it("does not crash when one active target is complete and another still has no resolved target amount", () => {
    expect(() =>
      buildOnboardingPlanningAnalysis({
        incomeStability: IncomeStability.STABLE,
        monthlyIncomeTotal: 9_200_000,
        monthlyExpenseTotal: 2_500_000,
        goalExecutionMode: "SEQUENTIAL",
        priorityGoalType: FinancialGoalType.HOUSE,
        goals: [
          {
            goalType: FinancialGoalType.HOUSE,
            goalName: "Beli Rumah",
            targetAmount: 700_000_000,
            targetMonth: 6,
            targetYear: 2030,
            status: FinancialGoalStatus.ACTIVE
          },
          {
            goalType: FinancialGoalType.FINANCIAL_FREEDOM,
            goalName: "Financial Freedom",
            targetAmount: null,
            targetMonth: null,
            targetYear: null,
            status: FinancialGoalStatus.PENDING_CALCULATION
          }
        ],
        assets: []
      })
    ).not.toThrow();
  });
});

