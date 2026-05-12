import { FinancialGoalStatus, FinancialGoalType, TransactionSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getFinancialGoalModel,
  getGoalContributionModel,
  getSavingsGoalModel
} from "./data-access";
import { findGoalForSelection, hasAnyActiveFinancialGoal } from "./queries";
import { getSavingsGoalStatus } from "./status-service";
import type { GoalSelection } from "./types";

export const addGoalContribution = async (
  userId: string,
  amount: number,
  selection?: GoalSelection
) => {
  const financialGoalModel = getFinancialGoalModel();
  const goalContributionModel = getGoalContributionModel();
  const normalizedAmount = Math.max(0, Math.round(amount));
  if (normalizedAmount <= 0) {
    return {
      contributionAmount: 0,
      goalStatus: await getSavingsGoalStatus(userId, selection)
    };
  }

  if (!financialGoalModel || !goalContributionModel) {
    const savingsGoalModel = getSavingsGoalModel();
    if (savingsGoalModel) {
      await savingsGoalModel.upsert({
        where: { userId },
        update: {
          currentProgress: {
            increment: normalizedAmount
          }
        },
        create: {
          userId,
          targetAmount: 0,
          currentProgress: normalizedAmount
        }
      });
    }

    return {
      contributionAmount: normalizedAmount,
      goalStatus: await getSavingsGoalStatus(userId, selection)
    };
  }

  const goal = await findGoalForSelection({
    userId,
    selection
  });

  if (!goal) {
    const hasActiveGoals = await hasAnyActiveFinancialGoal(userId);
    if (!hasActiveGoals) {
      const savingsGoalModel = getSavingsGoalModel();
      if (savingsGoalModel) {
        await savingsGoalModel.upsert({
          where: { userId },
          update: {
            currentProgress: {
              increment: normalizedAmount
            }
          },
          create: {
            userId,
            targetAmount: 0,
            currentProgress: normalizedAmount
          }
        });
      }

      return {
        contributionAmount: normalizedAmount,
        goalStatus: await getSavingsGoalStatus(userId, selection),
        goalCompleted: false
      };
    }

    const goalStatus = await getSavingsGoalStatus(userId);
    return {
      contributionAmount: normalizedAmount,
      goalStatus: {
        ...goalStatus,
        goalNotFoundQuery: selection?.goalQuery ?? selection?.goalName ?? null
      },
      goalCompleted: false
    };
  }

  await goalContributionModel.create({
    data: {
      userId,
      goalId: goal.id,
      amount: normalizedAmount,
      note: selection?.goalQuery ?? selection?.goalName ?? null
    }
  });

  const goalStatus = await getSavingsGoalStatus(userId, {
    goalName: goal.goalName,
    goalType: goal.goalType as FinancialGoalType,
    goalQuery: selection?.goalQuery ?? goal.goalName
  });

  if (goalStatus.targetAmount > 0 && goalStatus.currentProgress >= goalStatus.targetAmount) {
    await financialGoalModel.update({
      where: { id: goal.id },
      data: {
        status: FinancialGoalStatus.COMPLETED,
        estimatedMonthsToGoal: 0
      }
    });

    return {
      contributionAmount: normalizedAmount,
      goalStatus: {
        ...goalStatus,
        estimatedMonthsToGoal: 0
      },
      goalCompleted: true
    };
  }

  return {
    contributionAmount: normalizedAmount,
    goalStatus,
    goalCompleted: false
  };
};

export const addGoalContributionAndRecordSaving = async (
  userId: string,
  amount: number,
  selection?: GoalSelection
) => {
  const contribution = await addGoalContribution(userId, amount, selection);

  if (contribution.contributionAmount > 0 && !contribution.goalStatus.goalNotFoundQuery) {
    await prisma.transaction.create({
      data: {
        userId,
        type: "SAVING",
        amount: contribution.contributionAmount,
        category: "Tabungan",
        detailTag: "Setoran Goal",
        merchant: contribution.goalStatus.goalName ?? selection?.goalQuery ?? "Goal",
        note: `Setoran goal ${contribution.goalStatus.goalName ?? selection?.goalQuery ?? ""}`.trim(),
        occurredAt: new Date(),
        source: TransactionSource.TEXT,
        rawText: `/goal add ${selection?.goalQuery ?? ""} ${contribution.contributionAmount}`.trim()
      }
    });
  }

  return contribution;
};
