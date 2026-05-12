export { getMonthlySavingCapacity } from "./data-access";
export { addGoalContribution, addGoalContributionAndRecordSaving } from "./contribution-service";
export { getActiveGoalNames } from "./active-goals";
export { refreshSavingsGoalProgress, getSavingsGoalStatus } from "./status-service";
export { setSavingsGoalTarget } from "./target-service";
export type { GoalSelection, GoalStatusSummary } from "./types";
