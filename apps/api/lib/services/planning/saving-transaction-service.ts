import { addGoalContribution, refreshSavingsGoalProgress } from "@/lib/services/planning/goal-service";
import { resolveSavingGoalSelection } from "@/lib/services/transactions/saving-intent-service";

export const syncSavingTransactionGoalProgress = async (params: {
  userId: string;
  amount: number;
  rawText?: string | null;
}) => {
  if (params.amount <= 0) {
    return refreshSavingsGoalProgress(params.userId);
  }

  const selection = params.rawText ? resolveSavingGoalSelection(params.rawText) : undefined;
  const contribution = await addGoalContribution(params.userId, params.amount, selection);
  return contribution.goalStatus;
};
