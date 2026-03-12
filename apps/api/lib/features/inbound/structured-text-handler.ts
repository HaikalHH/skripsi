import { AnalysisType } from "@prisma/client";
import { HELP_TEXT } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { createAIAnalysisLog } from "@/lib/services/ai/ai-log-service";
import { upsertCategoryBudget } from "@/lib/services/transactions/budget-service";
import { buildCashflowForecastReply } from "@/lib/services/planning/cashflow-forecast-service";
import { buildFinancialHealthReply } from "@/lib/services/planning/financial-health-service";
import { tryHandleFinancialFreedomCommand } from "@/lib/services/planning/financial-freedom-service";
import { tryHandleFinanceNewsCommand } from "@/lib/services/market/finance-news-service";
import {
  ALL_GLOBAL_CONTEXT_MODULES,
  routeGlobalTextContext,
  type GlobalContextModule
} from "@/lib/services/assistant/global-context-router-service";
import { tryHandleMarketCommand } from "@/lib/services/market/market-command-service";
import { tryHandlePortfolioCommand } from "@/lib/services/market/portfolio-command-service";
import { tryHandlePrivacyCommand } from "@/lib/services/assistant/privacy-command-service";
import { buildGoalPlannerReply } from "@/lib/services/planning/goal-planner-service";
import { tryHandleSmartAllocation } from "@/lib/services/planning/smart-allocation-service";
import { tryHandleTransactionMutationCommand } from "@/lib/services/transactions/transaction-mutation-command-service";
import { tryHandleWealthProjection } from "@/lib/services/planning/wealth-projection-service";
import { generateUserFinancialAdvice } from "@/lib/services/assistant/advice-service";
import {
  addGoalContribution,
  getSavingsGoalStatus,
  setSavingsGoalTarget
} from "@/lib/services/planning/goal-service";
import { generateUserInsight } from "@/lib/services/reporting/insight-service";
import {
  buildCategoryDetailReport,
  buildGeneralAnalyticsReport
} from "@/lib/services/reporting/report-service";
import {
  buildReminderPreferenceText,
  getReminderPreference,
  updateReminderPreference
} from "@/lib/services/reminders/reminder-preference-service";
import {
  buildBudgetSetText,
  buildGoalContributionText,
  buildGoalStatusText
} from "./formatters";
import { buildReportResponse, toReportReplyBody } from "./report";
import { ok, type InboundHandlerResult } from "./result";

type StructuredTextParams = {
  userId: string;
  messageId: string;
  text: string;
};

const tryHandleContextModules = async (
  params: StructuredTextParams,
  moduleOrder: GlobalContextModule[]
): Promise<InboundHandlerResult | null> => {
  const triedModules = new Set<GlobalContextModule>();
  const modulesToTry = [
    ...moduleOrder,
    ...ALL_GLOBAL_CONTEXT_MODULES.filter((contextModule) => !moduleOrder.includes(contextModule))
  ];

  for (const contextModule of modulesToTry) {
    if (triedModules.has(contextModule)) continue;
    triedModules.add(contextModule);

    if (contextModule === "TRANSACTION") {
      continue;
    }

    if (contextModule === "TRANSACTION_MUTATION") {
      const transactionMutation = await tryHandleTransactionMutationCommand({
        userId: params.userId,
        text: params.text
      });
      if (transactionMutation.handled) {
        return ok({ replyText: transactionMutation.replyText });
      }
      continue;
    }

    if (contextModule === "PORTFOLIO") {
      const portfolioCommand = await tryHandlePortfolioCommand({
        userId: params.userId,
        text: params.text
      });
      if (portfolioCommand.handled) {
        return ok({ replyText: portfolioCommand.replyText });
      }
      continue;
    }

    if (contextModule === "MARKET") {
      const marketCommand = await tryHandleMarketCommand(params.text);
      if (marketCommand.handled) {
        return ok({ replyText: marketCommand.replyText });
      }
      continue;
    }

    if (contextModule === "NEWS") {
      try {
        const newsCommand = await tryHandleFinanceNewsCommand({
          userId: params.userId,
          text: params.text
        });
        if (newsCommand.handled) {
          return ok({ replyText: newsCommand.replyText });
        }
      } catch (error) {
        logger.warn({ err: error }, "Finance news retrieval failed");
        return ok({
          replyText: "Berita finance belum tersedia sementara. Coba lagi beberapa menit lagi."
        });
      }
      continue;
    }

    if (contextModule === "SMART_ALLOCATION") {
      const allocationCommand = await tryHandleSmartAllocation({
        userId: params.userId,
        text: params.text
      });
      if (allocationCommand.handled) {
        return ok({ replyText: allocationCommand.replyText });
      }
      continue;
    }

    if (contextModule === "FINANCIAL_FREEDOM") {
      const freedomCommand = await tryHandleFinancialFreedomCommand({
        userId: params.userId,
        text: params.text
      });
      if (freedomCommand.handled) {
        return ok({ replyText: freedomCommand.replyText });
      }
      continue;
    }

    if (contextModule === "WEALTH_PROJECTION") {
      const projectionCommand = tryHandleWealthProjection(params.text);
      if (projectionCommand.handled) {
        return ok({ replyText: projectionCommand.replyText });
      }
      continue;
    }

    if (contextModule === "PRIVACY") {
      const privacyCommand = await tryHandlePrivacyCommand(params.userId, params.text);
      if (privacyCommand.handled) {
        return ok({ replyText: privacyCommand.replyText });
      }
    }
  }

  return null;
};

