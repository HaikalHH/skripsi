import { FinancialGoalStatus, FinancialGoalType, GoalCalculationType } from "@prisma/client";
import {
  calculateRecordedSavingTotal,
  getFinancialGoalModel,
  getSavingsGoalModel
} from "./data-access";
import { findExistingGoalForSet } from "./queries";
import { getSavingsGoalStatus } from "./status-service";
import type { GoalSelection } from "./types";
import { isSupportedFinancialGoalType } from "./constants";
import { defaultGoalNameByType, toNumber } from "./utils";

export const setSavingsGoalTarget = async (
  userId: string,
  targetAmount: number,
  selection?: GoalSelection
) => {
  const financialGoalModel = getFinancialGoalModel();
  const normalizedTarget = Math.max(0, Math.round(targetAmount));
  const selectedGoalType = isSupportedFinancialGoalType(selection?.goalType)
    ? (selection?.goalType ?? null)
    : null;
  const goalType = selectedGoalType ?? FinancialGoalType.CUSTOM;
  const goalName = selection?.goalName ?? defaultGoalNameByType(selectedGoalType);

  if (financialGoalModel) {
    const existingGoal = await findExistingGoalForSet({
      userId,
      goalType,
      goalName
    });

    if (existingGoal) {
      const deadlineUpdate =
        selection?.targetMonth && selection?.targetYear
          ? {
              targetMonth: selection.targetMonth,
              targetYear: selection.targetYear
            }
          : {};
      await financialGoalModel.update({
        where: { id: existingGoal.id },
        data: {
          goalName,
          targetAmount: normalizedTarget,
          status: FinancialGoalStatus.ACTIVE,
          calculationType: GoalCalculationType.MANUAL,
          ...deadlineUpdate
        }
      });
    } else {
      await financialGoalModel.create({
        data: {
          userId,
          goalType,
          goalName,
          targetAmount: normalizedTarget,
          targetMonth: selection?.targetMonth ?? null,
          targetYear: selection?.targetYear ?? null,
          calculationType: GoalCalculationType.MANUAL,
          status: FinancialGoalStatus.ACTIVE
        }
      });
    }
  }

  const savingsGoalModel = getSavingsGoalModel();
  if (savingsGoalModel) {
    const [existingLegacyGoal, recordedSavingTotal] = await Promise.all([
      savingsGoalModel.findUnique != null
        ? savingsGoalModel.findUnique({
            where: { userId },
            select: {
              currentProgress: true
            }
          })
        : null,
      calculateRecordedSavingTotal(userId)
    ]);
    const explicitProgress = Math.max(
      toNumber(existingLegacyGoal?.currentProgress ?? 0),
      recordedSavingTotal
    );

    await savingsGoalModel.upsert({
      where: { userId },
      update: {
        targetAmount: normalizedTarget,
        currentProgress: explicitProgress
      },
      create: {
        userId,
        targetAmount: normalizedTarget,
        currentProgress: explicitProgress
      }
    });
  }

  return getSavingsGoalStatus(userId, {
    goalName,
    goalType,
    goalQuery: selection?.goalQuery ?? goalName
  });
};