export const tryHandleStructuredText = async (
  params: StructuredTextParams
): Promise<InboundHandlerResult | null> => {
  const routedContext = routeGlobalTextContext(params.text);

  if (routedContext.command.kind === "HELP") {
    return ok({ replyText: HELP_TEXT });
  }

  if (routedContext.command.kind === "REPORT") {
    const report = await buildReportResponse(params.userId, {
      period: routedContext.command.period,
      dateRange: routedContext.command.dateRange ?? null,
      comparisonRange: routedContext.command.comparisonRange ?? null
    });
    return ok(toReportReplyBody(report));
  }

  if (routedContext.command.kind === "CATEGORY_DETAIL_REPORT") {
    const replyText = await buildCategoryDetailReport({
      userId: params.userId,
      period: routedContext.command.period,
      category: routedContext.command.category,
      filterText: routedContext.command.filterText,
      mode: routedContext.command.mode,
      limit: routedContext.command.limit,
      rangeWindow: routedContext.command.rangeWindow,
      dateRange: routedContext.command.dateRange,
      comparisonRange: routedContext.command.comparisonRange
    });
    return ok({ replyText });
  }

  if (routedContext.command.kind === "GENERAL_ANALYTICS_REPORT") {
    const replyText = await buildGeneralAnalyticsReport({
      userId: params.userId,
      mode: routedContext.command.mode,
      period: routedContext.command.period,
      limit: routedContext.command.limit,
      rangeWindow: routedContext.command.rangeWindow,
      dateRange: routedContext.command.dateRange,
      comparisonRange: routedContext.command.comparisonRange
    });
    return ok({ replyText });
  }

  if (routedContext.command.kind === "CASHFLOW_FORECAST") {
    const replyText = await buildCashflowForecastReply({
      userId: params.userId,
      query: {
        horizon: routedContext.command.horizon,
        mode: routedContext.command.mode,
        ...(routedContext.command.scenarioExpenseAmount
          ? {
              scenarioExpenseAmount: routedContext.command.scenarioExpenseAmount,
              scenarioExpenseLabel: routedContext.command.scenarioExpenseLabel ?? null
            }
          : {})
      }
    });
    return ok({ replyText });
  }

  if (routedContext.command.kind === "GOAL_PLAN") {
    const replyText = await buildGoalPlannerReply({
      userId: params.userId,
      mode: routedContext.command.mode,
      goalQuery: routedContext.command.goalQuery,
      goalType: routedContext.command.goalType,
      focusMonths: routedContext.command.focusMonths ?? null,
      splitRatio: routedContext.command.splitRatio ?? null,
      annualExpenseGrowthRate: routedContext.command.annualExpenseGrowthRate ?? null
    });
    return ok({ replyText });
  }

  if (routedContext.command.kind === "REMINDER_PREFERENCE") {
    if (routedContext.command.command.action === "STATUS") {
      const preference = await getReminderPreference(params.userId);
      return ok({ replyText: buildReminderPreferenceText(preference, routedContext.command.command) });
    }

    const preference = await updateReminderPreference(
      params.userId,
      routedContext.command.command.updates
    );
    return ok({ replyText: buildReminderPreferenceText(preference, routedContext.command.command) });
  }

  if (routedContext.command.kind === "FINANCIAL_HEALTH") {
    const replyText = await buildFinancialHealthReply({
      userId: params.userId,
      mode: routedContext.command.mode,
      dateRange: routedContext.command.dateRange ?? null
    });
    return ok({ replyText });
  }

  if (routedContext.command.kind === "INSIGHT") {
    const insightText = await generateUserInsight(params.userId);
    await createAIAnalysisLog({
      userId: params.userId,
      messageId: params.messageId,
      analysisType: AnalysisType.INSIGHT,
      payload: { insightText, source: "command" }
    });
    return ok({ replyText: insightText });
  }

  if (routedContext.command.kind === "ADVICE") {
    const userQuestion =
      routedContext.command.question ??
      "Keuangan aku sehat gak? Kasih saran yang paling penting bulan ini.";
    const insightText = await generateUserFinancialAdvice(params.userId, userQuestion);
    await createAIAnalysisLog({
      userId: params.userId,
      messageId: params.messageId,
      analysisType: AnalysisType.INSIGHT,
      payload: { insightText, source: "command_advice", userQuestion }
    });
    return ok({ replyText: insightText });
  }

  if (routedContext.command.kind === "BUDGET_SET") {
    const budget = await upsertCategoryBudget({
      userId: params.userId,
      category: routedContext.command.category,
      monthlyLimit: routedContext.command.monthlyLimit
    });
    return ok({ replyText: buildBudgetSetText(budget) });
  }

  if (routedContext.command.kind === "GOAL_SET") {
    const goalStatus = await setSavingsGoalTarget(params.userId, routedContext.command.targetAmount, {
      goalName: routedContext.command.goalName,
      goalType: routedContext.command.goalType,
      goalQuery: routedContext.command.goalName
    });
    return ok({ replyText: buildGoalStatusText(goalStatus) });
  }

  if (routedContext.command.kind === "GOAL_STATUS") {
    const goalStatus = await getSavingsGoalStatus(params.userId, {
      goalQuery: routedContext.command.goalQuery,
      goalType: routedContext.command.goalType
    });
    return ok({ replyText: buildGoalStatusText(goalStatus) });
  }

  if (routedContext.command.kind === "GOAL_CONTRIBUTE") {
    const contribution = await addGoalContribution(params.userId, routedContext.command.amount, {
      goalQuery: routedContext.command.goalQuery,
      goalType: routedContext.command.goalType
    });
    return ok({ replyText: buildGoalContributionText(contribution) });
  }

  return tryHandleContextModules(params, routedContext.moduleOrder);
};
